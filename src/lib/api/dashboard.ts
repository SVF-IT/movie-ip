import { createClient } from '@/lib/supabase/client'
import type { DashboardStats, MovieWithDetails, Person, Platform, RightsNatureType } from '@/lib/types/database'

const supabase = createClient()

const CHUNK_SIZE = 200

async function fetchPlatformRightsChunked(
  movieIds: string[],
  select: string,
  extraFilters?: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>
): Promise<any[]> {
  if (movieIds.length === 0) return []
  const results: any[] = []
  for (let i = 0; i < movieIds.length; i += CHUNK_SIZE) {
    const chunk = movieIds.slice(i, i + CHUNK_SIZE)
    let q = supabase.from('platform_rights').select(select).in('movie_id', chunk)
    if (extraFilters) q = extraFilters(q) as any
    const { data } = await q
    if (data) results.push(...data)
  }
  return results
}

/** Returns a Set of movie_ids that have at least one movie_rights row matching the given right_type(s). */
async function fetchMovieRightsIdsByType(movieIds: string[], rightTypes: string[]): Promise<Set<string>> {
  if (movieIds.length === 0) return new Set()
  const result = new Set<string>()
  for (let i = 0; i < movieIds.length; i += CHUNK_SIZE) {
    const chunk = movieIds.slice(i, i + CHUNK_SIZE)
    const { data } = await supabase
      .from('movie_rights')
      .select('movie_id, right_type, end_date')
      .in('movie_id', chunk)
      .in('right_type', rightTypes)
    for (const row of data || []) result.add(row.movie_id)
  }
  return result
}

/**
 * Returns a Map<movie_id, earliest_end_date | null> for acquired movies.
 * null means the right has no end date (perpetual).
 * Only considers right_types matching the given list.
 */
