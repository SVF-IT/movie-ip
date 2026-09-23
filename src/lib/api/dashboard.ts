import { createClient } from '@/lib/supabase/client'
import type { MovieWithDetails, Platform } from '@/lib/types/database'
import { buildHoldbackInfo, filterHoldbackTextForTypes, flattenHoldbackInfo, holdsBackType, anyHoldsBackType, anyClassificationAllowsType, INTERNET_EXPLOITATION_TYPES, type ExploitationType, type HoldbackInfo } from '@/lib/utils/holdbacks'
import { orContains } from '@/lib/utils/search'
import { cachedQuery, onRightsMutated } from '@/lib/api/cache'

const supabase = createClient()

const CHUNK_SIZE = 200

async function fetchPlatformRightsChunked(
  movieIds: string[],
  select: string,
  extraFilters?: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>
): Promise<any[]> {
  if (movieIds.length === 0) return []
  // Chunks are independent, so they run concurrently — awaiting each in turn
  // was a large part of the dashboard's load time.
  const chunks: string[][] = []
  for (let i = 0; i < movieIds.length; i += CHUNK_SIZE) {
    chunks.push(movieIds.slice(i, i + CHUNK_SIZE))
  }
  const settled = await Promise.all(
    chunks.map((chunk) => {
      let q = supabase.from('platform_rights').select(select).in('movie_id', chunk)
      if (extraFilters) q = extraFilters(q) as any
      return q
    })
  )
  const results: any[] = []
  for (const { data } of settled) {
    if (data) results.push(...data)
  }
  return results
}

/**
 * One movie_rights fetch, shared by the four accessors below.
 *
 * Those accessors are called back-to-back with the SAME movie ids and right
 * types, differing only in which column they read, so they used to issue four
 * near-identical round trips (and a dashboard tab issued ~17 in series). This
 * fetches the needed columns once per (ids, right types) combination and
 * derives each shape from the cached rows.
 *
 * The cache is keyed on the exact id list + right types and lives for a short
 * window, so a single dashboard load shares rows while a later load — or one
 * with a different filter — refetches. Nothing here is written, so a slightly
 * stale read cannot corrupt anything; the window is deliberately short enough
 * that a user editing rights and returning sees fresh numbers.
 */
interface MovieRightsRow {
  movie_id: string
  right_type: string
  end_date: string | null
  holdbacks: string | null
  classification: string | null
}

/**
 * Stat-card cache, keyed on the filters that produce the numbers.
 *
 * The dashboard recomputes all four tabs' stat cards whenever the language or
 * an open-until date changes, and switching tabs re-renders the same request.
 * Without this, flipping Satellite -> Internet -> Satellite pays the full cost
 * three times for two distinct results.
 *
 * Entries are keyed by every input that changes the answer, so a new filter is
 * never served a stale number — a cache hit means the exact same question was
 * asked recently. In-flight promises are cached too, so four tabs mounting at
 * once share one request instead of racing.
 */
const STATS_TTL_MS = 60_000
const statsCache = new Map<string, { at: number; value: Promise<unknown> }>()

function cachedStat<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = statsCache.get(key)
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.value as Promise<T>

  const value = compute().catch((err) => {
    // Never cache a failure: the next call should retry rather than be handed
    // a rejected promise for the rest of the TTL.
    statsCache.delete(key)
    throw err
  })
  statsCache.set(key, { at: Date.now(), value })
  return value
}

/**
 * Drop every cached stat and movie_rights row.
 *
 * Call after anything that edits rights so the dashboard recomputes instead of
 * serving numbers from before the edit.
 */
export function invalidateDashboardCaches(): void {
  statsCache.clear()
  movieRightsCache.clear()
}

// Any rights write clears these caches, so an edit is reflected immediately
// rather than after the TTL expires.
onRightsMutated(invalidateDashboardCaches)

const MOVIE_RIGHTS_TTL_MS = 15_000
const movieRightsCache = new Map<string, { at: number; rows: Promise<MovieRightsRow[]> }>()

function fetchMovieRightsRows(movieIds: string[], rightTypes: string[]): Promise<MovieRightsRow[]> {
  if (movieIds.length === 0) return Promise.resolve([])

  const key = `${rightTypes.join(',')}|${movieIds.join(',')}`
  const cached = movieRightsCache.get(key)
  if (cached && Date.now() - cached.at < MOVIE_RIGHTS_TTL_MS) return cached.rows

  const rows = (async () => {
    const out: MovieRightsRow[] = []
    // Chunks still exist because `.in()` inlines the ids into the query string,
    // but they now run concurrently rather than one after another.
    const chunks: string[][] = []
    for (let i = 0; i < movieIds.length; i += CHUNK_SIZE) {
      chunks.push(movieIds.slice(i, i + CHUNK_SIZE))
    }
    const results = await Promise.all(
      chunks.map((chunk) =>
        supabase
          .from('movie_rights')
          .select('movie_id, right_type, end_date, holdbacks, classification')
          .in('movie_id', chunk)
          .in('right_type', rightTypes)
      )
    )
    for (const { data } of results) {
      for (const row of data || []) out.push(row as MovieRightsRow)
    }
    return out
  })()

  movieRightsCache.set(key, { at: Date.now(), rows })
  return rows
}

/** Returns a Set of movie_ids that have at least one movie_rights row matching the given right_type(s). */
async function fetchMovieRightsIdsByType(movieIds: string[], rightTypes: string[]): Promise<Set<string>> {
  const rows = await fetchMovieRightsRows(movieIds, rightTypes)
  const result = new Set<string>()
  for (const row of rows) result.add(row.movie_id)
  return result
}

/**
 * Returns a Map<movie_id, earliest_end_date | null> for acquired movies.
 * null means the right has no end date (perpetual).
 * Only considers right_types matching the given list.
 */
async function fetchMovieRightsEndDates(movieIds: string[], rightTypes: string[]): Promise<Map<string, string | null>> {
  const rows = await fetchMovieRightsRows(movieIds, rightTypes)
  const map = new Map<string, string | null>()
  for (const row of rows) {
    const endDate: string | null = row.end_date ?? null
    if (!map.has(row.movie_id)) {
      map.set(row.movie_id, endDate)
    } else {
      const existing = map.get(row.movie_id)!
      // null = perpetual (most generous) — once set, keep null
      if (existing !== null) {
        if (endDate === null) map.set(row.movie_id, null)
        else if (endDate > existing) map.set(row.movie_id, endDate)
      }
    }
  }
  return map
}

/**
 * Returns a Map<movie_id, classification strings[]> for the given right types.
 * A movie absent from the map has no recorded rows, which callers treat as
 * permissive (see anyClassificationAllowsType).
 */
async function fetchMovieRightsClassifications(movieIds: string[], rightTypes: string[]): Promise<Map<string, string[]>> {
  const rows = await fetchMovieRightsRows(movieIds, rightTypes)
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const existing = map.get(row.movie_id) || []
    existing.push(row.classification || '')
    map.set(row.movie_id, existing)
  }
  return map
}

/** Returns a Map<movie_id, raw holdback strings[]> — one entry per matching movie_rights row. */
async function fetchMovieRightsHoldbacks(movieIds: string[], rightTypes: string[]): Promise<Map<string, string[]>> {
  const rows = await fetchMovieRightsRows(movieIds, rightTypes)
  const map = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.holdbacks) continue
    const existing = map.get(row.movie_id) || []
    existing.push(row.holdbacks)
    map.set(row.movie_id, existing)
  }
  return map
}

/**
 * On a jointly-owned home production, jointly_exploitation_rights names the production house
 * that currently holds the right to exploit the title. Unless that house is SVF, the title
 * isn't ours to sell and must never count as open.
 *
 * The column is free text (a house name typed by the form, or raw sheet text on imported
 * rows), so matching tolerates casing, surrounding whitespace and the "SVF Entertainment"
 * long form. A blank value is deliberately permissive — it means "unrecorded", not
 * "someone else's", and blanking the field shouldn't silently drop titles off the dashboard.
 */
function heldByOtherHouse(m: any): boolean {
  if (m.source !== 'home_production') return false
  if (m.jointly_owned !== true) return false
  const holder = (m.jointly_exploitation_rights || '').trim()
  if (!holder) return false
  return !/^svf\b/i.test(holder)
}

/**
 * A movie should never appear on the rights dashboard if it's sold (home_sold=true), its
 * agreement has expired (acquired movies whose agreement_end_date has passed), or a joint
 * partner rather than SVF holds the exploitation rights. Applied consistently across every
 * rights-dashboard query so cards and stat numbers stay in sync.
 */
function isSoldOrExpired(m: any, referenceDate: string): boolean {
  if (m.source === 'home_production') {
    // home_sold is the current flag; jointly_exploitation_rights containing "Sold" is the
    // legacy marker still present in imported rows. movies.ts treats both as sold, so the
    // dashboard must too or a legacy-sold title reappears here after leaving the catalogue.
    if (m.home_sold === true) return true
    if (/sold/i.test(m.jointly_exploitation_rights || '')) return true
    // Jointly owned, but the exploitation rights sit with the partner house.
    return heldByOtherHouse(m)
  }
  // Acquired: an agreement that ended before the reference date is expired.
  if (m.agreement_end_date && m.agreement_end_date < referenceDate) return true
  return false
}

function isSatellitePlatformType(pt: string): boolean {
  const n = pt.toLowerCase()
  return n.includes('satellite') || n.includes('dth') || n.includes('terrestrial') || n.includes('cable')
}

function isInternetPlatformType(pt: string): boolean {
  const n = pt.toLowerCase()
  const isOther = /air|ship|surface|hotel/i.test(n)
  return !isSatellitePlatformType(pt) && !isOther
}

// Precise helpers for rights dashboard stats
function isHomeSatellitePlatform(pt: string): boolean {
  const n = pt.trim().toLowerCase()
  return n === 'satellite tv' || n === 'dth vod' || n === 'terrestrial tv'
}

function isAcquiredSatellitePlatform(pt: string): boolean {
  const n = pt.toLowerCase()
  return n.includes('satellite') || n.includes('terrestrial') || n.includes('dth')
}

function isInternetPlatform(pt: string): boolean {
  const n = pt.trim().toLowerCase()
  return n === 'svod' || n === 'tvod' || n === 'avod' || n === 'fvod'
}

/**
 * Maps a free-text platform_type onto the exploitation type it exploits, so an
 * "open to AVOD" query can tell an AVOD deal apart from an SVOD one. Returns
 * null for types that aren't internet exploitation (satellite, airborne, ...).
 */
/**
 * A platform right only carries a live holdback while it is itself active: is_current
 * and not past its end_date. A lapsed deal's holdback no longer encumbers the title, so
 * every holdback check filters through this first. Rows fetched without an is_current
 * filter are covered because the flag is re-tested here.
 */
function isActivePlatformRight(r: any, referenceDate: string): boolean {
  if (r?.is_current === false) return false
  return !r?.end_date || r.end_date >= referenceDate
}

function internetExploitationTypeOf(pt: string): ExploitationType | null {
  const n = (pt || '').trim().toLowerCase()
  if (n === 'avod') return 'avod'
  if (n === 'svod') return 'svod'
  if (n === 'tvod') return 'tvod'
  if (n === 'fvod') return 'fvod'
  return null
}

function isHoichoiPlatform(name: string): boolean {
  return name.toLowerCase().includes('hoichoi')
}

// Airborne/Ship/Other rights have no dedicated platform_type seed values today, but platforms
// are free-text — if an admin ever creates one (e.g. "Airborne TV"), this lets the "not
// currently exploited" check on the Other Rights tab recognize it.
function isOtherExploitationPlatform(pt: string): boolean {
  return /air|ship|surface|hotel/i.test(pt)
}


export async function getPlatforms(): Promise<Platform[]> {
  try {
    // Lookup lists are read on nearly every page mount and change rarely, so the
    // result is cached; a throw still falls through to the catch below and is
    // never cached, so a failure retries rather than sticking for the TTL.
    return await cachedQuery('platforms', async () => {
      const { data, error } = await supabase.from('platforms').select('*').order('name')
      if (error) throw error
      return data || []
    })
  } catch (error) {
    console.error('Error fetching platforms:', error)
    return []
  }
}

