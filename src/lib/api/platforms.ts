import { createClient } from '@/lib/supabase/client'
import type { Platform } from '@/lib/types/database'
import { sanitizeError } from '@/lib/utils/sanitize-error'

const supabase = createClient()
const MAX_LIMIT = 200


export interface PlatformWithStats extends Platform {
  active_rights?: number
  total_rights?: number
}

export async function getPlatformsWithStats(options?: { search?: string; platformType?: string; limit?: number; offset?: number }): Promise<{ data: PlatformWithStats[]; count: number }> {
  try {
    let query = supabase.from('platforms').select('*', { count: 'exact' })

    if (options?.search) {
      query = query.ilike('name', `%${options.search}%`)
    }

    if (options?.platformType) {
      query = query.eq('platform_type', options.platformType)
    }

    query = query.order('name')

    const limit = Math.min(options?.limit || 50, MAX_LIMIT)
    query = query.limit(limit)

    if (options?.offset) {
      query = query.range(options.offset, options.offset + limit - 1)
    }

    const { data: platforms, error, count } = await query

    if (error) throw sanitizeError(error)

    // Batch fetch rights counts instead of N+1
    const platformIds = (platforms || []).map((p: { id: string }) => p.id)

    const { data: rightsData } = await supabase.from('platform_rights').select('platform_id, is_current').in('platform_id', platformIds)

    const activeCounts = new Map<string, number>()
    const totalCounts = new Map<string, number>()
    ;(rightsData || []).forEach((r: { platform_id: string; is_current: boolean }) => {
      totalCounts.set(r.platform_id, (totalCounts.get(r.platform_id) || 0) + 1)
      if (r.is_current) {
        activeCounts.set(r.platform_id, (activeCounts.get(r.platform_id) || 0) + 1)
      }
    })

    const platformsWithStats: PlatformWithStats[] = (platforms || []).map((platform: { id: string; name: string; platform_type?: string; created_at?: string; updated_at?: string }) => ({
      ...platform,
      active_rights: activeCounts.get(platform.id) || 0,
      total_rights: totalCounts.get(platform.id) || 0,
    }))

    return { data: platformsWithStats, count: count || 0 }
  } catch (error) {
    console.error('Error fetching platforms with stats:', error)
    return { data: [], count: 0 }
  }
}

export async function getPlatformById(id: string): Promise<PlatformWithStats | null> {
  try {
    const { data: platform, error } = await supabase.from('platforms').select('*').eq('id', id).single()

    if (error) throw sanitizeError(error)
    if (!platform) return null

    const [activeResult, totalResult] = await Promise.all([
      supabase.from('platform_rights').select('*', { count: 'exact', head: true }).eq('platform_id', id).eq('is_current', true),
      supabase.from('platform_rights').select('*', { count: 'exact', head: true }).eq('platform_id', id),
    ])

    return {
      ...platform,
      active_rights: activeResult.count || 0,
      total_rights: totalResult.count || 0,
    }
  } catch (error) {
    console.error('Error fetching platform:', error)
    return null
  }
}

export async function createPlatform(data: { name: string; platform_type?: string; agreement_doc_url?: string }): Promise<Platform> {
  const { data: platform, error } = await supabase
    .from('platforms')
    .insert(data)
    .select()
    .single()

  if (error) throw sanitizeError(error)
  return platform
}

export async function updatePlatform(id: string, data: { name?: string; platform_type?: string; agreement_doc_url?: string }): Promise<Platform> {
  const { data: platform, error } = await supabase.from('platforms').update(data).eq('id', id).select().single()

  if (error) throw sanitizeError(error)
  return platform
}

export async function deletePlatform(id: string): Promise<void> {
  const { error } = await supabase.from('platforms').delete().eq('id', id)
  if (error) throw sanitizeError(error)
}

export async function getPlatformTypes(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('platforms').select('platform_type').not('platform_type', 'is', null)
    if (error) throw sanitizeError(error)
    const types = [...new Set(data?.map((p: { platform_type?: string }) => p.platform_type).filter(Boolean))]
    return types as string[]
  } catch (error) {
    console.error('Error fetching platform types:', error)
    return []
  }
}

export async function getRightsTypeNames(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('platforms').select('platform_type').not('platform_type', 'is', null)
    if (error) throw sanitizeError(error)
    const unique = Array.from(new Set((data || []).map((r: { platform_type: string | null }) => r.platform_type).filter(Boolean) as string[]))
    unique.sort()
    return unique
  } catch (error) {
    console.error('Error fetching platform types:', error)
    return []
  }
}
