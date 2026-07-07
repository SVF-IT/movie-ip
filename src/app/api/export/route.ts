import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Papa from 'papaparse'

// ── Column definitions ────────────────────────────────────────────────────────

const HOME_COLUMNS: Record<string, string> = {
  production_no: 'Production No',
  title: 'Movie Name',
  cast_names: 'Cast Details',
  director_names: 'Director',
  production_house_name: 'Production House',
  language: 'Language',
  release_year: 'Release Year',
  trailer_link: 'YT Trailer Link',
  certification: 'Certification',
  color_or_bw: 'Color/B/W',
  jointly_owned: 'Jointly Owned',
  jointly_exploitation_rights: 'Jointly Owned by',
  revenue_share: 'Revenue Share',
  joint_prod_buy_back_date: 'Joint Buy Back date',
  remarks: 'Remarks',
  actionables: 'Actionables',
  wtp_library: 'WTP / Library',
}

// Base acquired movie columns (no flat rights — those come from movie_rights rows)
const ACQUIRED_COLUMNS: Record<string, string> = {
  title: 'Movie Name',
  cast_names: 'Cast Details',
  director_names: 'Director',
  production_no: 'Production No',
  language: 'Language',
  production_house_name: 'Production House',
  release_date: 'Release Date',
  release_year: 'Release Year',
  certification: 'Certification',
  assignor_licensor: 'Assignor / Licensor',
  licensee: 'Licensee',
  agreement_date: 'Agreement Date',
  agreement_start_date: 'Agreement Start Date',
  agreement_end_date: 'Agreement End Date',
  clip_rights: 'Clip Rights',
  clip_rights_duration: 'Clip Rights Duration',
  prequel_sequel_rights: 'Prequel / Sequel Rights',
  character_rights: 'Character Rights',
  subtitling_rights: 'Subtitling Rights',
  dubbing_rights: 'Dubbing Rights',
  wtp_library: 'WTP / Library',
  remarks: 'Remarks',
  actionables: 'Actionable',
}

// Right-type labels and their column prefixes in the export
const RIGHT_TYPE_EXPORT_ORDER = ['Satellite', 'Internet', 'Negative', 'Other', 'Airborne', 'Ship']