// New rights-focused dashboard metrics
export interface RightsFocusedStats {
  openTitlesCount: number
  wtpCount: number
  expiringRightsCount: number
  upcomingMoviesCount: number
}

export async function getRightsFocusedStats(): Promise<RightsFocusedStats> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const oneYearFromNow = new Date()
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)
    const oneYearDate = oneYearFromNow.toISOString().split('T')[0]

    // Get all movies that are NOT expired and NOT "Sold to Grassroot"
    // A movie is expired if its agreement_end_date is in the past
    // Movies sold to grassroot should not be part of any open titles or WTP count
    // Get all movies that are NOT expired and NOT "Sold to Grassroot"
    // A movie is expired if its agreement_end_date is in the past
    // Movies sold to grassroot (remapped to Sold/Expired) should not be part of any open titles or WTP count
    const moviesQuery = supabase.from('movies').select('id, source, home_sold, jointly_owned, agreement_end_date, jointly_exploitation_rights, wtp_library').eq('approval_status', 'approved')
    const { data: allMovies } = await moviesQuery
    // Route through the shared helper so this count applies the same sold / expired /
    // held-by-partner rules as every other open-titles query.
    const liveMovies = (allMovies || []).filter((m: any) => !isSoldOrExpired(m, today))
    const allMovieIds = new Set(liveMovies.map((m: { id: string }) => m.id))

    // Get movies with active rights
    const { data: moviesWithActiveRights } = await supabase.from('platform_rights').select('movie_id').eq('is_current', true)
    const moviesWithRightsSet = new Set(moviesWithActiveRights?.map((r: { movie_id: string }) => r.movie_id) || [])

    // Open Titles: Movies without any current rights
    const openTitlesCount = allMovieIds.size - moviesWithRightsSet.size

    // WTP count: live titles tagged WTP or WTP/BD. Counted from the same
    // sold/expired-filtered set as open titles — a lapsed or sold film is not
    // ours to sell, so it is not WTP inventory.
    const wtpCount = liveMovies.filter(
      (m: any) => m.wtp_library === 'WTP' || m.wtp_library === 'WTP/BD'
    ).length

    // Expiring Rights Count (in next 1 year)
    const { count: expiringCount } = await supabase.from('platform_rights').select('*', { count: 'exact', head: true }).eq('is_current', true).gte('end_date', today).lte('end_date', oneYearDate)

    // Upcoming Movies Count: Movies with release_date in the future
    const { count: upcomingCount } = await supabase.from('movies').select('*', { count: 'exact', head: true }).gte('release_date', today)

    return {
      openTitlesCount,
      wtpCount: wtpCount || 0,
      expiringRightsCount: expiringCount || 0,
      upcomingMoviesCount: upcomingCount || 0,
    }
  } catch (error) {
    console.error('Error calculating rights-focused stats:', error)
    return {
      openTitlesCount: 0,
      wtpCount: 0,
      expiringRightsCount: 0,
      upcomingMoviesCount: 0,
    }
  }
}

export type RightsMode = 'satellite' | 'internet'

export interface RightsModeStats {
  openTitlesCount: number
  openHomeTitlesCount: number
  openAcquiredTitlesCount: number
  wtpCount: number
  expiringRightsCount: number
  upcomingMoviesCount: number
}

export function getRightsModeStats(mode: RightsMode, language?: string[], openTo?: string): Promise<RightsModeStats> {
  return cachedStat(
    `modeStats|${mode}|${(language ?? []).join(',')}|${openTo ?? ''}`,
    () => computeRightsModeStats(mode, language, openTo)
  )
}

async function computeRightsModeStats(mode: RightsMode, language?: string[], openTo?: string): Promise<RightsModeStats> {
  const emptyStats: RightsModeStats = {
    openTitlesCount: 0,
    openHomeTitlesCount: 0,
    openAcquiredTitlesCount: 0,
    wtpCount: 0,
    expiringRightsCount: 0,
    upcomingMoviesCount: 0,
  }
  if (language && language.length === 0) return emptyStats
  try {
    const today = new Date().toISOString().split('T')[0]
    // Same semantics as getOpenTitlesForMode: when an "open until" date is supplied, open-title
    // eligibility is evaluated as of that date instead of today, so the stat card and the table
    // stay consistent.
    const referenceDate = openTo || today
    const currentYear = new Date().getFullYear()
    // Stat card always shows current-year expiring
    const currentYearStart = `${currentYear}-01-01`
    const currentYearEnd = `${currentYear}-12-31`

    // Fetch all approved movies (language-filtered) — no flat rights columns needed
    let moviesQuery = supabase
      .from('movies')
      .select('id, source, certification, home_sold, jointly_owned, jointly_exploitation_rights, agreement_end_date, wtp_library, syndication_holdback')
      .eq('approval_status', 'approved')
    if (language && language.length > 0) moviesQuery = moviesQuery.in('language', language)
    const { data: allMovies } = await moviesQuery

    // Always exclude sold (home) and expired-agreement (acquired) movies
    const validMovies = (allMovies || []).filter((m: any) => !isSoldOrExpired(m, referenceDate))

    let openHomeCount = 0
    let openAcquiredCount = 0
    let homeSatStatRights: any[] = []
    let homeIntStatRights: any[] = []

    if (mode === 'satellite') {
      const homeMovies = validMovies.filter((m: any) => m.source === 'home_production')
      const homeMovieIds = homeMovies.map((m: any) => m.id)

      // Home open: no active satellite platform_right, cert != A
      let moviesWithActiveSatRights = new Set<string>()
      if (homeMovieIds.length > 0) {
        const satRights = await fetchPlatformRightsChunked(
          homeMovieIds, 'movie_id, platforms(platform_type), end_date, holdbacks',
          (q) => q.eq('is_current', true)
        )
        moviesWithActiveSatRights = new Set(
          satRights
            .filter((r: any) => isHomeSatellitePlatform(r.platforms?.platform_type || '') && (!r.end_date || r.end_date >= referenceDate))
            .map((r: any) => r.movie_id)
        )
        homeSatStatRights = satRights
      }
      openHomeCount = homeMovies.filter((m: any) =>
        !moviesWithActiveSatRights.has(m.id) &&
        (m.certification || '').trim().toUpperCase() !== 'A' &&
        !holdsBackType(m.syndication_holdback, 'satellite') &&
        !homeSatStatRights.some((r: any) => r.movie_id === m.id && isActivePlatformRight(r, referenceDate) && holdsBackType(r.holdbacks, 'satellite'))
      ).length

      // Acquired open: has a Satellite or Negative movie_rights row that hasn't expired,
      // cert != A, and no active satellite platform_right
      const acquiredMovies = validMovies.filter((m: any) => m.source === 'acquired' && (m.certification || '').trim().toUpperCase() !== 'A')
      const acquiredMovieIds = acquiredMovies.map((m: any) => m.id)

      // Which acquired movies have a Satellite or Negative right?
      const acqWithSatRight = await fetchMovieRightsIdsByType(acquiredMovieIds, ['Satellite', 'Negative'])
      // Get the effective end_date per movie from movie_rights
      const acqSatEndDates = await fetchMovieRightsEndDates(acquiredMovieIds, ['Satellite', 'Negative'])

      const eligibleAcquired = acquiredMovies.filter((m: any) => {
        if (!acqWithSatRight.has(m.id)) return false
        const mrEnd = acqSatEndDates.get(m.id)
        // mrEnd undefined = no row (already excluded above); null = perpetual
        const endDate = mrEnd ?? m.agreement_end_date ?? null
        // referenceDate, not today: getOpenTitlesForMode gates on it here too, and
        // using today would make the stat card and tab pill disagree with the table
        // whenever an "open until" date is selected.
        if (endDate && endDate < referenceDate) return false
        return true
      })
      const eligibleAcquiredIds = eligibleAcquired.map((m: any) => m.id)

      const moviesWithActiveSatPlatformRight = new Set<string>()
      let acqSatStatRights: any[] = []
      const acqSatStatMrHoldbacks = await fetchMovieRightsHoldbacks(eligibleAcquiredIds, ['Satellite', 'Negative'])
      if (eligibleAcquiredIds.length > 0) {
        acqSatStatRights = await fetchPlatformRightsChunked(eligibleAcquiredIds, 'movie_id, platforms(platform_type), end_date, holdbacks, is_current')
        acqSatStatRights.forEach((r: any) => {
          if (!isAcquiredSatellitePlatform(r.platforms?.platform_type || '')) return
          // referenceDate, not today — matches getOpenTitlesForMode's gating.
          if (!r.end_date || r.end_date >= referenceDate) moviesWithActiveSatPlatformRight.add(r.movie_id)
        })
      }
      openAcquiredCount = eligibleAcquired.filter((m: any) =>
        !moviesWithActiveSatPlatformRight.has(m.id) &&
        !holdsBackType(m.syndication_holdback, 'satellite') &&
        !anyHoldsBackType(acqSatStatMrHoldbacks.get(m.id) || [], 'satellite') &&
        !acqSatStatRights.some((r: any) => r.movie_id === m.id && isActivePlatformRight(r, referenceDate) && holdsBackType(r.holdbacks, 'satellite'))
      ).length
    } else {
      // Internet mode
      const homeMovies = validMovies.filter((m: any) => m.source === 'home_production')
      const homeMovieIds = homeMovies.map((m: any) => m.id)

      // Home open: no active internet platform_right (excluding Hoichoi), no SVOD syndication holdback
      let moviesWithActiveIntRights = new Set<string>()
      if (homeMovieIds.length > 0) {
        const intRights = await fetchPlatformRightsChunked(
          homeMovieIds, 'movie_id, platforms(name, platform_type), end_date, holdbacks',
          (q) => q.eq('is_current', true)
        )
        homeIntStatRights = intRights
        moviesWithActiveIntRights = new Set(
          intRights
            .filter((r: any) => isInternetPlatform(r.platforms?.platform_type || '') && !isHoichoiPlatform(r.platforms?.name || '') && (!r.end_date || r.end_date >= referenceDate))
            .map((r: any) => r.movie_id)
        )
      }
      // Mirrors openTypesFor() in getOpenTitlesForMode: a title counts as open when at least
      // one internet sub-type is owned, unexploited and unheld — so the card matches the rows.
      const openTypeCount = (m: any, rights: any[], ownedRaws: string[], classifications?: string[]) =>
        INTERNET_EXPLOITATION_TYPES.filter((t) => {
          if (!anyClassificationAllowsType(classifications || [], t)) return false
          const mine = rights.filter((r: any) => r.movie_id === m.id && isActivePlatformRight(r, referenceDate))
          if (mine.some((r: any) => internetExploitationTypeOf(r.platforms?.platform_type || '') === t && !isHoichoiPlatform(r.platforms?.name || ''))) return false
          return !anyHoldsBackType([m.syndication_holdback, ...mine.map((r: any) => r.holdbacks), ...ownedRaws], t)
        }).length

      openHomeCount = homeMovies.filter((m: any) => openTypeCount(m, homeIntStatRights, []) > 0).length

      // Acquired open: has an Internet or Negative movie_rights row that hasn't expired,
      // no active internet platform_right (excluding Hoichoi), and no SVOD holdback (movie-wide,
      // movie_rights, or platform_rights)
      const acquiredMovies = validMovies.filter((m: any) => m.source === 'acquired')
      const acquiredMovieIds = acquiredMovies.map((m: any) => m.id)

      const acqWithIntRight = await fetchMovieRightsIdsByType(acquiredMovieIds, ['Internet', 'Negative'])
      const acqIntEndDates = await fetchMovieRightsEndDates(acquiredMovieIds, ['Internet', 'Negative'])
      const acqIntHoldbacks = await fetchMovieRightsHoldbacks(acquiredMovieIds, ['Internet', 'Negative'])

      const eligibleAcquired = acquiredMovies.filter((m: any) => {
        if (!acqWithIntRight.has(m.id)) return false
        const mrEnd = acqIntEndDates.get(m.id)
        const endDate = mrEnd ?? m.agreement_end_date ?? null
        if (endDate && endDate < referenceDate) return false
        return true
      })
      const eligibleAcquiredIds = eligibleAcquired.map((m: any) => m.id)

      const moviesWithActiveIntPlatformRight = new Set<string>()
      let acqIntRights: any[] = []
      if (eligibleAcquiredIds.length > 0) {
        acqIntRights = await fetchPlatformRightsChunked(
          eligibleAcquiredIds, 'movie_id, platforms(name, platform_type), end_date, holdbacks',
          (q) => q.eq('is_current', true)
        )
        acqIntRights.forEach((r: any) => {
          if (!isInternetPlatform(r.platforms?.platform_type || '') || isHoichoiPlatform(r.platforms?.name || '')) return
          if (!r.end_date || r.end_date >= referenceDate) moviesWithActiveIntPlatformRight.add(r.movie_id)
        })
      }
      const acqIntStatClassifications = await fetchMovieRightsClassifications(eligibleAcquiredIds, ['Internet', 'Negative'])
      openAcquiredCount = eligibleAcquired.filter(
        (m: any) => openTypeCount(m, acqIntRights, acqIntHoldbacks.get(m.id) || [], acqIntStatClassifications.get(m.id)) > 0
      ).length
    }

    const openTitlesCount = openHomeCount + openAcquiredCount

    // WTP — counted from validMovies, which is already approved, language-filtered
    // and stripped of sold/expired titles, so the card matches the rows the WTP
    // table actually lists (it applies the same isSoldOrExpired rule).
    const wtpCount = validMovies.filter(
      (m: any) => m.wtp_library === 'WTP' || m.wtp_library === 'WTP/BD'
    ).length

    // Expiring rights — count unique movies with a matching platform_right expiring in current year
    let expiringCount = 0

    const allValidMovieIds = validMovies.map((m: any) => m.id)
    if (allValidMovieIds.length > 0) {
      const expiringRights = await fetchPlatformRightsChunked(
        allValidMovieIds, 'movie_id, platforms(platform_type)',
        (q) => q.eq('is_current', true).gte('end_date', currentYearStart).lte('end_date', currentYearEnd)
      )
      const filterFn = mode === 'satellite'
        ? (r: any) => isSatellitePlatformType(r.platforms?.platform_type || '')
        : (r: any) => isInternetPlatform(r.platforms?.platform_type || '')
      expiringCount = new Set(expiringRights.filter(filterFn).map((r: any) => r.movie_id)).size
    }

    // Upcoming movies count (same for both)
    const { count: upcomingCount } = await supabase.from('movies').select('*', { count: 'exact', head: true }).gte('release_date', today)

    return {
      openTitlesCount,
      openHomeTitlesCount: openHomeCount,
      openAcquiredTitlesCount: openAcquiredCount,
      wtpCount: wtpCount || 0,
      expiringRightsCount: expiringCount,
      upcomingMoviesCount: upcomingCount || 0,
    }
  } catch (error) {
    console.error('Error calculating rights mode stats:', error)
    return {
      openTitlesCount: 0,
      openHomeTitlesCount: 0,
      openAcquiredTitlesCount: 0,
      wtpCount: 0,
      expiringRightsCount: 0,
      upcomingMoviesCount: 0,
    }
  }
}

