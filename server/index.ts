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
  createRedisAdapterClients,
  flushPersist,
  initPersist,
  loadSnapshot,
  persistDiagnostics,
  scheduleSave,
  subscribeRoomUpdates,
} from './persist.js'
import {
  applyPartyToken,
  allRooms,
  backToLobby,
  castContainActionVote,
  castContainLandVote,
  castCureVote,
  continueTurn,
  createRoom,
  endParty,
  getBinding,
  getRoom,
  handleDisconnect,
  hydrateRoom,
  joinRoom,
  onPhaseTimeout,
  previewRoom,
  pruneIdleRooms,
  reconnectSocket,
  redeemParty,
  reloadRoomFromStore,
  restoreRooms,
  roomsNeedingTick,
  setLanguage,
  setBroadcastHook,
  setPersistHook,
  setPublicLobby,
  listPublicLobbies,
  startGame,
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
import type { Lang } from './types.js'

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
    'https://scourgeborn.com',
    'https://www.scourgeborn.com',
    'https://partypaths.com',
    'https://www.partypaths.com',
    ...extras,
  ])

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
    origin: [
      'https://scourgeborn.com',
      'https://www.scourgeborn.com',
      'https://partypaths.com',
      'https://www.partypaths.com',
      'http://localhost:5173',
    ],
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
    service: 'scourgeborn',
    rooms: allRooms().size,
    persist: persistDiagnostics(),
    stripe: stripeEnvDiagnostics(),
  })
})

app.get('/api/party/info', (_req, res) => {
  res.json(partyCheckoutPublicInfo())
})

app.get('/api/room/:code/preview', async (req, res) => {
  const code = String(req.params.code ?? '')
  await hydrateRoom(code)
  const preview = previewRoom(code)
  if (!preview) {
    res.status(404).json({
      error: 'Hittade inget spel med den koden / No game found with that code',
    })
    return
  }
  res.json(preview)
})

app.get('/api/lobbies', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : req.query.lang === 'sv' ? 'sv' : null
  const lobbies = listPublicLobbies({ language: lang, limit: 24 })
  res.json({ lobbies, count: lobbies.length })
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

  socket.on('create', async (payload, ack) => {
    try {
      const name = String(payload?.name ?? '')
      const language = (payload?.language === 'en' ? 'en' : 'sv') as Lang
      const partyToken = payload?.partyToken ? String(payload.partyToken) : null
      const wantPublic = Boolean(payload?.isPublic)
      const { room, playerId } = createRoom(name, socket.id, language, partyToken, wantPublic)
      // Force snapshot flush so a restart right after create can still restore.
      persistNow()
      await flushPersist()
      ack?.({ ok: true, playerId, room: toPublicRoom(room, playerId) })
      broadcastRoom(room.code)
    } catch (e) {
      console.error(e)
      ack?.({ ok: false, error: 'Kunde inte skapa rum' })
    }
  })

  socket.on('join', async (payload, ack) => {
    try {
      const code = String(payload?.code ?? '')
      await hydrateRoom(code)
      const result = joinRoom(code, String(payload?.name ?? ''), socket.id)
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

  socket.on('rejoin', async (payload, ack) => {
    try {
      const code = String(payload?.code ?? '')
      await hydrateRoom(code)
      const result = reconnectSocket(code, String(payload?.playerId ?? ''), socket.id)
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

  socket.on('setPublicLobby', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = setPublicLobby(binding.code, binding.playerId, Boolean(payload?.isPublic))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('startGame', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = startGame(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('continueTurn', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = continueTurn(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('endParty', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = endParty(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('backToLobby', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = backToLobby(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('castContainLandVote', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = castContainLandVote(
      binding.code,
      binding.playerId,
      String(payload?.regionId ?? ''),
    )
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('castContainActionVote', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = castContainActionVote(
      binding.code,
      binding.playerId,
      String(payload?.optionId ?? ''),
    )
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('castCureVote', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = castCureVote(
      binding.code,
      binding.playerId,
      String(payload?.optionId ?? ''),
    )
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  // Legacy event names
  socket.on('castLandVote', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = castContainLandVote(
      binding.code,
      binding.playerId,
      String(payload?.regionId ?? ''),
    )
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('castActionVote', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const room = getRoom(binding.code)
    const result =
      room?.status === 'council_cure'
        ? castCureVote(binding.code, binding.playerId, String(payload?.optionId ?? ''))
        : castContainActionVote(
            binding.code,
            binding.playerId,
            String(payload?.optionId ?? ''),
          )
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true, room: toPublicRoom(result, binding.playerId) })
    broadcastRoom(result.code)
  })

  socket.on('redeemParty', (payload, ack) => {
    const binding = bindingFrom(payload)
    if (!binding) return ack?.({ ok: false, error: 'Inte i ett rum' })
    const result = redeemParty(binding.code, binding.playerId, String(payload?.code ?? ''))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({
      ok: true,
      room: toPublicRoom(result.room, binding.playerId),
      token: result.pass.token,
      expiresAt: result.pass.expiresAt,
    })
    broadcastRoom(result.room.code)
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
    onPhaseTimeout(room)
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
    restoreRooms(snap.rooms as never)
    console.log(`Restored ${snap.passes.length} passes, ${snap.rooms.length} rooms`)
  }
  console.log(`Persist backend: ${backend ?? 'memory'}`)
  if (!backend) {
    console.warn(
      'WARNING: No REDIS_URL / data dir — rooms live only in memory and disappear on deploy/restart.',
    )
  }

  const adapterClients = await createRedisAdapterClients()
  if (adapterClients) {
    const { createAdapter } = await import('@socket.io/redis-adapter')
    io.adapter(createAdapter(adapterClients.pubClient, adapterClients.subClient))
    console.log('Socket.io Redis adapter enabled')
  }

  await subscribeRoomUpdates((code) => {
    void reloadRoomFromStore(code).then((room) => {
      if (room) broadcastRoom(code)
    })
  })

  httpServer.listen(PORT, () => {
    console.log(`Scourgeborn API on :${PORT}`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

process.on('SIGTERM', () => {
  void flushPersist().finally(() => process.exit(0))
})
