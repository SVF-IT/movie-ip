export interface HoldbackSourceEntry {
  source: string
  tokens: string[]
}

export interface HoldbackInfo {
  hasAny: boolean
  entries: HoldbackSourceEntry[]
}

export function parseHoldbackTokens(raw: string | null | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const t = part.trim().toLowerCase()
    if (t) seen.add(t)
  }
  return Array.from(seen)
}

export function parseHoldbackTokensDisplay(raw: string | null | undefined): string[] {
  if (!raw) return []
  const seen = new Map<string, string>()
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (!seen.has(key)) seen.set(key, trimmed)
  }
  return Array.from(seen.values())
}

export function hasHoldbackToken(raw: string | null | undefined, token: string): boolean {
  return parseHoldbackTokens(raw).includes(token.toLowerCase())
}

export function buildHoldbackInfo(sources: { label: string; raw: string | null | undefined }[]): HoldbackInfo {
  const entries: HoldbackSourceEntry[] = []
  for (const { label, raw } of sources) {
    const tokens = parseHoldbackTokensDisplay(raw)
    if (tokens.length > 0) entries.push({ source: label, tokens })
  }
  return { hasAny: entries.length > 0, entries }
}

export function flattenHoldbackInfo(info: HoldbackInfo): string {
  return info.entries.map((e) => `${e.source}: ${e.tokens.join(', ')}`).join('; ')
}
