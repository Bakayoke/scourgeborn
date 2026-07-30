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
  campaignMode: 'short',
}

export const PARTY_LIMITS: PremiumLimits = {
  maxPlayers: 0,
  campaignMode: 'full',
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
  const raw = process.env.PARTY_PASS_CODES ?? 'LinusÄrBästHundraProcent'
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
  if (!configuredPassCodes().has(normalized)) {
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