export async function getOpenTitlesForMode(
  mode: RightsMode,
  options?: {
    limit?: number
    offset?: number
    search?: string
    language?: string[]
    sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
    bangladeshiOnly?: boolean
    certification?: string[]
    sortBy?: 'title_asc' | 'title_desc' | 'created_at_desc' | 'release_date_desc' | 'release_date_asc'
    openFrom?: string
    openTo?: string
    wtpFilter?: ('wtp' | 'wtp_bd' | 'library')[]
    /**
     * Internet tab only: narrow to titles open for these exploitation types. A title
     * matches when it is open on ANY selected type (union) — selecting SVOD + AVOD
     * returns titles free for SVOD plus those free for AVOD. Empty/omitted = open on
     * at least one type.
     */
    openToTypes?: ExploitationType[]
    /**
     * Narrow by holdback presence: 'with' keeps only titles carrying at least one
     * holdback (from any source), 'without' keeps only titles carrying none.
     * Omitted / 'all' applies no narrowing.
     */
    holdbackFilter?: 'all' | 'with' | 'without'
  },
): Promise<{ data: (MovieWithDetails & { holdback_info: HoldbackInfo; holdback_summary: string; hoichoi_occupied?: boolean; open_types?: ExploitationType[] })[]; count: number }> {
  if ((options?.language && options.language.length === 0) || (options?.certification && options.certification.length === 0) || (options?.wtpFilter && options.wtpFilter.length === 0)) {
    return { data: [], count: 0 }
  }
  try {
    const today = new Date().toISOString().split('T')[0]
    // Reference date for expiry comparisons: when an "open until" date is supplied, a right
    // is only "active" if it stays active through that date — this lets titles whose current
    // right lapses inside the selected window count as open-in-range. `openFrom` doesn't
    // independently affect gating; it exists for UI symmetry with the date-range picker.
    const referenceDate = options?.openTo || today
    const sortBy = options?.sortBy || 'title_asc'

    let query = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')

    if (options?.search) {
      query = query.or(orContains(options.search, ["title", "production_no"]))
    }

    if (options?.language && options.language.length > 0) {
      query = query.in('language', options.language)
    }

    if (options?.certification && options.certification.length > 0) {
      const certs = [...options.certification]
      // Treat U/A and all UA variants as equivalent
      const hasUaVariant = certs.some((c) => c === 'UA' || c === 'U/A' || c.startsWith('UA '))
      if (hasUaVariant && !certs.includes('U/A')) certs.push('U/A')
      query = query.in('certification', certs)
    }

    if (options?.wtpFilter && options.wtpFilter.length > 0) {
      const wtpMap = { wtp: 'WTP', wtp_bd: 'WTP/BD', library: 'Library' } as const
      query = query.in('wtp_library', options.wtpFilter.map((f) => wtpMap[f]))
    }

    if (sortBy === 'title_asc') query = query.order('title', { ascending: true })
    else if (sortBy === 'title_desc') query = query.order('title', { ascending: false })
    else if (sortBy === 'created_at_desc') query = query.order('created_at', { ascending: false })
    else if (sortBy === 'release_date_desc') query = query.order('release_date', { ascending: false, nullsFirst: false })
    else if (sortBy === 'release_date_asc') query = query.order('release_date', { ascending: true, nullsFirst: false })

    const { data: movies } = await query

    // Always exclude sold (home) and expired-agreement (acquired) movies from the rights dashboard
    const validMovies = ((movies || []) as any[]).filter((m: any) => !isSoldOrExpired(m, referenceDate))

    let openTitles: any[] = []
    // Collected inside the satellite branch, consumed by the holdback_info pass below.
    let satHoldbackRights: any[] = []
    const satMrHoldbacks = new Map<string, string[]>()

    if (mode === 'satellite') {
      const homeMovies = validMovies.filter((m: any) => m.source === 'home_production')
      const homeMovieIds = homeMovies.map((m: any) => m.id)

      // Home: no active satellite platform_right, cert != A
      // platform_type in (Satellite TV, DTH VOD, Terrestrial TV)
      let moviesWithActiveSatRights = new Set<string>()
      let homeSatRights: any[] = []
      if (homeMovieIds.length > 0) {
        // end_date is checked alongside is_current: a stale is_current row whose end_date has
        // passed is no longer an active exploitation and must not hide the title.
        homeSatRights = await fetchPlatformRightsChunked(homeMovieIds, 'movie_id, platforms(name, platform_type), end_date, holdbacks', (q) => q.eq('is_current', true))
        moviesWithActiveSatRights = new Set(
          homeSatRights
            .filter((r: any) => isHomeSatellitePlatform(r.platforms?.platform_type || '') && (!r.end_date || r.end_date >= referenceDate))
            .map((r: any) => r.movie_id)
        )
      }
      // Satellite holdbacks: home titles own all rights, but an exploited platform right
      // (or the movie-wide field) can still hold satellite back.
      const homeSatHoldbackIds = new Set<string>(
        homeMovies
          .filter((m: any) =>
            holdsBackType(m.syndication_holdback, 'satellite') ||
            homeSatRights.some((r: any) => r.movie_id === m.id && isActivePlatformRight(r, referenceDate) && holdsBackType(r.holdbacks, 'satellite'))
          )
          .map((m: any) => m.id)
      )
      const openHomeMovies = homeMovies.filter((m: any) => !moviesWithActiveSatRights.has(m.id) && !homeSatHoldbackIds.has(m.id) && (m.certification || '').trim().toUpperCase() !== 'A')

      // Acquired: has Satellite or Negative movie_rights row, cert != A,
      // not expired, no active satellite platform_right
      const acquiredCandidates = validMovies.filter((m: any) => m.source === 'acquired' && (m.certification || '').trim().toUpperCase() !== 'A')
      const acquiredCandidateIds = acquiredCandidates.map((m: any) => m.id)
      const acqWithSatRight2 = await fetchMovieRightsIdsByType(acquiredCandidateIds, ['Satellite', 'Negative'])
      const acqSatEndDates2 = await fetchMovieRightsEndDates(acquiredCandidateIds, ['Satellite', 'Negative'])
      const acquiredMovies = acquiredCandidates.filter((m: any) => {
        if (!acqWithSatRight2.has(m.id)) return false
        const mrEnd = acqSatEndDates2.get(m.id)
        const endDate = mrEnd ?? m.agreement_end_date ?? null
        if (endDate && endDate < referenceDate) return false
        return true
      })
      const acquiredMovieIds = acquiredMovies.map((m: any) => m.id)
      const moviesWithActiveSatPlatformRight2 = new Set<string>()
      let acqSatRights: any[] = []
      const acqSatMrHoldbacks = await fetchMovieRightsHoldbacks(acquiredMovieIds, ['Satellite', 'Negative'])
      if (acquiredMovieIds.length > 0) {
        acqSatRights = await fetchPlatformRightsChunked(acquiredMovieIds, 'movie_id, platforms(name, platform_type), end_date, holdbacks, is_current')
        acqSatRights.forEach((r: any) => {
          if (!isAcquiredSatellitePlatform(r.platforms?.platform_type || '')) return
          if (!r.end_date || r.end_date >= referenceDate) moviesWithActiveSatPlatformRight2.add(r.movie_id)
        })
      }
      // A satellite holdback from any of the three sources blocks "open" status.
      const acqSatHoldbackIds = new Set<string>(
        acquiredMovies
          .filter((m: any) =>
            holdsBackType(m.syndication_holdback, 'satellite') ||
            anyHoldsBackType(acqSatMrHoldbacks.get(m.id) || [], 'satellite') ||
            acqSatRights.some((r: any) => r.movie_id === m.id && isActivePlatformRight(r, referenceDate) && holdsBackType(r.holdbacks, 'satellite'))
          )
          .map((m: any) => m.id)
      )
      const openAcquiredMovies = acquiredMovies.filter((m: any) => !moviesWithActiveSatPlatformRight2.has(m.id) && !acqSatHoldbackIds.has(m.id))

      satHoldbackRights = [...homeSatRights, ...acqSatRights]
      acqSatMrHoldbacks.forEach((v, k) => satMrHoldbacks.set(k, v))

      const sf = options?.sourceFilter || 'all'
      if (sf === 'home') openTitles = openHomeMovies
      else if (sf === 'acquired') openTitles = openAcquiredMovies
      else if (sf === 'bangladeshi') openTitles = [...openHomeMovies, ...openAcquiredMovies].filter((m: any) => m.is_bangladeshi === true)
      else openTitles = [...openHomeMovies, ...openAcquiredMovies]
    } else {
      // Internet mode
      const homeMovies = validMovies.filter((m: any) => m.source === 'home_production')
      const homeMovieIds = homeMovies.map((m: any) => m.id)

      // Home: no active internet platform_right (excluding Hoichoi)
      // platform_type in (SVOD, TVOD, AVOD, FVOD), is_current=true, (end_date is null or >= referenceDate)
      let moviesWithActiveIntRights = new Set<string>()
      let homeIntRights: any[] = []
      if (homeMovieIds.length > 0) {
        homeIntRights = await fetchPlatformRightsChunked(
          homeMovieIds, 'movie_id, platforms(name, platform_type), end_date, holdbacks',
          (q) => q.eq('is_current', true)
        )
        moviesWithActiveIntRights = new Set(
          homeIntRights
            .filter((r: any) => isInternetPlatform(r.platforms?.platform_type || '') && !isHoichoiPlatform(r.platforms?.name || '') && (!r.end_date || r.end_date >= referenceDate))
            .map((r: any) => r.movie_id)
        )
      }
      // Requested sub-types. A title matches if it is open on ANY selected type; with
      // none selected, being open on at least one type is enough.
      const selectedTypes = options?.openToTypes || []
      // Per-type evaluation: a title is open on a sub-type when it owns that sub-type, is not
      // actively exploited on it, and carries no live holdback naming it. "Open to any" then
      // means "open on at least one sub-type" rather than "has no internet deal at all" —
      // otherwise a film with only SVOD sold looks closed while AVOD/TVOD/… are free to sell.
      const openTypesFor = (
        m: any,
        rights: any[],
        classifications: string[] | undefined,
      ): ExploitationType[] =>
        INTERNET_EXPLOITATION_TYPES.filter((t) => {
          if (!anyClassificationAllowsType(classifications || [], t)) return false
          const mine = rights.filter((r: any) => r.movie_id === m.id && isActivePlatformRight(r, referenceDate))
          const exploited = mine.some(
            (r: any) => internetExploitationTypeOf(r.platforms?.platform_type || '') === t && !isHoichoiPlatform(r.platforms?.name || '')
          )
          if (exploited) return false
          const raws = [m.syndication_holdback, ...mine.map((r: any) => r.holdbacks)]
          return !anyHoldsBackType(raws, t)
        })

      const homeOpenTypes = new Map<string, ExploitationType[]>()
      for (const m of homeMovies) homeOpenTypes.set(m.id, openTypesFor(m, homeIntRights, undefined))

      const matchesSelection = (open: ExploitationType[]) =>
        selectedTypes.length > 0 ? selectedTypes.some((t) => open.includes(t)) : open.length > 0

      const openHomeMovies = homeMovies.filter((m: any) => matchesSelection(homeOpenTypes.get(m.id) || []))

      // Acquired: has Internet or Negative movie_rights row, not expired, no active internet platform_right (excl. Hoichoi)
      const acquiredCandidatesInt = validMovies.filter((m: any) => m.source === 'acquired')
      const acquiredCandidateIdsInt = acquiredCandidatesInt.map((m: any) => m.id)
      const acqWithIntRight2 = await fetchMovieRightsIdsByType(acquiredCandidateIdsInt, ['Internet', 'Negative'])
      const acqIntEndDates2 = await fetchMovieRightsEndDates(acquiredCandidateIdsInt, ['Internet', 'Negative'])
      const acqIntHoldbacks = await fetchMovieRightsHoldbacks(acquiredCandidateIdsInt, ['Internet', 'Negative'])
      const acqIntClassifications = await fetchMovieRightsClassifications(acquiredCandidateIdsInt, ['Internet', 'Negative'])
      const acquiredMovies = acquiredCandidatesInt.filter((m: any) => {
        if (!acqWithIntRight2.has(m.id)) return false
        const mrEnd = acqIntEndDates2.get(m.id)
        const endDate = mrEnd ?? m.agreement_end_date ?? null
        if (endDate && endDate < referenceDate) return false
        return true
      })
      const acquiredMovieIds = acquiredMovies.map((m: any) => m.id)
      const moviesWithActiveIntPlatformRight2 = new Set<string>()
      let acqIntRights: any[] = []
      if (acquiredMovieIds.length > 0) {
        acqIntRights = await fetchPlatformRightsChunked(acquiredMovieIds, 'movie_id, platforms(name, platform_type), end_date, holdbacks', (q) => q.eq('is_current', true))
        acqIntRights.forEach((r: any) => {
          if (!isInternetPlatform(r.platforms?.platform_type || '') || isHoichoiPlatform(r.platforms?.name || '')) return
          if (!r.end_date || r.end_date >= referenceDate) moviesWithActiveIntPlatformRight2.add(r.movie_id)
        })
      }
      // Same per-type evaluation as the home branch, plus the owned-rights holdbacks that
      // only acquired titles carry (movie_rights.holdbacks).
      const acqOpenTypes = new Map<string, ExploitationType[]>()
      for (const m of acquiredMovies) {
        const ownedRaws = acqIntHoldbacks.get(m.id) || []
        const types = openTypesFor(m, acqIntRights, acqIntClassifications.get(m.id))
          .filter((t) => !anyHoldsBackType(ownedRaws, t))
        acqOpenTypes.set(m.id, types)
      }

      const openAcquiredMovies = acquiredMovies.filter((m: any) => matchesSelection(acqOpenTypes.get(m.id) || []))

      // Surfaced in the table so "open to any" says WHICH sub-types are free.
      const openTypesById = new Map<string, ExploitationType[]>([...homeOpenTypes, ...acqOpenTypes])

      const sf2 = options?.sourceFilter || 'all'
      if (sf2 === 'home') openTitles = openHomeMovies
      else if (sf2 === 'acquired') openTitles = openAcquiredMovies
      else if (sf2 === 'bangladeshi') openTitles = [...openHomeMovies, ...openAcquiredMovies].filter((m: any) => m.is_bangladeshi === true)
      else openTitles = [...openHomeMovies, ...openAcquiredMovies]

      // Attach holdback_info for display — informational, independent of the SVOD gate above
      const holdbackContext = new Map<string, { movieRights: string[]; platformRights: { platformName: string; raw: string }[] }>()
      for (const m of [...homeMovies, ...acquiredMovies]) {
        holdbackContext.set(m.id, { movieRights: acqIntHoldbacks.get(m.id) || [], platformRights: [] })
      }
      for (const r of [...homeIntRights, ...acqIntRights]) {
        // Only live rights contribute — keeps the displayed column consistent with the gate.
        if (!r.holdbacks || !isActivePlatformRight(r, referenceDate)) continue
        const ctx = holdbackContext.get(r.movie_id)
        if (ctx) ctx.platformRights.push({ platformName: r.platforms?.name || 'Platform', raw: r.holdbacks })
      }
      // Hoichoi is in-house, so an active Hoichoi deal doesn't close a type — but the row
      // is flagged so nobody reads the title as commercially unsold.
      const hoichoiOccupied = new Set<string>(
        [...homeIntRights, ...acqIntRights]
          .filter((r: any) =>
            isHoichoiPlatform(r.platforms?.name || '') &&
            internetExploitationTypeOf(r.platforms?.platform_type || '') !== null &&
            isActivePlatformRight(r, referenceDate)
          )
          .map((r: any) => r.movie_id)
      )
      openTitles = openTitles.map((m: any) => {
        const ctx = holdbackContext.get(m.id) || { movieRights: [], platformRights: [] }
        // Internet must only surface internet holdbacks. The platform-right and
        // rights-level sources are already scoped (internet platforms;
        // Internet/Negative movie_rights), but syndication_holdback is a single
        // movie-wide field covering every right type, so a satellite-only note
        // would otherwise appear here. Scope each source to the internet types.
        const info = buildHoldbackInfo([
          {
            label: 'Movie-wide',
            raw: filterHoldbackTextForTypes(m.syndication_holdback, INTERNET_EXPLOITATION_TYPES),
          },
          {
            label: 'Rights-level (movie_rights)',
            raw: filterHoldbackTextForTypes(ctx.movieRights.join(', '), INTERNET_EXPLOITATION_TYPES),
          },
          ...ctx.platformRights.map((pr) => ({
            label: `Platform right (${pr.platformName})`,
            raw: filterHoldbackTextForTypes(pr.raw, INTERNET_EXPLOITATION_TYPES),
          })),
        ])
        return {
          ...m,
          holdback_info: info,
          holdback_summary: flattenHoldbackInfo(info),
          hoichoi_occupied: hoichoiOccupied.has(m.id),
          open_types: openTypesById.get(m.id) || [],
        }
      })
    }

    // Satellite mode: attach holdback_info from the same three sources the gate uses.
    if (mode === 'satellite') {
      openTitles = openTitles.map((m: any) => {
        const platformEntries = satHoldbackRights
          .filter((r: any) => r.movie_id === m.id && r.holdbacks && isActivePlatformRight(r, referenceDate))
          .map((r: any) => ({ label: `Platform right (${r.platforms?.name || 'Platform'})`, raw: r.holdbacks as string }))
        const info = buildHoldbackInfo([
          { label: 'Movie-wide', raw: m.syndication_holdback },
          { label: 'Rights-level (movie_rights)', raw: (satMrHoldbacks.get(m.id) || []).join(', ') },
          ...platformEntries,
        ])
        return { ...m, holdback_info: info, holdback_summary: flattenHoldbackInfo(info) }
      })
    }

    // Holdback narrowing — relies on holdback_info attached above, so it sees all three
    // sources (movie-wide, owned rights, active platform rights).
    if (options?.holdbackFilter === 'with') {
      openTitles = openTitles.filter((m: any) => m.holdback_info?.hasAny === true)
    } else if (options?.holdbackFilter === 'without') {
      openTitles = openTitles.filter((m: any) => m.holdback_info?.hasAny !== true)
    }

    // Independent Bangladeshi checkbox — combinable with sourceFilter (all/home/acquired)
    if (options?.bangladeshiOnly) {
      openTitles = openTitles.filter((m: any) => m.is_bangladeshi === true)
    }

    // Re-sort combined list by title
    if (sortBy === 'title_asc') openTitles.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else if (sortBy === 'title_desc') openTitles.sort((a, b) => (b.title || '').localeCompare(a.title || ''))

    const totalCount = openTitles.length
    const limit = options?.limit || 10
    const offset = options?.offset || 0
    const paginated = openTitles.slice(offset, offset + limit).map((m: any) => ({
      ...m,
      language_name: m.language,
      production_house_name: m.production_house_name,
    }))

    return { data: paginated, count: totalCount }
  } catch (error) {
    console.error('Error fetching open titles for mode:', error)
    return { data: [], count: 0 }
  }
}

