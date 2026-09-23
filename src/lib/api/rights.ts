import { createClient } from '@/lib/supabase/client'
import type { PlatformRight } from '@/lib/types/database'
import { sanitizeError } from '@/lib/utils/sanitize-error'
import { cachedQuery, notifyRightsMutated } from '@/lib/api/cache'

const supabase = createClient()
const MAX_LIMIT = 10000

type GetAllRightsOptions = {
  platformId?: string[]
  platformNameContains?: string
  platformTypeCategory?: 'satellite' | 'internet' | 'other'
  platformTypeExact?: string[]
  isExpired?: boolean
  nature?: string
  territory?: string
  endDateFrom?: string
  endDateTo?: string
  movieId?: string
  movieSearch?: string
  limit?: number
  offset?: number
}

/**
 * Cached front door for the rights list.
 *
 * Returning to the list — pressing back out of a right, or re-applying a filter
 * just cleared — would otherwise re-run the identical query. The key names every
 * option that changes the result, so a hit is always the same question, and any
 * rights write clears the cache outright.
 */
export async function getAllRights(
  options?: GetAllRightsOptions
): Promise<{ data: PlatformRight[]; count: number }> {
  return cachedQuery(`allRights:${JSON.stringify(options ?? {})}`, () => fetchAllRights(options))
}

async function fetchAllRights(
  options?: GetAllRightsOptions
): Promise<{ data: PlatformRight[]; count: number }> {
  if ((options?.platformId && options.platformId.length === 0) || (options?.platformTypeExact && options.platformTypeExact.length === 0)) {
    return { data: [], count: 0 }
  }
  let movieIds: string[] | null = null

  if (options?.movieSearch) {
    const { data: movies, error: movieError } = await supabase.from('movies').select('id').ilike('title', `%${options.movieSearch}%`)

    if (movieError) throw sanitizeError(movieError)
    const matchingMovieIds = (movies || []).map((m: { id: string }) => m.id)
    if (matchingMovieIds.length === 0) return { data: [], count: 0 }
    movieIds = matchingMovieIds
  }

  // Resolve platform IDs from name or type-category filter
  let filteredPlatformIds: string[] | null = null

  if (options?.platformId && options.platformId.length > 0) {
    filteredPlatformIds = options.platformId
  } else if (options?.platformNameContains || options?.platformTypeCategory || (options?.platformTypeExact && options.platformTypeExact.length > 0)) {
    let platQuery = supabase.from('platforms').select('id, platform_type')
    if (options.platformNameContains) {
      platQuery = platQuery.ilike('name', `%${options.platformNameContains}%`)
    }
    const { data: matchedPlatforms, error: platError } = await platQuery
    if (platError) throw sanitizeError(platError)

    let candidates = matchedPlatforms || []

    if (options.platformTypeExact && options.platformTypeExact.length > 0) {
      const exact = new Set(options.platformTypeExact.map((t) => t.toLowerCase()))
      candidates = candidates.filter((p: { platform_type?: string }) => exact.has((p.platform_type || '').toLowerCase()))
    } else if (options.platformTypeCategory) {
      const cat = options.platformTypeCategory
      candidates = candidates.filter((p: { platform_type?: string }) => {
        const pt = (p.platform_type || '').toLowerCase()
        const isSat = pt.includes('satellite') || pt.includes('dth') || pt.includes('terrestrial') || pt.includes('cable')
        const isNet = pt.includes('svod') || pt.includes('tvod') || pt.includes('avod') || pt.includes('fvod') || pt.includes('nvod') || pt.includes('iptv')
        if (cat === 'satellite') return isSat
        if (cat === 'internet') return isNet
        if (cat === 'other') return !isSat && !isNet
        return true
      })
    }

    const ids = candidates.map((p: { id: string }) => p.id)
    if (ids.length === 0) return { data: [], count: 0 }
    filteredPlatformIds = ids
  }

  let query = supabase.from('platform_rights').select(`*, movies(id, title, source), platforms(id, name, platform_type)`, { count: 'exact' })

  if (filteredPlatformIds) query = query.in('platform_id', filteredPlatformIds)

  if (options?.isExpired === true) {
    query = query.lt('end_date', new Date().toISOString().split('T')[0])
  } else if (options?.isExpired === false) {
    query = query.or(`end_date.is.null,end_date.gte.${new Date().toISOString().split('T')[0]}`)
  }

  if (options?.nature) {
    const nature = options.nature
    if (nature === 'Sold/Expired') query = query.in('nature', ['Sold', 'Sold to Grassroot', 'Sold/Expired'])
    else if (nature === 'Jointly Production') query = query.in('nature', ['Jointly Owned', 'Jointly Production'])
    else query = query.eq('nature', nature)
  }

  if (options?.territory) query = query.ilike('territory', `%${options.territory}%`)
  if (options?.endDateFrom) query = query.gte('end_date', options.endDateFrom)
  if (options?.endDateTo) query = query.lte('end_date', options.endDateTo)
  if (options?.movieId) query = query.eq('movie_id', options.movieId)
  if (movieIds && movieIds.length > 0) query = query.in('movie_id', movieIds)

  const limit = Math.min(options?.limit || 50, MAX_LIMIT)
  query = query.limit(limit)
  if (options?.offset) query = query.range(options.offset, options.offset + limit - 1)
  query = query.order('end_date', { ascending: true })

  const { data, error, count } = await query
  if (error) throw sanitizeError(error)
  return { data: data || [], count: count || 0 }
}

