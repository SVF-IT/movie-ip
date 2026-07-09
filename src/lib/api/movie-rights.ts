import { createClient } from '@/lib/supabase/client'
import type { MovieRight } from '@/lib/types/database'
import { sanitizeError } from '@/lib/utils/sanitize-error'

const supabase = createClient()

export async function getMovieRightsOwned(
  movieId: string,
  options?: {
    rightType?: string
    nature?: string
    territory?: string
  },
): Promise<MovieRight[]> {
  let query = supabase
    .from('movie_rights')
    .select('*, movie:movies(id, title, source)')
    .eq('movie_id', movieId)

  if (options?.rightType) query = query.eq('right_type', options.rightType)
  if (options?.nature) query = query.eq('nature', options.nature)
  if (options?.territory) query = query.ilike('territory', `%${options.territory}%`)

  query = query.order('right_type').order('start_date', { ascending: true, nullsFirst: true })

  const { data, error } = await query
  if (error) throw sanitizeError(error)
  return data || []
}

export async function getAllMovieRightsOwned(options?: {
  rightType?: string
  nature?: string
  territory?: string
  movieSearch?: string
  endDateFrom?: string
  endDateTo?: string
  isExpired?: boolean
  limit?: number
  offset?: number
}): Promise<{ data: MovieRight[]; count: number }> {
  let movieIds: string[] | null = null

  if (options?.movieSearch) {
    const { data: movies, error: movieError } = await supabase
      .from('movies')
      .select('id')
      .ilike('title', `%${options.movieSearch}%`)
    if (movieError) throw sanitizeError(movieError)
    const ids = (movies || []).map((m: { id: string }) => m.id)
    if (ids.length === 0) return { data: [], count: 0 }
    movieIds = ids
  }

  let query = supabase
    .from('movie_rights')
    .select('*, movie:movies(id, title, source)', { count: 'exact' })

  if (movieIds) query = query.in('movie_id', movieIds)
  if (options?.rightType) query = query.eq('right_type', options.rightType)
  if (options?.nature) query = query.eq('nature', options.nature)
  if (options?.territory) query = query.ilike('territory', `%${options.territory}%`)

  if (options?.isExpired === true) {
    query = query.lt('end_date', new Date().toISOString().split('T')[0])
  } else if (options?.isExpired === false) {
    query = query.or(`end_date.is.null,end_date.gte.${new Date().toISOString().split('T')[0]}`)
  }

  if (options?.endDateFrom) query = query.gte('end_date', options.endDateFrom)
  if (options?.endDateTo) query = query.lte('end_date', options.endDateTo)

  const limit = Math.min(options?.limit || 50, 10000)
  query = query.limit(limit)
  if (options?.offset) query = query.range(options.offset, options.offset + limit - 1)
  query = query.order('right_type').order('end_date', { ascending: true, nullsFirst: false })

  const { data, error, count } = await query
  if (error) throw sanitizeError(error)
  return { data: data || [], count: count || 0 }
}

export async function createMovieRight(right: Omit<MovieRight, 'id' | 'created_at' | 'updated_at' | 'movie'>): Promise<MovieRight> {
  const { data, error } = await supabase
    .from('movie_rights')
    .insert(right)
    .select()
    .single()

  if (error) throw sanitizeError(error)
  return data
}

export async function createMovieRights(rights: Omit<MovieRight, 'id' | 'created_at' | 'updated_at' | 'movie'>[]): Promise<MovieRight[]> {
  if (rights.length === 0) return []

  const clean = rights.map((r: any) => {
    const { _key, id, movie, created_at, updated_at, ...rest } = r
    return rest
  })

  const { data, error } = await supabase
    .from('movie_rights')
    .insert(clean)
    .select()

  if (error) throw sanitizeError(error)
  return data || []
}

export async function updateMovieRight(id: string, right: Partial<Omit<MovieRight, 'id' | 'movie_id' | 'created_at' | 'movie'>>): Promise<MovieRight> {
  const { data, error } = await supabase
    .from('movie_rights')
    .update(right)
    .eq('id', id)
    .select()
    .single()

  if (error) throw sanitizeError(error)
  return data
}

export async function deleteMovieRight(id: string): Promise<void> {
  const { error } = await supabase.from('movie_rights').delete().eq('id', id)
  if (error) throw sanitizeError(error)
}

export async function deleteAllMovieRights(movieId: string): Promise<void> {
  const { error } = await supabase.from('movie_rights').delete().eq('movie_id', movieId)
  if (error) throw sanitizeError(error)
}

export async function syncMovieRights(
  movieId: string,
  incoming: Omit<MovieRight, 'id' | 'created_at' | 'updated_at' | 'movie'>[],
  existing: MovieRight[],
): Promise<void> {
  const existingIds = new Set(existing.map((r) => r.id))
  const incomingIds = new Set(incoming.filter((r) => (r as any).id).map((r) => (r as any).id))

  const toDelete = existing.filter((r) => !incomingIds.has(r.id))
  const toInsert = incoming.filter((r) => !(r as any).id)
  const toUpdate = incoming.filter((r) => (r as any).id && existingIds.has((r as any).id))

  const strip = (r: any) => {
    const { _key, id, movie, created_at, updated_at, created_by, updated_by, ...rest } = r
    return rest
  }

  await Promise.all([
    ...toDelete.map((r) => deleteMovieRight(r.id)),
    toInsert.length > 0
      ? createMovieRights(toInsert.map((r) => ({ ...strip(r), movie_id: movieId })))
      : Promise.resolve(),
    ...toUpdate.map((r) => updateMovieRight((r as any).id, strip(r))),
  ])
}
