import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Papa from 'papaparse'

// ============================================
// Types
// ============================================

interface Stats {
  moviesCreated: number
  castLinked: number
  directorsLinked: number
  platformRightsCreated: number
  peopleCreated: number
  productionHousesCreated: number
  platformsCreated: number
}

interface RowError {
  row: number
  field?: string
  message: string
}

interface ConflictRow {
  row: number
  title: string
  existingId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any

// ============================================
// Helper Functions (ported from Python)
// ============================================

function cleanString(value: string | null | undefined): string | null {
  if (!value) return null
  const v = String(value).trim()
  if (['', 'n/a', 'na', 'n', 'no', 'none', 'null', 'tbd', '-'].includes(v.toLowerCase())) {
    return null
  }
  return v
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

function parseDate(dateStr: string | null | undefined): string | null {
  if (dateStr) {
    const v = String(dateStr).trim().toLowerCase()
    if (v === 'perpetual') return '3099-12-31'
  }
  const cleaned = cleanString(dateStr)
  if (!cleaned) return null

  // Try DD-MMM-YY or DD-MMM-YYYY (e.g., 10-May-96, 1-Apr-23, 10-May-1996)
  const monthNameRegex = /^(\d{1,2})[/-]([A-Za-z]+)[/-](\d{2,4})$/
  let match = cleaned.match(monthNameRegex)
  if (match) {
    const day = parseInt(match[1], 10)
    const monthStr = match[2].toLowerCase()
    let year = parseInt(match[3], 10)
    const month = MONTH_MAP[monthStr]
    if (month !== undefined && day >= 1 && day <= 31) {
      if (year < 100) {
        year += 2000
        if (year > 2050) year -= 100
      }
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // Try numeric date: M/D/YYYY, D/M/YYYY, etc.
  // When the year has 4 digits and first part ≤ 12 and second part > 12, it is unambiguously M/D/YYYY.
  // When both parts ≤ 12 and year has 4 digits, treat as M/D/YYYY (matches the acquired sheet format).
  // When year has only 2 digits, treat as D/M/YY (European shorthand).
  const numericRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/
  match = cleaned.match(numericRegex)
  if (match) {
    const a = parseInt(match[1], 10)
    const b = parseInt(match[2], 10)
    let year = parseInt(match[3], 10)
    if (year < 100) {
      year += 2000
      if (year > 2050) year -= 100
    }
    let month: number, day: number
    const fullYear = match[3].length === 4
    if (fullYear) {
      // 4-digit year → M/D/YYYY convention (acquired sheet uses this)
      month = a
      day = b
    } else {
      // 2-digit year → D/M/YY convention
      day = a
      month = b
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    // Fallback: try swapping if above was invalid
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
      return `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
    }
  }

  // Try YYYY-MM-DD
  const isoRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  match = cleaned.match(isoRegex)
  if (match) {
    return `${match[1]}-${String(parseInt(match[2])).padStart(2, '0')}-${String(parseInt(match[3])).padStart(2, '0')}`
  }

  // Try MMM-YY or MMMM-YY (e.g., Apr-23)
  const monthYearRegex = /^([A-Za-z]+)[/-](\d{2,4})$/
  match = cleaned.match(monthYearRegex)
  if (match) {
    const monthStr = match[1].toLowerCase()
    let year = parseInt(match[2], 10)
    const month = MONTH_MAP[monthStr]
    if (month !== undefined) {
      if (year < 100) {
        year += 2000
        if (year > 2050) year -= 100
      }
      return `${year}-${String(month + 1).padStart(2, '0')}-01`
    }
  }

  return null
}

function extractYearFromDate(dateStr: string | null | undefined): string | null {
  const parsed = parseDate(dateStr)
  if (parsed) return parsed.split('-')[0]

  const cleaned = cleanString(dateStr)
  if (cleaned && /^\d{4}$/.test(cleaned)) {
    return cleaned
  }
  return null
}

function parseCastList(castStr: string | null | undefined): string[] {
  const cleaned = cleanString(castStr)
  if (!cleaned) return []

  const str = cleaned
    .replace(/\s*&\s*others?/gi, '')
    .replace(/\s*,\s*others?/gi, '')
    .replace(/\s+&\s+/g, ', ')
    .replace(/\s+and\s+/g, ', ')

  return str
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n && !['others', '& others'].includes(n.toLowerCase()))
}

function parseDirector(directorStr: string | null | undefined): string[] {
  let cleaned = cleanString(directorStr)
  if (!cleaned) return []

  if (cleaned.startsWith(':')) cleaned = cleaned.slice(1).trim()

  cleaned = cleaned.replace(/\s+&\s+/g, ', ').replace(/\s+and\s+/g, ', ')
  return cleaned
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d)
}

function normalizeCertification(cert: string | null | undefined): string | null {
  if (!cert) return null
  const v = String(cert).trim()
  if (!v || ['', 'n/a', 'na', 'none', 'null', '-'].includes(v.toLowerCase())) return null

  const upper = v.toUpperCase().replace(/\s+/g, ' ')

  // Normalized Map for consistency
  const certMap: Record<string, string> = {
    U: 'U',
    UA: 'UA',
    'U/A': 'UA',
    'UA 7+': 'UA 7+',
    'UA7+': 'UA 7+',
    'UA 13+': 'UA 13+',
    'UA13+': 'UA 13+',
    'UA 16+': 'UA 16+',
    'UA16+': 'UA 16+',
    A: 'A',
    S: 'S',
    'V/U': 'V/U',
    'V/UA': 'V/UA',
    UNCENSORED: 'Uncensored',
    TBD: 'TBD',
  }

  if (certMap[upper]) return certMap[upper]

  // Check for partial matches or complex strings
  if (upper.includes('UA 7') || upper.includes('UA7')) return 'UA 7+'
  if (upper.includes('UA 13') || upper.includes('UA13')) return 'UA 13+'
  if (upper.includes('UA 16') || upper.includes('UA16')) return 'UA 16+'
  if (upper === 'U/A' || upper === 'UA') return 'UA'

  return v
}

// For platform rights nature — store raw value as-is so nothing is lost
// For movie-level text fields — preserve raw text as-is
function preserveRawText(value: string | null | undefined): string | null {
  if (!value) return null
  const v = String(value).trim()
  if (!v || ['', 'n/a', 'na', 'none', 'null', '-'].includes(v.toLowerCase())) return null
  return v
}

function findColumnByPattern(rowKeys: string[], patterns: string[]): string | null {
  for (const key of rowKeys) {
    const keyLower = key.toLowerCase().trim().replace(/\s+/g, ' ')
    for (const pattern of patterns) {
      if (keyLower.includes(pattern.toLowerCase().trim())) {
        return key
      }
    }
  }
  return null
}

/** Safe column read — returns null instead of undefined when column absent */
function col(row: Record<string, string>, key: string | null): string | undefined {
  if (!key) return undefined
  return row[key]
}

// ============================================
// CacheStore
// ============================================

class CacheStore {
  productionHouses = new Map<string, string>()
  people = new Map<string, string>()
  platforms = new Map<string, string>()
  movies = new Map<string, string>() // title.lower() → id
  stats: Stats = {
    moviesCreated: 0,
    castLinked: 0,
    directorsLinked: 0,
    platformRightsCreated: 0,
    peopleCreated: 0,
    productionHousesCreated: 0,
    platformsCreated: 0,
  }

  private supabase: SupabaseAdmin

  constructor(supabase: SupabaseAdmin) {
    this.supabase = supabase
  }

  async loadExisting(): Promise<void> {
    const [productionHouses, people, platforms, movies] = await Promise.all([
      this.supabase.from('production_houses').select('id, name'),
      this.supabase.from('people').select('id, name'),
      this.supabase.from('platforms').select('id, name, platform_type'),
      this.supabase.from('movies').select('id, title, production_no'),
    ])

    for (const row of productionHouses.data || []) {
      this.productionHouses.set(row.name.toLowerCase(), row.id)
    }
    for (const row of people.data || []) {
      this.people.set(row.name.toLowerCase().trim(), row.id)
    }
    for (const row of platforms.data || []) {
      const key = `${row.name.toLowerCase().trim()}|${row.platform_type ?? ''}`
      this.platforms.set(key, row.id)
    }
    for (const row of movies.data || []) {
      this.movies.set(row.title.toLowerCase().trim(), row.id)
    }
  }

  async updateMovie(movieId: string, movieData: Record<string, unknown>): Promise<void> {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(movieData)) {
      if (v !== undefined && v !== null && v !== '') {
        cleaned[k] = v
      }
    }
    delete cleaned.approval_status // don't reset approval on update
    const { error } = await this.supabase.from('movies').update(cleaned).eq('id', movieId)
    if (error) {
      throw new Error(`Failed to update movie: ${error.message}`)
    }
  }

  async getOrCreateProductionHouse(name: string | null): Promise<string | null> {
    const cleaned = cleanString(name)
    if (!cleaned) return null
    const key = cleaned.toLowerCase().trim()
    if (this.productionHouses.has(key)) return this.productionHouses.get(key)!

    const { data, error } = await this.supabase.from('production_houses').insert({ name: cleaned.trim() }).select('id').single()

    if (error) {
      const { data: existing } = await this.supabase.from('production_houses').select('id').ilike('name', cleaned.trim()).single()
      if (existing) {
        this.productionHouses.set(key, existing.id)
        return existing.id
      }
      return null
    }
    this.productionHouses.set(key, data.id)
    this.stats.productionHousesCreated++
    return data.id
  }

  async getOrCreatePerson(name: string | null): Promise<string | null> {
    const cleaned = cleanString(name)
    if (!cleaned) return null
    const key = cleaned.toLowerCase().trim()
    if (this.people.has(key)) return this.people.get(key)!

    const { data, error } = await this.supabase.from('people').insert({ name: cleaned.trim() }).select('id').single()

    if (error) {
      const { data: existing } = await this.supabase.from('people').select('id').ilike('name', cleaned.trim()).single()
      if (existing) {
        this.people.set(key, existing.id)
        return existing.id
      }
      return null
    }
    this.people.set(key, data.id)
    this.stats.peopleCreated++
    return data.id
  }

  async getOrCreatePlatform(name: string | null, platformType?: string): Promise<string | null> {
    const cleaned = cleanString(name)
    if (!cleaned) return null

    // Normalize well-known platform names
    const nameMap: Record<string, string> = {
      viacom: 'Viacom 18',
      'viacom 18': 'Viacom 18',
      viacom18: 'Viacom 18',
      'viacon 18': 'Viacom 18',
      star: 'Star',
      hotstar: 'Hotstar',
      prime: 'Prime Video',
      'prime video': 'Prime Video',
      'prime videos': 'Prime Video',
      hoichoi: 'Hoichoi',
      echo: 'Echo',
      hungama: 'Hungama',
      zee: 'Zee',
      sony: 'Sony',
      netflix: 'Netflix',
      jiocinema: 'JioCinema',
      youtube: 'YouTube',
      yt: 'YouTube',
    }

    const normalized = nameMap[cleaned.toLowerCase().trim()] || cleaned.trim()
    // Uniqueness key is (name, platform_type) — same name can exist with different types
    const key = `${normalized.toLowerCase().trim()}|${platformType ?? ''}`
    if (this.platforms.has(key)) return this.platforms.get(key)!

    const insertData: Record<string, string> = { name: normalized }
    if (platformType) insertData.platform_type = platformType

    const { data, error } = await this.supabase.from('platforms').insert(insertData).select('id').single()

    if (error) {
      // Row may already exist (race condition or pre-seeded) — fetch by (name, platform_type)
      let query = this.supabase.from('platforms').select('id').ilike('name', normalized)
      if (platformType) query = query.eq('platform_type', platformType)
      else query = query.is('platform_type', null)
      const { data: existing } = await query.single()
      if (existing) {
        this.platforms.set(key, existing.id)
        return existing.id
      }
      return null
    }
    this.platforms.set(key, data.id)
    this.stats.platformsCreated++
    return data.id
  }

  async insertMovie(movieData: Record<string, unknown>): Promise<string | null> {
    const title = cleanString(movieData.title as string)
    if (!title) return null

    // Remove undefined/null/empty values
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(movieData)) {
      if (v !== undefined && v !== null && v !== '') {
        cleaned[k] = v
      }
    }

    // All imported movies start as pending — must be approved by legal
    cleaned.approval_status = 'pending'

    const { data, error } = await this.supabase.from('movies').insert(cleaned).select('id').single()

    if (error) {
      throw new Error(`Failed to create movie "${title}": ${error.message}`)
    }

    this.stats.moviesCreated++
    return data.id
  }

  // Like insertMovie but respects approval_status already set in movieData (used for home rows)
  async insertMovieRaw(movieData: Record<string, unknown>): Promise<string | null> {
    const title = cleanString(movieData.title as string)
    if (!title) return null

    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(movieData)) {
      // Keep explicit nulls (we use them to clear acquired-only fields)
      if (v !== undefined && v !== '') cleaned[k] = v
    }

    if (!cleaned.wtp_library) cleaned.wtp_library = 'WTP'

    const { data, error } = await this.supabase.from('movies').insert(cleaned).select('id').single()
    if (error) throw new Error(`Failed to create movie "${title}": ${error.message}`)

    this.stats.moviesCreated++
    return data.id
  }

  async insertMovieCast(movieId: string, personId: string, role: string = 'Actor', billingOrder?: number): Promise<void> {
    const insertData: Record<string, unknown> = {
      movie_id: movieId,
      person_id: personId,
      role: role === 'Director' ? 'Director' : 'Actor',
    }
    if (billingOrder !== undefined) insertData.billing_order = billingOrder

    const { error } = await this.supabase.from('movie_people').insert(insertData)
    if (error && !error.message.toLowerCase().includes('duplicate')) {
      console.error(`Warning: Could not create movie cast: ${error.message}`)
      return
    }
    this.stats.castLinked++
  }

  async insertMovieDirector(movieId: string, personId: string): Promise<void> {
    const { error } = await this.supabase.from('movie_people').insert({
      movie_id: movieId,
      person_id: personId,
      role: 'Director',
    })
    if (error && !error.message.toLowerCase().includes('duplicate')) {
      console.error(`Warning: Could not create movie director: ${error.message}`)
      return
    }
    this.stats.directorsLinked++
  }

  async clearMoviePeople(movieId: string): Promise<void> {
    await this.supabase.from('movie_people').delete().eq('movie_id', movieId)
  }

  async clearMoviePlatformRights(movieId: string): Promise<void> {
    await this.supabase.from('platform_rights').delete().eq('movie_id', movieId)
  }

  async clearMovieRights(movieId: string): Promise<void> {
    await this.supabase.from('movie_rights').delete().eq('movie_id', movieId)
  }

  async insertMovieRightsRows(rows: Record<string, unknown>[]): Promise<void> {
    for (const row of rows) {
      // Skip rows where nature is null/empty — the movie_rights.nature column
      // is NOT NULL in the base schema (relaxed only after migration 27).
      // Rather than fail the whole movie, skip unpopulated rights rows.
      if (!row.nature) continue
      const { error } = await this.supabase.from('movie_rights').insert(row)
      if (error) throw new Error(`Could not insert movie_rights (${row.right_type}): ${error.message}`)
    }
  }

  async insertPlatformRights(rightsData: Record<string, unknown>): Promise<string | null> {
    if (!rightsData.movie_id) return null

    // Auto-determine is_current based on end_date
    const today = new Date().toISOString().split('T')[0]
    if (rightsData.end_date && String(rightsData.end_date) < today) {
      rightsData.is_current = false
    }

    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rightsData)) {
      if (v !== undefined && v !== null && v !== '') {
        cleaned[k] = v
      }
    }

    const { data, error } = await this.supabase.from('platform_rights').insert(cleaned).select('id').single()

    if (error) {
      console.error(`Warning: Could not create platform rights: ${error.message}`)
      return null
    }
    this.stats.platformRightsCreated++
    return data.id
  }
}

// ============================================
// Acquired Sheet — 3-row header platform rights parser
// ============================================

/**
 * Maps a typeRow label to a canonical platform_type stored in the DB.
 * Returns [dbType, isHistory].
 *
 * Generic: unknown labels pass through as-is (title-cased) so future
 * types added to the sheet work without code changes.
 */
function resolvePlatformType(row2Label: string): [string, boolean] {
  const label = row2Label.trim()
  const isHistory = /history/i.test(label)
  // Strip "history" suffix for the base type lookup
  const base = label.replace(/\s*history\s*/i, '').trim().toLowerCase()

  // Known canonical aliases — anything not in this map passes through title-cased
  const typeMap: Record<string, string> = {
    'satellite tv': 'Satellite TV',
    'satellite': 'Satellite TV',
    'dth vod': 'DTH VOD',
    'dth': 'DTH VOD',
    'terrestrial tv': 'Terrestrial TV',
    'terrestrial': 'Terrestrial TV',
    'svod': 'SVOD',
    'tvod': 'TVOD',
    'avod': 'AVOD',
    'fvod': 'FVOD',
    'nvod': 'NVOD',
    'iptv': 'IPTV',
  }

  // Pass through unknown types title-cased so new sheet types work automatically
  const dbType = typeMap[base] ?? label.replace(/\s*history\s*/i, '').trim()
  return [dbType, isHistory]
}

interface PlatformSlot {
  /** Column index in the data row array */
  colIndex: number
  /** Row-2 platform_type string (e.g. "Satellite TV", "SVOD") */
  platformType: string
  /** true when Row-2 label contained "History" → force is_current = false */
  isHistory: boolean
  /** When non-null, platform name is fixed from the header ("Platform - <Name>"). Data cell is a presence marker. */
  hardcodedName: string | null
  /** Row-2 label for error reporting */
  row2Label: string
  /** Slot index within the Row-2 group (0-based) */
  slotIndex: number
}

/**
 * Parses the 3 preamble header rows of an Acquired CSV into a list of platform slots.
 *
 * Layout (for the acquired sheet):
 *   bannerRow  — sparse section labels: "SATELLITE RIGHTS", "INTERNET RIGHTS", "OTHERS" (any text is fine)
 *   typeRow    — platform_type labels: "Satellite TV", "Satellite TV History", "DTH VOD",
 *                "Terrestrial TV", "SVOD", "TVOD", "AVOD", "Airborne Rights", ...
 *                Each label spans 6 columns until the next label appears.
 *   fieldRow   — 6-column slot headers starting with Platform/License or Platform - <Name> or Type - <Name>:
 *                [0] Platform/License  (or "Platform - Name" or "Type - TypeName")
 *                [1] Category
 *                [2] Nature Of Rights
 *                [3] Start Date
 *                [4] End Date
 *                [5] Territory
 *
 * Generic design: no platform names or right types are hardcoded. Any typeRow label
 * that isn't in the canonical alias map passes through as-is so future sheet additions
 * work without code changes.
 *
 * Returns null if the rows don't look like a platform-rights section (no Platform/License headers).
 */
function parsePlatformRightsSections(
  typeRow: string[],
  fieldRow: string[],
): PlatformSlot[] | null {
  // Detection: need at least one slot-anchor header in fieldRow.
  // We accept any fieldRow with a "Platform/License", "Platform - X", or "Type - X" cell.
  // Also accept if bannerRow/typeRow has any known rights keyword.
  const hasSlotAnchor = fieldRow.some((c) => {
    const cl = (c || '').toLowerCase().trim()
    return (
      cl === 'platform/license' ||
      cl === 'platform / license' ||
      cl.startsWith('platform -') ||
      cl.startsWith('platform–') ||
      cl.startsWith('type -') ||
      cl.startsWith('type–') ||
      cl === 'youtube'
    )
  })
  // Also check typeRow for any of our known type labels as a secondary signal
  const hasTypeLabel = typeRow.some((c) => {
    const cl = (c || '').toLowerCase().trim()
    return cl.includes('satellite') || cl.includes('internet') || cl.includes('svod') ||
      cl.includes('tvod') || cl.includes('avod') || cl.includes('dth') || cl.includes('terrestrial')
  })
  if (!hasSlotAnchor && !hasTypeLabel) return null

  const slots: PlatformSlot[] = []

  // Walk fieldRow looking for slot anchors — each marks the start of a 6-column slot.
  for (let col = 0; col < fieldRow.length; col++) {
    const field = (fieldRow[col] || '').trim()
    const fieldLower = field.toLowerCase()

    // Normalize: strip leading/trailing spaces and internal unicode dashes
    const isTypeHeader = fieldLower.startsWith('type -') || fieldLower.startsWith('type–') || fieldLower.startsWith('type –')
    const isPlatformHardcoded = fieldLower.startsWith('platform -') || fieldLower.startsWith('platform–') || fieldLower.startsWith('platform –')
    const isPlatformGeneric = fieldLower === 'platform/license' || fieldLower === 'platform / license' || fieldLower === 'platform/ license'
    // Bare "Youtube" (or "YouTube") in the row-1 type label row is a known slot anchor —
    // the data cell carries the platform name (e.g. "SVF YouTube") like a generic slot.
    const isYoutubeAnchor = fieldLower === 'youtube'

    if (!isTypeHeader && !isPlatformHardcoded && !isPlatformGeneric && !isYoutubeAnchor) continue

    // Resolve platform name override and type override from the field header cell
    let hardcodedName: string | null = null
    let typeOverride: string | null = null

    if (isPlatformHardcoded) {
      // "Platform - Viacom 18" → hardcoded platform name; data cell is Yes/No presence marker
      const sep = field.indexOf('-')
      hardcodedName = sep >= 0 ? field.slice(sep + 1).trim() || null : null
    } else if (isTypeHeader) {
      // "Type - Air Rights" → the platform_type is what follows the hyphen;
      // data cell is the actual platform name (generic Platform/License style)
      const sep = field.indexOf('-')
      typeOverride = sep >= 0 ? field.slice(sep + 1).trim() || null : null
    } else if (isYoutubeAnchor) {
      // Bare "Youtube" column header — data cell is the platform name; force type to "YouTube"
      typeOverride = 'YouTube'
    }
    // Generic "Platform/License" → data cell is the platform name; type from typeRow

    // Walk back through typeRow to find the nearest non-empty label at or before this col
    let row2Label = ''
    for (let t = col; t >= 0; t--) {
      const cell = (typeRow[t] || '').trim()
      if (cell) {
        row2Label = cell
        break
      }
    }

    // Skip slots with no type label at all (shouldn't happen in well-formed sheets)
    if (!row2Label && !typeOverride) continue

    const [resolvedType, isHistory] = row2Label ? resolvePlatformType(row2Label) : ['Other', false]
    // typeOverride wins when set (e.g. "Type - Air Rights" overrides the "Airborne Rights" typeRow label)
    const platformType = typeOverride ?? resolvedType

    // Slot index within its typeRow group (for error reporting)
    const slotIndex = slots.filter((s) => s.row2Label === row2Label).length

    slots.push({
      colIndex: col,
      platformType,
      isHistory,
      hardcodedName,
      row2Label,
      slotIndex,
    })
  }

  return slots.length > 0 ? slots : null
}

interface PlatformRightsRowError {
  row2Label: string
  slotIndex: number
  colRange: [number, number]
  message: string
}

/**
 * For a single data row (plus optional continuation rows), iterate every slot
 * in the slot map and insert platform_rights rows where the slot is active.
 *
 * Acquired slots: 6 columns — [platform/license, category, start, end, territory, nature]
 * Home slots:     7 columns — [platform/license, category, nature, start, end, territory, holdbacks]
 *
 * slotErrors is populated (not thrown) on per-slot failures.
 */
async function extractPlatformRights(
  dataCols: string[],
  slots: PlatformSlot[],
  cache: CacheStore,
  movieId: string,
  slotErrors: PlatformRightsRowError[],
  isHome: boolean,
  continuationColArrays?: string[][],
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  const slotWidth = isHome ? 7 : 6

  for (const slot of slots) {
    const { colIndex, platformType, isHistory, hardcodedName, row2Label, slotIndex } = slot
    const colRange: [number, number] = [colIndex, colIndex + slotWidth - 1]

    try {
      const cell0 = (dataCols[colIndex] ?? '').trim()

      let platformName: string | null
      if (hardcodedName) {
        // Hardcoded header: data cell is a presence marker — skip if blank, 'No', 'Open', or 'N/A'
        if (!cell0) continue
        const cell0Lower = cell0.toLowerCase()
        if (['no', 'n', 'open', 'n/a', 'na', '-'].includes(cell0Lower)) continue
        platformName = hardcodedName
      } else {
        // Generic header: platform name comes from the data cell
        platformName = cell0 || null
        if (!platformName) continue
        if (['no', 'n', 'open', 'n/a', 'na', '-'].includes(platformName.toLowerCase())) continue
      }

      const platformId = await cache.getOrCreatePlatform(platformName, platformType)
      if (!platformId) {
        slotErrors.push({ row2Label, slotIndex, colRange, message: `Could not resolve platform "${platformName}"` })
        continue
      }

      // Helper: insert one platform_rights record from a column array.
      // Acquired: [platform, category, start, end, territory, nature]
      // Home:     [platform, category, nature, start, end, territory, holdbacks]
      const insertSlotRow = async (cols: string[]) => {
        let categoryRaw: string, startRaw: string, endRaw: string, territoryRaw: string, natureRaw: string, holdbacksRaw: string
        if (isHome) {
          categoryRaw   = (cols[colIndex + 1] ?? '').trim()
          natureRaw     = (cols[colIndex + 2] ?? '').trim()
          startRaw      = (cols[colIndex + 3] ?? '').trim()
          endRaw        = (cols[colIndex + 4] ?? '').trim()
          territoryRaw  = (cols[colIndex + 5] ?? '').trim()
          holdbacksRaw  = (cols[colIndex + 6] ?? '').trim()
        } else {
          // Acquired slot: [Platform/License, Category, Nature Of Rights, Start Date, End Date, Territory]
          categoryRaw   = (cols[colIndex + 1] ?? '').trim()
          natureRaw     = (cols[colIndex + 2] ?? '').trim()
          startRaw      = (cols[colIndex + 3] ?? '').trim()
          endRaw        = (cols[colIndex + 4] ?? '').trim()
          territoryRaw  = (cols[colIndex + 5] ?? '').trim()
          holdbacksRaw  = ''
        }

        const startDate = parseDate(startRaw)
        const endDate   = parseDate(endRaw)

        // Skip rows that carry no meaningful data for this slot
        if (!startDate && !endDate && !natureRaw && !categoryRaw && !territoryRaw) return

        let isCurrent: boolean
        if (isHistory) {
          isCurrent = false
        } else if (endDate && endDate !== '3099-12-31' && endDate < today) {
          isCurrent = false
        } else {
          isCurrent = true
        }

        await cache.insertPlatformRights({
          movie_id: movieId,
          platform_id: platformId,
          category: cleanString(categoryRaw) ?? null,
          start_date: startDate,
          end_date: endDate,
          territory: cleanString(territoryRaw) ?? null,
          nature: cleanString(natureRaw) ?? null,
          holdbacks: cleanString(holdbacksRaw) ?? null,
          is_current: isCurrent,
        })
      }

      // Primary row
      await insertSlotRow(dataCols)

      // Continuation rows for additional natures
      if (continuationColArrays) {
        for (const contCols of continuationColArrays) {
          await insertSlotRow(contCols)
        }
      }
    } catch (err) {
      slotErrors.push({
        row2Label,
        slotIndex,
        colRange,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

// ============================================
// CSV Row Processing
// ============================================

async function processHomeRow(
  row: Record<string, string>,
  keys: string[],
  cache: CacheStore,
  userId: string,
  resolution: 'skip' | 'update' | null,
  platformSlots: PlatformSlot[] | null,
  rawDataCols: string[],
  slotErrors: PlatformRightsRowError[],
  continuationColArrays?: string[][],
): Promise<'created' | 'skipped' | 'updated'> {
  // New home sheet uses "Movie Name" at col 1 (not "Title")
  const titleKey_col = findColumnByPattern(keys, ['Movie Name', 'Title'])
  const title = cleanString(titleKey_col ? row[titleKey_col] : row['Movie Name'] ?? row['Title'])
  if (!title) throw new Error('Movie Name is required')

  // ── Conflict check by title ──────────────────────────────────
  const titleKey = title.toLowerCase().trim()
  const existingId = cache.movies.get(titleKey) ?? null
  const productionNo = cleanString(row['Production No'])

  if (existingId) {
    if (!resolution || resolution === 'skip') return 'skipped'
    // resolution === 'update' → fall through and update below
  }

  // ── Language ─────────────────────────────────────────────────
  const langKey = findColumnByPattern(keys, ['Language'])
  const languageRaw = langKey ? row[langKey] : null
  const language = languageRaw
    ? languageRaw
        .trim()
        .replace(/\s*[Dd]ubbed\s*/g, '')
        .trim()
    : null

  // ── Production houses ────────────────────────────────────────
  let productionHouseName: string | null = null
  const rawProductionHouse = cleanString(row['Production House'])
  if (rawProductionHouse) {
    productionHouseName = rawProductionHouse.trim()
    const parts = rawProductionHouse
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    for (const part of parts) {
      await cache.getOrCreateProductionHouse(part)
    }
  }

  // ── Release date / year ──────────────────────────────────────
  // New sheet uses "Release Year" (col 6) — no separate release date column
  const releaseDateKey = findColumnByPattern(keys, ['Theatrical Release Date', 'Release Date'])
  const releaseYearKey = findColumnByPattern(keys, ['Release Year'])
  const rawDate = cleanString(releaseDateKey ? row[releaseDateKey] : null)
  const rawYear = cleanString(releaseYearKey ? row[releaseYearKey] : null)
  // Release Year column may hold a plain year ("2022") or a full date ("10-May-96").
  // Plain year → release_year only, no release_date.
  // Full date  → both release_date and release_year (extracted).
  const parsedDate = rawDate ? parseDate(rawDate) : null
  const isPlainYear = rawYear && /^\d{4}$/.test(rawYear.trim())
  const parsedFromRawYear = !isPlainYear && rawYear ? parseDate(rawYear) : null
  const releaseDate = parsedDate ?? parsedFromRawYear ?? rawDate ?? null
  const releaseYear = parsedDate
    ? parsedDate.split('-')[0]
    : parsedFromRawYear
    ? parsedFromRawYear.split('-')[0]
    : isPlainYear
    ? rawYear!.trim()
    : null

  // ── Certification ─────────────────────────────────────────────
  const certKey = findColumnByPattern(keys, ['Certification', 'Censor'])
  const cert = normalizeCertification(certKey ? row[certKey] : null)
  const recensorFlag = cert === 'A'

  // ── Color / B&W ───────────────────────────────────────────────
  const colorKey = findColumnByPattern(keys, ['Color/B/W', 'Color/BW', 'Color or BW', 'Color'])
  const colorOrBw = cleanString(colorKey ? row[colorKey] : null) ?? null

  // ── Jointly owned ────────────────────────────────────────────
  // New sheet: col 10 = "Jointly Owned" (Yes/No), col 11 = "Jointly Owned by", col 12 = "Revenue Share", col 13 = "Joint Buy Back date"
  const jointlyOwnedKey = findColumnByPattern(keys, ['Jointly Owned'])
  const jointlyOwnedByKey = findColumnByPattern(keys, ['Jointly Owned by', 'Jointly Owned By'])
  const revenueShareKey = findColumnByPattern(keys, ['Revenue Share'])
  const buyBackKey = findColumnByPattern(keys, ['Joint Buy Back', 'Buy Back Date'])

  const jointlyOwnedRaw = jointlyOwnedKey ? cleanString(row[jointlyOwnedKey]) : null
  const isJointlyOwned = jointlyOwnedRaw?.toLowerCase() === 'yes'
  // "Sold to Grassroot" (or similar) in the Jointly Owned column — store as a note in jointly_exploitation_rights
  const isSoldEntry = jointlyOwnedRaw && !isJointlyOwned && jointlyOwnedRaw.toLowerCase().startsWith('sold')

  // Home productions always require legal approval — never auto-approve on import
  const approvalStatus = 'pending'

  const movieData: Record<string, unknown> = {
    title,
    production_no: productionNo,
    source: 'home_production',
    release_date: releaseDate,
    release_year: releaseYear,
    certification: cert,
    recensor_flag: recensorFlag,
    color_or_bw: colorOrBw,
    language,
    production_house_name: productionHouseName,
    trailer_link: cleanString(row['YT Trailer Link'] ?? row['YT Link']),
    remarks: cleanString(row['Remarks']),
    actionables: cleanString(row['Actionables'] ?? row['Actionable']),
    jointly_owned: isJointlyOwned,
    // "Sold to Grassroot" in the Jointly Owned column → store the sold note here
    jointly_exploitation_rights: isJointlyOwned && jointlyOwnedByKey
      ? preserveRawText(row[jointlyOwnedByKey])
      : isSoldEntry ? jointlyOwnedRaw : null,
    revenue_share: isJointlyOwned && revenueShareKey ? preserveRawText(row[revenueShareKey]) : null,
    joint_prod_buy_back_date: isJointlyOwned && buyBackKey ? parseDate(row[buyBackKey]) : null,
    clip_rights: 'Yes',
    character_rights: 'Yes',
    prequel_sequel_rights: 'Yes',
    subtitling_rights: 'Yes',
    dubbing_rights: 'Yes',
    wtp_library: null,
    approval_status: approvalStatus,
    created_by: userId,
  }

  const castKey = findColumnByPattern(keys, ['Cast Details', 'Cast'])
  const directorKey = findColumnByPattern(keys, ['Director'])

  if (existingId && resolution === 'update') {
    await cache.updateMovie(existingId, movieData)
    const movieId = existingId
    await relinkPeople(row, cache, movieId, castKey, directorKey)
    if (platformSlots) {
      await cache.clearMoviePlatformRights(movieId)
      await extractPlatformRights(rawDataCols, platformSlots, cache, movieId, slotErrors, true, continuationColArrays)
    }
    return 'updated'
  }

  const movieId = await cache.insertMovieRaw(movieData)
  if (!movieId) return 'skipped'

  cache.movies.set(titleKey, movieId)

  await relinkPeople(row, cache, movieId, castKey, directorKey)
  if (platformSlots) {
    await extractPlatformRights(rawDataCols, platformSlots, cache, movieId, slotErrors, true, continuationColArrays)
  }
  return 'created'
}

// Shared helper — wipe and re-link cast + directors for a movie row
async function relinkPeople(row: Record<string, string>, cache: CacheStore, movieId: string, castKey?: string | null, directorKey?: string | null): Promise<void> {
  await cache.clearMoviePeople(movieId)

  const castRaw = castKey ? row[castKey] : row['Cast']
  const castList = parseCastList(castRaw)
  for (let i = 0; i < castList.length; i++) {
    const personId = await cache.getOrCreatePerson(castList[i])
    if (personId) await cache.insertMovieCast(movieId, personId, 'Actor', i + 1)
  }

  const directorRaw = directorKey ? row[directorKey] : row['Director']
  const directorList = parseDirector(directorRaw)
  for (const dirName of directorList) {
    const personId = await cache.getOrCreatePerson(dirName)
    if (personId) await cache.insertMovieDirector(movieId, personId)
  }
}

function parseHoldbacks(value: string | null | undefined): string | null {
  const raw = cleanString(value)
  if (!raw) return null
  // Already stored as "on VALUE1,VALUE2" — normalise
  const stripped = raw.replace(/^on\s*/i, '').trim()
  if (!stripped) return null
  return `on ${stripped}`
}

// Blank/null → 'No' (for rights flags where absence means not licensed)
function parseYesNoDefault(value: string | null | undefined): string {
  const v = cleanString(value)
  if (!v) return 'No'
  const lower = v.toLowerCase()
  if (lower === 'yes' || lower === 'y') return 'Yes'
  if (lower === 'no' || lower === 'n') return 'No'
  // Non-boolean value (e.g. "Cable TV" for Other Rights) — store as-is
  return v
}

interface MovieRightsPayload {
  [key: string]: unknown
  movie_id: string
  right_type: string
  nature: string | null
  classification: string | null
  territory: string | null
  start_date: string | null
  end_date: string | null
  syndication: string | null
  holdbacks: string | null
}

/**
 * Column key cache for movie_rights extraction — computed once per import, reused per row.
 *
 * The acquired sheet primary rights section has:
 *   - Flags:          Satellite Rights | Internet Rights | Negative Rights | Other Rights
 *   - Classification: Satellite Rights Classification | Internet Classification
 *   - Nature:         Nature of Satellite Rights | Nature of Internet Rights |
 *                     Nature of Negative Rights | Nature of Other Rights
 *   - Dates:          Satellite Rights Start/End Date | Internet Rights Start/End Date |
 *                     Negative Rights Start/End Date | Other Rights Start/End Date
 *   - Shared:         Territory (one column for all) | Holdbacks | Syndication- Internet Rights
 *
 * Airborne and Ship rights appear only in the platform rights section (cols 112+),
 * not in the primary rights flags, so they are NOT included here.
 */
interface MovieRightsColKeys {
  satRightsKey: string | null
  intRightsKey: string | null
  negRightsKey: string | null
  othRightsKey: string | null
  satClassKey: string | null
  intClassKey: string | null
  othClassKey: string | null
  syndicationIntKey: string | null
  holdbacksKey: string | null
  natSatKey: string | null
  natIntKey: string | null
  natNegKey: string | null
  natOthKey: string | null
  satStartKey: string | null
  satEndKey: string | null
  intStartKey: string | null
  intEndKey: string | null
  negStartKey: string | null
  negEndKey: string | null
  othStartKey: string | null
  othEndKey: string | null
  territoryKey: string | null
}

function buildMovieRightsColKeys(keys: string[]): MovieRightsColKeys {
  return {
    satRightsKey:     findColumnByPattern(keys, ['Satellite Rights']),
    intRightsKey:     findColumnByPattern(keys, ['Internet Rights']),
    negRightsKey:     findColumnByPattern(keys, ['Negative Rights']),
    othRightsKey:     findColumnByPattern(keys, ['Other Rights', 'Others']),
    satClassKey:      findColumnByPattern(keys, ['Satellite Rights Classification', 'Satellite Classification']),
    intClassKey:      findColumnByPattern(keys, ['Internet Classification', 'Internet Rights - Classification', 'Internet Rights Classification']),
    othClassKey:      findColumnByPattern(keys, ['Other Rights Classification', 'Other Classification']),
    syndicationIntKey: findColumnByPattern(keys, ['Syndication- Internet Rights', 'Syndication - Internet Rights', 'Internet Rights Syndication', 'Syndication']),
    holdbacksKey:     findColumnByPattern(keys, ['Holdbacks', 'Holdback']),
    natSatKey:        findColumnByPattern(keys, ['Nature of Satellite Rights', 'Nature of Satellite']),
    natIntKey:        findColumnByPattern(keys, ['Nature of Internet Rights', 'Nature of Internet']),
    natNegKey:        findColumnByPattern(keys, ['Nature of Negative Rights', 'Nature of Negative']),
    natOthKey:        findColumnByPattern(keys, ['Nature of Other Rights', 'Nature of Other']),
    satStartKey:      findColumnByPattern(keys, ['Satellite Rights Start Date', 'Satellite Start Date']),
    satEndKey:        findColumnByPattern(keys, ['Satellite Rights End Date',   'Satellite End Date']),
    intStartKey:      findColumnByPattern(keys, ['Internet Rights Start Date',  'Internet Start Date']),
    intEndKey:        findColumnByPattern(keys, ['Internet Rights End Date',    'Internet End Date']),
    negStartKey:      findColumnByPattern(keys, ['Negative Rights Start Date',  'Negative Start Date']),
    negEndKey:        findColumnByPattern(keys, ['Negative Rights End Date',    'Negative End Date']),
    othStartKey:      findColumnByPattern(keys, ['Other Rights Start Date',     'Other Start Date']),
    othEndKey:        findColumnByPattern(keys, ['Other Rights End Date',       'Other End Date']),
    territoryKey:     findColumnByPattern(keys, ['Territory']),
  }
}

/**
 * Build movie_rights DB rows from a primary CSV row plus optional continuation rows.
 *
 * Primary rights in the acquired sheet: Satellite, Internet, Negative, Other.
 * Each type has: Yes/No flag, classification, nature, territory (shared), start/end date,
 * syndication (Internet only), holdbacks (shared).
 *
 * Multi-nature continuation rows: when a movie has multiple natures for the same right type,
 * the sheet adds continuation rows that only have nature/territory/start/end filled.
 * Those are passed in `continuationRows` and each generates an additional movie_rights record.
 */
function buildMovieRightsRows(
  movieId: string,
  row: Record<string, string>,
  keys: string[],
  col: (row: Record<string, string>, key: string | null) => string | undefined,
  ck?: MovieRightsColKeys,
  continuationRows?: Record<string, string>[],
): MovieRightsPayload[] {
  const rows: MovieRightsPayload[] = []
  const k = ck ?? buildMovieRightsColKeys(keys)

  const satVal = parseYesNoDefault(col(row, k.satRightsKey))
  const intVal = parseYesNoDefault(col(row, k.intRightsKey))
  const negVal = parseYesNoDefault(col(row, k.negRightsKey))
  const othVal = parseYesNoDefault(col(row, k.othRightsKey))

  const territory = cleanString(col(row, k.territoryKey)) ?? null
  const holdbacks = parseHoldbacks(cleanString(col(row, k.holdbacksKey)))

  // ── Primary row: one record per active right type ──────────────────────
  const satNature = preserveRawText(col(row, k.natSatKey))
  const satClass = cleanString(col(row, k.satClassKey))
  const satStartDate = parseDate(col(row, k.satStartKey))
  const satEndDate = parseDate(col(row, k.satEndKey))
  if (satVal === 'Yes' || satNature || satClass || satStartDate || satEndDate) {
    rows.push({
      movie_id: movieId,
      right_type: 'Satellite',
      nature: satNature || (satVal === 'Yes' ? 'Owned' : null),
      classification: satClass,
      territory,
      start_date: satStartDate,
      end_date: satEndDate,
      syndication: null,
      holdbacks,
    })
  }

  const intNature = preserveRawText(col(row, k.natIntKey))
  const intClass = cleanString(col(row, k.intClassKey))
  const intStartDate = parseDate(col(row, k.intStartKey))
  const intEndDate = parseDate(col(row, k.intEndKey))
  // Create Internet row if the Yes flag is set OR if detailed data exists.
  // Default nature to 'Owned' when flag=Yes but no nature text — satisfies NOT NULL.
  if (intVal === 'Yes' || intNature || intClass || intStartDate || intEndDate) {
    rows.push({
      movie_id: movieId,
      right_type: 'Internet',
      nature: intNature || (intVal === 'Yes' ? 'Owned' : null),
      classification: intClass,
      territory,
      start_date: intStartDate,
      end_date: intEndDate,
      syndication: preserveRawText(col(row, k.syndicationIntKey)),
      holdbacks,
    })
  }

  const negNature = preserveRawText(col(row, k.natNegKey))
  if (negVal === 'Yes' || negNature || parseDate(col(row, k.negStartKey)) || parseDate(col(row, k.negEndKey))) {
    rows.push({
      movie_id: movieId,
      right_type: 'Negative',
      nature: negNature || (negVal === 'Yes' ? 'Owned' : null),
      classification: null,
      territory,
      start_date: parseDate(col(row, k.negStartKey)),
      end_date: parseDate(col(row, k.negEndKey)),
      syndication: null,
      holdbacks,
    })
  }

  // "Other Rights" cell may carry a label like "Yes ( Airborne Rights, Ship Rights...)"
  // or just "Yes". Store the raw value as classification when it isn't a plain Yes/No.
  const othNature = preserveRawText(col(row, k.natOthKey))
  if (othVal && othVal !== 'No') {
    rows.push({
      movie_id: movieId,
      right_type: 'Other',
      nature: othNature,
      classification: othVal !== 'Yes' ? othVal : cleanString(col(row, k.othClassKey)),
      territory,
      start_date: parseDate(col(row, k.othStartKey)),
      end_date: parseDate(col(row, k.othEndKey)),
      syndication: null,
      holdbacks,
    })
  }

  // ── Continuation rows: additional natures for the same right types ─────
  // A continuation row has the rights flag blank but fills in nature/start/end
  // for the type(s) it adds a new nature to.
  if (continuationRows) {
    for (const contRow of continuationRows) {
      const contTerritory = cleanString(col(contRow, k.territoryKey)) ?? territory
      const contHoldbacks = parseHoldbacks(cleanString(col(contRow, k.holdbacksKey))) ?? holdbacks

      const pushIfData = (
        rightType: string,
        natKey: string | null,
        startKey: string | null,
        endKey: string | null,
        classKey: string | null,
        synKey: string | null,
      ) => {
        const nature = preserveRawText(col(contRow, natKey))
        const startDate = parseDate(col(contRow, startKey))
        const endDate = parseDate(col(contRow, endKey))
        if (!nature && !startDate && !endDate) return
        rows.push({
          movie_id: movieId,
          right_type: rightType,
          nature,
          classification: cleanString(col(contRow, classKey)),
          territory: contTerritory,
          start_date: startDate,
          end_date: endDate,
          syndication: synKey ? preserveRawText(col(contRow, synKey)) : null,
          holdbacks: contHoldbacks,
        })
      }

      pushIfData('Satellite', k.natSatKey, k.satStartKey, k.satEndKey, k.satClassKey, null)
      pushIfData('Internet',  k.natIntKey, k.intStartKey, k.intEndKey, k.intClassKey, k.syndicationIntKey)
      pushIfData('Negative',  k.natNegKey, k.negStartKey, k.negEndKey, null, null)
      pushIfData('Other',     k.natOthKey, k.othStartKey, k.othEndKey, k.othClassKey, null)
    }
  }

  return rows
}

async function processAcquiredRow(
  row: Record<string, string>,
  keys: string[],
  cache: CacheStore,
  userId: string,
  userRole: string,
  resolution: 'skip' | 'update' | null,
  platformSlots: PlatformSlot[] | null,
  rawDataCols: string[],
  slotErrors: PlatformRightsRowError[],
  continuationRows?: Record<string, string>[],
  continuationRawCols?: string[][],
): Promise<'created' | 'skipped' | 'updated'> {
  // ── Required field ───────────────────────────────────────
  const movieNameKey = findColumnByPattern(keys, ['Movie Name', 'Movie Title', 'Title'])
  const title = cleanString(col(row, movieNameKey) ?? row['Movie Name'])
  if (!title) throw new Error('Movie Name is required — column not found or value is empty')

  const titleKey = title.toLowerCase().trim()
  const existingId = cache.movies.get(titleKey) ?? null

  if (existingId) {
    if (!resolution || resolution === 'skip') return 'skipped'
    // resolution === 'update' → fall through
  }

  // ── Release year / date ──────────────────────────────────
  const releaseYearKey = findColumnByPattern(keys, ['Release Year', 'Release Date'])
  const releaseYearVal = cleanString(col(row, releaseYearKey))
  const releaseDate = parseDate(releaseYearVal)
  const releaseYear = extractYearFromDate(releaseYearVal)

  // ── Production house ─────────────────────────────────────
  const productionHouseKey = findColumnByPattern(keys, ['Production House'])
  const rawProductionHouse = productionHouseKey ? cleanString(row[productionHouseKey]) : null
  if (rawProductionHouse) {
    if (rawProductionHouse.includes('&') || rawProductionHouse.includes('-') || rawProductionHouse.includes(',')) {
      for (const part of rawProductionHouse
        .split(/[&,-]/)
        .map((p) => p.trim())
        .filter(Boolean)) {
        await cache.getOrCreateProductionHouse(part)
      }
    } else {
      await cache.getOrCreateProductionHouse(rawProductionHouse)
    }
  }

  // ── Language ─────────────────────────────────────────────
  const langKey = findColumnByPattern(keys, ['Language'])
  const languageRaw = langKey ? row[langKey] : null
  const language = languageRaw
    ? languageRaw
        .trim()
        .replace(/\s*[Dd]ubbed\s*/g, '')
        .trim()
    : null

  // ── Assignor / Licensor ──────────────────────────────────
  const assignorKey = findColumnByPattern(keys, ['Assignor', 'Licensor', 'Assignor/ Licensor', 'Assignor/Licensor'])
  const assignorVal = cleanString(col(row, assignorKey))

  // ── Licensee ─────────────────────────────────────────────
  const licenseeKey = findColumnByPattern(keys, ['Licensee'])
  const licenseeVal = cleanString(col(row, licenseeKey))

  // ── Agreement dates ──────────────────────────────────────
  const agrmtDateKey = findColumnByPattern(keys, ['Date of Agreement', 'Agreement Date'])
  const agrmtStartKey = findColumnByPattern(keys, ['Agreement Start Date'])
  const agrmtEndKey = findColumnByPattern(keys, ['Agreement End Date'])

  // ── Certification / color ────────────────────────────────
  const certKey = findColumnByPattern(keys, ['Certification', 'Certif'])
  const colorKey = findColumnByPattern(keys, ['Color/B/W', 'Color / B/W', 'Colour'])

  // ── Clip rights ──────────────────────────────────────────
  const clipRightsKey = findColumnByPattern(keys, ['Clip Rights'])
  const clipDurKey = findColumnByPattern(keys, ['Duration', 'Clip Rights Duration'])

  // ── Derivative / secondary ───────────────────────────────
  const preqSeqKey = findColumnByPattern(keys, ['Prequel/ Sequel Rights', 'Prequel/Sequel Rights', 'Prequel Sequel'])
  const charRightsKey = findColumnByPattern(keys, ['Character Rights'])
  const subtitleKey = findColumnByPattern(keys, ['Sub-Titling Rights', 'Subtitling Rights', 'Sub Titling'])
  const dubbingKey = findColumnByPattern(keys, ['Dubbing Rights'])

  // ── Other metadata ───────────────────────────────────────
  const remarksKey = findColumnByPattern(keys, ['Remarks'])
  const actionablesKey = findColumnByPattern(keys, ['Actionables', 'Actionable'])
  const castKey = findColumnByPattern(keys, ['Cast Details', 'Cast'])
  const directorKey = findColumnByPattern(keys, ['Director'])

  // ── Build movie record (no flat rights columns — they live in movie_rights) ─
  const movieData: Record<string, unknown> = {
    title,
    source: 'acquired',
    release_date: releaseDate,
    release_year: releaseYear,
    production_house_name: rawProductionHouse || null,
    certification: normalizeCertification(col(row, certKey)),
    language,
    color_or_bw: cleanString(col(row, colorKey)) || 'Color',
    assignor_licensor: assignorVal,
    licensee: licenseeVal,
    agreement_date: parseDate(col(row, agrmtDateKey)),
    agreement_start_date: parseDate(col(row, agrmtStartKey)),
    agreement_end_date: parseDate(col(row, agrmtEndKey)),
    // Clip rights (standalone — no nature/territory)
    clip_rights: parseYesNoDefault(col(row, clipRightsKey)),
    clip_rights_duration: cleanString(col(row, clipDurKey)),
    // Derivative / secondary
    prequel_sequel_rights: preserveRawText(col(row, preqSeqKey)),
    character_rights: preserveRawText(col(row, charRightsKey)),
    subtitling_rights: preserveRawText(col(row, subtitleKey)),
    dubbing_rights: preserveRawText(col(row, dubbingKey)),
    remarks: cleanString(col(row, remarksKey)),
    actionables: cleanString(col(row, actionablesKey)),
    approval_status: userRole === 'admin' ? 'approved' : 'pending',
  }

  // Pre-build column key cache once — reused across primary + continuation rows
  const ck = buildMovieRightsColKeys(keys)

  if (existingId && resolution === 'update') {
    await cache.updateMovie(existingId, movieData)
    await relinkPeople(row, cache, existingId, castKey, directorKey)
    // Sync movie_rights (including continuation rows for extra natures)
    await cache.clearMovieRights(existingId)
    const mrRows = buildMovieRightsRows(existingId, row, keys, col, ck, continuationRows)
    await cache.insertMovieRightsRows(mrRows)
    // Sync platform_rights (including continuation rows for extra natures)
    if (platformSlots) {
      await cache.clearMoviePlatformRights(existingId)
      await extractPlatformRights(rawDataCols, platformSlots, cache, existingId, slotErrors, false, continuationRawCols)
    }
    return 'updated'
  }

  movieData.created_by = userId
  const movieId = await cache.insertMovie(movieData)
  if (!movieId) return 'skipped'

  cache.movies.set(titleKey, movieId)

  await relinkPeople(row, cache, movieId, castKey, directorKey)
  // Insert movie_rights rows (including continuation rows for extra natures)
  const mrRows = buildMovieRightsRows(movieId, row, keys, col, ck, continuationRows)
  await cache.insertMovieRightsRows(mrRows)
  // Insert platform_rights rows (including continuation rows for extra natures)
  if (platformSlots) {
    await extractPlatformRights(rawDataCols, platformSlots, cache, movieId, slotErrors, false, continuationRawCols)
  }

  return 'created'
}

// ============================================
// Format Detection & Validation
// ============================================

function detectCSVFormat(headers: string[]): 'home' | 'acquired' | 'unknown' {
  const headersLower = headers.map((h) => h.toLowerCase().trim())

  // Home: has "Jointly Owned" column (unique to home sheet) or "Production No" at col 0
  if (headersLower.some((h) => h === 'jointly owned')) return 'home'
  if (headersLower[0] === 'production no') return 'home'
  // Legacy home format: had "Title" as the primary movie name column
  if (headersLower.some((h) => h === 'title') && !headersLower.some((h) => h.includes('assignor') || h.includes('licensor'))) return 'home'

  // Acquired: has Assignor/Licensor column or is definitively NOT home
  if (headersLower.some((h) => h.includes('assignor') || h.includes('licensor'))) return 'acquired'
  if (headersLower.some((h) => h === 'movie name')) return 'acquired'

  return 'unknown'
}

function validateHeaders(headers: string[], format: 'home' | 'acquired'): { valid: boolean; error?: string; warnings: string[] } {
  const headersLower = headers.map((h) => h.toLowerCase().trim())
  const warnings: string[] = []

  if (format === 'home') {
    // Home sheet requires either "Movie Name" (new format) or "Title" (legacy)
    const hasTitle = headersLower.some((h) => h === 'movie name' || h === 'title')
    if (!hasTitle) {
      return {
        valid: false,
        error: "Home production CSV is missing the required 'Movie Name' column. " + `First columns found: ${headers.slice(0, 10).join(', ')}`,
        warnings: [],
      }
    }
    for (const label of ['Cast', 'Director', 'Language', 'Production House']) {
      if (!headersLower.some((h) => h.includes(label.toLowerCase()))) {
        warnings.push(label)
      }
    }
  } else {
    const hasMovieName = headersLower.some((h) => h === 'movie name' || h === 'movie title' || h === 'title')
    if (!hasMovieName) {
      return {
        valid: false,
        error: "Acquired CSV is missing the required 'Movie Name' column. " + `First columns found: ${headers.slice(0, 10).join(', ')}`,
        warnings: [],
      }
    }
    const usefulCols: [string, string][] = [
      ['cast details', 'Cast Details'],
      ['director', 'Director'],
      ['release year', 'Release Year'],
      ['agreement start date', 'Agreement Start Date'],
      ['agreement end date', 'Agreement End Date'],
    ]
    for (const [pattern, label] of usefulCols) {
      if (!headersLower.some((h) => h.includes(pattern))) {
        warnings.push(label)
      }
    }
  }

  return { valid: true, warnings }
}

// ============================================
// Main POST Handler
// ============================================

export async function POST(request: Request) {
  try {
    // 1. Auth check
    const serverClient = await createServerClient()
    const {
      data: { user },
    } = await serverClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await serverClient.from('user_profiles').select('role').eq('id', user.id).single()

    if (!profile || !['admin', 'editor'].includes(profile.role)) {
      return NextResponse.json({ message: 'Only admins and editors can import data' }, { status: 403 })
    }

    // 2. Validate file
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ message: 'No file provided' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ message: 'File size must be under 10MB' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      return NextResponse.json({ message: 'Only CSV files are accepted' }, { status: 400 })
    }

    // 3. Parse CSV
    const text = await file.text()
    const cleanText = text.replace(/^﻿/, '') // strip BOM

    // Use PapaParse for all row extraction — it correctly handles quoted newlines
    // (e.g. "Syndication- Internet Rights\n(Y/N)" stays as one cell, not two lines).
    //
    // Acquired format: up to 3 preamble rows before data
    //   Row 0: section groupings (sparse — no 'movie name')
    //   Row 1: "Movie Name,,,,Primary Rights,..." — primary header
    //   Row 2: ",Assignor/ Licensor,Licensee,..." — sub-header (first cell empty)
    //   Row 3+: data rows
    // Home format: first non-preamble row is "Title,Production No,..."

    // Parse first 12 rows (enough to cover all preamble) without skipping empties
    const preambleParsed = Papa.parse<string[]>(cleanText, {
      header: false,
      skipEmptyLines: false,
      preview: 12,
    })
    const preambleRows: string[][] = preambleParsed.data as string[][]

    // Find which row index contains the primary header
    let headerRowIndex = 0
    for (let i = 0; i < preambleRows.length; i++) {
      const lower = preambleRows[i].map((c) => c.toLowerCase().trim())
      if (lower.some((c) => c === 'movie name' || c === 'title' || c.includes('production no'))) {
        headerRowIndex = i
        break
      }
    }

    // Check if the NEXT row is a sub-header (first cell empty + ≥3 real field names)
    const examplePatterns = ['yes/no', 'dd/mm/yyyy', 'yyyy', 'text', 'color/b/w']
    let subHeaderRowIndex: number | null = null
    const nextRowIdx = headerRowIndex + 1
    if (nextRowIdx < preambleRows.length) {
      const nextCells = preambleRows[nextRowIdx]
      const firstEmpty = !nextCells[0] || nextCells[0].trim() === ''
      const nonEmpty = nextCells.filter((c) => c.trim() !== '')
      const isExample = nonEmpty.filter((c) => examplePatterns.some((p) => c.toLowerCase().trim().startsWith(p))).length >= 3
      if (firstEmpty && nonEmpty.length >= 3 && !isExample) {
        subHeaderRowIndex = nextRowIdx
      }
    }

    // Build synthetic merged header: sub-row cell wins when non-empty, else primary-row cell.
    // Collapse embedded newlines inside cell values. De-duplicate with _2, _3 suffixes.
    let syntheticHeaders: string[] | null = null
    if (subHeaderRowIndex !== null) {
      const primaryCells = preambleRows[headerRowIndex]
      const subCells = preambleRows[subHeaderRowIndex]
      const maxLen = Math.max(primaryCells.length, subCells.length)
      const seen = new Map<string, number>()
      syntheticHeaders = Array.from({ length: maxLen }, (_, i) => {
        const sub = (subCells[i] || '').replace(/\s*\n\s*/g, ' ').trim()
        const primary = (primaryCells[i] || '').replace(/\s*\n\s*/g, ' ').trim()
        let name = sub || primary || `_col${i}`
        const count = seen.get(name) || 0
        seen.set(name, count + 1)
        if (count > 0) name = `${name}_${count + 1}`
        return name
      })
    }

    // Parse the full file (no row limit), then slice off the preamble rows
    const fullParsed = Papa.parse<string[]>(cleanText, { header: false, skipEmptyLines: false })
    const fullRows: string[][] = fullParsed.data as string[][]

    let allRows: unknown[]
    let rawDataColArrays: string[][] = [] // parallel to allRows — raw column arrays per data row
    let parseErrors: { type?: string; message: string; row?: number }[]
    let headers: string[]
    let effectiveDataStartRow = headerRowIndex + 1 // updated below when sub-rows are skipped

    if (syntheticHeaders) {
      // Data starts after the sub-header row; drop all-empty rows
      const dataRows = fullRows.slice(subHeaderRowIndex! + 1).filter((r) => r.some((c) => c.trim() !== ''))
      parseErrors = fullParsed.errors as { type?: string; message: string; row?: number }[]
      allRows = dataRows.map((cols) => {
        const obj: Record<string, string> = {}
        syntheticHeaders!.forEach((h, i) => {
          obj[h] = cols[i] ?? ''
        })
        return obj
      })
      rawDataColArrays = dataRows
      headers = syntheticHeaders
    } else {
      // Simple single-header format
      const headerRow = preambleRows[headerRowIndex].map((h) => h.replace(/\s*\n\s*/g, ' ').trim())
      // For home format, rows immediately after the header may be platform type/field sub-headers
      // (rows 1 and 2 in the standard home layout). Skip them by detecting known section banners.
      const knownSections = ['satellite rights', 'internet rights']
      let dataStartOffset = headerRowIndex + 1
      for (let si = dataStartOffset; si < Math.min(dataStartOffset + 3, preambleRows.length); si++) {
        const rowCells = preambleRows[si]
        const hasSection = rowCells.some((c) => knownSections.some((s) => c.toLowerCase().trim().includes(s)))
        const hasPlatformHeader = rowCells.some((c) => {
          const cl = c.toLowerCase().trim()
          return cl === 'platform/license' || cl === 'platform / license' || cl.startsWith('platform -')
        })
        const hasPlatformType = rowCells.some((c) => {
          const cl = c.toLowerCase().trim()
          return ['satellite tv', 'svod', 'tvod', 'avod', 'dth vod', 'terrestrial tv'].includes(cl)
        })
        if (hasSection || hasPlatformHeader || hasPlatformType) {
          dataStartOffset = si + 1
        }
      }
      effectiveDataStartRow = dataStartOffset
      const dataRows = fullRows.slice(dataStartOffset).filter((r) => r.some((c) => c.trim() !== ''))
      parseErrors = fullParsed.errors as { type?: string; message: string; row?: number }[]
      allRows = dataRows.map((cols) => {
        const obj: Record<string, string> = {}
        headerRow.forEach((h, i) => {
          obj[h] = cols[i] ?? ''
        })
        return obj
      })
      rawDataColArrays = dataRows
      headers = headerRow
    }

    // Filter out "TooFewFields" / "TooManyFields" warnings — PapaParse still parses these rows fine
    const fatalErrors = parseErrors.filter((e: { type?: string; message: string }) => e.type !== 'FieldMismatch')
    if (fatalErrors.length > 0) {
      return NextResponse.json(
        {
          message: 'CSV parsing failed',
          errors: fatalErrors.map((e: { row?: number; message: string }) => ({
            row: (e.row ?? 0) + headerRowIndex + 1,
            message: e.message,
          })),
        },
        { status: 400 },
      )
    }

    // 4. Detect format
    const detectedFormat = detectCSVFormat(headers)
    if (detectedFormat === 'unknown') {
      return NextResponse.json(
        {
          message:
            "Could not detect CSV format. The file must have a 'Movie Name' + 'Jointly Owned' column (home production) or a 'Movie Name' + 'Assignor/Licensor' column (acquired). " +
            `Columns found: ${headers.slice(0, 15).join(', ')}${headers.length > 15 ? '…' : ''}`,
        },
        { status: 400 },
      )
    }

    // 5. Validate headers
    const validation = validateHeaders(headers, detectedFormat)
    if (!validation.valid) {
      return NextResponse.json({ message: validation.error }, { status: 400 })
    }

    // 5a. Parse platform slot map for both acquired and home formats.
    //
    // Acquired (3-row preamble + sub-header):
    //   Banner row = preambleRows[headerRowIndex - 1]
    //   Type row   = preambleRows[headerRowIndex]
    //   Field row  = preambleRows[subHeaderRowIndex]
    //
    // Home (2-row preamble above the field header):
    //   Banner row = preambleRows[headerRowIndex - 2]
    //   Type row   = preambleRows[headerRowIndex - 1]
    //   Field row  = preambleRows[headerRowIndex]   ← same row as metadata headers
    let acquiredPlatformSlots: PlatformSlot[] | null = null
    if (detectedFormat === 'acquired' && subHeaderRowIndex !== null) {
      const typeRow = preambleRows[headerRowIndex]
      const fieldRow = preambleRows[subHeaderRowIndex]
      acquiredPlatformSlots = parsePlatformRightsSections(typeRow, fieldRow)
    }
    let homePlatformSlots: PlatformSlot[] | null = null
    if (detectedFormat === 'home') {
      // Home CSV layout: row 0 = metadata headers + banner labels (SATELLITE RIGHTS, INTERNET RIGHTS...)
      //                  row 1 = platform type labels (Satellite TV, SVOD, ...)
      //                  row 2 = platform field headers (Platform/License, Category, Start Date, ...)
      // headerRowIndex is 0 in this layout, so we always use rows [0,1,2] as [banner,type,field].
      if (headerRowIndex >= 2) {
        // Legacy layout where preamble rows sit above the header
        const typeRow = preambleRows[headerRowIndex - 1] ?? []
        const fieldRow = preambleRows[headerRowIndex]
        homePlatformSlots = parsePlatformRightsSections(typeRow, fieldRow)
      } else {
        // Standard home layout: header row IS row 0; platform sub-rows are rows 1 and 2
        const typeRow = preambleRows[headerRowIndex + 1] ?? []     // row 1 — platform type labels
        const fieldRow = preambleRows[headerRowIndex + 2] ?? []    // row 2 — Platform/License, Category…
        homePlatformSlots = parsePlatformRightsSections(typeRow, fieldRow)
      }
    }

    // 6. Strip the "accepted values" example row (row immediately after the header that
    //    contains strings like "Yes/No", "DD/MM/YYYY", "Text" — not real data).
    const isExampleRow = (r: Record<string, string>): boolean => {
      const vals = Object.values(r).map((v) => (v || '').toLowerCase().trim())
      const examplePatterns = ['yes/no', 'dd/mm/yyyy', 'yyyy', 'text', 'color/b/w', 'exclusive/non-exclusive']
      const matchCount = vals.filter((v) => examplePatterns.some((p) => v === p || v.startsWith(p))).length
      return matchCount >= 3
    }

    // Keep parallel rawDataColArrays in sync with rows after example-row filtering
    const allRowsTyped = allRows as Record<string, string>[]
    const filteredPairs = allRowsTyped
      .map((r, i) => ({ r, cols: rawDataColArrays[i] }))
      .filter(({ r }) => !isExampleRow(r))
    const rows = filteredPairs.map((p) => p.r)
    const rawCols = filteredPairs.map((p) => p.cols)

    // 7. Create supabase admin client
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

    // 8. Initialize cache and load existing data
    const cache = new CacheStore(supabaseAdmin)
    await cache.loadExisting()

    // 9. Parse conflict resolutions sent by client (JSON string in form field)
    const resolutionsRaw = formData.get('resolutions') as string | null
    const resolutions: Record<string, 'skip' | 'update'> = resolutionsRaw ? JSON.parse(resolutionsRaw) : {}

    // 9a. Group rows: a continuation row has no movie name and belongs to the most
    //     recent primary row. Both acquired and home formats use continuation rows for
    //     additional platform natures (e.g. DTH with two nature entries).
    //
    // A continuation row is defined as: Movie Name cell is blank/null AND at least one
    // data cell is non-empty.

    interface AcquiredGroup {
      primaryIndex: number              // index into rows[] for the primary row
      continuationIndexes: number[]     // indexes of following continuation rows
    }

    const movieNameKey = findColumnByPattern(headers, ['Movie Name', 'Movie Title', 'Title'])

    const buildGroups = (): AcquiredGroup[] => {
      const groups: AcquiredGroup[] = []
      let currentGroup: AcquiredGroup | null = null
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as Record<string, string>
        const title = cleanString(col(row, movieNameKey) ?? (movieNameKey ? row[movieNameKey] : undefined))
        if (title) {
          currentGroup = { primaryIndex: i, continuationIndexes: [] }
          groups.push(currentGroup)
        } else if (currentGroup) {
          currentGroup.continuationIndexes.push(i)
        }
      }
      return groups
    }

    let acquiredGroups: AcquiredGroup[] = []
    let homeGroups: AcquiredGroup[] = []

    if (detectedFormat === 'acquired') {
      acquiredGroups = buildGroups()
    } else {
      homeGroups = buildGroups()
    }

    // 9b. First pass: detect unresolved conflicts before writing anything
    {
      const unresolvedConflicts: ConflictRow[] = []

      if (detectedFormat === 'home') {
        // Home: check only primary rows (continuation rows belong to the same movie)
        for (const group of homeGroups) {
          const row = rows[group.primaryIndex] as Record<string, string>
          const title = cleanString(movieNameKey ? row[movieNameKey] : row['Movie Name'] ?? row['Title'])
          if (!title) continue
          const existingId = cache.movies.get(title.toLowerCase().trim()) ?? null
          if (existingId && !(title in resolutions)) {
            unresolvedConflicts.push({ row: group.primaryIndex + 2, title, existingId })
          }
        }
      } else {
        // Acquired: check only primary rows (continuation rows belong to the same movie)
        for (const group of acquiredGroups) {
          const row = rows[group.primaryIndex] as Record<string, string>
          const title = cleanString(col(row, movieNameKey) ?? row['Movie Name'])
          if (!title) continue
          const titleKey = title.toLowerCase().trim()
          const existingId = cache.movies.get(titleKey) ?? null
          if (existingId && !(title in resolutions)) {
            unresolvedConflicts.push({ row: group.primaryIndex + 2, title, existingId })
          }
        }
      }

      if (unresolvedConflicts.length > 0) {
        return NextResponse.json({ needsResolution: true, conflicts: unresolvedConflicts })
      }
    }

    // 10. Process rows
    const errors: RowError[] = []
    let success = 0
    let skipped = 0
    let updated = 0

    const dataStartRowIndex = subHeaderRowIndex !== null ? subHeaderRowIndex + 1 : effectiveDataStartRow

    if (detectedFormat === 'home') {
      // Iterate over pre-grouped primary rows, passing continuation raw col arrays along
      for (const group of homeGroups) {
        const i = group.primaryIndex
        const row = rows[i] as Record<string, string>
        const rowNum = i + dataStartRowIndex + 1
        const contRawCols = group.continuationIndexes.map((ci) => rawCols[ci] ?? [])

        try {
          const homeTitle = cleanString(movieNameKey ? row[movieNameKey] : row['Movie Name'] ?? row['Title']) || ''
          const homeResolution = homeTitle ? (resolutions[homeTitle] ?? null) : null
          const homeSlotErrors: PlatformRightsRowError[] = []
          const result = await processHomeRow(row, headers, cache, user.id, homeResolution, homePlatformSlots, rawCols[i] ?? [], homeSlotErrors, contRawCols)
          for (const se of homeSlotErrors) {
            errors.push({
              row: rowNum,
              field: `${se.row2Label} slot ${se.slotIndex} (cols ${se.colRange[0]}-${se.colRange[1]})`,
              message: se.message,
            })
          }
          if (result === 'created') success++
          else if (result === 'updated') updated++
          else skipped++
        } catch (err) {
          errors.push({ row: rowNum, message: err instanceof Error ? err.message : 'Unknown error' })
        }
      }
    } else {
      // Acquired: iterate over pre-grouped primary rows, passing continuation rows along
      for (const group of acquiredGroups) {
        const i = group.primaryIndex
        const row = rows[i] as Record<string, string>
        const rowNum = i + dataStartRowIndex + 1

        const contRows = group.continuationIndexes.map((ci) => rows[ci] as Record<string, string>)
        const contRawCols = group.continuationIndexes.map((ci) => rawCols[ci] ?? [])

        try {
          const title = cleanString(col(row, movieNameKey) ?? row['Movie Name']) || ''
          const resolution = resolutions[title] ?? null
          const slotErrors: PlatformRightsRowError[] = []
          const result = await processAcquiredRow(
            row,
            headers,
            cache,
            user.id,
            profile.role,
            resolution,
            acquiredPlatformSlots,
            rawCols[i] ?? [],
            slotErrors,
            contRows,
            contRawCols,
          )
          for (const se of slotErrors) {
            errors.push({
              row: rowNum,
              field: `${se.row2Label} slot ${se.slotIndex} (cols ${se.colRange[0]}-${se.colRange[1]})`,
              message: se.message,
            })
          }
          if (result === 'created') success++
          else if (result === 'updated') updated++
          else skipped++
        } catch (err) {
          errors.push({ row: rowNum, message: err instanceof Error ? err.message : 'Unknown error' })
        }
      }
    }

    // 11. Return results
    const warningMsg = validation.warnings.length > 0 ? `Missing optional columns (skipped): ${validation.warnings.join(', ')}` : undefined

    return NextResponse.json({
      success,
      skipped,
      updated,
      errors,
      // Total = primary movie rows only (continuation rows don't count as separate movies)
      total: detectedFormat === 'acquired' ? acquiredGroups.length : homeGroups.length,
      detectedFormat,
      stats: cache.stats,
      warnings: warningMsg,
    })
  } catch (error) {
    console.error('Comprehensive import error:', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'An unexpected error occurred during import',
      },
      { status: 500 },
    )
  }
}
