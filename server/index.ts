import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import {
  allPasses,
  restorePasses,
  setPassPersistHook,
} from './premium.js'
import {
  buildSnapshot,
  flushPersist,
  initPersist,
  loadSnapshot,
  persistDiagnostics,
  scheduleSave,
} from './persist.js'
import {
  applyPartyToken,
  allRooms,
  castVote,
  createRoom,
  getBinding,
  getRoom,
  handleDisconnect,
  joinRoom,
  lockVotes,
  onResolveTimeout,
  onVoteTimeout,
  pickClass,
  previewRoom,
  pruneIdleRooms,
  reconnectSocket,
  redeemParty,
  pauseAdventure,
  rematch,
  resumeAdventure,
  restoreRooms,
  roomsNeedingTick,
  setDmNote,
  setLanguage,
  setBroadcastHook,
  setPersistHook,
  setSecretBallot,
  setHostPlays,
  setVoteSeconds,
  startAdventure,
  toPublicRoom,
  unlockRoomWithPass,
} from './rooms.js'
import {
  claimPartyCheckoutSession,
  createPartyCheckoutSession,
  handleStripeWebhook,
  partyCheckoutPublicInfo,
  stripeEnvDiagnostics,
} from './stripe.js'
import type { AdventureMode, Lang, PlayerClass } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3001
const isProd = process.env.NODE_ENV === 'production'

const app = express()
const httpServer = createServer(app)

function resolveCorsOrigin():
  | boolean
  | string[]
  | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean | string) => void) => void) {
  const extras =
    process.env.CORS_ORIGIN?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  const allowed = new Set([
    'https://partypaths.com',
    'https://www.partypaths.com',
    ...extras,
  ])

  // Reflect matching Origin — empty/misconfigured CORS_ORIGIN must not block the site.
  return (origin, cb) => {
    if (!origin) {
      cb(null, true)
      return
    }
    if (allowed.has(origin) || origin.endsWith('.up.railway.app') || origin.startsWith('http://localhost:')) {
      cb(null, origin)
      return
    }
    cb(null, false)
  }
}

const corsOrigin = resolveCorsOrigin()

const io = new Server(httpServer, {
  cors: {
    origin: ['https://partypaths.com', 'https://www.partypaths.com', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

function persistNow() {
  scheduleSave(buildSnapshot(allPasses().values(), allRooms().values()))
}

setPersistHook(persistNow)
setPassPersistHook(persistNow)
setBroadcastHook(broadcastRoom)

function broadcastRoom(code: string) {
  const room = getRoom(code)
  if (!room) return
  for (const [, socket] of io.of('/').sockets) {
    const binding = getBinding(socket.id)
    if (!binding || binding.code !== code) continue
    socket.emit('room', toPublicRoom(room, binding.playerId))
  }
}

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const result = await handleStripeWebhook(
      req.body as Buffer,
      req.headers['stripe-signature'] as string | undefined,
    )
    if ('error' in result) {
      res.status(result.status).json({ error: result.error })
      return
    }
    persistNow()
    res.json({ received: true })
  },
)

app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'partypaths',
    persist: persistDiagnostics(),
    stripe: stripeEnvDiagnostics(),
  })
})

app.get('/api/party/info', (_req, res) => {
  res.json(partyCheckoutPublicInfo())
})

app.get('/api/room/:code/preview', (req, res) => {
  const preview = previewRoom(String(req.params.code ?? ''))
  if (!preview) {
    res.status(404).json({
      error: 'Hittade inget spel med den koden / No game found with that code',
    })
    return
  }
  res.json(preview)
})

