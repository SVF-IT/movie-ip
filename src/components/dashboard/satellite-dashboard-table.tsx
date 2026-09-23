'use client'

import { ActiveFilterChips, type ActiveFilterChip } from '@/components/dashboard/active-filter-chips'
import { DataExportDialog, type ExportFieldDef } from '@/components/import-export/data-export-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ColumnDateRangeFilter, ColumnFilter, FilterableHead, SortableFilterableHead } from '@/components/ui/column-header-filter'
import { SortableHeader } from '@/components/ui/sortable-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useUrlMultiSelectFilterState } from '@/hooks/use-url-multi-select-filter-state'
import { stringCodec, stringListCodec, useUrlFilterState } from '@/hooks/use-url-filter-state'
import { useSortableTable } from '@/hooks/use-sortable-table'
import {
  getExpiringSatelliteTitles,
  getMoviesForDashboard,
  getOpenTitlesForMode,
  type MovieWithSatelliteRights,
} from '@/lib/api/dashboard'
import { cn } from '@/lib/utils'
import { CalendarIcon, CalendarRange, ChevronRight, Download, Loader2, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

function DateInput({ value, onChange, placeholder = 'dd/mm/yyyy' }: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(value + 'T00:00:00') : undefined

  const handleSelect = (date: Date | undefined) => {
    if (!date) { onChange(''); setOpen(false); return }
    const iso = date.toLocaleDateString('en-CA') // YYYY-MM-DD
    onChange(iso)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-sm outline-none text-foreground min-w-[110px]">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className={value ? 'text-foreground' : 'text-muted-foreground/60'}>
            {value ? isoToDisplay(value) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          captionLayout="dropdown"
          startMonth={new Date(2000, 0)}
          endMonth={new Date(2050, 11)}
        />
      </PopoverContent>
    </Popover>
  )
}

type ActiveCard = 'open_titles' | 'expiring' | 'wtp'
type SortOption = 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc' | 'expiry_asc' | 'expiry_desc'
type SourceFilter = 'all' | 'home' | 'acquired' | 'bangladeshi'

interface SatelliteDashboardTableProps {
  activeCard: ActiveCard
  language: string[]
  /**
   * Language options + setter, so the selector can live in this filter bar rather
   * than in the page header. Optional — omit and no selector renders.
   */
  languageOptions?: string[]
  onLanguageChange?: (next: string[]) => void
  /**
   * The language selection this page opens with (Bengali). Clearing filters
   * must return to the state the page started in, not to "all languages" —
   * which is a state the user could not otherwise reach.
   */
  defaultLanguage?: string[]
  totalLanguageCount: number
  /**
   * False until the parent's language options have been fetched. The tables hold
   * their first fetch until then, so the default language filter is applied to it.
   */
  languagesReady?: boolean
  expiryYear: string
  onExpiryYearChange: (year: string) => void
  expiryFrom: string
  expiryTo: string
  onExpiryFromChange: (v: string) => void
  onExpiryToChange: (v: string) => void
  openFrom: string
  openTo: string
  onOpenFromChange: (v: string) => void
  onOpenToChange: (v: string) => void
  yearOptions: number[]
  fullPage?: boolean
  /**
   * Reports the count AFTER every in-table filter (licensor, open-to type,
   * agreement-end, …) so the stat card can show the same number the table lists.
   * The table fetches the full result set (limit 10000), so this is the true total.
   */
  onFilteredCountChange?: (counts: { total: number; home: number; acquired: number }) => void
}

const EXPORT_FIELDS: ExportFieldDef[] = [
  { key: 'sl_no', label: 'Sl No' },
  { key: 'title', label: 'Title' },
  { key: 'cast_names', label: 'Cast' },
  { key: 'director_names', label: 'Director' },
  { key: 'release_date', label: 'Release Date' },
  { key: 'trailer_link', label: 'YT Trailer Link' },
  { key: 'certification', label: 'Censor' },
  { key: 'wtp_library', label: 'WTP/Library' },
  { key: 'source', label: 'Source' },
  { key: 'assignor_licensor', label: 'Licensor' },
  { key: 'licensee', label: 'Licensee' },
  { key: 'agreement_start_date', label: 'Agreement Start Date' },
  { key: 'agreement_end_date', label: 'Agreement End Date' },
]

const EXPORT_FIELDS_EXPIRING: ExportFieldDef[] = [
  { key: 'sl_no', label: 'Sl No' },
  { key: 'title', label: 'Title' },
  { key: 'source', label: 'Source' },
  { key: 'platform_name', label: 'Platform' },
  { key: 'rights_type_name', label: 'Type' },
  { key: 'nature', label: 'Nature' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'end_date', label: 'Expiry Date' },
  { key: 'days_remaining', label: 'Days Remaining' },
  { key: 'territory', label: 'Territory' },
  { key: 'certification', label: 'Censor' },
  { key: 'release_date', label: 'Release Date' },
  { key: 'language', label: 'Language' },
]

const cardLabels: Record<ActiveCard, string> = {
  open_titles: 'Open Titles',
  expiring: 'Expiring Satellite Rights',
  wtp: 'WTP Titles',
}

export function SatelliteDashboardTable({
  activeCard,
  language,
  languageOptions,
  onLanguageChange,
  defaultLanguage,
  totalLanguageCount,
  languagesReady = true,
  expiryYear,
  onExpiryYearChange,
  expiryFrom,
  expiryTo,
  onExpiryFromChange,
  onExpiryToChange,
  openFrom,
  openTo,
  onOpenFromChange,
  onOpenToChange,
  yearOptions,
  fullPage = false,
  onFilteredCountChange,
}: SatelliteDashboardTableProps) {
  const CERT_OPTIONS = ['U', 'UA', 'UA 7+', 'UA 13+', 'UA 16+', 'A']


  const [movies, setMovies] = useState<MovieWithSatelliteRights[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useUrlFilterState('sat_q', '', stringCodec)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // Source is a multi-select in the column header; the API still takes a single
  // value, so an all-or-one selection maps to it and mixed selections are
  // narrowed client-side alongside the licensor filter.
  const SOURCE_OPTIONS = [
    { value: 'home', label: 'Home Production' },
    { value: 'acquired', label: 'Acquired' },
    { value: 'bangladeshi', label: 'Bangladesh' },
  ]
  const [sourceSel, setSourceSel] = useUrlMultiSelectFilterState('sat_src', SOURCE_OPTIONS.map(o => o.value))
  const sourceFilter: SourceFilter =
    sourceSel.length === 1 ? (sourceSel[0] as SourceFilter) : 'all'
  const [certFilter, setCertFilter] = useUrlMultiSelectFilterState('sat_cert', CERT_OPTIONS)
  const [sortBy, setSortBy] = useState<SortOption>('title_asc')
  const WTP_OPTIONS: { value: 'wtp' | 'wtp_bd' | 'library'; label: string }[] = [
    { value: 'wtp', label: 'WTP' },
    { value: 'wtp_bd', label: 'WTP/BD' },
    { value: 'library', label: 'Library' },
  ]
  const [wtpFilter, setWtpFilter] = useUrlMultiSelectFilterState('sat_wtp', WTP_OPTIONS.map(o => o.value))
  // Sunset/rights window starts at today by default so Open Titles opens on
  // what is available from now on; the end stays open-ended.
  const todayIso = useMemo(() => new Date().toLocaleDateString('en-CA'), [])
  const didInitOpenFrom = useRef(false)
  useEffect(() => {
    if (didInitOpenFrom.current) return
    didInitOpenFrom.current = true
    if (activeCard === 'open_titles' && !openFrom && !openTo) onOpenFromChange(todayIso)
  }, [activeCard, openFrom, openTo, todayIso, onOpenFromChange])
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportData, setExportData] = useState<Record<string, unknown>[]>([])
  const [exportLoading, setExportLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const getEffectiveLicensor = (movie: any) => movie.source === 'home_production' ? 'SVF' : (movie.assignor_licensor || '')

  const licensorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const m of movies as any[]) {
      const v = getEffectiveLicensor(m)
      if (v) set.add(v)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [movies])

  const [licensorFilter, setLicensorFilter] = useUrlMultiSelectFilterState('sat_lic', licensorOptions)

  // Title gets a searchable multi-select of the titles currently loaded, so the
  // header filter can pick exact titles the way Excel's column filter does.
  const titleOptions = useMemo(() => {
    const set = new Set<string>()
    for (const m of movies as any[]) if (m.title) set.add(m.title)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [movies])
  // Unlike the other filters, title's options are derived from the fetched rows
  // rather than a fixed list, so "all selected" can't mean "no filter" — the set
  // shrinks whenever another filter narrows the data, which would leave a stale
  // selection looking like an active filter. An empty selection means no filter.
  const [titleSel, setTitleSel] = useUrlFilterState<string[]>('sat_title', [], stringListCodec, (v) => v.length === 0)
  const titleFilter = titleSel.length === 0 ? titleOptions : titleSel
  const setTitleFilter = (next: string[]) =>
    setTitleSel(next.length >= titleOptions.length ? [] : next)

  useEffect(() => { setSelectedIds(new Set()) }, [activeCard, language, expiryFrom, expiryTo, openFrom, openTo, sourceSel, licensorFilter, certFilter, wtpFilter])

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })
  const toggleSelectAll = () => {
    const ids = flatExpiryRows
      ? flatRightRows.map(({ right }) => right.id)
      : sortedData.map((m: any) => m.id)
    setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids))
  }

  useEffect(() => {
    setSortBy(activeCard === 'expiring' ? 'expiry_asc' : 'title_asc')
    setWtpFilter(WTP_OPTIONS.map(o => o.value))
  }, [activeCard])

  const fetchData = useCallback(async (forExport = false) => {
    // The parent resolves its language options asynchronously and only then applies
    // the default (Bengali). Fetching before that lands would send no language filter
    // at all — `language.length < totalLanguageCount` is `0 < 0`, i.e. false — and the
    // table would report an all-language count to the stat card. `languagesReady`
    // distinguishes "options not fetched yet" from "fetched and genuinely empty", so a
    // failed language fetch still renders rather than hanging on a skeleton forever.
    if (!languagesReady) return
    if (!forExport) setIsLoading(true)
    try {
      const limit = 10000
      const offset = 0
      const safeSortBy = (sortBy === 'expiry_asc' || sortBy === 'expiry_desc') ? 'title_asc' : sortBy

      // A filter is only sent to the server when it's a genuine narrowing (partial selection or
      // fully cleared). When every known option is checked, we pass undefined — the same as "no
      // filter" — rather than the full array, because the option lists (esp. Certification, a
      // hardcoded set) aren't guaranteed to cover every value present in the data (nulls, blanks,
      // legacy values). Sending the full array would silently exclude those rows via `.in()`.
      const languageParam =
        language.length > 0 && language.length < totalLanguageCount ? language : undefined
      const certParam = certFilter.length < CERT_OPTIONS.length ? certFilter : undefined
      const wtpParam = wtpFilter.length < WTP_OPTIONS.length ? wtpFilter : undefined

      if (activeCard === 'open_titles') {
        const { data } = await getOpenTitlesForMode('satellite', {
          search: debouncedSearch || undefined,
          language: languageParam,
          sourceFilter,
          sortBy: safeSortBy,
          certification: certParam,
          wtpFilter: wtpParam,
          openFrom: openFrom || undefined,
          openTo: openTo || undefined,
          limit,
          offset,
        })
        if (forExport) return data
        setMovies(data)
      } else if (activeCard === 'expiring') {
        const { data } = await getExpiringSatelliteTitles({
          fromDate: expiryFrom || undefined,
          toDate: expiryTo || undefined,
          language: languageParam,
          sourceFilter,
          search: debouncedSearch || undefined,
          sortBy,
          certification: certParam,
          limit,
          offset,
        })
        if (forExport) return data
        setMovies(data)
      } else {
        // WTP — server-side filtering with language, source, search, and pagination
        const { data } = await getMoviesForDashboard({
          category: 'wtp',
          search: debouncedSearch || undefined,
          language: languageParam,
          sourceFilter,
          sortBy: safeSortBy,
          certification: certParam,
          limit,
          offset,
        })
        if (forExport) return data as MovieWithSatelliteRights[]
        setMovies(data as MovieWithSatelliteRights[])
      }
    } catch (error) {
      console.error('Error loading satellite table:', error)
    } finally {
      if (!forExport) setIsLoading(false)
    }
  }, [activeCard, debouncedSearch, language, totalLanguageCount, languagesReady, sourceFilter, certFilter, expiryFrom, expiryTo, openFrom, openTo, sortBy, wtpFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExportClick = useCallback(async () => {
    setExportLoading(true)
    try {
      const rawData = await fetchData(true)
      const data = activeCard !== 'expiring'
        ? (rawData as any[]).filter((m: any) => {
          if (licensorFilter.length < licensorOptions.length && getEffectiveLicensor(m) && !licensorFilter.includes(getEffectiveLicensor(m))) return false
          return true
        })
        : rawData
      let preparedData: Record<string, unknown>[]
      if (activeCard === 'expiring') {
        const rows: Record<string, unknown>[] = []
        let idx = 1
        const sourceData = selectedIds.size > 0
          ? (data as MovieWithSatelliteRights[]).filter(m =>
            (m.satellite_rights_list || []).some(r => selectedIds.has(r.id))
          )
          : (data as MovieWithSatelliteRights[])
        for (const movie of sourceData || []) {
          const rights = movie.satellite_rights_list || []
          if (rights.length === 0) {
            rows.push({ sl_no: idx++, title: movie.title, source: movie.source, certification: movie.certification, release_date: movie.release_date || (movie as any).release_year || '', language: (movie as any).language })
          } else {
            for (const right of rights) {
              const days = right.end_date ? Math.ceil((new Date(right.end_date).getTime() - Date.now()) / 86400000) : null
              rows.push({
                sl_no: idx++,
                title: movie.title,
                source: movie.is_bangladeshi ? 'Bangladesh' : movie.source === 'home_production' ? 'Home' : 'Acquired',
                platform_name: right.platform_name || '',
                rights_type_name: right.rights_type_name || '',
                nature: right.nature || '',
                start_date: right.start_date || '',
                end_date: right.end_date || '',
                days_remaining: days !== null ? days : '',
                territory: right.territory || 'World',
                certification: movie.certification || '',
                release_date: (movie as any).release_date || (movie as any).release_year || '',
                language: (movie as any).language || '',
              })
            }
          }
        }
        preparedData = rows
      } else {
        const sourceData = selectedIds.size > 0
          ? (data as any[]).filter((m: any) => selectedIds.has(m.id))
          : (data as any[])
        preparedData = (sourceData || []).map((row, idx) => ({
          ...row,
          release_date: row.release_date || row.release_year || '',
          source: row.is_bangladeshi ? 'Bangladesh' : row.source === 'home_production' ? 'Home' : 'Acquired',
          assignor_licensor: row.source === 'home_production' ? '' : (row.assignor_licensor || ''),
          licensee: row.source === 'home_production' ? '' : (row.licensee || ''),
          agreement_start_date: row.source === 'home_production' ? '' : (row.agreement_start_date || ''),
          agreement_end_date: row.source === 'home_production' ? '' : (row.agreement_end_date || ''),
          sl_no: idx + 1,
        }))
      }
      setExportData(preparedData)
      setShowExportDialog(true)
    } catch (error) {
      console.error('Error loading export data:', error)
    } finally {
      setExportLoading(false)
    }
  }, [fetchData, activeCard, selectedIds, licensorFilter, sourceSel, titleSel])

  const matchesSourceSel = (m: any) => {
    if (sourceSel.length >= SOURCE_OPTIONS.length) return true
    return sourceSel.some((sel) =>
      sel === 'home' ? m.source === 'home_production'
        : sel === 'acquired' ? m.source === 'acquired'
          : Boolean(m.is_bangladeshi)
    )
  }

  const matchesTitleSel = (m: any) =>
    titleFilter.length >= titleOptions.length || !m.title || titleFilter.includes(m.title)

  // Titles with no licensor aren't represented in licensorOptions, so they must not be
  // filtered out by a partial selection — they'd disappear with no way to get them back.
  // The parentheses matter: without them `&&` binds tighter than `||` and a
  // licensor-less row would bypass the source and title filters entirely.
  const matchesLicensorSel = (m: any) =>
    licensorFilter.length >= licensorOptions.length ||
    !getEffectiveLicensor(m) ||
    licensorFilter.includes(getEffectiveLicensor(m))

  const licensorFilteredMovies = movies.filter(
    (m: any) => matchesSourceSel(m) && matchesTitleSel(m) && matchesLicensorSel(m)
  )

  const total = licensorFilteredMovies.length
  const home = licensorFilteredMovies.filter((m: any) => m.source === 'home_production').length
  const acquired = total - home

  // Keep the stat card in sync with what the table actually shows.
  useEffect(() => {
    // Not while loading: the rows are empty until the fetch lands, and reporting
    // that emptiness makes the stat card flash 0 before the real number arrives.
    if (isLoading) return
    onFilteredCountChange?.({ total, home, acquired })
    // Depend on the numbers, not the array — a fresh array identity each render would
    // otherwise re-fire this effect on every pass.
  }, [isLoading, total, home, acquired, onFilteredCountChange])

  const { sortedData, sortConfig, requestSort } = useSortableTable(licensorFilteredMovies)

  // Bangladeshi titles are stored as acquired (occasionally home), but the origin
  // is what matters when reading the list, so it wins over the raw source.
  const getSourceBadge = (movie: { source?: string; is_bangladeshi?: boolean }) =>
    movie.is_bangladeshi ? (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">Bangladesh</Badge>
    ) : movie.source === 'home_production' ? (
      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">Home</Badge>
    ) : (
      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">Acquired</Badge>
    )

  const getCertBadge = (cert: string) => {
    const colors: Record<string, string> = {
      U: 'bg-green-500/10 text-green-400 border-green-500/30',
      UA: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      'U/A': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      A: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
      S: 'bg-red-500/10 text-red-400 border-red-500/30',
    }
    return <Badge variant="outline" className={cn('text-xs', colors[cert] || 'bg-muted text-muted-foreground')}>{cert}</Badge>
  }

  const showExpiryFilters = activeCard === 'expiring'
  const showWtpCol = activeCard === 'open_titles'
  // Licensor now carries its own header filter, so the column is always present
  // on Open Titles rather than appearing only for acquired/narrowed views.
  const showLicensorCol = activeCard === 'open_titles'
  // Expiring card: flat per-right rows (no expand/collapse)
  const flatExpiryRows = activeCard === 'expiring'
  const colSpan = flatExpiryRows ? 9 : showWtpCol ? (showLicensorCol ? 11 : 10) : 7

  // ── row / cell sizing based on mode ──
  const rowCls = ''
  const cellCls = ''
  const headCls = ''

  const labelCls = "text-[11px] font-medium uppercase tracking-[.06em] text-(--filter-label)"
  const selectTriggerCls = "h-9 rounded-[8px] bg-(--filter-panel-bg) border-(--filter-border) text-(--text) hover:border-(--filter-border-hover) focus-visible:border-(--filter-border-hover) focus-visible:ring-0 transition-colors text-sm"

  // Chips describe only genuine narrowing: a filter with every option selected is
  // the same as no filter, so it must not appear as "active".
  const activeChips: ActiveFilterChip[] = []
  if (sourceSel.length > 0 && sourceSel.length < SOURCE_OPTIONS.length) activeChips.push({
    key: 'source', label: 'Type',
    value: sourceSel.map((v) => SOURCE_OPTIONS.find(o => o.value === v)?.label ?? v).join(', '),
    onClear: () => setSourceSel(SOURCE_OPTIONS.map(o => o.value)),
  })
  if (titleSel.length > 0) activeChips.push({
    key: 'title', label: 'Title',
    value: titleSel.length === 1 ? titleSel[0] : `${titleSel.length} selected`,
    onClear: () => setTitleSel([]),
  })
  if (licensorFilter.length > 0 && licensorFilter.length < licensorOptions.length) activeChips.push({
    key: 'licensor', label: 'Licensor',
    value: licensorFilter.length === 1 ? licensorFilter[0] : `${licensorFilter.length} selected`,
    onClear: () => setLicensorFilter(licensorOptions),
  })
  if (certFilter.length > 0 && certFilter.length < CERT_OPTIONS.length) activeChips.push({
    key: 'cert', label: 'Certification',
    value: certFilter.length === 1 ? certFilter[0] : `${certFilter.length} selected`,
    onClear: () => setCertFilter(CERT_OPTIONS),
  })
  if (languageOptions && onLanguageChange && language.length > 0 && language.length < totalLanguageCount) activeChips.push({
    key: 'language', label: 'Language',
    value: language.length === 1 ? language[0] : `${language.length} selected`,
    onClear: () => onLanguageChange(defaultLanguage ?? languageOptions),
  })
  if (wtpFilter.length > 0 && wtpFilter.length < WTP_OPTIONS.length) activeChips.push({
    key: 'wtp', label: 'WTP library',
    value: wtpFilter.map((w) => WTP_OPTIONS.find((o) => o.value === w)?.label ?? w).join(', '),
    onClear: () => setWtpFilter(WTP_OPTIONS.map((o) => o.value)),
  })
  if (openFrom || openTo) activeChips.push({
    key: 'window', label: 'Rights window',
    value: `${openFrom || '…'} → ${openTo || '…'}`,
    onClear: () => { onOpenFromChange(''); onOpenToChange('') },
  })
  if (expiryFrom || expiryTo) activeChips.push({
    key: 'expiry', label: 'Expiry window',
    value: `${expiryFrom || '…'} → ${expiryTo || '…'}`,
    onClear: () => { onExpiryFromChange(''); onExpiryToChange(''); onExpiryYearChange('all') },
  })

  const clearAllFilters = () => {
    setSearch('')
    setSourceSel(SOURCE_OPTIONS.map(o => o.value))
    setLicensorFilter(licensorOptions)
    setTitleSel([])
    setCertFilter(CERT_OPTIONS)
    if (onLanguageChange) onLanguageChange(defaultLanguage ?? languageOptions ?? [])
    setWtpFilter(WTP_OPTIONS.map((o) => o.value))
    onOpenFromChange(todayIso); onOpenToChange('')
    onExpiryFromChange(''); onExpiryToChange(''); onExpiryYearChange('all')
  }

  const filtersBar = (
    <div className={fullPage
      ? 'px-4 py-3 bg-(--filter-panel-bg) border-b border-(--filter-border)'
      : 'rounded-[14px] border border-(--filter-border) bg-(--filter-panel-bg) p-3.5'}>
      {/* Most filters now live in the column headers; this grid only renders for the
          cards that still have bar-level controls, so it collapses entirely rather
          than leaving an empty row above the chips. */}
      {showExpiryFilters && (
      <div className="grid gap-x-3 gap-y-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">

        {/* Expiry year + date range */}
        {showExpiryFilters && (
          <>
            <div className="flex flex-col gap-1 min-w-0">
              <span className={labelCls}>Expiry year</span>
              <Select value={expiryYear} onValueChange={onExpiryYearChange}>
                <SelectTrigger className={`w-full ${selectTriggerCls}`}>
                  <CalendarRange className="h-3 w-3 mr-1 text-(--text-faint) shrink-0" />
                  <SelectValue placeholder="Expiry Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 min-w-0 sm:col-span-2">
              <span className={labelCls}>Expiry window</span>
              <div className="flex items-center gap-1 min-w-0 bg-(--filter-panel-bg) border border-(--filter-border) rounded-[8px] px-3 h-9 hover:border-(--filter-border-hover) transition-colors [&_input]:min-w-0 [&_input]:flex-1">
                  <DateInput value={expiryFrom} onChange={onExpiryFromChange} />
                <span className="text-(--filter-label) text-[10px] font-medium uppercase px-0.5">to</span>
                  <DateInput value={expiryTo} onChange={onExpiryToChange} />
                {(expiryFrom || expiryTo) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onExpiryFromChange(''); onExpiryToChange(''); onExpiryYearChange('all') }}
                    className="ml-1 p-0.5 text-(--text-faint) hover:text-red-400 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}

      </div>
      )}

      <ActiveFilterChips chips={activeChips} onClearAll={clearAllFilters} divider={showExpiryFilters} />

      {/* Actions row — selection count + export */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-red-500">
              {selectedIds.size} selected
            </span>
          )}
          {fullPage && (
            <Button variant="outline" size="sm" className="gap-1.5 h-9 rounded-[8px] px-3 text-xs bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20 transition-colors" onClick={handleExportClick} disabled={exportLoading}>
              {exportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Export
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  // For expiring card: flatten to one row per right
  const flatRightRows: Array<{ movie: any; right: any }> = flatExpiryRows
    ? sortedData.flatMap((movie: any) =>
      ((movie as MovieWithSatelliteRights).satellite_rights_list || []).map((right) => ({ movie, right }))
    )
    : []

  const getDaysBadge = (endDate?: string) => {
    if (!endDate) return <span className="text-muted-foreground text-xs">—</span>
    const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
    if (days <= 7) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
        {days}d
      </span>
    )
    if (days <= 30) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        {days}d
      </span>
    )
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-(--bg-raise) text-(--text-faint) border border-(--svf-border-strong)">
        {days}d
      </span>
    )
  }

  const getUrgencyRowCls = (endDate?: string) => {
    if (!endDate) return ''
    const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
    if (days <= 7) return 'border-l-2 border-l-red-500/70 bg-red-500/5'
    if (days <= 30) return 'border-l-2 border-l-amber-500/70 bg-amber-500/5'
    return ''
  }

  const tableEl = (
    <div className={fullPage ? 'flex-1 overflow-auto' : 'rounded-[16px] border border-(--tbl-border) overflow-hidden'}>
      <Table className={fullPage ? 'border-collapse' : ''}>
        <TableHeader className={fullPage ? 'sticky top-0 z-10' : ''}>
          <TableRow className={`border-(--svf-border)/40 ${fullPage ? 'bg-(--bg-deep) backdrop-blur-sm' : 'bg-(--bg-deep)/60'}`}>
            {flatExpiryRows ? (
              <>
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={flatRightRows.length > 0 && selectedIds.size === flatRightRows.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className={headCls}>Movie</TableHead>
                <TableHead className={headCls}>Source</TableHead>
                <TableHead className={headCls}>Platform</TableHead>
                <TableHead className={headCls}>Type</TableHead>
                <TableHead className={headCls}>Nature</TableHead>
                <TableHead className={headCls}>Start Date</TableHead>
                <TableHead className={headCls}>Expiry</TableHead>
                <TableHead className={headCls}>Days</TableHead>
                <TableHead className={headCls}>Territory</TableHead>
              </>
            ) : (
              <>
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={sortedData.length > 0 && selectedIds.size === sortedData.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <SortableFilterableHead column="title" label="Title" currentSort={sortConfig} onSort={requestSort} className={headCls}>
                  <ColumnFilter
                    options={titleOptions}
                    value={titleFilter}
                    onChange={setTitleFilter}
                    searchable
                    searchValue={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Title or production no…"
                  />
                </SortableFilterableHead>
                <SortableFilterableHead column="source" label="Type" currentSort={sortConfig} onSort={requestSort} className={headCls}>
                  <ColumnFilter options={SOURCE_OPTIONS} value={sourceSel} onChange={setSourceSel} />
                </SortableFilterableHead>
                <SortableFilterableHead column="certification" label="Cert" currentSort={sortConfig} onSort={requestSort} className={cn('w-px px-2', headCls)}>
                  <ColumnFilter options={CERT_OPTIONS} value={certFilter} onChange={setCertFilter} />
                </SortableFilterableHead>
                <SortableHeader column="release_date" label="Release" currentSort={sortConfig} onSort={requestSort} className={headCls} />
                <SortableFilterableHead column="language" label="Language" currentSort={sortConfig} onSort={requestSort} className={headCls}>
                  {languageOptions && onLanguageChange && (
                    <ColumnFilter options={languageOptions} value={language} onChange={onLanguageChange} searchable />
                  )}
                </SortableFilterableHead>
                {showWtpCol && (
                  <FilterableHead label="WTP Library" className={headCls}>
                    <ColumnFilter
                      options={WTP_OPTIONS}
                      value={wtpFilter}
                      onChange={(v) => setWtpFilter(v as ('wtp' | 'wtp_bd' | 'library')[])}
                    />
                  </FilterableHead>
                )}
                {showLicensorCol && (
                  <FilterableHead label="Licensor" className={headCls}>
                    <ColumnFilter options={licensorOptions} value={licensorFilter} onChange={setLicensorFilter} searchable />
                  </FilterableHead>
                )}
                {activeCard === 'open_titles' && (
                  <FilterableHead label="Sunset Date" className={headCls}>
                    <ColumnDateRangeFilter
                      from={openFrom}
                      to={openTo}
                      onFromChange={onOpenFromChange}
                      onToChange={onOpenToChange}
                      renderInput={(value, onChange) => <DateInput value={value} onChange={onChange} />}
                    />
                  </FilterableHead>
                )}
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            [...Array(fullPage ? 12 : 6)].map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={colSpan} className={cellCls}>
                  <div className={`bg-(--hover) rounded animate-pulse ${fullPage ? 'h-6' : 'h-9'}`} />
                </TableCell>
              </TableRow>
            ))
          ) : flatExpiryRows ? (
            flatRightRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                  No expiring rights found matching your filters
                </TableCell>
              </TableRow>
            ) : (
              flatRightRows.map(({ movie, right }) => (
                <TableRow
                  key={right.id}
                  className={cn('border-(--svf-border)/30 hover:bg-(--hover) transition-colors', getUrgencyRowCls(right.end_date), selectedIds.has(right.id) && 'bg-red-500/5')}
                >
                  <TableCell className={cn('pl-4 w-10', cellCls)}>
                    <Checkbox checked={selectedIds.has(right.id)} onCheckedChange={() => toggleSelect(right.id)} />
                  </TableCell>
                  <TableCell className={cn('font-medium whitespace-normal', cellCls)}>
                    <Link href={`/movies/${movie.id}`} title={movie.title} className="hover:text-primary transition-colors break-words">
                      {movie.title}
                      {(movie.release_year || movie.release_date?.split('-')[0]) && (
                        <span className="font-normal ml-1" style={{ color: 'var(--text-faint)' }}>({movie.release_year || movie.release_date?.split('-')[0]})</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className={cellCls}>{getSourceBadge(movie)}</TableCell>
                  <TableCell className={cn('whitespace-nowrap', cellCls)}>
                    {right.platform_name || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={cellCls}>
                    {right.rights_type_name ? (
                      <Badge variant="outline" className="bg-(--bg-raise)/60 text-(--text-faint) border-(--svf-border) text-xs whitespace-nowrap">
                        {right.rights_type_name}
                      </Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className={cellCls}>
                    {right.nature ? (
                      <Badge variant="outline" className={cn('text-xs whitespace-nowrap',
                        right.nature === 'exclusive'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          : 'bg-(--bg-raise) text-(--text-faint) border-(--svf-border-strong)'
                      )}>
                        {right.nature === 'exclusive' ? 'Exclusive' : right.nature === 'non_exclusive' ? 'Non-Exclusive' : right.nature}
                      </Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className={cn('whitespace-nowrap text-muted-foreground', cellCls)}>
                    {right.start_date ? right.start_date.split('-').reverse().join('/') : '—'}
                  </TableCell>
                  <TableCell className={cn('whitespace-nowrap text-muted-foreground', cellCls)}>
                    {right.end_date ? right.end_date.split('-').reverse().join('/') : '—'}
                  </TableCell>
                  <TableCell className={cellCls}>{getDaysBadge(right.end_date)}</TableCell>
                  <TableCell className={cn('whitespace-nowrap text-muted-foreground', cellCls)}>
                    {right.territory || 'World'}
                  </TableCell>
                </TableRow>
              ))
            )
          ) : sortedData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center py-10 text-muted-foreground text-sm">
                No movies found matching your filters
              </TableCell>
            </TableRow>
          ) : (
            sortedData.map((movie: any, idx: number) => (
              <TableRow key={movie.id} className={cn(rowCls, fullPage && idx % 2 === 0 ? 'bg-(--panel-solid)/30' : '', selectedIds.has(movie.id) && 'bg-red-500/5')}>
                <TableCell className={cn('pl-4 w-10', cellCls)}>
                  <Checkbox checked={selectedIds.has(movie.id)} onCheckedChange={() => toggleSelect(movie.id)} />
                </TableCell>
                <TableCell className={cn('font-medium whitespace-normal', cellCls)}>
                  <Link href={`/movies/${movie.id}`} title={movie.title} className="hover:text-primary transition-colors break-words">
                    {movie.title}
                    {(movie.release_year || movie.release_date?.split('-')[0]) && (
                      <span className="font-normal ml-1" style={{ color: 'var(--text-faint)' }}>({movie.release_year || movie.release_date?.split('-')[0]})</span>
                    )}
                  </Link>
                </TableCell>
                <TableCell className={cellCls}>{getSourceBadge(movie)}</TableCell>
                <TableCell className={cn('w-px px-2 whitespace-nowrap', cellCls)}>{movie.certification ? getCertBadge(movie.certification) : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                <TableCell className={cn('tabular-nums', cellCls)}>
                  {movie.release_date ? movie.release_date.split('-').reverse().join('/') : movie.release_year || '—'}
                </TableCell>
                <TableCell className={cellCls}>{movie.language || '—'}</TableCell>
                {showWtpCol && (
                  <TableCell className={cellCls}>
                    {movie.wtp_library
                      ? <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-xs">{movie.wtp_library}</Badge>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                )}
                {showLicensorCol && (
                  <TableCell className={cn('max-w-45 whitespace-normal', cellCls)} style={{ color: 'var(--text-faint)' }}>
                    <span className="block text-xs break-words">{getEffectiveLicensor(movie) || '—'}</span>
                  </TableCell>
                )}
                {activeCard === 'open_titles' && (
                  <TableCell className={cn('whitespace-nowrap text-xs', cellCls)}>
                    {movie.agreement_end_date ? (
                      <span style={{ color: new Date(movie.agreement_end_date) < new Date() ? 'var(--st-expired)' : 'var(--text-faint)' }}>
                        {movie.agreement_start_date ? movie.agreement_start_date.split('-').reverse().join('/') + ' → ' : ''}{movie.agreement_end_date.split('-').reverse().join('/')}
                      </span>
                    ) : movie.agreement_start_date ? (
                      <span style={{ color: 'var(--text-faint)' }}>{movie.agreement_start_date.split('-').reverse().join('/')} → ∞</span>
                    ) : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )


  if (fullPage) {
    return (
      <div className="flex flex-col h-full">
        {filtersBar}
        {tableEl}
        <DataExportDialog open={showExportDialog} onOpenChange={setShowExportDialog}
          data={exportData}
          fields={activeCard === 'expiring' ? EXPORT_FIELDS_EXPIRING : EXPORT_FIELDS} filename="satellite_dashboard" />
      </div>
    )
  }

  return (
    <Card className="glass-card">
      <div className="p-3.5 space-y-2.5">
        {/* Header */}
        <div className="px-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="dsp text-[17px] font-bold tracking-tight text-(--text)">{cardLabels[activeCard]}</h2>
            <p className="text-[12px] text-(--text-faint) mt-0.5">
              {activeCard === 'open_titles' && 'Movies without active satellite rights — available to exploit'}
              {activeCard === 'expiring' && 'Movies whose satellite rights are expiring in the selected period (stat shows current year)'}
              {activeCard === 'wtp' && 'World Television Premiere titles'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-red-500">
                {selectedIds.size} selected
              </span>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3 text-xs bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20 transition-colors" onClick={handleExportClick} disabled={exportLoading}>
              {exportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Export
            </Button>
            {!fullPage && (
              <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3 text-xs bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20 transition-colors" asChild>
                <Link href="/movies">Full Catalog <ChevronRight className="h-3 w-3" /></Link>
              </Button>
            )}
          </div>
        </div>
        {filtersBar}
        {tableEl}
      </div>
      <DataExportDialog open={showExportDialog} onOpenChange={setShowExportDialog}
        data={exportData}
        fields={activeCard === 'expiring' ? EXPORT_FIELDS_EXPIRING : EXPORT_FIELDS} filename="satellite_dashboard" />
    </Card>
  )
}
