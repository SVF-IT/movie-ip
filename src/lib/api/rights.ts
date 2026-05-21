import { createClient } from '@/lib/supabase/client'
import type { ExpiringRight, PlatformRight } from '@/lib/types/database'
import { sanitizeError } from '@/lib/utils/sanitize-error'

const supabase = createClient()
const MAX_LIMIT = 200

export async function getAllRights(options?: {
  platformId?: string
  platformNameContains?: string
  isExpired?: boolean
  nature?: string
  territory?: string
  endDateFrom?: string
  endDateTo?: string
  movieId?: string
  movieSearch?: string
  limit?: number
  offset?: number
}): Promise<{ data: PlatformRight[]; count: number }> {
  let movieIds: string[] | null = null

  if (options?.movieSearch) {
    const { data: movies, error: movieError } = await supabase.from('movies').select('id').ilike('title', `%${options.movieSearch}%`)

    if (movieError) throw sanitizeError(movieError)
    const matchingMovieIds = (movies || []).map((m: { id: string }) => m.id)
    if (matchingMovieIds.length === 0) return { data: [], count: 0 }
    movieIds = matchingMovieIds
  }

  let starPlatformIds: string[] | null = null
  if (options?.platformNameContains) {
    const { data: matchedPlatforms, error: platError } = await supabase.from('platforms').select('id').ilike('name', `%${options.platformNameContains}%`)

    if (platError) throw sanitizeError(platError)
    const ids = (matchedPlatforms || []).map((p: { id: string }) => p.id)
    if (ids.length === 0) return { data: [], count: 0 }
    starPlatformIds = ids
  }

  let query = supabase.from('platform_rights').select(`*, movies(id, title, source), platforms(id, name, platform_type)`, { count: 'exact' })

  if (starPlatformIds) query = query.in('platform_id', starPlatformIds)
  else if (options?.platformId) query = query.eq('platform_id', options.platformId)

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

export async function getRightById(id: string): Promise<PlatformRight | null> {
  const { data, error } = await supabase.from('platform_rights').select(`*, movies(id, title, source), platforms(id, name, platform_type)`).eq('id', id).single()

  if (error) throw sanitizeError(error)
  return data
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
  if (right.movie_id) await recalculateWtpLibrary(right.movie_id)
  return data
}

export async function updateRight(id: string, right: Partial<PlatformRight>): Promise<PlatformRight> {
  const payload = 'end_date' in right ? deriveIsCurrentFromEndDate(right) : right
  const { data, error } = await supabase.from('platform_rights').update(payload).eq('id', id).select().single()

  if (error) throw sanitizeError(error)
  const movieId = right.movie_id || (data as PlatformRight)?.movie_id
  if (movieId) await recalculateWtpLibrary(movieId)
  return data
}

export async function deleteRight(id: string): Promise<void> {
  const { data: existing } = await supabase.from('platform_rights').select('movie_id').eq('id', id).single()

  const { error } = await supabase.from('platform_rights').delete().eq('id', id)
  if (error) throw sanitizeError(error)
  if (existing?.movie_id) await recalculateWtpLibrary(existing.movie_id)
}

export async function getExpiringRightsAlert(): Promise<ExpiringRight[]> {
  const { data, error } = await supabase.from('expiring_rights').select('*').lte('days_until_expiry', 30).order('days_until_expiry')

  if (error) throw sanitizeError(error)
  return data || []
}

export async function getMovieRights(movieIds: string[]) {
  if (movieIds.length === 0) return []

  const { data, error } = await supabase.from('platform_rights').select(`*, platforms(id, name, platform_type)`).in('movie_id', movieIds)

  if (error) throw sanitizeError(error)
  return data || []
}