/**
 * How many current rights have already lapsed, optionally only those that
 * lapsed on or after `since`.
 *
 * Counts without fetching rows: the Expiring Rights page shows this as a
 * headline figure but never lists the rights themselves, since that page is
 * about upcoming expiries and lapsed ones live in Rights Management.
 */
export async function getExpiredRightsCount(since?: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0]
  return cachedQuery(`expiredRightsCount:${since ?? 'all'}`, async () => {
    // No is_current clause: that flag is derived as `end_date >= today`, so
    // combining it with `end_date < today` is self-contradictory and counted
    // only rows left stale by an earlier recalculation. A past end date is the
    // definition of lapsed, and it is what Rights Management filters on too.
    let query = supabase
      .from('platform_rights')
      .select('*', { count: 'exact', head: true })
      .lt('end_date', today)
    if (since) query = query.gte('end_date', since)
    const { count, error } = await query
    if (error) throw sanitizeError(error)
    return count || 0
  })
}

export async function getRightById(id: string): Promise<PlatformRight | null> {
  const { data, error } = await supabase.from('platform_rights').select(`*, movies(id, title, source), platforms(id, name, platform_type)`).eq('id', id).single()

  if (error) throw sanitizeError(error)
  return data
}

/**
 * All rows belonging to the same logical "right" as the given one: same movie,
 * same platform and same category. Each row carries exactly one nature, so the
 * edit page needs the whole sibling set to show every nature of that right.
 */
export async function getSiblingRights(right: {
  movie_id: string
  platform_id: string | null
  category: string | null
}): Promise<PlatformRight[]> {
  let query = supabase
    .from('platform_rights')
    .select('*')
    .eq('movie_id', right.movie_id)

  query = right.platform_id ? query.eq('platform_id', right.platform_id) : query.is('platform_id', null)
  query = right.category ? query.eq('category', right.category) : query.is('category', null)

  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) throw sanitizeError(error)
  return (data || []) as PlatformRight[]
}

async function recalculateWtpLibrary(movieId: string): Promise<void> {
  const { data: movie } = await supabase.from('movies').select('source').eq('id', movieId).single()
  if (movie?.source === 'acquired') return

  const today = new Date().toISOString().split('T')[0]
  const { data: allRights, error: rightsError } = await supabase.from('platform_rights').select('id, end_date, platforms(platform_type)').eq('movie_id', movieId)

  if (rightsError) return

  const satelliteRights = (allRights || []).filter((r: any) => (r.platforms?.platform_type || '').toLowerCase().includes('satellite'))

  let wtpLibrary: string | null
  if (satelliteRights.length === 0) {
    wtpLibrary = 'WTP'
  } else {
    const hasActive = satelliteRights.some((r: any) => !r.end_date || r.end_date >= today)
    wtpLibrary = hasActive ? null : 'Library'
  }

  await supabase.from('movies').update({ wtp_library: wtpLibrary }).eq('id', movieId)
}

function deriveIsCurrentFromEndDate(right: Partial<PlatformRight>): Partial<PlatformRight> {
  const today = new Date().toISOString().split('T')[0]
  const isCurrent = !right.end_date || right.end_date >= today
  return { ...right, is_current: isCurrent }
}

export async function createRight(right: Partial<PlatformRight>): Promise<PlatformRight> {
  const payload = deriveIsCurrentFromEndDate(right)
  const { data, error } = await supabase
    .from('platform_rights')
    .insert({ ...payload })
    .select()
    .single()

  if (error) throw sanitizeError(error)
  notifyRightsMutated()
  if (right.movie_id) await recalculateWtpLibrary(right.movie_id)
  return data
}

export async function updateRight(id: string, right: Partial<PlatformRight>): Promise<PlatformRight> {
  const payload = 'end_date' in right ? deriveIsCurrentFromEndDate(right) : right
  const { data, error } = await supabase.from('platform_rights').update(payload).eq('id', id).select().single()

  if (error) throw sanitizeError(error)
  notifyRightsMutated()
  const movieId = right.movie_id || (data as PlatformRight)?.movie_id
  if (movieId) await recalculateWtpLibrary(movieId)
  return data
}

export async function deleteRight(id: string): Promise<void> {
  const { data: existing } = await supabase.from('platform_rights').select('movie_id').eq('id', id).single()

  const { error } = await supabase.from('platform_rights').delete().eq('id', id)
  if (error) throw sanitizeError(error)
  notifyRightsMutated()
  if (existing?.movie_id) await recalculateWtpLibrary(existing.movie_id)
}

export async function getMovieRights(movieIds: string[]) {
  if (movieIds.length === 0) return []

  const { data, error } = await supabase.from('platform_rights').select(`*, platforms(id, name, platform_type)`).in('movie_id', movieIds)

  if (error) throw sanitizeError(error)
  return data || []
}
