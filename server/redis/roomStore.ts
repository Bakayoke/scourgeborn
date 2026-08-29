import { ROOM_UPDATE_CHANNEL } from '../persist.js'
import type { Patient, Player, Room } from '../types.js'

const ROOM_TTL_SEC = 60 * 60 * 24

function metaKey(code: string) {
  return `scourgeborn:room:${code}:meta`
}
function playersKey(code: string) {
  return `scourgeborn:room:${code}:players`
}
function playerKey(code: string, id: string) {
  return `scourgeborn:room:${code}:player:${id}`
}
function patientsKey(code: string) {
  return `scourgeborn:room:${code}:patients`
}
function labKey(code: string) {
  return `scourgeborn:room:${code}:lab`
}
function blobKey(code: string) {
  return `scourgeborn:room:${code}:blob`
}
function roomIndexKey() {
  return 'scourgeborn:rooms'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisClient = any

export async function saveRoomToRedis(redis: RedisClient, room: Room): Promise<void> {
  const code = room.code.toUpperCase()
  const pipeline = redis.multi()

  pipeline.hSet(metaKey(code), {
    code: room.code,
    hostId: room.hostId,
    language: room.language,
    status: room.status,
    mode: room.mode,
    score: String(room.score),
    misses: String(room.misses),
    lastTickAt: String(room.lastTickAt),
    lastSpawnAt: String(room.lastSpawnAt),
    updatedAt: String(room.updatedAt),
    premiumExpiresAt: String(room.premiumExpiresAt ?? 0),
    isPublic: room.isPublic ? '1' : '0',
    lastEventSv: room.lastEventSv ?? '',
    lastEventEn: room.lastEventEn ?? '',
  })

  pipeline.del(playersKey(code))
  for (const p of room.players) {
    pipeline.sAdd(playersKey(code), p.id)
    const ls = room.lab[p.id]
    pipeline.hSet(playerKey(code, p.id), {
      id: p.id,
      name: p.name,
      connected: p.connected ? '1' : '0',
      spectator: p.spectator ? '1' : '0',
      assignedStation: ls?.assignedStation ?? 'extractor',
      itemInHand: ls?.itemInHand ?? '',
    })
  }

  pipeline.del(patientsKey(code))
  for (const patient of room.patients) {
    pipeline.rPush(patientsKey(code), JSON.stringify(patient))
  }

  pipeline.set(labKey(code), JSON.stringify(room.lab), { EX: ROOM_TTL_SEC })

  const blob = JSON.stringify({
    ...room,
    players: room.players.map((p) => ({ ...p, connected: false })),
  })
  pipeline.set(blobKey(code), blob, { EX: ROOM_TTL_SEC })
  pipeline.sAdd(roomIndexKey(), code)
  pipeline.expire(metaKey(code), ROOM_TTL_SEC)
  pipeline.expire(playersKey(code), ROOM_TTL_SEC)
  pipeline.expire(patientsKey(code), ROOM_TTL_SEC)

  await pipeline.exec()
  await redis.publish(ROOM_UPDATE_CHANNEL, code)
}

export async function loadRoomFromRedis(redis: RedisClient, code: string): Promise<Room | null> {
  const c = code.toUpperCase().trim()
  const raw = await redis.get(blobKey(c))
  if (!raw) return null
  const parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw)) as Room
  if (!parsed?.lab && !parsed?.patients) return null
  return parsed
}

export async function loadRoomMetaFromRedis(
  redis: RedisClient,
  code: string,
): Promise<Record<string, string> | null> {
  const meta = await redis.hGetAll(metaKey(code.toUpperCase()))
  if (!meta || Object.keys(meta).length === 0) return null
  return meta as Record<string, string>
}

export async function loadConnectedPlayerIds(
  redis: RedisClient,
  code: string,
): Promise<string[]> {
  return redis.sMembers(playersKey(code.toUpperCase()))
}

export async function loadPatientsFromRedis(
  redis: RedisClient,
  code: string,
): Promise<Patient[]> {
  const list: string[] = await redis.lRange(patientsKey(code.toUpperCase()), 0, -1)
  return list.map((s) => JSON.parse(s) as Patient)
}

export async function deleteRoomFromRedis(redis: RedisClient, code: string): Promise<void> {
  const c = code.toUpperCase()
  const ids: string[] = await redis.sMembers(playersKey(c))
  const keys = [
    metaKey(c),
    playersKey(c),
    patientsKey(c),
    labKey(c),
    blobKey(c),
    ...ids.map((id) => playerKey(c, id)),
  ]
  if (keys.length) await redis.del(keys)
  await redis.sRem(roomIndexKey(), c)
  await redis.publish(ROOM_UPDATE_CHANNEL, c)
}

export function summarizePlayerFromHash(
  hash: Record<string, string>,
): Pick<Player, 'id' | 'name' | 'connected' | 'spectator'> {
  return {
    id: hash.id ?? '',
    name: hash.name ?? '',
    connected: hash.connected === '1',
    spectator: hash.spectator === '1',
  }
}
