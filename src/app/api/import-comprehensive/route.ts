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

  // Try DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY or DD-MM-YY
  const numericRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/
  match = cleaned.match(numericRegex)
  if (match) {
    const day = parseInt(match[1], 10)
    const month = parseInt(match[2], 10)
    let year = parseInt(match[3], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      if (year < 100) {
        year += 2000
        if (year > 2050) year -= 100
      }
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
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

// For platform rights nature — normalise known patterns, fall back to raw value as-is
function normalizeNature(nature: string | null | undefined): string | null {
  const cleaned = cleanString(nature)
  if (!cleaned) return null
  const lower = cleaned.toLowerCase()

  if (lower.includes('non') && lower.includes('exclusive')) return 'Non-Exclusive'
  if (lower.includes('jointly') && lower.includes('owned')) return 'Jointly Production'
  if (lower.includes('joint')) return 'Jointly Production'
  if (lower.includes('sold') || lower.includes('grassroot')) return 'Sold/Expired'
  if (lower.includes('co-production') || lower.includes('coproduction')) return 'Jointly Production'
  if (lower.includes('licensed') || lower.includes('license')) return 'Non-Exclusive'
  if (lower.includes('assignment') || lower.includes('assigned')) return 'Exclusive'
  // Only map bare "exclusive" — not "Shared-Exclusive", "Semi-Exclusive", etc.
  if (lower.trim() === 'exclusive') return 'Exclusive'

  // Anything else — store the raw value so nothing is lost
  return cleaned
}

// For movie-level nature_of_rights - preserve raw text as-is
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
      this.supabase.from('platforms').select('id, name'),
      this.supabase.from('movies').select('id, title, production_no'),
    ])

    for (const row of productionHouses.data || []) {
      this.productionHouses.set(row.name.toLowerCase(), row.id)
    }
    for (const row of people.data || []) {
      this.people.set(row.name.toLowerCase().trim(), row.id)
    }
    for (const row of platforms.data || []) {
      this.platforms.set(row.name.toLowerCase(), row.id)
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

    // Normalize platform names
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
    const key = normalized.toLowerCase()
    if (this.platforms.has(key)) return this.platforms.get(key)!

    const insertData: Record<string, string> = { name: normalized }
    if (platformType) insertData.platform_type = platformType

    const { data, error } = await this.supabase.from('platforms').insert(insertData).select('id').single()

    if (error) {
      const { data: existing } = await this.supabase.from('platforms').select('id').ilike('name', normalized).single()
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
// Platform Rights Extraction Functions
// ============================================

async function extractSatelliteRights(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string): Promise<void> {
  const satLicenseKey = findColumnByPattern(keys, ['Satellite TV License'])
  if (!satLicenseKey) return

  const satLicense = cleanString(row[satLicenseKey])
  const hasCurrentSatellite = satLicense && !['open', 'qc issue'].includes(satLicense.toLowerCase())

  if (hasCurrentSatellite) {
    const platformId = await cache.getOrCreatePlatform(satLicense!, 'Satellite')
    if (!platformId) return

    const satLicenseIdx = keys.indexOf(satLicenseKey)
    let categoryVal: string | null = null
    let startDateVal: string | null = null
    let endDateVal: string | null = null
    let territoryVal: string | null = null
    let natureVal: string | null = null

    for (let i = satLicenseIdx + 1; i < Math.min(keys.length, satLicenseIdx + 7); i++) {
      const colName = keys[i].toLowerCase().trim()
      const val = row[keys[i]]
      if (colName.includes('previous')) break
      if ((colName.includes('category') || colName.includes('categorization')) && !categoryVal) categoryVal = val
      else if (colName.includes('start') && colName.includes('date') && !startDateVal) startDateVal = val
      else if (colName.includes('end') && colName.includes('date') && !endDateVal) endDateVal = val
      else if (colName.includes('territory') && !territoryVal) territoryVal = val
      else if (colName.includes('nature') && !natureVal) natureVal = val
    }

    const startDate = parseDate(startDateVal)
    const endDate = parseDate(endDateVal)

    if (startDate || endDate || satLicense) {
      await cache.insertPlatformRights({
        movie_id: movieId,
        platform_id: platformId,
        category: cleanString(categoryVal),
        nature: normalizeNature(natureVal),
        start_date: startDate,
        end_date: endDate,
        territory: cleanString(territoryVal) || 'World',
        is_current: true,
      })
    }
  }
}

async function extractDthRights(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string): Promise<void> {
  const dthKey = findColumnByPattern(keys, ['DTH VOD License'])
  if (!dthKey) return

  const dthLicense = cleanString(row[dthKey])
  if (!dthLicense || ['open', 'no'].includes(dthLicense.toLowerCase())) return

  const platformId = await cache.getOrCreatePlatform(dthLicense, 'DTH')
  if (!platformId) return

  await cache.insertPlatformRights({
    movie_id: movieId,
    platform_id: platformId,
    nature: normalizeNature(row['Nature of DTH VOD License']),
    start_date: parseDate(row['DTH VOD Start Date']),
    end_date: parseDate(row['DTH VOD End Date']),
    territory: cleanString(row['DTH VOD Territory']) || 'World',
    is_current: true,
  })
}

async function extractTerrestrialRights(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string): Promise<void> {
  const terrKey = findColumnByPattern(keys, ['Terrestrial TV License'])
  if (!terrKey) return

  const terrLicense = cleanString(row[terrKey])
  if (!terrLicense || ['open', 'no'].includes(terrLicense.toLowerCase())) return

  const platformId = await cache.getOrCreatePlatform(terrLicense, 'Terrestrial')
  if (!platformId) return

  const startKey = findColumnByPattern(keys, ['Terrestrial Tv [Holdback]', 'Terrestrial TV Holdback Start'])
  const endKey = findColumnByPattern(keys, ['Terrestrial TV\n[Holdback]\nEnd Date', 'Terrestrial TV Holdback End', 'Terrestrial TV [Holdback] End'])

  await cache.insertPlatformRights({
    movie_id: movieId,
    platform_id: platformId,
    nature: normalizeNature(row['Nature of Terrestrial TV Rights']),
    start_date: startKey ? parseDate(row[startKey]) : null,
    end_date: endKey ? parseDate(row[endKey]) : null,
    territory: cleanString(row['Terrestrial TV Territory']) || 'World',
    is_current: true,
  })
}

async function extractSvodRightsPositional(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string, anchorPatterns: string[], platformName: string): Promise<void> {
  const anchorKey = findColumnByPattern(keys, anchorPatterns)
  if (!anchorKey) return

  const anchorVal = cleanString(row[anchorKey])
  if (!anchorVal || ['no', 'open'].includes(anchorVal.toLowerCase())) return

  const platformId = await cache.getOrCreatePlatform(platformName, 'SVOD')
  if (!platformId) return

  const anchorIdx = keys.indexOf(anchorKey)
  let natureVal: string | null = null
  let startDateVal: string | null = null
  let endDateVal: string | null = null
  let territoryVal: string | null = null
  let categoryVal: string | null = null

  for (let i = anchorIdx + 1; i < Math.min(keys.length, anchorIdx + 7); i++) {
    const colName = keys[i].toLowerCase()
    const val = row[keys[i]]

    if (
      colName.includes('hotstar') ||
      colName.includes('hoichoi') ||
      colName.includes('hungama') ||
      colName.includes('prime') ||
      colName.includes('viacom') ||
      colName.includes('viacon') ||
      colName.includes('tvod') ||
      colName.includes('avod') ||
      colName.includes('fvod') ||
      colName.includes('yt') ||
      colName.includes('others') ||
      colName.includes('rights granted') ||
      colName.includes('remarks') ||
      colName.includes('actionable')
    ) {
      break
    }

    if (colName.includes('nature') && !natureVal) {
      natureVal = val
    } else if (colName.includes('category') && !categoryVal) {
      categoryVal = val
    } else if (colName.includes('start') && colName.includes('date') && !startDateVal) {
      startDateVal = val
    } else if (colName.includes('end') && colName.includes('date') && !endDateVal) {
      endDateVal = val
    } else if (colName.includes('territory') && !territoryVal) {
      territoryVal = val
    }
  }

  await cache.insertPlatformRights({
    movie_id: movieId,
    platform_id: platformId,
    category: cleanString(categoryVal),
    nature: normalizeNature(natureVal),
    start_date: parseDate(startDateVal),
    end_date: parseDate(endDateVal),
    territory: cleanString(territoryVal) || 'World',
    is_current: true,
  })
}

async function extractHoichoiRights(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string): Promise<void> {
  const anchorKey = findColumnByPattern(keys, ['Hoichoi'])
  if (!anchorKey) return

  const anchorVal = cleanString(row[anchorKey])
  if (!anchorVal || ['no', 'open'].includes(anchorVal.toLowerCase())) return

  const platformId = await cache.getOrCreatePlatform('Hoichoi', 'SVOD')
  if (!platformId) return

  const anchorIdx = keys.indexOf(anchorKey)
  const startDateVal = anchorIdx + 1 < keys.length ? row[keys[anchorIdx + 1]] : null
  const endDateVal = anchorIdx + 2 < keys.length ? row[keys[anchorIdx + 2]] : null
  const territoryVal = anchorIdx + 3 < keys.length ? row[keys[anchorIdx + 3]] : null

  await cache.insertPlatformRights({
    movie_id: movieId,
    platform_id: platformId,
    start_date: parseDate(startDateVal),
    end_date: parseDate(endDateVal),
    territory: cleanString(territoryVal) || 'World',
    is_current: true,
  })
}

async function extractHungamaRights(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string): Promise<void> {
  const anchorKey = findColumnByPattern(keys, ['Hungama'])
  if (!anchorKey) return

  const anchorVal = cleanString(row[anchorKey])
  if (!anchorVal || ['no', 'open'].includes(anchorVal.toLowerCase())) return

  const platformId = await cache.getOrCreatePlatform('Hungama', 'SVOD')
  if (!platformId) return

  const anchorIdx = keys.indexOf(anchorKey)
  const startDateVal = anchorIdx + 1 < keys.length ? row[keys[anchorIdx + 1]] : null
  const endDateVal = anchorIdx + 2 < keys.length ? row[keys[anchorIdx + 2]] : null
  const territoryVal = anchorIdx + 3 < keys.length ? row[keys[anchorIdx + 3]] : null

  await cache.insertPlatformRights({
    movie_id: movieId,
    platform_id: platformId,
    start_date: parseDate(startDateVal),
    end_date: parseDate(endDateVal),
    territory: cleanString(territoryVal) || 'World',
    is_current: true,
  })
}

async function extractTvodRights(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string): Promise<void> {
  const tvodKey = findColumnByPattern(keys, ['TVOD\nLicense', 'TVOD License'])
  if (!tvodKey) return

  const tvod = cleanString(row[tvodKey])
  if (!tvod || ['no', 'open'].includes(tvod.toLowerCase())) return

  await cache.insertPlatformRights({
    movie_id: movieId,
    start_date: parseDate(row['TVOD Start Date']),
    end_date: parseDate(row['TVOD End Date']),
    territory: cleanString(row['TVOD Territory']) || 'World',
    is_current: true,
  })
}

async function extractAvodRights(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string): Promise<void> {
  const avodKey = findColumnByPattern(keys, ['AVOD License'])
  if (!avodKey) return

  const avod = cleanString(row[avodKey])
  if (!avod || ['no', 'open'].includes(avod.toLowerCase())) return

  await cache.insertPlatformRights({
    movie_id: movieId,
    start_date: parseDate(row['AVOD Start Date']),
    end_date: parseDate(row['AVOD End Date']),
    territory: cleanString(row['AVOD Territory']) || 'World',
    is_current: true,
  })
}

async function extractYoutubeRights(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string): Promise<void> {
  const ytKey = findColumnByPattern(keys, ['YT'])
  if (!ytKey) return

  const yt = cleanString(row[ytKey])
  if (!yt || ['no', 'open'].includes(yt.toLowerCase())) return

  const platformId = await cache.getOrCreatePlatform('YouTube', 'AVOD')
  if (!platformId) return

  await cache.insertPlatformRights({
    movie_id: movieId,
    platform_id: platformId,
    territory: 'World',
    is_current: true,
  })
}

async function extractOtherRights(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string): Promise<void> {
  const othersKey = findColumnByPattern(keys, ['Others'])
  const rightsGrantedKey = findColumnByPattern(keys, ['Rights Granted'])

  if (othersKey) {
    const others = cleanString(row[othersKey])
    if (others && !['no', 'open'].includes(others.toLowerCase())) {
      const platformId = await cache.getOrCreatePlatform(others)
      if (platformId) {
        await cache.insertPlatformRights({
          movie_id: movieId,
          platform_id: platformId,
          territory: 'World',
          is_current: true,
        })
      }
    }
  }

  if (rightsGrantedKey) {
    const rightsGranted = cleanString(row[rightsGrantedKey])
    if (rightsGranted && !['no', 'open'].includes(rightsGranted.toLowerCase())) {
      const rgIdx = keys.indexOf(rightsGrantedKey)
      let natureVal: string | null = null
      let startDateVal: string | null = null
      let endDateVal: string | null = null
      let territoryVal: string | null = null

      for (let i = rgIdx + 1; i < Math.min(keys.length, rgIdx + 6); i++) {
        const colName = keys[i].toLowerCase()
        const val = row[keys[i]]
        if (colName.includes('nature') && !natureVal) natureVal = val
        else if (colName.includes('start date') && !startDateVal) startDateVal = val
        else if (colName.includes('end date') && !endDateVal) endDateVal = val
        else if (colName.includes('territory') && !territoryVal) territoryVal = val
      }

      const platformId = await cache.getOrCreatePlatform(rightsGranted)
      if (platformId) {
        await cache.insertPlatformRights({
          movie_id: movieId,
          platform_id: platformId,
          nature: normalizeNature(natureVal),
          start_date: parseDate(startDateVal),
          end_date: parseDate(endDateVal),
          territory: cleanString(territoryVal) || 'World',
          is_current: true,
        })
      }
    }
  }
}

// Call all 12 extraction functions for a row (currently unused — platform rights import disabled for acquired)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function extractAllPlatformRights(row: Record<string, string>, keys: string[], cache: CacheStore, movieId: string): Promise<void> {
  await extractSatelliteRights(row, keys, cache, movieId)
  await extractDthRights(row, keys, cache, movieId)
  await extractTerrestrialRights(row, keys, cache, movieId)

  // SVOD platforms using positional column finding
  await extractSvodRightsPositional(row, keys, cache, movieId, ['Viacon 18', 'Viacom 18'], 'Viacom 18')
  await extractSvodRightsPositional(row, keys, cache, movieId, ['Prime Videos', 'Prime Video'], 'Prime Video')
  await extractSvodRightsPositional(row, keys, cache, movieId, ['Hotstar'], 'Hotstar')

  await extractHoichoiRights(row, keys, cache, movieId)
  await extractHungamaRights(row, keys, cache, movieId)
  await extractTvodRights(row, keys, cache, movieId)
  await extractAvodRights(row, keys, cache, movieId)
  await extractYoutubeRights(row, keys, cache, movieId)
  await extractOtherRights(row, keys, cache, movieId)
}

// ============================================
// CSV Row Processing
// ============================================

async function processHomeRow(
  row: Record<string, string>,
  keys: string[],
  cache: CacheStore,
  userId: string,
  userRole: string,
  resolution: 'skip' | 'update' | null,
): Promise<'created' | 'skipped' | 'updated'> {
  const title = cleanString(row['Title'])
  if (!title) throw new Error('Title is required')

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
  // Split by comma only (not & or -)
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
  const rawDate = cleanString(row['Theatrical Release Date'])
  // If it parses as a proper date, store formatted; otherwise store the raw text (e.g. "UNRELEASED")
  const parsedDate = rawDate ? parseDate(rawDate) : null
  const releaseDate = parsedDate ?? rawDate // raw text fallback
  const releaseYear = parsedDate ? parsedDate.split('-')[0] : rawDate && /^\d{4}$/.test(rawDate.trim()) ? rawDate.trim() : null

  // ── Recensor flag ────────────────────────────────────────────
  const cert = normalizeCertification(row['Censor'])
  const recensorFlag = cert === 'A'

  // ── Nature of rights (store raw, no normalization) ───────────
  const natureKey = findColumnByPattern(keys, ['Nature of Right', 'Nature of Rights'])
  const natureOfRights = preserveRawText(natureKey ? row[natureKey] : null)

  // ── Jointly owned extras ─────────────────────────────────────
  const jointExploitKey = findColumnByPattern(keys, ['Joint Exploitation Rights', 'Exploitation Rights'])
  const revenueShareKey = findColumnByPattern(keys, ['Revenue Share'])
  const buyBackKey = findColumnByPattern(keys, ['Joint Buy Back Date', 'Buy Back Date'])

  // ── Approval status based on uploader role ───────────────────
  const approvalStatus = userRole === 'admin' ? 'approved' : 'pending'

  const movieData: Record<string, unknown> = {
    title,
    production_no: productionNo,
    source: 'home_production',
    release_date: releaseDate,
    release_year: releaseYear,
    certification: cert,
    recensor_flag: recensorFlag,
    language,
    production_house_name: productionHouseName,
    trailer_link: cleanString(row['YT Trailer Link']),
    nature_of_rights: natureOfRights,
    remarks: cleanString(row['Remarks']),
    actionables: cleanString(row['Actionable']),
    holdbacks: parseHoldbacks(row['Holdbacks'] ?? row['Holdback']),
    territory: 'World',
    // Jointly owned extras
    jointly_exploitation_rights: jointExploitKey ? preserveRawText(row[jointExploitKey]) : null,
    revenue_share: revenueShareKey ? preserveRawText(row[revenueShareKey]) : null,
    joint_prod_buy_back_date: buyBackKey ? parseDate(row[buyBackKey]) : null,
    // All rights fields fixed for home production
    satellite_rights: 'Yes',
    internet_rights: 'Yes',
    negative_rights: 'Yes',
    other_rights: 'Yes',
    nature_of_satellite_rights: 'Exclusive',
    nature_of_internet_rights: 'Exclusive',
    nature_of_negative_rights: 'Exclusive',
    nature_of_other_rights: 'Exclusive',
    clip_rights: 'Yes',
    character_rights: 'Yes',
    prequel_sequel_rights: 'Yes',
    subtitling_rights: 'Yes',
    dubbing_rights: 'Yes',
    // Fields not applicable to home production — store as null
    assignor_licensor: null,
    licensee: null,
    agreement_date: null,
    agreement_start_date: null,
    agreement_end_date: null,
    satellite_rights_start_date: null,
    satellite_rights_end_date: null,
    internet_rights_start_date: null,
    internet_rights_end_date: null,
    negative_rights_start_date: null,
    negative_rights_end_date: null,
    other_rights_start_date: null,
    other_rights_end_date: null,
    syndication_internet_rights: null,
    satellite_rights_classification: null,
    internet_rights_classification: null,
    wtp_library: null,
    approval_status: approvalStatus,
    created_by: userId,
  }

  const castKey = findColumnByPattern(keys, ['Cast Details', 'Cast'])
  const directorKey = findColumnByPattern(keys, ['Director'])

  if (existingId && resolution === 'update') {
    await cache.updateMovie(existingId, movieData)
    const movieId = existingId

    // Re-link cast & directors on update too
    await relinkPeople(row, cache, movieId, castKey, directorKey)
    return 'updated'
  }

  const movieId = await cache.insertMovieRaw(movieData)
  if (!movieId) return 'skipped'

  // Register in cache so duplicate rows in the same sheet are caught
  cache.movies.set(titleKey, movieId)

  await relinkPeople(row, cache, movieId, castKey, directorKey)
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

async function processAcquiredRow(
  row: Record<string, string>,
  keys: string[],
  cache: CacheStore,
  userId: string,
  userRole: string,
  resolution: 'skip' | 'update' | null,
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

  // ── Primary Rights Yes/No flags ──────────────────────────
  // Blank cell = 'No' (not licensed). Other Rights may also contain a name (e.g. "Cable TV") — store as-is.
  const satRightsKey = findColumnByPattern(keys, ['Satellite Rights'])
  const intRightsKey = findColumnByPattern(keys, ['Internet Rights'])
  const negRightsKey = findColumnByPattern(keys, ['Negative Rights'])
  const othRightsKey = findColumnByPattern(keys, ['Other Rights', 'Others'])

  // ── Rights sub-classifications ───────────────────────────
  const satClassKey = findColumnByPattern(keys, ['Satellite Rights Classification', 'Satellite Classification'])
  const internetClassKey = findColumnByPattern(keys, ['Internet Classification', 'Internet Rights - Classification', 'Internet Rights Classification'])

  // ── Holdbacks: explicit column first, then positional fallback after Internet Classification ──
  const hbKey = findColumnByPattern(keys, ['Holdbacks', 'Holdback'])
  let holdbacksRaw: string | null = hbKey ? cleanString(row[hbKey]) : null
  if (!holdbacksRaw && internetClassKey) {
    const idx = keys.indexOf(internetClassKey)
    const candidate = idx + 1 < keys.length ? cleanString(row[keys[idx + 1]]) : null
    if (candidate && candidate.toLowerCase().startsWith('on ')) holdbacksRaw = candidate
  }

  // ── Nature per right type — store raw text, null for blank/n/a ──
  const natSatKey = findColumnByPattern(keys, ['Nature of Satellite Rights', 'Nature of Satellite'])
  const natIntKey = findColumnByPattern(keys, ['Nature of Internet Rights', 'Nature of Internet'])
  const natNegKey = findColumnByPattern(keys, ['Nature of Negative Rights', 'Nature of Negative'])
  const natOthKey = findColumnByPattern(keys, ['Nature of Other Rights', 'Nature of Other'])

  // ── Per-right date ranges ────────────────────────────────
  const satStartKey = findColumnByPattern(keys, ['Satellite Rights Start Date', 'Satellite Start Date'])
  const satEndKey = findColumnByPattern(keys, ['Satellite Rights End Date', 'Satellite End Date'])
  const intStartKey = findColumnByPattern(keys, ['Internet Rights Start Date', 'Internet Start Date'])
  const intEndKey = findColumnByPattern(keys, ['Internet Rights End Date', 'Internet End Date'])
  const negStartKey = findColumnByPattern(keys, ['Negative Rights Start Date', 'Negative Start Date'])
  const negEndKey = findColumnByPattern(keys, ['Negative Rights End Date', 'Negative End Date'])
  const othStartKey = findColumnByPattern(keys, ['Other Rights Start Date', 'Other Start Date'])
  const othEndKey = findColumnByPattern(keys, ['Other Rights End Date', 'Other End Date'])

  // ── Clip rights ──────────────────────────────────────────
  const clipRightsKey = findColumnByPattern(keys, ['Clip Rights'])
  const clipDurKey = findColumnByPattern(keys, ['Duration', 'Clip Rights Duration'])

  // ── Syndication ──────────────────────────────────────────
  const syndicationKey = findColumnByPattern(keys, ['Syndication- Internet Rights', 'Syndication - Internet Rights', 'Syndication'])

  // ── Derivative / secondary ───────────────────────────────
  const preqSeqKey = findColumnByPattern(keys, ['Prequel/ Sequel Rights', 'Prequel/Sequel Rights', 'Prequel Sequel'])
  const charRightsKey = findColumnByPattern(keys, ['Character Rights'])
  const subtitleKey = findColumnByPattern(keys, ['Sub-Titling Rights', 'Subtitling Rights', 'Sub Titling'])
  const dubbingKey = findColumnByPattern(keys, ['Dubbing Rights'])

  // ── Other metadata ───────────────────────────────────────
  const territoryKey = findColumnByPattern(keys, ['Territory'])
  const remarksKey = findColumnByPattern(keys, ['Remarks'])
  const actionablesKey = findColumnByPattern(keys, ['Actionables', 'Actionable'])
  const castKey = findColumnByPattern(keys, ['Cast Details', 'Cast'])
  const directorKey = findColumnByPattern(keys, ['Director'])

  // ── Build movie record ───────────────────────────────────
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
    // Primary Rights flags — blank = 'No' (not licensed); Other Rights may hold a name
    satellite_rights: parseYesNoDefault(col(row, satRightsKey)),
    internet_rights: parseYesNoDefault(col(row, intRightsKey)),
    negative_rights: parseYesNoDefault(col(row, negRightsKey)),
    other_rights: parseYesNoDefault(col(row, othRightsKey)),
    // Sub-classifications
    satellite_rights_classification: cleanString(col(row, satClassKey)),
    internet_rights_classification: cleanString(col(row, internetClassKey)),
    // Nature per type
    nature_of_satellite_rights: preserveRawText(col(row, natSatKey)),
    nature_of_internet_rights: preserveRawText(col(row, natIntKey)),
    nature_of_negative_rights: preserveRawText(col(row, natNegKey)),
    nature_of_other_rights: preserveRawText(col(row, natOthKey)),
    // Date ranges
    satellite_rights_start_date: parseDate(col(row, satStartKey)),
    satellite_rights_end_date: parseDate(col(row, satEndKey)),
    internet_rights_start_date: parseDate(col(row, intStartKey)),
    internet_rights_end_date: parseDate(col(row, intEndKey)),
    negative_rights_start_date: parseDate(col(row, negStartKey)),
    negative_rights_end_date: parseDate(col(row, negEndKey)),
    other_rights_start_date: parseDate(col(row, othStartKey)),
    other_rights_end_date: parseDate(col(row, othEndKey)),
    // Clip rights
    clip_rights: parseYesNoDefault(col(row, clipRightsKey)),
    clip_rights_duration: cleanString(col(row, clipDurKey)),
    // Holdbacks
    holdbacks: parseHoldbacks(holdbacksRaw),
    // Syndication
    syndication_internet_rights: preserveRawText(col(row, syndicationKey)),
    // Derivative / secondary
    prequel_sequel_rights: preserveRawText(col(row, preqSeqKey)),
    character_rights: preserveRawText(col(row, charRightsKey)),
    subtitling_rights: preserveRawText(col(row, subtitleKey)),
    dubbing_rights: preserveRawText(col(row, dubbingKey)),
    // Other
    nature_of_rights: null,
    territory: cleanString(col(row, territoryKey)),
    remarks: cleanString(col(row, remarksKey)),
    actionables: cleanString(col(row, actionablesKey)),
    approval_status: userRole === 'admin' ? 'approved' : 'pending',
  }

  if (existingId && resolution === 'update') {
    await cache.updateMovie(existingId, movieData)
    // Re-link people (wipes old links first)
    await relinkPeople(row, cache, existingId, castKey, directorKey)
    // Platform rights import disabled for acquired — skipping
    // await cache.clearMoviePlatformRights(existingId)
    // await extractAllPlatformRights(row, keys, cache, existingId)
    return 'updated'
  }

  movieData.created_by = userId
  const movieId = await cache.insertMovie(movieData)
  if (!movieId) return 'skipped'

  // ── Cast + Directors ──────────────────────────────────────
  await relinkPeople(row, cache, movieId, castKey, directorKey)

  // Platform rights import disabled for acquired — skipping
  // await extractAllPlatformRights(row, keys, cache, movieId)

  return 'created'
}

// ============================================
// Format Detection & Validation
// ============================================

function detectCSVFormat(headers: string[]): 'home' | 'acquired' | 'unknown' {
  const headersLower = headers.map((h) => h.toLowerCase().trim())

  // Acquired: has Movie Name or Assignor/Licensor
  if (headersLower.some((h) => h === 'movie name')) return 'acquired'
  if (headersLower.some((h) => h.includes('assignor') || h.includes('licensor'))) return 'acquired'

  // Home: has Title or Production No
  if (headersLower.some((h) => h === 'title')) return 'home'
  if (headersLower.some((h) => h.includes('production no'))) return 'home'

  return 'unknown'
}

function validateHeaders(headers: string[], format: 'home' | 'acquired'): { valid: boolean; error?: string; warnings: string[] } {
  const headersLower = headers.map((h) => h.toLowerCase().trim())
  const warnings: string[] = []

  if (format === 'home') {
    if (!headersLower.some((h) => h === 'title')) {
      return {
        valid: false,
        error: "Home production CSV is missing the required 'Title' column. " + `First columns found: ${headers.slice(0, 10).join(', ')}`,
        warnings: [],
      }
    }
    // Soft warnings for useful-but-optional columns
    for (const label of ['Cast', 'Director', 'Language', 'Production House', 'Theatrical Release Date']) {
      if (!headersLower.some((h) => h.includes(label.toLowerCase()))) {
        warnings.push(label)
      }
    }
  } else {
    // Only Movie Name is required for acquired — every other column is optional
    const hasMovieName = headersLower.some((h) => h === 'movie name') || headersLower.some((h) => h === 'movie title') || headersLower.some((h) => h === 'title')
    if (!hasMovieName) {
      return {
        valid: false,
        error: "Acquired CSV is missing the required 'Movie Name' column. " + `First columns found: ${headers.slice(0, 10).join(', ')}`,
        warnings: [],
      }
    }
    // Soft warnings for useful-but-optional columns
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
    let parseErrors: { type?: string; message: string; row?: number }[]
    let headers: string[]

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
      headers = syntheticHeaders
    } else {
      // Simple single-header format
      const headerRow = preambleRows[headerRowIndex].map((h) => h.replace(/\s*\n\s*/g, ' ').trim())
      const dataRows = fullRows.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim() !== ''))
      parseErrors = fullParsed.errors as { type?: string; message: string; row?: number }[]
      allRows = dataRows.map((cols) => {
        const obj: Record<string, string> = {}
        headerRow.forEach((h, i) => {
          obj[h] = cols[i] ?? ''
        })
        return obj
      })
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
            "Could not detect CSV format. The file must have a 'Movie Name' column (acquired) or a 'Title' column (home production). " +
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

    // 6. Strip the "accepted values" example row (row immediately after the header that
    //    contains strings like "Yes/No", "DD/MM/YYYY", "Text" — not real data).
    const isExampleRow = (r: Record<string, string>): boolean => {
      const vals = Object.values(r).map((v) => (v || '').toLowerCase().trim())
      const examplePatterns = ['yes/no', 'dd/mm/yyyy', 'yyyy', 'text', 'color/b/w', 'exclusive/non-exclusive']
      const matchCount = vals.filter((v) => examplePatterns.some((p) => v === p || v.startsWith(p))).length
      return matchCount >= 3
    }

    const rows = (allRows as Record<string, string>[]).filter((r) => !isExampleRow(r))

    // 7. Create supabase admin client
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

    // 8. Initialize cache and load existing data
    const cache = new CacheStore(supabaseAdmin)
    await cache.loadExisting()

    // 9. Parse conflict resolutions sent by client (JSON string in form field)
    const resolutionsRaw = formData.get('resolutions') as string | null
    const resolutions: Record<string, 'skip' | 'update'> = resolutionsRaw ? JSON.parse(resolutionsRaw) : {}

    // 9a. First pass: detect unresolved conflicts before writing anything
    {
      const unresolvedConflicts: ConflictRow[] = []

      if (detectedFormat === 'home') {
        // Home: conflict = same title already in DB (prod no is not unique — dubbed versions share it)
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as Record<string, string>
          const title = cleanString(row['Title'])
          if (!title) continue
          const existingId = cache.movies.get(title.toLowerCase().trim()) ?? null
          if (existingId && !(title in resolutions)) {
            unresolvedConflicts.push({ row: i + 2, title, existingId })
          }
        }
      } else {
        // Acquired: conflict = same title already in DB
        const movieNameKey = findColumnByPattern(headers, ['Movie Name', 'Movie Title', 'Title'])
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as Record<string, string>
          const title = cleanString(col(row, movieNameKey) ?? row['Movie Name'])
          if (!title) continue
          const titleKey = title.toLowerCase().trim()
          const existingId = cache.movies.get(titleKey) ?? null
          if (existingId && !(title in resolutions)) {
            unresolvedConflicts.push({ row: i + 2, title, existingId })
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

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, string>
      const dataStartRowIndex = subHeaderRowIndex !== null ? subHeaderRowIndex + 1 : headerRowIndex + 1
      const rowNum = i + dataStartRowIndex + 1 // account for header offset in original file

      try {
        let result: 'created' | 'skipped' | 'updated'
        if (detectedFormat === 'home') {
          const homeTitle = cleanString(row['Title']) || ''
          const homeResolution = homeTitle ? (resolutions[homeTitle] ?? null) : null
          result = await processHomeRow(row, headers, cache, user.id, profile.role, homeResolution)
        } else {
          const movieNameKey = findColumnByPattern(headers, ['Movie Name', 'Movie Title', 'Title'])
          const title = cleanString(col(row, movieNameKey) ?? row['Movie Name']) || ''
          const resolution = resolutions[title] ?? null
          result = await processAcquiredRow(row, headers, cache, user.id, profile.role, resolution)
        }

        if (result === 'created') success++
        else if (result === 'updated') updated++
        else skipped++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        errors.push({ row: rowNum, message: msg })
        // Don't abort — continue to next row so one bad row doesn't block the rest
      }
    }

    // 11. Return results
    const warningMsg = validation.warnings.length > 0 ? `Missing optional columns (skipped): ${validation.warnings.join(', ')}` : undefined

    return NextResponse.json({
      success,
      skipped,
      updated,
      errors,
      total: rows.length,
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