app.post('/api/party/checkout', async (req, res) => {
  const result = await createPartyCheckoutSession({
    locale: req.body?.locale,
    roomCode: req.body?.roomCode,
    plan: req.body?.plan,
    firstTime: Boolean(req.body?.firstTime),
  })
  if ('error' in result) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.post('/api/party/claim', async (req, res) => {
  const sessionId = String(req.body?.sessionId ?? '')
  const result = await claimPartyCheckoutSession(sessionId)
  if ('error' in result) {
    res.status(400).json(result)
    return
  }
  if (result.roomCode) {
    unlockRoomWithPass(result.roomCode, result)
    broadcastRoom(result.roomCode)
  }
  persistNow()
  res.json({
    token: result.token,
    expiresAt: result.expiresAt,
    plan: result.plan,
    roomCode: result.roomCode,
  })
})

io.on('connection', (socket) => {
  function bindingFrom(payload?: { code?: unknown; roomCode?: unknown; playerId?: unknown }) {
    let binding = getBinding(socket.id)
    const code = payload?.roomCode ?? payload?.code
    if (!binding && code && payload?.playerId) {
      const rebound = reconnectSocket(String(code), String(payload.playerId), socket.id)
      if (!('error' in rebound)) binding = getBinding(socket.id)
    }
    return binding
  }

  socket.on('create', (payload, ack) => {
    try {
      const name = String(payload?.name ?? '')
      const language = (payload?.language === 'en' ? 'en' : 'sv') as Lang
      const partyToken = payload?.partyToken ? String(payload.partyToken) : null
      const { room, playerId } = createRoom(name, socket.id, language, partyToken)
      ack?.({ ok: true, playerId, room: toPublicRoom(room, playerId) })
      broadcastRoom(room.code)
    } catch (e) {
      console.error(e)
      ack?.({ ok: false, error: 'Kunde inte skapa rum' })
    }
  })

  socket.on('join', (payload, ack) => {
    try {
      const result = joinRoom(String(payload?.code ?? ''), String(payload?.name ?? ''), socket.id)
      if ('error' in result) {
        ack?.({ ok: false, ...result })
        return
      }
      ack?.({
        ok: true,
        playerId: result.playerId,
        room: toPublicRoom(result.room, result.playerId),
      })
      broadcastRoom(result.room.code)
    } catch (e) {
      console.error(e)
      ack?.({ ok: false, error: 'Kunde inte gå med' })
    }
  })

  socket.on('rejoin', (payload, ack) => {
    try {
      const result = reconnectSocket(
        String(payload?.code ?? ''),
        String(payload?.playerId ?? ''),
        socket.id,
      )
      if ('error' in result) {
        ack?.({ ok: false, error: result.error })
        return
      }
      const binding = getBinding(socket.id)
      ack?.({
        ok: true,
        playerId: binding!.playerId,
        room: toPublicRoom(result, binding!.playerId),
      })
      broadcastRoom(result.code)
    } catch (e) {
      console.error(e)
      ack?.({ ok: false, error: 'Kunde inte återansluta' })
    }
  })

  socket.on('setLanguage', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = setLanguage(
      binding.code,
      binding.playerId,
      payload?.language === 'en' ? 'en' : 'sv',
    )
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('setVoteSeconds', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = setVoteSeconds(binding.code, binding.playerId, Number(payload?.seconds))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('setSecretBallot', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = setSecretBallot(binding.code, binding.playerId, Boolean(payload?.enabled))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('setHostPlays', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = setHostPlays(binding.code, binding.playerId, Boolean(payload?.plays))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('pickClass', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = pickClass(binding.code, binding.playerId, payload?.classId as PlayerClass)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('start', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const mode = payload?.mode as AdventureMode | undefined
    const result = startAdventure(binding.code, binding.playerId, mode)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('castVote', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = castVote(binding.code, binding.playerId, String(payload?.choiceId ?? ''))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('lockVotes', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = lockVotes(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('rematch', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const mode = payload?.mode as AdventureMode | undefined
    const result = rematch(binding.code, binding.playerId, mode)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('pause', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = pauseAdventure(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('resume', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = resumeAdventure(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('setDmNote', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = setDmNote(binding.code, binding.playerId, String(payload?.note ?? ''))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('redeemParty', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = redeemParty(binding.code, binding.playerId, String(payload?.code ?? ''))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('applyPartyToken', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = applyPartyToken(binding.code, String(payload?.token ?? ''))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('disconnect', () => {
    const binding = getBinding(socket.id)
    handleDisconnect(socket.id)
    if (binding) broadcastRoom(binding.code)
  })
})

setInterval(() => {
  for (const room of roomsNeedingTick()) {
    if (room.status === 'voting') onVoteTimeout(room)
    else if (room.status === 'resolve') onResolveTimeout(room)
    broadcastRoom(room.code)
  }
}, 250)

setInterval(() => {
  pruneIdleRooms()
}, 30_000)

if (isProd) {
  const dist = path.join(__dirname, '../client/dist')
  app.use(express.static(dist))
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'))
  })
}

async function main() {
  const { backend } = await initPersist()
  const snap = await loadSnapshot()
  if (snap) {
    restorePasses(snap.passes)
    restoreRooms(snap.rooms)
    console.log(`Restored ${snap.passes.length} passes, ${snap.rooms.length} rooms`)
  }
  console.log(`Persist backend: ${backend ?? 'memory'}`)

  httpServer.listen(PORT, () => {
    console.log(`Party Paths API on :${PORT}`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

process.on('SIGTERM', () => {
  void flushPersist().finally(() => process.exit(0))
})