const OTHER_RIGHT_TYPES = ['Airborne', 'Ship', 'Other']

/**
 * Open Titles for the "Other Rights" tab (Airborne + Ship + Other movie_rights combined).
 * Unlike Satellite/Internet, these right_types have no platform_rights linkage in seed data,
 * but platform_type is free-text, so we still check for an active matching platform_right.
 *
 * - Home productions always hold these rights by default (no dated movie_rights row) — "open"
 *   means simply no active platform_right of a matching type currently exploiting them.
 * - Acquired movies are "open" if they have an unexpired Other/Airborne/Ship movie_rights row
 *   (falling back to agreement_end_date when the row itself has no end_date) AND no active
 *   platform_right of a matching type.
 */
export async function getOpenOtherRightsTitles(options?: {
  limit?: number
  offset?: number
  search?: string
  language?: string[]
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  bangladeshiOnly?: boolean
  certification?: string[]
  sortBy?: 'title_asc' | 'title_desc' | 'created_at_desc' | 'release_date_desc' | 'release_date_asc'
  openFrom?: string
  openTo?: string
}): Promise<{ data: MovieWithDetails[]; count: number }> {
  if ((options?.language && options.language.length === 0) || (options?.certification && options.certification.length === 0)) {
    return { data: [], count: 0 }
  }
  try {
    const today = new Date().toISOString().split('T')[0]
    const referenceDate = options?.openTo || today
    const sortBy = options?.sortBy || 'title_asc'

    let query = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')

    if (options?.search) {
      query = query.or(orContains(options.search, ["title", "production_no"]))
    }
    if (options?.language && options.language.length > 0) {
      query = query.in('language', options.language)
    }
    if (options?.certification && options.certification.length > 0) {
      const certs = [...options.certification]
      const hasUaVariant = certs.some((c) => c === 'UA' || c === 'U/A' || c.startsWith('UA '))
      if (hasUaVariant && !certs.includes('U/A')) certs.push('U/A')
      query = query.in('certification', certs)
    }

    if (sortBy === 'title_asc') query = query.order('title', { ascending: true })
    else if (sortBy === 'title_desc') query = query.order('title', { ascending: false })
    else if (sortBy === 'created_at_desc') query = query.order('created_at', { ascending: false })
    else if (sortBy === 'release_date_desc') query = query.order('release_date', { ascending: false, nullsFirst: false })
    else if (sortBy === 'release_date_asc') query = query.order('release_date', { ascending: true, nullsFirst: false })

    const { data: movies } = await query
    const validMovies = ((movies || []) as any[]).filter((m: any) => !isSoldOrExpired(m, referenceDate))

    const homeMovies = validMovies.filter((m: any) => m.source === 'home_production')
    const acquiredCandidates = validMovies.filter((m: any) => m.source === 'acquired')
    const acquiredCandidateIds = acquiredCandidates.map((m: any) => m.id)

    const acqWithOtherRight = await fetchMovieRightsIdsByType(acquiredCandidateIds, OTHER_RIGHT_TYPES)
    const acqOtherEndDates = await fetchMovieRightsEndDates(acquiredCandidateIds, OTHER_RIGHT_TYPES)

    const eligibleAcquired = acquiredCandidates.filter((m: any) => {
      if (!acqWithOtherRight.has(m.id)) return false
      const mrEnd = acqOtherEndDates.get(m.id)
      const endDate = mrEnd ?? m.agreement_end_date ?? null
      if (endDate && endDate < referenceDate) return false
      return true
    })

    // "Not currently exploited" check — applies to both home (always-eligible) and acquired
    // movies, since either can have a platform_right recorded against an Other-type platform.
    const allCandidateIds = [...homeMovies.map((m: any) => m.id), ...eligibleAcquired.map((m: any) => m.id)]
    const moviesWithActiveOtherPlatformRight = new Set<string>()
    if (allCandidateIds.length > 0) {
      const otherRights = await fetchPlatformRightsChunked(
        allCandidateIds, 'movie_id, platforms(platform_type), end_date',
        (q) => q.eq('is_current', true)
      )
      otherRights.forEach((r: any) => {
        if (!isOtherExploitationPlatform(r.platforms?.platform_type || '')) return
        if (!r.end_date || r.end_date >= referenceDate) moviesWithActiveOtherPlatformRight.add(r.movie_id)
      })
    }

    const openHomeMovies = homeMovies.filter((m: any) => !moviesWithActiveOtherPlatformRight.has(m.id))
    const openAcquiredMovies = eligibleAcquired.filter((m: any) => !moviesWithActiveOtherPlatformRight.has(m.id))

    let openTitles: any[]
    const sf = options?.sourceFilter || 'all'
    if (sf === 'home') openTitles = openHomeMovies
    else if (sf === 'acquired') openTitles = openAcquiredMovies
    else if (sf === 'bangladeshi') openTitles = [...openHomeMovies, ...openAcquiredMovies].filter((m: any) => m.is_bangladeshi === true)
    else openTitles = [...openHomeMovies, ...openAcquiredMovies]

    if (options?.bangladeshiOnly) {
      openTitles = openTitles.filter((m: any) => m.is_bangladeshi === true)
    }

    if (sortBy === 'title_asc') openTitles.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else if (sortBy === 'title_desc') openTitles.sort((a, b) => (b.title || '').localeCompare(a.title || ''))

    const totalCount = openTitles.length
    const limit = options?.limit || 10
    const offset = options?.offset || 0
    const paginated = openTitles.slice(offset, offset + limit)

    return { data: paginated, count: totalCount }
  } catch (error) {
    console.error('Error fetching open other-rights titles:', error)
    return { data: [], count: 0 }
  }
}