async function fetchMovieRightsEndDates(movieIds: string[], rightTypes: string[]): Promise<Map<string, string | null>> {
  if (movieIds.length === 0) return new Map()
  const map = new Map<string, string | null>()
  for (let i = 0; i < movieIds.length; i += CHUNK_SIZE) {
    const chunk = movieIds.slice(i, i + CHUNK_SIZE)
    const { data } = await supabase
      .from('movie_rights')
      .select('movie_id, end_date')
      .in('movie_id', chunk)
      .in('right_type', rightTypes)
    for (const row of data || []) {
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
  }
  return map
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

function isHoichoiPlatform(name: string): boolean {
  return name.toLowerCase().includes('hoichoi')
}


//test
export async function getDashboardStats(): Promise<DashboardStats> {
  // Try to get from view first
  const { data, error } = await supabase.from('dashboard_stats').select('*').single()

  if (!error && data) {
    return data
  }

  // If view doesn't exist, calculate manually
  return calculateStats()
}

async function calculateStats(): Promise<DashboardStats> {
  try {
    const [moviesResult, homeResult, acquiredResult, actorsResult, directorsResult, activeRightsResult] = await Promise.all([
      supabase.from('movies').select('*', { count: 'exact', head: true }).eq('approval_status', 'approved'),
      supabase.from('movies').select('*', { count: 'exact', head: true }).eq('source', 'home_production').eq('approval_status', 'approved'),
      supabase.from('movies').select('*', { count: 'exact', head: true }).eq('source', 'acquired').eq('approval_status', 'approved'),
      supabase.from('people').select('*', { count: 'exact', head: true }),
      supabase.from('movie_people').select('person_id', { count: 'exact', head: true }).eq('role', 'Director'),
      supabase.from('platform_rights').select('*', { count: 'exact', head: true }).eq('is_current', true),
    ])

    // Calculate expiring rights
    const today = new Date()
    const thirtyDaysFromNow = new Date(today)
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    const ninetyDaysFromNow = new Date(today)
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90)

    const { count: expiring30 } = await supabase
      .from('platform_rights')
      .select('*', { count: 'exact', head: true })
      .eq('is_current', true)
      .gte('end_date', today.toISOString().split('T')[0])
      .lte('end_date', thirtyDaysFromNow.toISOString().split('T')[0])

    const { count: expiring90 } = await supabase
      .from('platform_rights')
      .select('*', { count: 'exact', head: true })
      .eq('is_current', true)
      .gte('end_date', today.toISOString().split('T')[0])
      .lte('end_date', ninetyDaysFromNow.toISOString().split('T')[0])

    return {
      total_movies: moviesResult.count || 0,
      home_productions: homeResult.count || 0,
      acquired_movies: acquiredResult.count || 0,
      total_actors: actorsResult.count || 0,
      total_directors: directorsResult.count || 0,
      active_rights: activeRightsResult.count || 0,
      rights_expiring_30_days: expiring30 || 0,
      rights_expiring_90_days: expiring90 || 0,
    }
  } catch (error) {
    console.error('Error calculating stats:', error)
    return {
      total_movies: 0,
      home_productions: 0,
      acquired_movies: 0,
      total_actors: 0,
      total_directors: 0,
      active_rights: 0,
      rights_expiring_30_days: 0,
      rights_expiring_90_days: 0,
    }
  }
}

export async function getMoviesByYear(): Promise<{ year: number; count: number }[]> {
  try {
    const { data, error } = await supabase.from('movies').select('release_year').not('release_year', 'is', null).order('release_year')

    if (error) throw error

    // Group by year and count (skip non-numeric values like "UNRELEASED")
    const yearCounts: Record<number, number> = {}
    data?.forEach((movie: { release_year: string | null }) => {
      if (movie.release_year) {
        const y = parseInt(movie.release_year)
        if (!isNaN(y)) yearCounts[y] = (yearCounts[y] || 0) + 1
      }
    })

    return Object.entries(yearCounts)
      .map(([year, count]: [string, number]) => ({ year: parseInt(year), count }))
      .sort((a, b) => a.year - b.year)
  } catch (error) {
    console.error('Error fetching movies by year:', error)
    return []
  }
}

export async function getMoviesBySource(): Promise<{ source: string; count: number }[]> {
  try {
    const { count: homeCount } = await supabase.from('movies').select('*', { count: 'exact', head: true }).eq('source', 'home_production')

    const { count: acquiredCount } = await supabase.from('movies').select('*', { count: 'exact', head: true }).eq('source', 'acquired')

    return [
      { source: 'Home Production', count: homeCount || 0 },
      { source: 'Acquired', count: acquiredCount || 0 },
    ]
  } catch (error) {
    console.error('Error fetching movies by source:', error)
    return []
  }
}

export async function getRightsByPlatform(): Promise<{ platform: string; count: number }[]> {
  try {
    const { data, error } = await supabase
      .from('platform_rights')
      .select(
        `
        platform_id,
        platforms(name)
      `,
      )
      .eq('is_current', true)

    if (error) throw error

    // Group by platform
    const platformCounts: Record<string, number> = {}
    const rightsData = data as unknown as Array<{ platform_id: string; platforms: { name: string } | null }>
    rightsData?.forEach((right) => {
      const name = right.platforms?.name || 'Unknown'
      platformCounts[name] = (platformCounts[name] || 0) + 1
    })

    return Object.entries(platformCounts)
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  } catch (error) {
    console.error('Error fetching rights by platform:', error)
    return []
  }
}

export async function getPlatforms(): Promise<Platform[]> {
  try {
    const { data, error } = await supabase.from('platforms').select('*').order('name')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching platforms:', error)
    return []
  }
}

export async function getPeople(options?: { search?: string; limit?: number }): Promise<Person[]> {
  try {
    let query = supabase.from('people').select('*')

    if (options?.search) {
      query = query.ilike('name', `%${options.search}%`)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    query = query.order('name')

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching people:', error)
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
    const moviesQuery = supabase.from('movies').select('id, agreement_end_date, nature_of_rights').eq('approval_status', 'approved')
    const { data: allMovies } = await moviesQuery
    const allMovieIds = new Set(
      (allMovies || [])
        .filter((m: { id: string; source?: string; agreement_end_date?: string | null; nature_of_rights?: string | null }) => {
          if (m.source === 'home_production') {
            const nature = (m.nature_of_rights || '').toLowerCase()
            return !nature.includes('sold') && !nature.includes('grassroot')
          }
          if (!m.agreement_end_date) return true
          return m.agreement_end_date >= today
        })
        .map((m: { id: string }) => m.id),
    )

    // Get movies with active rights
    const { data: moviesWithActiveRights } = await supabase.from('platform_rights').select('movie_id').eq('is_current', true)
    const moviesWithRightsSet = new Set(moviesWithActiveRights?.map((r: { movie_id: string }) => r.movie_id) || [])

    // Open Titles: Movies without any current rights
    const openTitlesCount = allMovieIds.size - moviesWithRightsSet.size

    // WTP count: movies where wtp_library is 'WTP' or 'WTP/BD'
    const { count: wtpCount } = await supabase.from('movies').select('*', { count: 'exact', head: true }).in('wtp_library', ['WTP', 'WTP/BD'])

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

export async function getRightsModeStats(mode: RightsMode, language?: string): Promise<RightsModeStats> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const currentYear = new Date().getFullYear()
    // Stat card always shows current-year expiring
    const currentYearStart = `${currentYear}-01-01`
    const currentYearEnd = `${currentYear}-12-31`

    // Fetch all approved movies (language-filtered) — no flat rights columns needed
    let moviesQuery = supabase
      .from('movies')
      .select('id, source, certification, nature_of_rights, agreement_end_date, wtp_library')
      .eq('approval_status', 'approved')
    if (language) moviesQuery = moviesQuery.eq('language', language)
    const { data: allMovies } = await moviesQuery

    const validMovies = (allMovies || []).filter((m: any) => {
      if (m.source === 'home_production') {
        const nature = (m.nature_of_rights || '').toLowerCase()
        return !nature.includes('sold') && !nature.includes('grassroot')
      }
      return true
    })

    let openHomeCount = 0
    let openAcquiredCount = 0

    if (mode === 'satellite') {
      const homeMovies = validMovies.filter((m: any) => m.source === 'home_production')
      const homeMovieIds = homeMovies.map((m: any) => m.id)

      // Home open: no active satellite platform_right, cert != A
      let moviesWithActiveSatRights = new Set<string>()
      if (homeMovieIds.length > 0) {
        const satRights = await fetchPlatformRightsChunked(
          homeMovieIds, 'movie_id, platforms(platform_type)',
          (q) => q.eq('is_current', true)
        )
        moviesWithActiveSatRights = new Set(
          satRights.filter((r: any) => isHomeSatellitePlatform(r.platforms?.platform_type || '')).map((r: any) => r.movie_id)
        )
      }
      openHomeCount = homeMovies.filter((m: any) =>
        !moviesWithActiveSatRights.has(m.id) && (m.certification || '').trim().toUpperCase() !== 'A'
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
        if (endDate && endDate < today) return false
        return true
      })
      const eligibleAcquiredIds = eligibleAcquired.map((m: any) => m.id)

      const moviesWithActiveSatPlatformRight = new Set<string>()
      if (eligibleAcquiredIds.length > 0) {
        const acqSatRights = await fetchPlatformRightsChunked(eligibleAcquiredIds, 'movie_id, platforms(platform_type), end_date')
        acqSatRights.forEach((r: any) => {
          if (!isAcquiredSatellitePlatform(r.platforms?.platform_type || '')) return
          if (!r.end_date || r.end_date >= today) moviesWithActiveSatPlatformRight.add(r.movie_id)
        })
      }
      openAcquiredCount = eligibleAcquired.filter((m: any) => !moviesWithActiveSatPlatformRight.has(m.id)).length
    } else {
      // Internet mode
      const homeMovies = validMovies.filter((m: any) => m.source === 'home_production')
      const homeMovieIds = homeMovies.map((m: any) => m.id)

      // Home open: no active internet platform_right (excluding Hoichoi)
      let moviesWithActiveIntRights = new Set<string>()
      if (homeMovieIds.length > 0) {
        const intRights = await fetchPlatformRightsChunked(
          homeMovieIds, 'movie_id, platforms(name, platform_type), end_date',
          (q) => q.eq('is_current', true)
        )
        moviesWithActiveIntRights = new Set(
          intRights
            .filter((r: any) => isInternetPlatform(r.platforms?.platform_type || '') && !isHoichoiPlatform(r.platforms?.name || '') && (!r.end_date || r.end_date >= today))
            .map((r: any) => r.movie_id)
        )
      }
      openHomeCount = homeMovies.filter((m: any) => !moviesWithActiveIntRights.has(m.id)).length

      // Acquired open: has an Internet or Negative movie_rights row that hasn't expired,
      // and no active internet platform_right (excluding Hoichoi)
      const acquiredMovies = validMovies.filter((m: any) => m.source === 'acquired')
      const acquiredMovieIds = acquiredMovies.map((m: any) => m.id)

      const acqWithIntRight = await fetchMovieRightsIdsByType(acquiredMovieIds, ['Internet', 'Negative'])
      const acqIntEndDates = await fetchMovieRightsEndDates(acquiredMovieIds, ['Internet', 'Negative'])

      const eligibleAcquired = acquiredMovies.filter((m: any) => {
        if (!acqWithIntRight.has(m.id)) return false
        const mrEnd = acqIntEndDates.get(m.id)
        const endDate = mrEnd ?? m.agreement_end_date ?? null
        if (endDate && endDate < today) return false
        return true
      })
      const eligibleAcquiredIds = eligibleAcquired.map((m: any) => m.id)

      const moviesWithActiveIntPlatformRight = new Set<string>()
      if (eligibleAcquiredIds.length > 0) {
        const acqIntRights = await fetchPlatformRightsChunked(
          eligibleAcquiredIds, 'movie_id, platforms(name, platform_type), end_date',
          (q) => q.eq('is_current', true)
        )
        acqIntRights.forEach((r: any) => {
          if (!isInternetPlatform(r.platforms?.platform_type || '') || isHoichoiPlatform(r.platforms?.name || '')) return
          if (!r.end_date || r.end_date >= today) moviesWithActiveIntPlatformRight.add(r.movie_id)
        })
      }
      openAcquiredCount = eligibleAcquired.filter((m: any) => !moviesWithActiveIntPlatformRight.has(m.id)).length
    }

    const openTitlesCount = openHomeCount + openAcquiredCount

    // WTP — approved + language-filtered
    let wtpQuery = supabase
      .from('movies')
      .select('*', { count: 'exact', head: true })
      .eq('approval_status', 'approved')
      .in('wtp_library', ['WTP', 'WTP/BD'])
    if (language) wtpQuery = wtpQuery.eq('language', language)
    const { count: wtpCount } = await wtpQuery

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
    language?: string
    sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
    certification?: string[]
    sortBy?: 'title_asc' | 'title_desc' | 'created_at_desc' | 'release_date_desc' | 'release_date_asc'
    openFrom?: string
    openTo?: string
    wtpFilter?: 'all' | 'wtp' | 'wtp_bd' | 'library'
  },
): Promise<{ data: MovieWithDetails[]; count: number }> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const sortBy = options?.sortBy || 'title_asc'

    let query = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')

    if (options?.search) {
      query = query.ilike('title', `%${options.search}%`)
    }

    if (options?.language) {
      query = query.eq('language', options.language)
    }

    if (options?.certification && options.certification.length > 0) {
      const certs = [...options.certification]
      // Treat U/A and all UA variants as equivalent
      const hasUaVariant = certs.some((c) => c === 'UA' || c === 'U/A' || c.startsWith('UA '))
      if (hasUaVariant && !certs.includes('U/A')) certs.push('U/A')
      query = query.in('certification', certs)
    }

    if (options?.wtpFilter && options.wtpFilter !== 'all') {
      if (options.wtpFilter === 'wtp') query = query.eq('wtp_library', 'WTP')
      else if (options.wtpFilter === 'wtp_bd') query = query.eq('wtp_library', 'WTP/BD')
      else if (options.wtpFilter === 'library') query = query.eq('wtp_library', 'Library')
    }

    if (sortBy === 'title_asc') query = query.order('title', { ascending: true })
    else if (sortBy === 'title_desc') query = query.order('title', { ascending: false })
    else if (sortBy === 'created_at_desc') query = query.order('created_at', { ascending: false })
    else if (sortBy === 'release_date_desc') query = query.order('release_date', { ascending: false, nullsFirst: false })
    else if (sortBy === 'release_date_asc') query = query.order('release_date', { ascending: true, nullsFirst: false })

    const { data: movies } = await query

    // Filter valid home movies: exclude sold/grassroot
    const validMovies = ((movies || []) as any[]).filter((m: any) => {
      if (m.source !== 'home_production') return true
      const nature = (m.nature_of_rights || '').toLowerCase()
      return !nature.includes('sold') && !nature.includes('grassroot')
    })

    let openTitles: any[] = []

    if (mode === 'satellite') {
      const homeMovies = validMovies.filter((m: any) => m.source === 'home_production')
      const homeMovieIds = homeMovies.map((m: any) => m.id)

      // Home: no active satellite platform_right, cert != A
      // platform_type in (Satellite TV, DTH VOD, Terrestrial TV)
      let moviesWithActiveSatRights = new Set<string>()
      if (homeMovieIds.length > 0) {
        const satRights = await fetchPlatformRightsChunked(homeMovieIds, 'movie_id, platforms(platform_type)', (q) => q.eq('is_current', true))
        moviesWithActiveSatRights = new Set(satRights.filter((r: any) => isHomeSatellitePlatform(r.platforms?.platform_type || '')).map((r: any) => r.movie_id))
      }
      const openHomeMovies = homeMovies.filter((m: any) => !moviesWithActiveSatRights.has(m.id) && (m.certification || '').trim().toUpperCase() !== 'A')

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
        if (endDate && endDate < today) return false
        return true
      })
      const acquiredMovieIds = acquiredMovies.map((m: any) => m.id)
      const moviesWithActiveSatPlatformRight2 = new Set<string>()
      if (acquiredMovieIds.length > 0) {
        const acqSatRights = await fetchPlatformRightsChunked(acquiredMovieIds, 'movie_id, platforms(platform_type), end_date')
        acqSatRights.forEach((r: any) => {
          if (!isAcquiredSatellitePlatform(r.platforms?.platform_type || '')) return
          if (!r.end_date || r.end_date >= today) moviesWithActiveSatPlatformRight2.add(r.movie_id)
        })
      }
      const openAcquiredMovies = acquiredMovies.filter((m: any) => !moviesWithActiveSatPlatformRight2.has(m.id))

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
      // platform_type in (SVOD, TVOD, AVOD, FVOD), is_current=true, (end_date is null or >= today)
      let moviesWithActiveIntRights = new Set<string>()
      if (homeMovieIds.length > 0) {
        const intRights = await fetchPlatformRightsChunked(
          homeMovieIds, 'movie_id, platforms(name, platform_type), end_date',
          (q) => q.eq('is_current', true)
        )
        moviesWithActiveIntRights = new Set(
          intRights
            .filter((r: any) => isInternetPlatform(r.platforms?.platform_type || '') && !isHoichoiPlatform(r.platforms?.name || '') && (!r.end_date || r.end_date >= today))
            .map((r: any) => r.movie_id)
        )
      }
      const openHomeMovies = homeMovies.filter((m: any) => !moviesWithActiveIntRights.has(m.id))

      // Acquired: has Internet or Negative movie_rights row, not expired, no active internet platform_right (excl. Hoichoi)
      const acquiredCandidatesInt = validMovies.filter((m: any) => m.source === 'acquired')
      const acquiredCandidateIdsInt = acquiredCandidatesInt.map((m: any) => m.id)
      const acqWithIntRight2 = await fetchMovieRightsIdsByType(acquiredCandidateIdsInt, ['Internet', 'Negative'])
      const acqIntEndDates2 = await fetchMovieRightsEndDates(acquiredCandidateIdsInt, ['Internet', 'Negative'])
      const acquiredMovies = acquiredCandidatesInt.filter((m: any) => {
        if (!acqWithIntRight2.has(m.id)) return false
        const mrEnd = acqIntEndDates2.get(m.id)
        const endDate = mrEnd ?? m.agreement_end_date ?? null
        if (endDate && endDate < today) return false
        return true
      })
      const acquiredMovieIds = acquiredMovies.map((m: any) => m.id)
      const moviesWithActiveIntPlatformRight2 = new Set<string>()
      if (acquiredMovieIds.length > 0) {
        const acqIntRights = await fetchPlatformRightsChunked(acquiredMovieIds, 'movie_id, platforms(name, platform_type), end_date', (q) => q.eq('is_current', true))
        acqIntRights.forEach((r: any) => {
          if (!isInternetPlatform(r.platforms?.platform_type || '') || isHoichoiPlatform(r.platforms?.name || '')) return
          if (!r.end_date || r.end_date >= today) moviesWithActiveIntPlatformRight2.add(r.movie_id)
        })
      }
      const openAcquiredMovies = acquiredMovies.filter((m: any) => !moviesWithActiveIntPlatformRight2.has(m.id))

      const sf2 = options?.sourceFilter || 'all'
      if (sf2 === 'home') openTitles = openHomeMovies
      else if (sf2 === 'acquired') openTitles = openAcquiredMovies
      else if (sf2 === 'bangladeshi') openTitles = [...openHomeMovies, ...openAcquiredMovies].filter((m: any) => m.is_bangladeshi === true)
      else openTitles = [...openHomeMovies, ...openAcquiredMovies]
    }

    // Re-sort combined list by title
    if (sortBy === 'title_asc') openTitles.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else if (sortBy === 'title_desc') openTitles.sort((a, b) => (b.title || '').localeCompare(a.title || ''))

    // Filter by open date range: title must be open (rights end date within or after openFrom, before openTo)
    if (options?.openFrom || options?.openTo) {
      openTitles = openTitles.filter((m: any) => {
        // For acquired movies, the effective expiry is the agreement_end_date
        // (per-right expiry is already filtered above via movie_rights lookup)
        const endDate = m.agreement_end_date ?? null
        if (!endDate) return true
        if (options.openFrom && endDate < options.openFrom) return false
        if (options.openTo && endDate > options.openTo) return false
        return true
      })
    }

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

