import type { PremiumLimits, PremiumTier } from './types.js'

export type PartyPlan = 'day' | 'week'

export type PartyPass = {
  token: string
  tier: 'party'
  expiresAt: number
  plan?: PartyPlan
}

export const FREE_LIMITS: PremiumLimits = {
  maxPlayers: 5,
  maxRounds: 8,
  freePack: true,
}

export const PARTY_LIMITS: PremiumLimits = {
  maxPlayers: 0,
  maxRounds: 24,
  freePack: false,
}

export const PARTY_PASS_MS = 24 * 60 * 60 * 1000
export const PARTY_WEEK_MS = 7 * 24 * 60 * 60 * 1000

const passes = new Map<string, PartyPass>()
let onPersist: (() => void) | null = null

export function setPassPersistHook(fn: (() => void) | null) {
  onPersist = fn
}

function touchPasses() {
  onPersist?.()
}

function configuredPassCodes(): Set<string> {
  const raw = process.env.PARTY_PASS_CODES?.trim() ?? ''
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  )
}

export function limitsFor(tier: PremiumTier): PremiumLimits {
  return tier === 'party' ? PARTY_LIMITS : FREE_LIMITS
}

export function isPartyActive(expiresAt: number | null | undefined): boolean {
  return typeof expiresAt === 'number' && expiresAt > Date.now()
}

export function tierFromExpiry(expiresAt: number | null | undefined): PremiumTier {
  return isPartyActive(expiresAt) ? 'party' : 'free'
}

export function issuePartyPass(plan: PartyPlan = 'day'): PartyPass {
  const duration = plan === 'week' ? PARTY_WEEK_MS : PARTY_PASS_MS
  const pass: PartyPass = {
    token: crypto.randomUUID(),
    tier: 'party',
    expiresAt: Date.now() + duration,
    plan,
  }
  passes.set(pass.token, pass)
  touchPasses()
  return pass
}

export function restorePasses(list: PartyPass[]) {
  const now = Date.now()
  for (const pass of list) {
    if (!pass?.token || !pass.expiresAt || pass.expiresAt <= now) continue
    passes.set(pass.token, pass)
  }
}

export function allPasses() {
  return passes
}

export function redeemPassCode(code: string): PartyPass | { error: string } {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return { error: 'Ange en party-kod' }
  const codes = configuredPassCodes()
  if (codes.size === 0) return { error: 'Inga party-koder är konfigurerade' }
  if (!codes.has(normalized)) {
    return { error: 'Ogiltig party-kod' }
  }
  return issuePartyPass()
}

export function lookupPass(token: string | null | undefined): PartyPass | null {
  if (!token) return null
  const pass = passes.get(token)
  if (!pass) return null
  if (pass.expiresAt <= Date.now()) {
    passes.delete(token)
    touchPasses()
    return null
  }
  return pass
}