export interface OtherRight {
  id: string
  right_type: string
  nature?: string
  territory?: string
  start_date?: string
  end_date?: string
}

export type MovieWithOtherRights = MovieWithDetails & {
  other_rights_expiry_date?: string
  other_rights_list?: OtherRight[]
}

// Movies whose Airborne/Ship/Other movie_rights are expiring in a given date range.
// Home productions have no dated rows for these types, so this only ever returns acquired movies.
export async function getExpiringOtherRightsTitles(options?: {
  fromDate?: string
  toDate?: string
  language?: string[]
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  search?: string
  certification?: string[]
  sortBy?: 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc' | 'expiry_asc' | 'expiry_desc'
  limit?: number
  offset?: number
}): Promise<{ data: MovieWithOtherRights[]; count: number }> {
  if ((options?.language && options.language.length === 0) || (options?.certification && options.certification.length === 0)) {
    return { data: [], count: 0 }
  }
  try {
    const today = new Date().toISOString().split('T')[0]
    const sortBy = options?.sortBy || 'expiry_asc'
    const fromDate = options?.fromDate || null
    const toDate = options?.toDate || null

    let moviesQuery = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved').eq('source', 'acquired')
    if (options?.search) moviesQuery = moviesQuery.or(orContains(options.search, ["title", "production_no"]))
    if (options?.language && options.language.length > 0) moviesQuery = moviesQuery.in('language', options.language)
    if (options?.certification && options.certification.length > 0) {
      const certs = [...options.certification]
      const hasUaVariant = certs.some((c) => c === 'UA' || c === 'U/A' || c.startsWith('UA '))
      if (hasUaVariant && !certs.includes('U/A')) certs.push('U/A')
      moviesQuery = moviesQuery.in('certification', certs)
    }

    const { data: allMoviesRaw } = await moviesQuery
    const allMovies = ((allMoviesRaw || []) as any[])
    const validMovies = allMovies.filter((m: any) => !isSoldOrExpired(m, today))
    const movieById = new Map<string, any>(validMovies.map((m: any) => [m.id, m]))
    const movieIds = validMovies.map((m: any) => m.id)

    const results: MovieWithOtherRights[] = []
    if (movieIds.length > 0) {
      const otherMovieRights: any[] = []
      for (let i = 0; i < movieIds.length; i += CHUNK_SIZE) {
        const chunk = movieIds.slice(i, i + CHUNK_SIZE)
        let q = supabase
          .from('movie_rights')
          .select('id, movie_id, right_type, nature, territory, start_date, end_date')
          .in('movie_id', chunk)
          .in('right_type', OTHER_RIGHT_TYPES)
          .not('end_date', 'is', null)
        if (fromDate) q = q.gte('end_date', fromDate)
        if (toDate) q = q.lte('end_date', toDate)
        const { data } = await q
        if (data) otherMovieRights.push(...data)
      }

      const earliestExpiryPerMovie = new Map<string, string>()
      const rightsPerMovie = new Map<string, OtherRight[]>()

      otherMovieRights.forEach((r: any) => {
        const existing = earliestExpiryPerMovie.get(r.movie_id)
        if (!existing || r.end_date < existing) earliestExpiryPerMovie.set(r.movie_id, r.end_date)
        const arr = rightsPerMovie.get(r.movie_id) || []
        arr.push({ id: r.id, right_type: r.right_type, nature: r.nature, territory: r.territory, start_date: r.start_date, end_date: r.end_date })
        rightsPerMovie.set(r.movie_id, arr)
      })

      earliestExpiryPerMovie.forEach((expiryDate, movieId) => {
        const movie = movieById.get(movieId)
        if (!movie) return
        results.push({ ...movie, other_rights_expiry_date: expiryDate, other_rights_list: rightsPerMovie.get(movieId) || [] })
      })
    }

    let deduped = results

    const sf = options?.sourceFilter || 'all'
    if (sf === 'bangladeshi') deduped = deduped.filter((m: any) => m.is_bangladeshi === true)
    // sf === 'home' yields nothing (home has no dated Other rights); 'acquired'/'all' both pass through since this query is acquired-only.

    if (sortBy === 'expiry_asc') deduped.sort((a, b) => (a.other_rights_expiry_date || '').localeCompare(b.other_rights_expiry_date || ''))
    else if (sortBy === 'expiry_desc') deduped.sort((a, b) => (b.other_rights_expiry_date || '').localeCompare(a.other_rights_expiry_date || ''))
    else if (sortBy === 'title_asc') deduped.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else if (sortBy === 'title_desc') deduped.sort((a, b) => (b.title || '').localeCompare(a.title || ''))
    else if (sortBy === 'release_date_desc') deduped.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
    else if (sortBy === 'release_date_asc') deduped.sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))

    const totalCount = deduped.length
    const limit = options?.limit || 10
    const offset = options?.offset || 0
    return { data: deduped.slice(offset, offset + limit), count: totalCount }
  } catch (error) {
    console.error('Error fetching expiring other-rights titles:', error)
    return { data: [], count: 0 }
  }
}

export interface OtherRightsModeStats {
  openTitlesCount: number
  openHomeTitlesCount: number
  openAcquiredTitlesCount: number
  expiringRightsCount: number
  activeRightsCount: number
}

export function getOtherRightsModeStats(language?: string[], openTo?: string): Promise<OtherRightsModeStats> {
  return cachedStat(
    `otherStats|${(language ?? []).join(',')}|${openTo ?? ''}`,
    () => computeOtherRightsModeStats(language, openTo)
  )
}

async function computeOtherRightsModeStats(language?: string[], openTo?: string): Promise<OtherRightsModeStats> {
  if (language && language.length === 0) {
    return { openTitlesCount: 0, openHomeTitlesCount: 0, openAcquiredTitlesCount: 0, expiringRightsCount: 0, activeRightsCount: 0 }
  }
  try {
    const today = new Date().toISOString().split('T')[0]
    const referenceDate = openTo || today
    const currentYear = new Date().getFullYear()
    const currentYearStart = `${currentYear}-01-01`
    const currentYearEnd = `${currentYear}-12-31`

    let moviesQuery = supabase
      .from('movies')
      .select('id, source, home_sold, jointly_owned, jointly_exploitation_rights, agreement_end_date')
      .eq('approval_status', 'approved')
    if (language && language.length > 0) moviesQuery = moviesQuery.in('language', language)
    const { data: allMovies } = await moviesQuery

    const validMovies = (allMovies || []).filter((m: any) => !isSoldOrExpired(m, referenceDate))
    const homeMovies = validMovies.filter((m: any) => m.source === 'home_production')
    const acquiredCandidates = validMovies.filter((m: any) => m.source === 'acquired')
    const acquiredCandidateIds = acquiredCandidates.map((m: any) => m.id)

    const acqWithOtherRight = await fetchMovieRightsIdsByType(acquiredCandidateIds, OTHER_RIGHT_TYPES)
    const acqOtherEndDates = await fetchMovieRightsEndDates(acquiredCandidateIds, OTHER_RIGHT_TYPES)

    const eligibleAcquired = acquiredCandidates.filter((m: any) => {
      if (!acqWithOtherRight.has(m.id)) return false
      const mrEnd = acqOtherEndDates.get(m.id)
      const endDate = mrEnd ?? m.agreement_end_date ?? null
      if (endDate && endDate < referenceDate) return false
      return true
    })

    const allCandidateIds = [...homeMovies.map((m: any) => m.id), ...eligibleAcquired.map((m: any) => m.id)]
    const moviesWithActiveOtherPlatformRight = new Set<string>()
    if (allCandidateIds.length > 0) {
      const otherRights = await fetchPlatformRightsChunked(
        allCandidateIds, 'movie_id, platforms(platform_type), end_date',
        (q) => q.eq('is_current', true)
      )
      otherRights.forEach((r: any) => {
        if (!isOtherExploitationPlatform(r.platforms?.platform_type || '')) return
        if (!r.end_date || r.end_date >= referenceDate) moviesWithActiveOtherPlatformRight.add(r.movie_id)
      })
    }

    const openHomeCount = homeMovies.filter((m: any) => !moviesWithActiveOtherPlatformRight.has(m.id)).length
    const openAcquiredCount = eligibleAcquired.filter((m: any) => !moviesWithActiveOtherPlatformRight.has(m.id)).length

    // Expiring — unique acquired movies with an Other/Airborne/Ship movie_rights row expiring this year
    let expiringCount = 0
    const allValidMovieIds = validMovies.map((m: any) => m.id)
    if (allValidMovieIds.length > 0) {
      const expiringRights: any[] = []
      for (let i = 0; i < allValidMovieIds.length; i += CHUNK_SIZE) {
        const chunk = allValidMovieIds.slice(i, i + CHUNK_SIZE)
        const { data } = await supabase
          .from('movie_rights')
          .select('movie_id')
          .in('movie_id', chunk)
          .in('right_type', OTHER_RIGHT_TYPES)
          .gte('end_date', currentYearStart)
          .lte('end_date', currentYearEnd)
        if (data) expiringRights.push(...data)
      }
      expiringCount = new Set(expiringRights.map((r: any) => r.movie_id)).size
    }

    // Active — unique movies with a currently-live platform_rights row on an Other/Airborne/Ship
    // -classified platform (isOtherExploitationPlatform). Mirrors "Active Internet Rights"
    // exactly; ignores movie_rights entirely, so returns 0 until such a platform exists.
    let activeCount = 0
    const allMovieIds = validMovies.map((m: any) => m.id)
    if (allMovieIds.length > 0) {
      const activeRights = await fetchPlatformRightsChunked(
        allMovieIds, 'movie_id, platforms(platform_type), end_date',
        (q) => q.eq('is_current', true)
      )
      const activeIds = new Set<string>()
      activeRights.forEach((r: any) => {
        if (!isOtherExploitationPlatform(r.platforms?.platform_type || '')) return
        if (r.end_date && r.end_date < today) return
        activeIds.add(r.movie_id)
      })
      activeCount = activeIds.size
    }

    return {
      openTitlesCount: openHomeCount + openAcquiredCount,
      openHomeTitlesCount: openHomeCount,
      openAcquiredTitlesCount: openAcquiredCount,
      expiringRightsCount: expiringCount,
      activeRightsCount: activeCount,
    }
  } catch (error) {
    console.error('Error calculating other-rights mode stats:', error)
    return { openTitlesCount: 0, openHomeTitlesCount: 0, openAcquiredTitlesCount: 0, expiringRightsCount: 0, activeRightsCount: 0 }
  }
}

