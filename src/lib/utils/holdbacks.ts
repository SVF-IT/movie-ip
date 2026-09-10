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

// ── Exploitation-type holdback matching ──────────────────────────────────────
// Holdbacks are free-text (inputs are plain text boxes with an "e.g. FVOD,
// Theatrical" placeholder), so there is no controlled vocabulary to rely on.
// We therefore match on a substring of the normalised text plus a small alias
// table, rather than exact comma-token equality. This deliberately errs toward
// reporting a holdback: a false "held back" hides a title from Open Titles,
// which is recoverable, whereas a false "open" can lead to selling a right that
// is already encumbered.

export type ExploitationType = 'avod' | 'svod' | 'tvod' | 'fvod' | 'iptv' | 'nvod' | 'satellite'

/** Aliases people actually type instead of the formal type name. */
const EXPLOITATION_ALIASES: Record<ExploitationType, string[]> = {
  avod: ['avod', 'youtube', 'yt', 'ad supported', 'ad-supported', 'ad supported video'],
  svod: ['svod', 'subscription'],
  tvod: ['tvod', 'est', 'rental', 'transactional', 'pay per view', 'pay-per-view', 'ppv'],
  fvod: ['fvod', 'free vod'],
  iptv: ['iptv'],
  nvod: ['nvod', 'near video on demand'],
  satellite: ['satellite', 'sat', 'dth', 'terrestrial', 'cable', 'tv rights', 'television'],
}

export const INTERNET_EXPLOITATION_TYPES: ExploitationType[] = ['avod', 'svod', 'tvod', 'fvod', 'iptv', 'nvod']

export const EXPLOITATION_TYPE_LABELS: Record<ExploitationType, string> = {
  avod: 'AVOD', svod: 'SVOD', tvod: 'TVOD', fvod: 'FVOD', iptv: 'IPTV', nvod: 'NVOD', satellite: 'Satellite',
}

function normaliseHoldbackText(raw: string | null | undefined): string {
  return (raw || '').toLowerCase()
}

/**
 * True when `raw` holds back the given exploitation type. Substring-based, so
 * "No AVOD till 2026" and "youtube holdback" both count for 'avod'.
 */
export function holdsBackType(raw: string | null | undefined, type: ExploitationType): boolean {
  const text = normaliseHoldbackText(raw)
  if (!text.trim()) return false
  return EXPLOITATION_ALIASES[type].some((alias) => text.includes(alias))
}

/** True when ANY of the supplied raw holdback strings holds back `type`. */
export function anyHoldsBackType(raws: (string | null | undefined)[], type: ExploitationType): boolean {
  return raws.some((r) => holdsBackType(r, type))
}

// ── Owned-rights classification ──────────────────────────────────────────────
// `movie_rights.classification` is free text listing the sub-types actually
// acquired, e.g. "AVOD, FVOD, SVOD, TVOD, IPTV". The convention is:
//   - blank  → the whole right_type is owned (no restriction)
//   - listed → ONLY those sub-types are owned
// Reporting a title open for a sub-type it never acquired would advertise a
// right SVF cannot sell, so an unparseable/blank value stays permissive but a
// populated one is enforced strictly.

/**
 * Does this classification permit exploiting `type`?
 * Blank/absent classification permits everything.
 */
export function classificationAllowsType(
  classification: string | null | undefined,
  type: ExploitationType,
): boolean {
  const text = (classification || '').trim().toLowerCase()
  if (!text) return true
  return EXPLOITATION_ALIASES[type].some((alias) => text.includes(alias))
}

/**
 * True when at least one of the movie's owned rows permits `type`. A movie with
 * no rows recorded at all is treated as permissive (home productions own
 * everything by default and carry no dated movie_rights row).
 */
export function anyClassificationAllowsType(
  classifications: (string | null | undefined)[],
  type: ExploitationType,
): boolean {
  if (classifications.length === 0) return true
  return classifications.some((c) => classificationAllowsType(c, type))
}