export async function getLanguages(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('movies').select('language').not('language', 'is', null)
    if (error) throw error

    const uniqueLanguages = Array.from(new Set((data as { language: string }[]).map((m) => m.language)))
    return uniqueLanguages.sort()
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
  language?: string
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  search?: string
  certification?: string[]
  sortBy?: 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc' | 'expiry_asc' | 'expiry_desc'
  limit?: number
  offset?: number
}): Promise<{ data: MovieWithSatelliteRights[]; count: number }> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const sortBy = options?.sortBy || 'expiry_asc'

    // fromDate / toDate undefined means "All Years" — no date restriction
    const fromDate = options?.fromDate || null
    const toDate = options?.toDate || null

    // Fetch all valid movies with language filter
    let moviesQuery = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')

    if (options?.search) moviesQuery = moviesQuery.ilike('title', `%${options.search}%`)
    if (options?.language) moviesQuery = moviesQuery.eq('language', options.language)
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

    const validMovies = allMovies.filter((m: any) => {
      if (m.source === 'home_production') {
        const nature = (m.nature_of_rights || '').toLowerCase()
        return !nature.includes('sold') && !nature.includes('grassroot')
      }
      if (!m.agreement_end_date) return true
      return m.agreement_end_date >= today
    })

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
  language?: string
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  search?: string
  certification?: string[]
  sortBy?: 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc' | 'expiry_asc' | 'expiry_desc'
  limit?: number
  offset?: number
}): Promise<{ data: MovieWithInternetRights[]; count: number }> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const sortBy = options?.sortBy || 'expiry_asc'

    // fromDate / toDate null means "All Years" — no date restriction
    const fromDate = options?.fromDate || null
    const toDate = options?.toDate || null

    // Fetch valid movies
    let moviesQuery = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')
    if (options?.search) moviesQuery = moviesQuery.ilike('title', `%${options.search}%`)
    if (options?.language) moviesQuery = moviesQuery.eq('language', options.language)
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
    const validMovies = allMovies.filter((m: any) => {
      if (m.source === 'home_production') {
        const nature = (m.nature_of_rights || '').toLowerCase()
        return !nature.includes('sold') && !nature.includes('grassroot')
      }
      if (!m.agreement_end_date) return true
      return m.agreement_end_date >= today
    })

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
  language?: string
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  search?: string
  certification?: string[]
  sortBy?: 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc'
  limit?: number
  offset?: number
}): Promise<{ data: MovieWithInternetRights[]; count: number }> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const sortBy = options?.sortBy || 'title_asc'

    let moviesQuery = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')
    if (options?.search) moviesQuery = moviesQuery.ilike('title', `%${options.search}%`)
    if (options?.language) moviesQuery = moviesQuery.eq('language', options.language)
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
    const validMovies = allMovies.filter((m: any) => {
      if (m.source !== 'home_production') return true
      const nature = (m.nature_of_rights || '').toLowerCase()
      return !nature.includes('sold') && !nature.includes('grassroot')
    })

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
export async function getActiveInternetTitlesCount(language?: string): Promise<{ total: number; home: number; acquired: number }> {
  try {
    const today = new Date().toISOString().split('T')[0]

    // Fetch all approved movies (language-filtered) — no flat rights columns needed
    let moviesQuery = supabase
      .from('movies')
      .select('id, source, nature_of_rights, agreement_end_date')
      .eq('approval_status', 'approved')
    if (language) moviesQuery = moviesQuery.eq('language', language)
    const { data: allMovies } = await moviesQuery

    const validMovies = (allMovies || []).filter((m: any) => {
      if (m.source === 'home_production') {
        const nature = (m.nature_of_rights || '').toLowerCase()
        return !nature.includes('sold') && !nature.includes('grassroot')
      }
      return true
    })

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
  language?: string
  sourceFilter?: 'all' | 'home' | 'acquired' | 'bangladeshi'
  sortBy?: 'title_asc' | 'title_desc' | 'created_at_desc' | 'release_date_desc' | 'release_date_asc'
  limit?: number
  offset?: number
}): Promise<{ data: MovieWithDetails[]; count: number }> {
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
      query = query.ilike('title', `%${options.search}%`)
    }

    // Apply language filter
    if (options?.language) {
      query = query.eq('language', options.language)
    }

    // Category filtering - only apply upfront filters for non-special categories
    if (options?.category === 'upcoming') {
      query = query.gte('release_date', today)
    } else if (options?.category === 'acquired') {
      query = query.eq('source', 'acquired')
    } else if (options?.category === 'wtp') {
      query = query.in('wtp_library', ['WTP', 'WTP/BD'])
    }

    // "Sold to Grassroot" (now Sold/Expired) can be filtered directly on the nature_of_rights column
    if (options?.rightsStatus === 'sold_to_grassroot') {
      query = query.or('nature_of_rights.ilike.%Sold to Grassroot%,nature_of_rights.ilike.%Sold/Expired%,nature_of_rights.ilike.%Sold%')
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
      // Exclude expired movies (agreement_end_date < today) and "Sold to Grassroot" movies
      filteredMovies = filteredMovies.filter((m: { source?: string; nature_of_rights?: string; agreement_end_date?: string }) => {
        if (m.source === 'home_production') {
          const nature = (m.nature_of_rights || '').toLowerCase()
          return !nature.includes('sold') && !nature.includes('grassroot')
        }
        // Acquired: exclude if agreement_end_date is in the past
        if (m.agreement_end_date && m.agreement_end_date < today) return false
        return true
      })

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

// Get all rights nature types from lookup table
export async function getRightsNatureTypes(): Promise<RightsNatureType[]> {
  try {
    const { data, error } = await supabase.from('rights_nature_types').select('*').eq('is_active', true).order('name')

    if (error) throw error

    // Define the strictly allowed nature types
    const allowedNatures = ['Exclusive', 'Non-Exclusive', 'Jointly Owned']

    // Map and filter existing data
    const mappedData = (data || [])
      .map((item: RightsNatureType) => {
        let name = item.name
        if (name === 'Jointly Production') name = 'Jointly Owned'
        if (name === 'Sold/Expired' || name === 'Sold to Grassroot') name = 'Sold'
        return { ...item, name }
      })
      .filter((item: RightsNatureType) => allowedNatures.includes(item.name))

    // Ensure allowed options are present even if not in DB
    const finalData = [...mappedData]
    allowedNatures.forEach((name) => {
      if (!finalData.find((d) => d.name === name)) {
        finalData.push({ id: name.toLowerCase().replace(/ /g, '_'), name, is_active: true })
      }
    })

    return finalData.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Error fetching rights nature types:', error)
    // Return default fallback values
    return [
      { id: 'exclusive', name: 'Exclusive', is_active: true },
      { id: 'non_exclusive', name: 'Non-Exclusive', is_active: true },
      { id: 'jointly_owned', name: 'Jointly Owned', is_active: true },
    ]
  }
}

// Get all distinct certification values from movies
export async function getDistinctCertifications(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('movies').select('certification').not('certification', 'is', null)

    if (error) throw error

    const certs = (data || []).map((m: { certification: string | null }) => m.certification).filter((c: string | null): c is string => Boolean(c))
    const unique: string[] = Array.from(new Set(certs))
    unique.sort()
    return unique
  } catch (error) {
    console.error('Error fetching distinct certifications:', error)
    return []
  }
}

// Get unique nature values from actual platform_rights data
export async function getUniqueNatureValues(): Promise<{ nature_value: string; usage_count: number }[]> {
  try {
    const { data, error } = await supabase.rpc('get_unique_nature_values')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching unique nature values:', error)
    return []
  }
}

// Add a new nature type
export async function addNatureType(name: string, description?: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('add_nature_type', {
      p_name: name,
      p_description: description,
    })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error adding nature type:', error)
    throw error
  }
}