/**
 * Movies currently holding an unexpired Other/Airborne/Ship movie_rights row — the "Active"
 * counterpart to Open Titles. Unlike Internet/Satellite, there's no platform_rights linkage for
 * these types, so "active" is determined purely from movie_rights dates (falling back to
 * agreement_end_date for acquired movies when the row itself is perpetual).
 */
/**
 * Movies with a currently-live platform_rights row on an Other/Airborne/Ship-classified
 * platform (isOtherExploitationPlatform) — exact mirror of getActiveInternetTitles, just keyed
 * off a different platform_type classifier. Ignores movie_rights entirely: since no
 * Airborne/Ship/Other-typed platform exists in seed data today, this returns no rows until such
 * a platform is created and a platform_right recorded against it.
 */
export async function getActiveOtherRightsTitles(options?: {
  limit?: number
  offset?: number
  search?: string
  language?: string[]
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  certification?: string[]
  sortBy?: 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc'
}): Promise<{ data: MovieWithOtherRights[]; count: number }> {
  if ((options?.language && options.language.length === 0) || (options?.certification && options.certification.length === 0)) {
    return { data: [], count: 0 }
  }
  try {
    const today = new Date().toISOString().split('T')[0]
    const sortBy = options?.sortBy || 'title_asc'

    let query = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')
    if (options?.search) query = query.or(orContains(options.search, ["title", "production_no"]))
    if (options?.language && options.language.length > 0) query = query.in('language', options.language)
    if (options?.certification && options.certification.length > 0) {
      const certs = [...options.certification]
      const hasUaVariant = certs.some((c) => c === 'UA' || c === 'U/A' || c.startsWith('UA '))
      if (hasUaVariant && !certs.includes('U/A')) certs.push('U/A')
      query = query.in('certification', certs)
    }

    const { data: movies } = await query
    const validMovies = ((movies || []) as any[]).filter((m: any) => !isSoldOrExpired(m, today))

    let filteredMovies = validMovies
    const sf = options?.sourceFilter || 'all'
    if (sf === 'home') filteredMovies = validMovies.filter((m: any) => m.source === 'home_production')
    else if (sf === 'acquired') filteredMovies = validMovies.filter((m: any) => m.source === 'acquired')
    else if (sf === 'bangladeshi') filteredMovies = validMovies.filter((m: any) => m.is_bangladeshi === true)

    const movieIds = filteredMovies.map((m: any) => m.id)
    if (movieIds.length === 0) return { data: [], count: 0 }

    const activeRights = await fetchPlatformRightsChunked(
      movieIds, 'movie_id, id, start_date, end_date, nature, territory, platforms(name, platform_type)',
      (q) => q.eq('is_current', true)
    )

    const rightsPerMovie = new Map<string, OtherRight[]>()
    activeRights.forEach((r: any) => {
      const platformType = r.platforms?.platform_type || ''
      if (!isOtherExploitationPlatform(platformType)) return
      if (r.end_date && r.end_date < today) return
      const right: OtherRight = {
        id: r.id,
        right_type: platformType,
        nature: r.nature,
        territory: r.territory,
        start_date: r.start_date,
        end_date: r.end_date,
      }
      const arr = rightsPerMovie.get(r.movie_id) || []
      arr.push(right)
      rightsPerMovie.set(r.movie_id, arr)
    })

    const results: MovieWithOtherRights[] = filteredMovies
      .filter((m: any) => rightsPerMovie.has(m.id))
      .map((m: any) => {
        const rights = rightsPerMovie.get(m.id)!
        rights.sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))
        return { ...m, other_rights_list: rights, other_rights_expiry_date: rights[0]?.end_date }
      })

    if (sortBy === 'title_asc') results.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else if (sortBy === 'title_desc') results.sort((a, b) => (b.title || '').localeCompare(a.title || ''))
    else if (sortBy === 'release_date_desc') results.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
    else if (sortBy === 'release_date_asc') results.sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))

    const totalCount = results.length
    const limit = options?.limit || 10
    const offset = options?.offset || 0
    return { data: results.slice(offset, offset + limit), count: totalCount }
  } catch (error) {
    console.error('Error fetching active other-rights titles:', error)
    return { data: [], count: 0 }
  }
}

/**
 * Plain listing of movies filtered by whether Clip Rights were acquired — no rights-lifecycle
 * concept here (clip_rights is a flat Yes/No + duration flag on the movie, not a dated
 * movie_rights row), so this is a simple table query, not an "open titles" algorithm.
 */
export async function getClipRightsMovies(options?: {
  limit?: number
  offset?: number
  search?: string
  language?: string[]
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  clipRightsFilter?: 'all' | 'yes' | 'no'
  agreementEndBy?: string
  sortBy?: 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc'
}): Promise<{ data: MovieWithDetails[]; count: number }> {
  if (options?.language && options.language.length === 0) {
    return { data: [], count: 0 }
  }
  try {
    const sortBy = options?.sortBy || 'title_asc'
    let query = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')

    if (options?.search) {
      query = query.or(orContains(options.search, ["title", "production_no"]))
    }
    if (options?.language && options.language.length > 0) {
      query = query.in('language', options.language)
    }

    if (sortBy === 'title_asc') query = query.order('title', { ascending: true })
    else if (sortBy === 'title_desc') query = query.order('title', { ascending: false })
    else if (sortBy === 'release_date_desc') query = query.order('release_date', { ascending: false, nullsFirst: false })
    else if (sortBy === 'release_date_asc') query = query.order('release_date', { ascending: true, nullsFirst: false })

    const { data: movies } = await query
    const today = new Date().toISOString().split('T')[0]
    // Always exclude sold (home) and expired-agreement (acquired) movies from the rights dashboard
    let filtered = ((movies || []) as any[]).filter((m: any) => !isSoldOrExpired(m, today))

    const sf = options?.sourceFilter || 'all'
    if (sf === 'home') filtered = filtered.filter((m) => m.source === 'home_production')
    else if (sf === 'acquired') filtered = filtered.filter((m) => m.source === 'acquired')
    else if (sf === 'bangladeshi') filtered = filtered.filter((m) => m.is_bangladeshi === true)

    const cf = options?.clipRightsFilter || 'all'
    if (cf === 'yes') filtered = filtered.filter((m) => (m.clip_rights || '').trim().toLowerCase() === 'yes')
    else if (cf === 'no') filtered = filtered.filter((m) => (m.clip_rights || '').trim().toLowerCase() !== 'yes')

    // Acquired-only: home productions have no agreement_end_date, so this filter excludes them.
    if (options?.agreementEndBy) {
      const by = options.agreementEndBy
      filtered = filtered.filter((m) => m.source === 'acquired' && m.agreement_end_date && m.agreement_end_date <= by)
    }

    const totalCount = filtered.length
    const limit = options?.limit || 10000
    const offset = options?.offset || 0
    return { data: filtered.slice(offset, offset + limit), count: totalCount }
  } catch (error) {
    console.error('Error fetching clip rights movies:', error)
    return { data: [], count: 0 }
  }
}

export async function getLanguages(): Promise<string[]> {
  try {
    return await cachedQuery('languages', async () => {
      const { data, error } = await supabase.from('movies').select('language').not('language', 'is', null)
      if (error) throw error
      const uniqueLanguages = Array.from(new Set((data as { language: string }[]).map((m) => m.language)))
      return uniqueLanguages.sort()
    })
  } catch (error) {
    console.error('Error fetching languages:', error)
    return []
  }
}

export interface SatelliteRight {
  id: string
  platform_name: string
  rights_type_name: string
  start_date?: string
  end_date?: string
  nature?: string
  territory?: string
}

export type MovieWithSatelliteRights = MovieWithDetails & {
  satellite_expiry_date?: string
  satellite_rights_list?: SatelliteRight[]
}

// Satellite-specific: movies whose satellite platform rights expire in a given date range
// For home: satellite platform_rights with end_date in range
// For acquired: satellite_rights_end_date in range AND satellite_rights=Yes OR negative_rights=Yes
export async function getExpiringSatelliteTitles(options?: {
  fromDate?: string
  toDate?: string
  language?: string[]
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  search?: string
  certification?: string[]
  sortBy?: 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc' | 'expiry_asc' | 'expiry_desc'
  limit?: number
  offset?: number
}): Promise<{ data: MovieWithSatelliteRights[]; count: number }> {
  if ((options?.language && options.language.length === 0) || (options?.certification && options.certification.length === 0)) {
    return { data: [], count: 0 }
  }
  try {
    const today = new Date().toISOString().split('T')[0]
    const sortBy = options?.sortBy || 'expiry_asc'

    // fromDate / toDate undefined means "All Years" — no date restriction
    const fromDate = options?.fromDate || null
    const toDate = options?.toDate || null

    // Fetch all valid movies with language filter
    let moviesQuery = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')

    if (options?.search) moviesQuery = moviesQuery.or(orContains(options.search, ["title", "production_no"]))
    if (options?.language && options.language.length > 0) moviesQuery = moviesQuery.in('language', options.language)
    if (options?.certification && options.certification.length > 0) {
      const certs = [...options.certification]
      const hasUaVariant = certs.some((c) => c === 'UA' || c === 'U/A' || c.startsWith('UA '))
      if (hasUaVariant && !certs.includes('U/A')) certs.push('U/A')
      moviesQuery = moviesQuery.in('certification', certs)
    }

    const { data: allMoviesRaw } = await moviesQuery

    const allMovies = ((allMoviesRaw || []) as any[]).map((m: any) => ({
      ...m,
      language_name: m.language,
      production_house_name: m.production_house_name,
    }))

    const validMovies = allMovies.filter((m: any) => !isSoldOrExpired(m, today))

    const results: (MovieWithDetails & { satellite_expiry_date?: string; satellite_rights_list?: SatelliteRight[] })[] = []

    // Query platform_rights for ALL valid movies (home + acquired) with satellite type and date range
    const allValidMovieIds = validMovies.map((m: any) => m.id)
    const movieById = new Map<string, any>(validMovies.map((m: any) => [m.id, m]))

    if (allValidMovieIds.length > 0) {
      const satRights: any[] = []
      for (let i = 0; i < allValidMovieIds.length; i += CHUNK_SIZE) {
        const chunk = allValidMovieIds.slice(i, i + CHUNK_SIZE)
        let q = supabase
          .from('platform_rights')
          .select('id, movie_id, start_date, end_date, nature, territory, platforms(name, platform_type)')
          .eq('is_current', true)
          .in('movie_id', chunk)
        if (fromDate) q = q.gte('end_date', fromDate)
        if (toDate) q = q.lte('end_date', toDate)
        const { data } = await q
        if (data) satRights.push(...data)
      }

      const earliestExpiryPerMovie = new Map<string, string>()
      const rightsPerMovie = new Map<string, SatelliteRight[]>()

      ;(satRights || []).forEach((r: any) => {
        const platformType = r.platforms?.platform_type || ''
        if (!isSatellitePlatformType(platformType)) return

        const existing = earliestExpiryPerMovie.get(r.movie_id)
        if (!existing || r.end_date < existing) {
          earliestExpiryPerMovie.set(r.movie_id, r.end_date)
        }
        const arr = rightsPerMovie.get(r.movie_id) || []
        arr.push({
          id: r.id,
          platform_name: r.platforms?.name || '',
          rights_type_name: platformType,
          start_date: r.start_date,
          end_date: r.end_date,
          nature: r.nature,
          territory: r.territory,
        })
        rightsPerMovie.set(r.movie_id, arr)
      })

      earliestExpiryPerMovie.forEach((expiryDate, movieId) => {
        const movie = movieById.get(movieId)
        if (!movie) return
        results.push({
          ...movie,
          satellite_expiry_date: expiryDate,
          satellite_rights_list: rightsPerMovie.get(movieId) || [],
        })
      })
    }

    // Remove duplicates by movie id (keep earliest expiry)
    const seen = new Map<string, (typeof results)[0]>()
    results.forEach((r) => {
      const existing = seen.get(r.id)
      if (!existing || (r.satellite_expiry_date && existing.satellite_expiry_date && r.satellite_expiry_date < existing.satellite_expiry_date)) {
        seen.set(r.id, r)
      }
    })
    let deduped = Array.from(seen.values())

    // Apply source filter
    const sfExpire = options?.sourceFilter || 'all'
    if (sfExpire === 'home') deduped = deduped.filter((m) => m.source === 'home_production')
    else if (sfExpire === 'acquired') deduped = deduped.filter((m) => m.source === 'acquired')
    else if (sfExpire === 'bangladeshi') deduped = deduped.filter((m: any) => m.is_bangladeshi === true)

    // Sort
    if (sortBy === 'expiry_asc') deduped.sort((a, b) => (a.satellite_expiry_date || '').localeCompare(b.satellite_expiry_date || ''))
    else if (sortBy === 'expiry_desc') deduped.sort((a, b) => (b.satellite_expiry_date || '').localeCompare(a.satellite_expiry_date || ''))
    else if (sortBy === 'title_asc') deduped.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else if (sortBy === 'title_desc') deduped.sort((a, b) => (b.title || '').localeCompare(a.title || ''))
    else if (sortBy === 'release_date_desc') deduped.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
    else if (sortBy === 'release_date_asc') deduped.sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))

    const totalCount = deduped.length
    const limit = options?.limit || 10
    const offset = options?.offset || 0
    return { data: deduped.slice(offset, offset + limit), count: totalCount }
  } catch (error) {
    console.error('Error fetching expiring satellite titles:', error)
    return { data: [], count: 0 }
  }
}


