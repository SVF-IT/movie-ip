import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Papa from 'papaparse'

// ── Column definitions ────────────────────────────────────────────────────────

const HOME_COLUMNS: Record<string, string> = {
  production_no: 'Production No',
  title: 'Title',
  cast_names: 'Cast',
  director_names: 'Director',
  language: 'Language',
  production_house_name: 'Production House',
  release_date: 'Theatrical Release Date',
  release_year: 'Release Year',
  trailer_link: 'YT Trailer Link',
  certification: 'Censor',
  nature_of_rights: 'Nature of Right',
  holdbacks: 'Holdbacks',
  remarks: 'Remarks',
  actionables: 'Actionable',
  jointly_exploitation_rights: 'Joint Exploitation Rights',
  revenue_share: 'Revenue Share',
  joint_prod_buy_back_date: 'Joint Buy Back Date',
  wtp_library: 'WTP / Library',
}

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
  territory: 'Territory',
  assignor_licensor: 'Assignor / Licensor',
  licensee: 'Licensee',
  agreement_date: 'Agreement Date',
  agreement_start_date: 'Agreement Start Date',
  agreement_end_date: 'Agreement End Date',
  satellite_rights: 'Satellite Rights',
  satellite_rights_start_date: 'Satellite Rights Start Date',
  satellite_rights_end_date: 'Satellite Rights End Date',
  satellite_rights_classification: 'Satellite Rights Classification',
  nature_of_satellite_rights: 'Nature of Satellite Rights',
  internet_rights: 'Internet Rights',
  internet_rights_start_date: 'Internet Rights Start Date',
  internet_rights_end_date: 'Internet Rights End Date',
  internet_rights_classification: 'Internet Rights Classification',
  nature_of_internet_rights: 'Nature of Internet Rights',
  syndication_internet_rights: 'Syndication Internet Rights',
  negative_rights: 'Negative Rights',
  negative_rights_start_date: 'Negative Rights Start Date',
  negative_rights_end_date: 'Negative Rights End Date',
  nature_of_negative_rights: 'Nature of Negative Rights',
  other_rights: 'Other Rights',
  other_rights_start_date: 'Other Rights Start Date',
  other_rights_end_date: 'Other Rights End Date',
  nature_of_other_rights: 'Nature of Other Rights',
  clip_rights: 'Clip Rights',
  clip_rights_duration: 'Clip Rights Duration',
  holdbacks: 'Holdbacks',
  prequel_sequel_rights: 'Prequel / Sequel Rights',
  character_rights: 'Character Rights',
  subtitling_rights: 'Subtitling Rights',
  dubbing_rights: 'Dubbing Rights',
  nature_of_rights: 'Nature of Rights',
  wtp_library: 'WTP / Library',
  remarks: 'Remarks',
  actionables: 'Actionable',
}

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
      // Build source filter
      let query = serverClient.from('movies_with_details').select('*').order('title')

      if (movieFormat === 'home') {
        query = query.eq('source', 'home_production')
      } else if (movieFormat === 'acquired') {
        query = query.eq('source', 'acquired')
      }

      const { data: movies, error } = await query
      if (error) throw error

      const columnDef = movieFormat === 'acquired' ? ACQUIRED_COLUMNS : HOME_COLUMNS

      // Determine which fields to include
      let fieldKeys = Object.keys(columnDef)
      if (columnsParam) {
        const requested = new Set(columnsParam.split(',').map((s) => s.trim()))
        fieldKeys = fieldKeys.filter((k) => requested.has(k))
      }

      const moviesFlat = (movies || []).map((m: Record<string, unknown>) => {
        const row: Record<string, unknown> = {}
        for (const key of fieldKeys) {
          const label = columnDef[key]
          row[label] = m[key] ?? ''
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