export async function GET(request: Request) {
  try {
    const serverClient = await createServerClient()
    const {
      data: { user },
    } = await serverClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await serverClient.from('user_profiles').select('role').eq('id', user.id).single()

    if (!profile || !['admin', 'editor', 'legal'].includes(profile.role)) {
      return NextResponse.json({ message: 'You do not have permission to export data' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const entity = searchParams.get('entity') || 'movies'
    // For movies: "home" | "acquired" | "all"
    const movieFormat = searchParams.get('movieFormat') || 'all'
    // Comma-separated list of db field keys to include (empty = all)
    const columnsParam = searchParams.get('columns') || ''

    let csvString = ''

    if (entity === 'movies' || entity === 'all') {
      let query = serverClient.from('movies_with_details').select('*').order('title')

      if (movieFormat === 'home') {
        query = query.eq('source', 'home_production')
      } else if (movieFormat === 'acquired') {
        query = query.eq('source', 'acquired')
      }

      const { data: movies, error } = await query
      if (error) throw error

      const isAcquiredExport = movieFormat === 'acquired'
      const columnDef = isAcquiredExport ? ACQUIRED_COLUMNS : HOME_COLUMNS

      let fieldKeys = Object.keys(columnDef)
      if (columnsParam) {
        const requested = new Set(columnsParam.split(',').map((s) => s.trim()))
        fieldKeys = fieldKeys.filter((k) => requested.has(k))
      }

      // For acquired exports, fetch all movie_rights rows and group by movie_id
      let movieRightsMap = new Map<string, Record<string, unknown>[]>()
      if (isAcquiredExport && (movies || []).length > 0) {
        const movieIds = (movies || []).map((m: Record<string, unknown>) => m.id as string)
        // Chunk to avoid URL limits
        const CHUNK = 200
        const allRightsRows: Record<string, unknown>[] = []
        for (let i = 0; i < movieIds.length; i += CHUNK) {
          const { data: chunk } = await serverClient
            .from('movie_rights')
            .select('movie_id, right_type, nature, classification, territory, start_date, end_date, syndication, holdbacks')
            .in('movie_id', movieIds.slice(i, i + CHUNK))
            .order('right_type')
          if (chunk) allRightsRows.push(...chunk)
        }
        for (const r of allRightsRows) {
          const mid = r.movie_id as string
          if (!movieRightsMap.has(mid)) movieRightsMap.set(mid, [])
          movieRightsMap.get(mid)!.push(r)
        }
      }

      const moviesFlat = (movies || []).map((m: Record<string, unknown>) => {
        const row: Record<string, unknown> = {}
        for (const key of fieldKeys) {
          const val = m[key]
          row[columnDef[key]] = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : (val ?? '')
        }

        if (isAcquiredExport) {
          const rights = movieRightsMap.get(m.id as string) || []
          // Group by right_type, emit columns per type; multiple entries = semicolon-separated
          for (const rt of RIGHT_TYPE_EXPORT_ORDER) {
            const rows = rights.filter((r) => r.right_type === rt)
            if (rows.length === 0) {
              row[`${rt} Rights`] = ''
              row[`${rt} Nature`] = ''
              row[`${rt} Classification`] = ''
              row[`${rt} Territory`] = ''
              row[`${rt} Start Date`] = ''
              row[`${rt} End Date`] = ''
              if (rt === 'Internet') {
                row['Syndication'] = ''
                row['Holdbacks'] = ''
              }
            } else {
              row[`${rt} Rights`] = 'Yes'
              row[`${rt} Nature`] = rows.map((r) => r.nature ?? '').join('; ')
              row[`${rt} Classification`] = rows.map((r) => r.classification ?? '').filter(Boolean).join('; ')
              row[`${rt} Territory`] = rows.map((r) => r.territory ?? '').filter(Boolean).join('; ')
              row[`${rt} Start Date`] = rows.map((r) => r.start_date ?? '').filter(Boolean).join('; ')
              row[`${rt} End Date`] = rows.map((r) => r.end_date ?? '').filter(Boolean).join('; ')
              if (rt === 'Internet') {
                row['Syndication'] = rows.map((r) => r.syndication ?? '').filter(Boolean).join('; ')
                row['Holdbacks'] = rows.map((r) => r.holdbacks ?? '').filter(Boolean).join('; ')
              }
            }
          }
        }

        return row
      })

      csvString = Papa.unparse(moviesFlat)
    }

    if (entity === 'rights' || entity === 'all') {
      const { data: rights, error } = await serverClient.from('platform_rights').select(`*, movies(title), platforms(name, platform_type)`).order('end_date')

      if (error) throw error

      const rightsFlat = (rights || []).map((r: Record<string, unknown>) => ({
        movie: (r.movies as Record<string, string> | null)?.title || '',
        platform: (r.platforms as Record<string, string> | null)?.name || '',
        rights_type: (r.platforms as Record<string, string> | null)?.platform_type || '',
        category: r.category,
        nature: r.nature,
        start_date: r.start_date,
        end_date: r.end_date,
        territory: r.territory,
        is_current: r.is_current,
        remarks: r.remarks,
      }))

      const rightsCsv = Papa.unparse(rightsFlat)
      if (entity === 'all') {
        csvString += '\n\n--- RIGHTS ---\n\n' + rightsCsv
      } else {
        csvString = rightsCsv
      }
    }

    const formatSuffix = entity === 'movies' && movieFormat !== 'all' ? `_${movieFormat}` : ''
    const filename = `${entity}${formatSuffix}_export_${new Date().toISOString().split('T')[0]}.csv`

    return new NextResponse(csvString, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ message: 'An unexpected error occurred during export' }, { status: 500 })
  }
}