export interface InternetRight {
  id: string
  platform_name: string
  rights_type_name: string
  start_date?: string
  end_date?: string
  nature?: string
  territory?: string
  is_current: boolean
}

export interface MovieWithInternetRights extends MovieWithDetails {
  internet_rights_list: InternetRight[]
  earliest_expiry?: string
}

// Movies whose internet/SVOD platform rights expire in a date range
export async function getExpiringInternetTitles(options?: {
  fromDate?: string
  toDate?: string
  language?: string[]
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  search?: string
  certification?: string[]
  sortBy?: 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc' | 'expiry_asc' | 'expiry_desc'
  limit?: number
  offset?: number
}): Promise<{ data: MovieWithInternetRights[]; count: number }> {
  if ((options?.language && options.language.length === 0) || (options?.certification && options.certification.length === 0)) {
    return { data: [], count: 0 }
  }
  try {
    const today = new Date().toISOString().split('T')[0]
    const sortBy = options?.sortBy || 'expiry_asc'

    // fromDate / toDate null means "All Years" — no date restriction
    const fromDate = options?.fromDate || null
    const toDate = options?.toDate || null

    // Fetch valid movies
    let moviesQuery = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')
    if (options?.search) moviesQuery = moviesQuery.or(orContains(options.search, ["title", "production_no"]))
    if (options?.language && options.language.length > 0) moviesQuery = moviesQuery.in('language', options.language)
    if (options?.certification && options.certification.length > 0) {
      const certs = [...options.certification]
      const hasUaVariant = certs.some((c) => c === 'UA' || c === 'U/A' || c.startsWith('UA '))
      if (hasUaVariant && !certs.includes('U/A')) certs.push('U/A')
      moviesQuery = moviesQuery.in('certification', certs)
    }

    const { data: allMoviesRaw } = await moviesQuery
    const allMovies = ((allMoviesRaw || []) as any[]).map((m: any) => ({
      ...m,
      language_name: m.language,
      production_house_name: m.production_house_name,
    }))
    const validMovies = allMovies.filter((m: any) => !isSoldOrExpired(m, today))

    // Apply source filter early
    let filteredMovies = validMovies
    const sf = options?.sourceFilter || 'all'
    if (sf === 'home') filteredMovies = validMovies.filter((m: any) => m.source === 'home_production')
    else if (sf === 'acquired') filteredMovies = validMovies.filter((m: any) => m.source === 'acquired')
    else if (sf === 'bangladeshi') filteredMovies = validMovies.filter((m: any) => m.is_bangladeshi === true)

    const movieIds = filteredMovies.map((m: any) => m.id)
    if (movieIds.length === 0) return { data: [], count: 0 }

    // Find internet platform rights expiring in range (or all if no range)
    const expiringRights: any[] = []
    for (let i = 0; i < movieIds.length; i += CHUNK_SIZE) {
      const chunk = movieIds.slice(i, i + CHUNK_SIZE)
      let q = supabase
        .from('platform_rights')
        .select('movie_id, id, start_date, end_date, nature, territory, platforms(name, platform_type)')
        .eq('is_current', true)
        .in('movie_id', chunk)
      if (fromDate) q = q.gte('end_date', fromDate)
      if (toDate) q = q.lte('end_date', toDate)
      const { data } = await q
      if (data) expiringRights.push(...data)
    }

    // Group rights by movie_id, keeping only internet-type rights
    const movieRightsMap = new Map<string, InternetRight[]>()
    ;(expiringRights || []).forEach((r: any) => {
      const platformType = r.platforms?.platform_type || ''
      if (!isInternetPlatform(platformType)) return
      const right: InternetRight = {
        id: r.id,
        platform_name: r.platforms?.name || 'Unknown',
        rights_type_name: platformType,
        start_date: r.start_date,
        end_date: r.end_date,
        nature: r.nature,
        territory: r.territory,
        is_current: true,
      }
      if (!movieRightsMap.has(r.movie_id)) movieRightsMap.set(r.movie_id, [])
      movieRightsMap.get(r.movie_id)!.push(right)
    })

    // Build result: only movies that have at least one expiring internet right
    const results: MovieWithInternetRights[] = filteredMovies
      .filter((m: any) => movieRightsMap.has(m.id))
      .map((m: any) => {
        const rights = movieRightsMap.get(m.id)!
        rights.sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))
        return { ...m, internet_rights_list: rights, earliest_expiry: rights[0]?.end_date }
      })

    // Sort
    if (sortBy === 'expiry_asc') results.sort((a, b) => (a.earliest_expiry || '').localeCompare(b.earliest_expiry || ''))
    else if (sortBy === 'expiry_desc') results.sort((a, b) => (b.earliest_expiry || '').localeCompare(a.earliest_expiry || ''))
    else if (sortBy === 'title_asc') results.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else if (sortBy === 'title_desc') results.sort((a, b) => (b.title || '').localeCompare(a.title || ''))
    else if (sortBy === 'release_date_desc') results.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
    else if (sortBy === 'release_date_asc') results.sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))

    const totalCount = results.length
    const limit = options?.limit || 10
    const offset = options?.offset || 0
    return { data: results.slice(offset, offset + limit), count: totalCount }
  } catch (error) {
    console.error('Error fetching expiring internet titles:', error)
    return { data: [], count: 0 }
  }
}

// Movies with at least one active internet/SVOD platform right (with sub-rights details)
export async function getActiveInternetTitles(options?: {
  language?: string[]
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  search?: string
  certification?: string[]
  sortBy?: 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc'
  limit?: number
  offset?: number
}): Promise<{ data: MovieWithInternetRights[]; count: number }> {
  if ((options?.language && options.language.length === 0) || (options?.certification && options.certification.length === 0)) {
    return { data: [], count: 0 }
  }
  try {
    const today = new Date().toISOString().split('T')[0]
    const sortBy = options?.sortBy || 'title_asc'

    let moviesQuery = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')
    if (options?.search) moviesQuery = moviesQuery.or(orContains(options.search, ["title", "production_no"]))
    if (options?.language && options.language.length > 0) moviesQuery = moviesQuery.in('language', options.language)
    if (options?.certification && options.certification.length > 0) {
      const certs = [...options.certification]
      const hasUaVariant = certs.some((c) => c === 'UA' || c === 'U/A' || c.startsWith('UA '))
      if (hasUaVariant && !certs.includes('U/A')) certs.push('U/A')
      moviesQuery = moviesQuery.in('certification', certs)
    }

    const { data: allMoviesRaw } = await moviesQuery
    const allMovies = ((allMoviesRaw || []) as any[]).map((m: any) => ({
      ...m,
      language_name: m.language,
      production_house_name: m.production_house_name,
    }))
    const validMovies = allMovies.filter((m: any) => !isSoldOrExpired(m, today))

    let filteredMovies = validMovies
    const sf = options?.sourceFilter || 'all'
    if (sf === 'home') filteredMovies = validMovies.filter((m: any) => m.source === 'home_production')
    else if (sf === 'acquired') filteredMovies = validMovies.filter((m: any) => m.source === 'acquired')
    else if (sf === 'bangladeshi') filteredMovies = validMovies.filter((m: any) => m.is_bangladeshi === true)

    const movieIds = filteredMovies.map((m: any) => m.id)
    if (movieIds.length === 0) return { data: [], count: 0 }

    // Fetch all active internet platform rights for these movies
    const activeRights = await fetchPlatformRightsChunked(
      movieIds, 'movie_id, id, start_date, end_date, nature, territory, platforms(name, platform_type)',
      (q) => q.eq('is_current', true)
    )

    const movieRightsMap = new Map<string, InternetRight[]>()
    activeRights.forEach((r: any) => {
      const platformType = r.platforms?.platform_type || ''
      if (!isInternetPlatform(platformType)) return
      if (isHoichoiPlatform(r.platforms?.name || '')) return
      if (r.end_date && r.end_date < today) return
      const right: InternetRight = {
        id: r.id,
        platform_name: r.platforms?.name || 'Unknown',
        rights_type_name: platformType,
        start_date: r.start_date,
        end_date: r.end_date,
        nature: r.nature,
        territory: r.territory,
        is_current: true,
      }
      if (!movieRightsMap.has(r.movie_id)) movieRightsMap.set(r.movie_id, [])
      movieRightsMap.get(r.movie_id)!.push(right)
    })

    const results: MovieWithInternetRights[] = filteredMovies
      .filter((m: any) => movieRightsMap.has(m.id))
      .map((m: any) => {
        const rights = movieRightsMap.get(m.id)!
        rights.sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))
        return { ...m, internet_rights_list: rights, earliest_expiry: rights[0]?.end_date }
      })

    // Sort
    if (sortBy === 'title_asc') results.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else if (sortBy === 'title_desc') results.sort((a, b) => (b.title || '').localeCompare(a.title || ''))
    else if (sortBy === 'release_date_desc') results.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
    else if (sortBy === 'release_date_asc') results.sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))

    const totalCount = results.length
    const limit = options?.limit || 10
    const offset = options?.offset || 0
    return { data: results.slice(offset, offset + limit), count: totalCount }
  } catch (error) {
    console.error('Error fetching active internet titles:', error)
    return { data: [], count: 0 }
  }
}

// Count of movies with active internet rights (for stat card)
export function getActiveInternetTitlesCount(language?: string[]): Promise<{ total: number; home: number; acquired: number }> {
  return cachedStat(
    `activeInternet|${(language ?? []).join(',')}`,
    () => computeActiveInternetTitlesCount(language)
  )
}

async function computeActiveInternetTitlesCount(language?: string[]): Promise<{ total: number; home: number; acquired: number }> {
  if (language && language.length === 0) return { total: 0, home: 0, acquired: 0 }
  try {
    const today = new Date().toISOString().split('T')[0]

    // Fetch all approved movies (language-filtered) — no flat rights columns needed
    let moviesQuery = supabase
      .from('movies')
      .select('id, source, home_sold, jointly_owned, jointly_exploitation_rights, agreement_end_date')
      .eq('approval_status', 'approved')
    if (language && language.length > 0) moviesQuery = moviesQuery.in('language', language)
    const { data: allMovies } = await moviesQuery

    const validMovies = (allMovies || []).filter((m: any) => !isSoldOrExpired(m, today))

    const movieIds = validMovies.map((m: any) => m.id)
    if (movieIds.length === 0) return { total: 0, home: 0, acquired: 0 }

    // Fetch all active platform_rights (is_current = true) for these movies
    const activeRights = await fetchPlatformRightsChunked(
      movieIds, 'movie_id, platforms(name, platform_type), end_date',
      (q) => q.eq('is_current', true)
    )

    const moviesWithActivePlatformRights = new Set<string>()
    activeRights.forEach((r: any) => {
      const platformType = r.platforms?.platform_type || ''
      const platformName = (r.platforms?.name || '').toLowerCase()
      if (!isInternetPlatform(platformType) || isHoichoiPlatform(platformName)) return
      if (r.end_date && r.end_date < today) return
      moviesWithActivePlatformRights.add(r.movie_id)
    })

    // For acquired movies: check movie_rights for Internet or Negative rows
    const acquiredIds = validMovies.filter((m: any) => m.source === 'acquired').map((m: any) => m.id)
    const acqWithIntRight = await fetchMovieRightsIdsByType(acquiredIds, ['Internet', 'Negative'])
    const acqIntEndDates = await fetchMovieRightsEndDates(acquiredIds, ['Internet', 'Negative'])

    const homeWithActive = new Set<string>()
    const acquiredWithActive = new Set<string>()

    validMovies.forEach((m: any) => {
      const hasPlatformRight = moviesWithActivePlatformRights.has(m.id)
      const hasMovieLevelRight = m.source === 'acquired' &&
        acqWithIntRight.has(m.id) &&
        (() => {
          const mrEnd = acqIntEndDates.get(m.id)
          const endDate = mrEnd ?? m.agreement_end_date ?? null
          return !endDate || endDate >= today
        })()

      if (hasPlatformRight || hasMovieLevelRight) {
        if (m.source === 'home_production') homeWithActive.add(m.id)
        else if (m.source === 'acquired') acquiredWithActive.add(m.id)
      }
    })

    return {
      total: homeWithActive.size + acquiredWithActive.size,
      home: homeWithActive.size,
      acquired: acquiredWithActive.size,
    }
  } catch (error) {
    console.error('Error counting active internet titles:', error)
    return { total: 0, home: 0, acquired: 0 }
  }
}


export async function getMoviesForDashboard(options?: {
  category?: 'all' | 'upcoming' | 'open_titles' | 'wtp' | 'acquired'
  certification?: string[]
  rightsStatus?: 'expiring' | 'perpetual' | 'sold_to_grassroot' | 'all'
  versionFilter?: string
  search?: string
  language?: string[]
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  sortBy?: 'title_asc' | 'title_desc' | 'created_at_desc' | 'release_date_desc' | 'release_date_asc'
  limit?: number
  offset?: number
}): Promise<{ data: MovieWithDetails[]; count: number }> {
  if ((options?.language && options.language.length === 0) || (options?.certification && options.certification.length === 0)) {
    return { data: [], count: 0 }
  }
  try {
    const today = new Date().toISOString().split('T')[0]
    const ninetyDaysFromNow = new Date()
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90)
    const twentyYearsFromNow = new Date()
    twentyYearsFromNow.setFullYear(twentyYearsFromNow.getFullYear() + 20)

    const sortBy = options?.sortBy || 'title_asc'

    // When special categories or rights status filters are active, we need to fetch ALL movies
    // Otherwise pagination happens before filtering and breaks the results
    const needsFullDataset = options?.category === 'open_titles' || options?.category === 'wtp' || (options?.rightsStatus && options.rightsStatus !== 'all')

    let query = supabase.from('movies_with_details').select('*', { count: 'exact' }).eq('approval_status', 'approved')

    // Apply certification filter
    if (options?.certification && options.certification.length > 0) {
      const certs = [...options.certification]
      // UA should also match U/A in the database
      if (certs.includes('UA') && !certs.includes('U/A')) {
        certs.push('U/A')
      }
      query = query.in('certification', certs)
    }

    // Apply search filter
    if (options?.search) {
      query = query.or(orContains(options.search, ["title", "production_no"]))
    }

    // Apply language filter
    if (options?.language && options.language.length > 0) {
      query = query.in('language', options.language)
    }

    // Category filtering - only apply upfront filters for non-special categories
    if (options?.category === 'upcoming') {
      query = query.gte('release_date', today)
    } else if (options?.category === 'acquired') {
      query = query.eq('source', 'acquired')
    } else if (options?.category === 'wtp') {
      // The search filter above may already own this query's single `or` slot —
      // in PostgREST a second `.or()` replaces the first rather than ANDing with
      // it — so the live-title rule is applied client-side further down instead.
      query = query.in('wtp_library', ['WTP', 'WTP/BD'])
    }

    if (options?.rightsStatus === 'sold_to_grassroot') {
      query = query.ilike('jointly_exploitation_rights', '%Sold%')
    }

    // Applying sorting at SQL level when possible
    if (sortBy === 'title_asc') {
      query = query.order('title', { ascending: true })
    } else if (sortBy === 'title_desc') {
      query = query.order('title', { ascending: false })
    } else if (sortBy === 'created_at_desc') {
      query = query.order('created_at', { ascending: false })
    } else if (sortBy === 'release_date_desc') {
      query = query.order('release_date', { ascending: false, nullsFirst: false })
    } else if (sortBy === 'release_date_asc') {
      query = query.order('release_date', { ascending: true, nullsFirst: false })
    }

    // Only apply limit/offset if NOT using special categories
    if (!needsFullDataset) {
      const limit = Math.min(options?.limit || 50, 200)
      query = query.limit(limit)

      if (options?.offset) {
        query = query.range(options.offset, options.offset + limit - 1)
      }
    }

    const { data: movies, error, count } = await query

    if (error) throw error

    let filteredMovies = (movies || []).map((m: any) => ({
      ...m,
      production_house_name: m.production_house_name,
    }))

    // Apply version filter (group by production_no)
    if (options?.versionFilter && options.versionFilter !== 'all') {
      // Group movies by production_no
      const groupsMap = new Map<string, any[]>()

      filteredMovies.forEach((movie: MovieWithDetails) => {
        const groupKey = movie.production_no || `single_${movie.id}`
        if (!groupsMap.has(groupKey)) {
          groupsMap.set(groupKey, [])
        }
        groupsMap.get(groupKey)!.push(movie)
      })

      // Filter based on version type
      if (options.versionFilter === 'multi') {
        // Show only first movie from groups with multiple versions
        filteredMovies = Array.from(groupsMap.values())
          .filter((group) => group.length > 1)
          .map((group) => group[0])
      } else if (options.versionFilter === 'single') {
        // Show only movies from groups with single version
        filteredMovies = Array.from(groupsMap.values())
          .filter((group) => group.length === 1)
          .map((group) => group[0])
      }

      // Now apply pagination to the grouped/filtered results
      const limit = options?.limit || 10
      const offset = options?.offset || 0
      const totalFilteredCount = filteredMovies.length
      filteredMovies = filteredMovies.slice(offset, offset + limit)

      return { data: filteredMovies, count: totalFilteredCount }
    }

    // For special categories (open_titles, wtp), filter the movies
    if (options?.category === 'open_titles') {
      // Always exclude sold (home) and expired-agreement (acquired) movies from the rights dashboard
      filteredMovies = filteredMovies.filter((m: any) => !isSoldOrExpired(m, today))

      // Get ALL movies without current rights
      const movieIds = filteredMovies.map((m: { id: string }) => m.id)

      const { data: moviesWithRights } = await supabase.from('platform_rights').select('movie_id').eq('is_current', true).in('movie_id', movieIds)

      const moviesWithRightsSet = new Set(moviesWithRights?.map((r: { movie_id: string }) => r.movie_id) || [])
      filteredMovies = filteredMovies.filter((m: { id: string }) => !moviesWithRightsSet.has(m.id))

      // Now apply pagination to the filtered results
      const limit = options?.limit || 10
      const offset = options?.offset || 0
      const totalFilteredCount = filteredMovies.length
      filteredMovies = filteredMovies.slice(offset, offset + limit)

      return { data: filteredMovies, count: totalFilteredCount }
    }

    if (options?.category === 'wtp') {
      // Always exclude sold (home) and expired-agreement (acquired) movies from the rights dashboard
      filteredMovies = filteredMovies.filter((m: any) => !isSoldOrExpired(m, today))

      // Apply source filter
      const sf = options?.sourceFilter || 'all'
      if (sf === 'home') filteredMovies = filteredMovies.filter((m: any) => m.source === 'home_production')
      else if (sf === 'acquired') filteredMovies = filteredMovies.filter((m: any) => m.source === 'acquired')
      else if (sf === 'bangladeshi') filteredMovies = filteredMovies.filter((m: any) => m.is_bangladeshi === true)

      const limit = options?.limit || 10
      const offset = options?.offset || 0
      const totalFilteredCount = filteredMovies.length
      filteredMovies = filteredMovies.slice(offset, offset + limit)

      return { data: filteredMovies, count: totalFilteredCount }
    }

    // Rights status filtering (expiring / perpetual)
    if (options?.rightsStatus === 'expiring' || options?.rightsStatus === 'perpetual') {
      const movieIds = filteredMovies.map((m: { id: string }) => m.id)

      if (options.rightsStatus === 'expiring') {
        // Movies with rights expiring in the next 90 days
        const ninetyDaysDate = ninetyDaysFromNow.toISOString().split('T')[0]
        const { data: expiringRights } = await supabase
          .from('platform_rights')
          .select('movie_id')
          .eq('is_current', true)
          .gte('end_date', today)
          .lte('end_date', ninetyDaysDate)
          .in('movie_id', movieIds)

        const expiringMovieIds = new Set(expiringRights?.map((r: { movie_id: string }) => r.movie_id) || [])
        filteredMovies = filteredMovies.filter((m: { id: string }) => expiringMovieIds.has(m.id))
      } else {
        // Perpetual: rights with no end date or very far future (20+ years)
        const perpetualDate = twentyYearsFromNow.toISOString().split('T')[0]
        const { data: perpetualRights } = await supabase.from('platform_rights').select('movie_id').eq('is_current', true).or(`end_date.is.null,end_date.gte.${perpetualDate}`).in('movie_id', movieIds)

        const perpetualMovieIds = new Set(perpetualRights?.map((r: { movie_id: string }) => r.movie_id) || [])
        filteredMovies = filteredMovies.filter((m: { id: string }) => perpetualMovieIds.has(m.id))
      }

      const limit = options?.limit || 10
      const offset = options?.offset || 0
      const totalFilteredCount = filteredMovies.length
      filteredMovies = filteredMovies.slice(offset, offset + limit)

      return { data: filteredMovies, count: totalFilteredCount }
    }

    // "Sold to Grassroot" was already filtered in the query, just paginate
    if (options?.rightsStatus === 'sold_to_grassroot') {
      const limit = options?.limit || 10
      const offset = options?.offset || 0
      const totalFilteredCount = filteredMovies.length
      filteredMovies = filteredMovies.slice(offset, offset + limit)

      return { data: filteredMovies, count: totalFilteredCount }
    }

    return { data: filteredMovies, count: count || 0 }
  } catch (error: any) {
    console.error('Error fetching movies for dashboard:', error?.message || error)
    return { data: [], count: 0 }
  }
}

// Get all distinct certification values from movies
export async function getDistinctCertifications(): Promise<string[]> {
  try {
    return await cachedQuery('distinctCertifications', async () => {
      const { data, error } = await supabase.from('movies').select('certification').not('certification', 'is', null)
      if (error) throw error
      const certs = (data || []).map((m: { certification: string | null }) => m.certification).filter((c: string | null): c is string => Boolean(c))
      const unique: string[] = Array.from(new Set(certs))
      unique.sort()
      return unique
    })
  } catch (error) {
    console.error('Error fetching distinct certifications:', error)
    return []
  }
}

