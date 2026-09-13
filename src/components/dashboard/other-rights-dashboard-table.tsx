'use client'

import { ActiveFilterChips, type ActiveFilterChip } from '@/components/dashboard/active-filter-chips'
import { DataExportDialog, type ExportFieldDef } from '@/components/import-export/data-export-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMultiSelectFilterState } from '@/hooks/use-multi-select-filter-state'
import {
  getActiveOtherRightsTitles,
  getExpiringOtherRightsTitles,
  getOpenOtherRightsTitles,
  type MovieWithOtherRights,
  type OtherRight,
} from '@/lib/api/dashboard'
import type { MovieWithDetails } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { CalendarIcon, CalendarRange, ChevronDown, ChevronRight, ChevronUp, Download, Loader2, Search, X } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'

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
    const iso = date.toLocaleDateString('en-CA')
    onChange(iso)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-sm outline-none text-foreground min-w-27.5">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className={value ? 'text-foreground' : 'text-muted-foreground/60'}>
            {value ? isoToDisplay(value) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarPicker
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

type ActiveCard = 'open_titles' | 'expiring' | 'active'
type SortOption = 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc' | 'expiry_asc' | 'expiry_desc'
type SourceFilter = 'all' | 'home' | 'acquired' | 'bangladeshi'

interface OtherRightsDashboardTableProps {
  activeCard: ActiveCard
  language: string[]
  /**
   * Language options + setter, so the selector can live in this filter bar rather
   * than in the page header. Optional — omit and no selector renders.
   */
  languageOptions?: string[]
  onLanguageChange?: (next: string[]) => void
  totalLanguageCount: number
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
}

const cardLabels: Record<ActiveCard, string> = {
  open_titles: 'Open Other Rights Titles',
  expiring: 'Expiring Other Rights',
  active: 'Active Other Rights',
}

const cardDescriptions: Record<ActiveCard, string> = {
  open_titles: 'Movies without active Airborne/Ship/Other rights — available to license',
  expiring: 'Movies whose Airborne/Ship/Other rights are expiring in the selected period',
  active: 'Movies with currently active Airborne/Ship/Other rights',
}

const EXPORT_FIELDS_OPEN: ExportFieldDef[] = [
  { key: 'sl_no', label: 'Sl No' },
  { key: 'title', label: 'Title' },
  { key: 'cast_names', label: 'Cast' },
  { key: 'director_names', label: 'Director' },
  { key: 'release_date', label: 'Release Date' },
  { key: 'certification', label: 'Censor' },
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
  { key: 'right_type', label: 'Type' },
  { key: 'nature', label: 'Nature' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'end_date', label: 'Expiry Date' },
  { key: 'days_remaining', label: 'Days Remaining' },
  { key: 'territory', label: 'Territory' },
  { key: 'certification', label: 'Censor' },
  { key: 'release_date', label: 'Release Date' },
  { key: 'language', label: 'Language' },
]

const EXPORT_FIELDS_ACTIVE: ExportFieldDef[] = [
  { key: 'sl_no', label: 'Sl No' },
  { key: 'title', label: 'Title' },
  { key: 'cast_names', label: 'Cast' },
  { key: 'director_names', label: 'Director' },
  { key: 'release_date', label: 'Release Date' },
  { key: 'certification', label: 'Censor' },
  { key: 'source', label: 'Source' },
]

export function OtherRightsDashboardTable({
  activeCard,
  language,
  languageOptions,
  onLanguageChange,
  totalLanguageCount,
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
}: OtherRightsDashboardTableProps) {
  const CERT_OPTIONS = ['U', 'UA', 'UA 7+', 'UA 13+', 'UA 16+', 'A', 'S']

  const [movies, setMovies] = useState<(MovieWithDetails | MovieWithOtherRights)[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [certFilter, setCertFilter] = useMultiSelectFilterState(CERT_OPTIONS)
  const [sortBy, setSortBy] = useState<SortOption>('title_asc')
  const [agreementEndBy, setAgreementEndBy] = useState('')
  const [bangladeshiOnly, setBangladeshiOnly] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportData, setExportData] = useState<Record<string, unknown>[]>([])
  const [exportLoading, setExportLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  const getEffectiveLicensor = (movie: any) => movie.source === 'home_production' ? 'SVF' : (movie.assignor_licensor || '')

  const licensorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const m of movies as any[]) {
      const v = getEffectiveLicensor(m)
      if (v) set.add(v)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [movies])

  const [licensorFilter, setLicensorFilter] = useMultiSelectFilterState(licensorOptions)

  useEffect(() => { setSelectedIds(new Set()) }, [activeCard, language, expiryFrom, expiryTo, openFrom, openTo, sourceFilter, licensorFilter, certFilter, bangladeshiOnly, agreementEndBy])

  const filteredMovies = movies.filter((m: any) =>
    licensorFilter.length >= licensorOptions.length || licensorFilter.includes(getEffectiveLicensor(m))
  ).filter((m: any) => {
    if (!agreementEndBy) return true
    // Acquired-only: home productions have no agreement_end_date, so this filter excludes them.
    if (m.source !== 'acquired' || !m.agreement_end_date) return false
    return m.agreement_end_date <= agreementEndBy
  })

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setSortBy(activeCard === 'expiring' ? 'expiry_asc' : 'title_asc')
    setAgreementEndBy('')
    setExpandedRows(new Set())
  }, [activeCard])

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fetchData = useCallback(async (forExport = false): Promise<any[] | undefined> => {
    if (!forExport) setIsLoading(true)
    try {
      const limit = 10000
      const offset = 0
      const safeSortBy = (sortBy === 'expiry_asc' || sortBy === 'expiry_desc')
        ? 'title_asc'
        : sortBy as 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc'

      // A filter is only sent to the server when it's a genuine narrowing (partial selection or
      // fully cleared). When every known option is checked, we pass undefined — the same as "no
      // filter" — since hardcoded/fetched option lists aren't guaranteed to cover every value
      // present in the data (nulls, blanks, legacy values); sending the full array would
      // silently exclude those rows via `.in()`.
      const languageParam = language.length < totalLanguageCount ? language : undefined
      const certParam = certFilter.length < CERT_OPTIONS.length ? certFilter : undefined

      if (activeCard === 'open_titles') {
        const { data } = await getOpenOtherRightsTitles({
          search: debouncedSearch || undefined,
          language: languageParam,
          sourceFilter,
          certification: certParam,
          sortBy: safeSortBy,
          bangladeshiOnly: bangladeshiOnly || undefined,
          openFrom: openFrom || undefined,
          openTo: openTo || undefined,
          limit,
          offset,
        })
        if (forExport) return data
        setMovies(data)
      } else if (activeCard === 'expiring') {
        const { data } = await getExpiringOtherRightsTitles({
          fromDate: expiryFrom || undefined,
          toDate: expiryTo || undefined,
          language: languageParam,
          sourceFilter,
          search: debouncedSearch || undefined,
          certification: certParam,
          sortBy,
          limit,
          offset,
        })
        if (forExport) return data
        setMovies(data)
      } else {
        // active
        const { data } = await getActiveOtherRightsTitles({
          search: debouncedSearch || undefined,
          language: languageParam,
          sourceFilter,
          certification: certParam,
          sortBy: safeSortBy,
          limit,
          offset,
        })
        if (forExport) return data
        setMovies(data)
      }
    } catch (error) {
      console.error('Error loading other-rights table:', error)
    } finally {
      if (!forExport) setIsLoading(false)
    }
  }, [activeCard, debouncedSearch, language, totalLanguageCount, sourceFilter, certFilter, expiryFrom, expiryTo, openFrom, openTo, sortBy, bangladeshiOnly])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleSelectAll = () => {
    const ids = filteredMovies.map((m: any) => m.id)
    setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids))
  }

  const handleExportClick = useCallback(async () => {
    setExportLoading(true)
    try {
      const rawData = await fetchData(true)
      const data = (rawData as any[]).filter((m: any) => {
        if (licensorFilter.length < licensorOptions.length && !licensorFilter.includes(getEffectiveLicensor(m))) return false
        if (agreementEndBy) {
          if (m.source !== 'acquired' || !m.agreement_end_date) return false
          if (m.agreement_end_date > agreementEndBy) return false
        }
        return true
      })
      let preparedData: Record<string, unknown>[]
      if (activeCard === 'expiring') {
        const rows: Record<string, unknown>[] = []
        let idx = 1
        const sourceData = selectedIds.size > 0
          ? (data as MovieWithOtherRights[]).filter(m =>
            (m.other_rights_list || []).some(r => selectedIds.has(r.id))
          )
          : (data as MovieWithOtherRights[])
        for (const movie of sourceData || []) {
          const rights = movie.other_rights_list || []
          if (rights.length === 0) {
            rows.push({ sl_no: idx++, title: movie.title, source: movie.source, certification: (movie as any).certification, release_date: (movie as any).release_date || (movie as any).release_year || '', language: (movie as any).language })
          } else {
            for (const right of rights) {
              const days = right.end_date ? Math.ceil((new Date(right.end_date).getTime() - Date.now()) / 86400000) : null
              rows.push({
                sl_no: idx++,
                title: movie.title,
                source: movie.source === 'home_production' ? 'Home' : 'Acquired',
                right_type: right.right_type || '',
                nature: right.nature || '',
                start_date: right.start_date || '',
                end_date: right.end_date || '',
                days_remaining: days !== null ? days : '',
                territory: right.territory || 'World',
                certification: (movie as any).certification || '',
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
          source: row.source === 'home_production' ? 'Home' : 'Acquired',
          assignor_licensor: row.source === 'home_production' ? '' : (row.assignor_licensor || ''),
          licensee: row.source === 'home_production' ? '' : (row.licensee || ''),
          agreement_start_date: row.source === 'home_production' ? '' : (row.agreement_start_date || ''),
          agreement_end_date: row.source === 'home_production' ? '' : (row.agreement_end_date || ''),
          sl_no: idx + 1,
        })) as Record<string, unknown>[]
      }
      setExportData(preparedData)
      setShowExportDialog(true)
    } catch (error) {
      console.error('Error loading export data:', error)
    } finally {
      setExportLoading(false)
    }
  }, [fetchData, activeCard, selectedIds, licensorFilter, agreementEndBy])

  const getSourceBadge = (source: string) =>
    source === 'home_production' ? (
      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">Home</Badge>
    ) : (
      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">Acquired</Badge>
    )

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'title_asc', label: 'A-Z (Title)' },
    { value: 'title_desc', label: 'Z-A (Title)' },
    { value: 'release_date_desc', label: 'Newest Release' },
    { value: 'release_date_asc', label: 'Oldest Release' },
    ...(activeCard === 'expiring' ? [
      { value: 'expiry_asc' as SortOption, label: 'Expiry (Soonest)' },
      { value: 'expiry_desc' as SortOption, label: 'Expiry (Latest)' },
    ] : []),
  ]

  const hasSubRows = activeCard === 'active'
  const showLicensorCol = activeCard === 'open_titles' && (sourceFilter === 'acquired' || (licensorFilter.length > 0 && licensorFilter.length < licensorOptions.length))
  const colCount = hasSubRows ? 6 : showLicensorCol ? 8 : 7

  const exportFields = activeCard === 'open_titles' ? EXPORT_FIELDS_OPEN
    : activeCard === 'expiring' ? EXPORT_FIELDS_EXPIRING
      : EXPORT_FIELDS_ACTIVE

  const cellCls = ''
  const headCls = ''

  const inputCls = "h-9 rounded-[8px] bg-(--filter-panel-bg) border-(--filter-border) text-(--text) hover:border-(--filter-border-hover) focus-visible:border-(--filter-border-hover) focus-visible:ring-0 transition-colors"
  const labelCls = "text-[11px] font-medium uppercase tracking-[.06em] text-(--filter-label)"
  const selectTriggerCls = "h-9 rounded-[8px] bg-(--filter-panel-bg) border-(--filter-border) text-(--text) hover:border-(--filter-border-hover) focus-visible:border-(--filter-border-hover) focus-visible:ring-0 transition-colors text-sm"

  // Chips describe only genuine narrowing: a filter with every option selected is
  // the same as no filter, so it must not appear as "active".
  const activeChips: ActiveFilterChip[] = []
  if (debouncedSearch) activeChips.push({ key: 'search', label: 'Search', value: debouncedSearch, onClear: () => setSearch('') })
  if (sourceFilter !== 'all') activeChips.push({
    key: 'source', label: 'Source',
    value: sourceFilter === 'home' ? 'Home Production' : sourceFilter === 'acquired' ? 'Acquired' : 'Bangladesh',
    onClear: () => setSourceFilter('all'),
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
    onClear: () => onLanguageChange(languageOptions),
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
  if (agreementEndBy) activeChips.push({
    key: 'agmt', label: 'Agreement ends by', value: agreementEndBy,
    onClear: () => setAgreementEndBy(''),
  })
  if (bangladeshiOnly) activeChips.push({
    key: 'bd', label: 'Bangladesh', value: 'Only',
    onClear: () => setBangladeshiOnly(false),
  })

  const clearAllFilters = () => {
    setSearch('')
    setSourceFilter('all')
    setLicensorFilter(licensorOptions)
    setCertFilter(CERT_OPTIONS)
    if (languageOptions && onLanguageChange) onLanguageChange(languageOptions)
    onOpenFromChange(''); onOpenToChange('')
    onExpiryFromChange(''); onExpiryToChange(''); onExpiryYearChange('all')
    setAgreementEndBy('')
    setBangladeshiOnly(false)
  }

  const filtersBar = (
    <div className={fullPage
      ? 'px-4 py-3 bg-(--filter-panel-bg) border-b border-(--filter-border)'
      : 'rounded-[14px] border border-(--filter-border) bg-(--filter-panel-bg) p-3.5'}>
      {/* One labelled grid — search is the first cell rather than its own full-width
          row, so the block is a row shorter and the table sits higher. */}
      <div className="grid gap-x-3 gap-y-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {/* Search */}
        <div className="flex flex-col gap-1 min-w-0 sm:col-span-2">
          <span className={labelCls}>Search</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--filter-label)" />
            <Input placeholder="Title or production number…" value={search} onChange={(e) => setSearch(e.target.value)}
              className={`h-9 rounded-[8px] pl-9 text-sm placeholder:text-(--filter-label) bg-(--filter-panel-bg) border-(--filter-border) text-(--text) hover:border-(--filter-border-hover) focus-visible:border-(--filter-border-hover) focus-visible:ring-0 transition-colors`} />
          </div>
        </div>
        {/* Source */}
        <div className="flex flex-col gap-1 min-w-0">
          <span className={labelCls}>Source</span>
          <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as SourceFilter) }}>
            <SelectTrigger className={`w-full ${selectTriggerCls}`}>
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="home">Home Production</SelectItem>
              <SelectItem value="acquired">Acquired</SelectItem>
              <SelectItem value="bangladeshi">Bangladesh</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Licensor */}
        <div className="flex flex-col gap-1 min-w-0">
          <span className={labelCls}>Licensor</span>
          <MultiSelectFilter
            label="Licensor"
            options={licensorOptions}
            value={licensorFilter}
            onChange={setLicensorFilter}
            searchable
            accent="blue"
            triggerWidth="w-full"
          />
        </div>

        {/* Certification */}
        <div className="flex flex-col gap-1 min-w-0">
          <span className={labelCls}>Certification</span>
          <MultiSelectFilter
            label="Certification"
            options={CERT_OPTIONS}
            value={certFilter}
            onChange={setCertFilter}
            accent="blue"
            triggerWidth="w-full"
            extraPresetRows={[{
              key: 'except-a',
              label: 'Except A',
              isActive: (v) => v.length > 0 && !v.includes('A') && CERT_OPTIONS.filter(c => c !== 'A').every(c => v.includes(c)),
              onSelect: () => setCertFilter(CERT_OPTIONS.filter(c => c !== 'A')),
            }]}
          />
        </div>

        {/* Language */}
        {languageOptions && onLanguageChange && (
          <div className="flex flex-col gap-1 min-w-0">
            <span className={labelCls}>Language</span>
            <MultiSelectFilter
              label="Language"
              options={languageOptions}
              value={language}
              onChange={onLanguageChange}
              triggerWidth="w-full"
            />
          </div>
        )}

        {/* Expiry year + date range */}
        {activeCard === 'expiring' && (
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

        {/* Open titles filters: date range + agreement end + bangladesh */}
        {activeCard === 'open_titles' && (
          <>
            <div className="flex flex-col gap-1 min-w-0 sm:col-span-2">
              <span className={labelCls}>Rights window</span>
              <div className="flex items-center gap-1 min-w-0 bg-(--filter-panel-bg) border border-(--filter-border) rounded-[8px] px-3 h-9 hover:border-(--filter-border-hover) transition-colors [&_input]:min-w-0 [&_input]:flex-1">
                  <DateInput value={openFrom} onChange={onOpenFromChange} />
                <span className="text-(--filter-label) text-[10px] font-medium uppercase px-0.5">to</span>
                  <DateInput value={openTo} onChange={onOpenToChange} />
                {(openFrom || openTo) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenFromChange(''); onOpenToChange('') }}
                    className="ml-1 p-0.5 text-(--text-faint) hover:text-red-400 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <span className={labelCls}>Agreement ends by</span>
              <div className={`flex items-center gap-1 bg-(--bg-raise) border rounded-[8px] px-3 h-9 transition-colors ${agreementEndBy ? 'border-amber-500/60' : 'border-(--svf-border-strong) hover:border-(--svf-border-strong)'}`}>
                <DateInput value={agreementEndBy} onChange={setAgreementEndBy} />
                {agreementEndBy && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setAgreementEndBy('') }}
                    className="ml-1 p-0.5 text-(--text-faint) hover:text-red-400 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <label className={cn(
              'self-end flex items-center gap-1.5 h-9 px-3 rounded-[8px] border transition-colors cursor-pointer',
              bangladeshiOnly ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-(--svf-border-strong) bg-(--bg-raise) hover:border-(--svf-border-strong)'
            )}>
              <Checkbox checked={bangladeshiOnly} onCheckedChange={(v) => setBangladeshiOnly(v === true)} className="h-3.5 w-3.5" />
              <span className={cn('text-xs', bangladeshiOnly ? 'text-emerald-400' : 'text-(--text)')}>Bangladesh</span>
            </label>
          </>
        )}

        {/* Active rights filters: agreement end-by date */}
        {activeCard === 'active' && (
          <div className={`flex items-center gap-1 bg-(--bg-raise) border rounded-[8px] px-3 h-9 transition-colors ${agreementEndBy ? 'border-amber-500/60' : 'border-(--svf-border) hover:border-(--svf-border-strong)'}`}>
            <span className="text-[10px] font-medium text-(--text-faint) uppercase px-1">Agmt End By</span>
            <DateInput value={agreementEndBy} onChange={setAgreementEndBy} />
            {agreementEndBy && (
              <button
                onClick={(e) => { e.stopPropagation(); setAgreementEndBy('') }}
                className="ml-1 p-0.5 text-(--text-faint) hover:text-red-400 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

      </div>

      <ActiveFilterChips chips={activeChips} onClearAll={clearAllFilters} />

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

  // Expiring card: flatten to one row per Other/Airborne/Ship right
  const flatExpiryRows = activeCard === 'expiring'
  const flatRightRows: Array<{ movie: any; right: OtherRight }> = flatExpiryRows
    ? filteredMovies.flatMap((movie: any) =>
      ((movie as MovieWithOtherRights).other_rights_list || []).map((right) => ({ movie, right }))
    )
    : []

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
                    onCheckedChange={() => {
                      const ids = flatRightRows.map(({ right }) => right.id)
                      setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids))
                    }}
                  />
                </TableHead>
                <TableHead className={headCls}>Movie</TableHead>
                <TableHead className={headCls}>Source</TableHead>
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
                    checked={filteredMovies.length > 0 && selectedIds.size === filteredMovies.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                {hasSubRows && <TableHead className={cn('w-8', headCls)} />}
                <TableHead className={headCls}>Title</TableHead>
                <TableHead className={headCls}>Source</TableHead>
                <TableHead className={headCls}>Cert</TableHead>
                <TableHead className={headCls}>Release</TableHead>
                <TableHead className={headCls}>Language</TableHead>
                {showLicensorCol && <TableHead className={headCls}>Licensor</TableHead>}
                {activeCard === 'open_titles' && <TableHead className={headCls}>Agreement</TableHead>}
                {activeCard === 'active' && <TableHead className={headCls}>Rights Count</TableHead>}
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            [...Array(fullPage ? 14 : 6)].map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={colCount} className={cellCls}>
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
                  <TableCell className={cn('font-medium max-w-48', cellCls)}>
                    <Link href={`/movies/${movie.id}`} title={movie.title} className="hover:text-primary transition-colors line-clamp-2">
                      {movie.title}
                      {(movie.release_year || movie.release_date?.split('-')[0]) && (
                        <span className="font-normal ml-1" style={{ color: 'var(--text-faint)' }}>({movie.release_year || movie.release_date?.split('-')[0]})</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className={cellCls}>{getSourceBadge(movie.source)}</TableCell>
                  <TableCell className={cellCls}>
                    {right.right_type ? (
                      <Badge variant="outline" className="bg-(--bg-raise)/60 text-(--text-faint) border-(--svf-border) text-xs whitespace-nowrap">
                        {right.right_type}
                      </Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className={cellCls}>
                    {right.nature ? (
                      <Badge variant="outline" className="bg-(--bg-raise) text-(--text-faint) border-(--svf-border-strong) text-xs whitespace-nowrap">
                        {right.nature}
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
          ) : filteredMovies.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="text-center py-10 text-muted-foreground text-sm">
                No movies found matching your filters
              </TableCell>
            </TableRow>
          ) : (
            filteredMovies.map((movie: any, idx: number) => {
              const isExpanded = expandedRows.has(movie.id)
              const otherRights: OtherRight[] = (movie as MovieWithOtherRights).other_rights_list || []
              return (
                <Fragment key={movie.id}>
                  <TableRow
                    className={cn(
                      'border-(--svf-border)/30 hover:bg-(--hover) transition-colors',
                      hasSubRows && otherRights.length > 0 && 'cursor-pointer',
                      fullPage && idx % 2 === 0 && 'bg-(--panel-solid)/30',
                      selectedIds.has(movie.id) && 'bg-red-500/5',
                    )}
                    onClick={() => hasSubRows && otherRights.length > 0 && toggleRow(movie.id)}
                  >
                    <TableCell className={cn('pl-4 w-10', cellCls)} onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(movie.id)} onCheckedChange={() => toggleSelect(movie.id)} />
                    </TableCell>
                    {hasSubRows && (
                      <TableCell className={cn('w-8', cellCls)}>
                        {otherRights.length > 0 ? (
                          <div className="flex items-center justify-center h-5 w-5 rounded hover:bg-muted/50">
                            {isExpanded
                              ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                              : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                          </div>
                        ) : <div className="w-5" />}
                      </TableCell>
                    )}
                    <TableCell className={cn('font-medium max-w-50', cellCls)}>
                      <Link href={`/movies/${movie.id}`} title={movie.title} className="hover:text-primary transition-colors line-clamp-1" onClick={(e) => e.stopPropagation()}>
                        {movie.title}
                        {(movie.release_year || movie.release_date?.split('-')[0]) && (
                          <span className="font-normal ml-1" style={{ color: 'var(--text-faint)' }}>({movie.release_year || movie.release_date?.split('-')[0]})</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className={cellCls} onClick={(e) => e.stopPropagation()}>{getSourceBadge(movie.source)}</TableCell>
                    <TableCell className={cn('text-muted-foreground', cellCls)}>{movie.certification || '—'}</TableCell>
                    <TableCell className={cn('tabular-nums', cellCls)}>
                      {movie.release_date ? movie.release_date.split('-').reverse().join('/') : movie.release_year || '—'}
                    </TableCell>
                    <TableCell className={cellCls}>{movie.language || '—'}</TableCell>
                    {showLicensorCol && (
                      <TableCell className={cn('max-w-35', cellCls)} style={{ color: 'var(--text-faint)' }} onClick={(e) => e.stopPropagation()}>
                        <span className="line-clamp-1 text-xs" title={getEffectiveLicensor(movie) || undefined}>{getEffectiveLicensor(movie) || '—'}</span>
                      </TableCell>
                    )}
                    {activeCard === 'open_titles' && (
                      <TableCell className={cn('whitespace-nowrap text-xs', cellCls)} onClick={(e) => e.stopPropagation()}>
                        {movie.agreement_end_date ? (
                          <span style={{ color: new Date(movie.agreement_end_date) < new Date() ? 'var(--st-expired)' : 'var(--text-faint)' }}>
                            {movie.agreement_start_date ? movie.agreement_start_date.split('-').reverse().join('/') + ' → ' : ''}{movie.agreement_end_date.split('-').reverse().join('/')}
                          </span>
                        ) : movie.agreement_start_date ? (
                          <span style={{ color: 'var(--text-faint)' }}>{movie.agreement_start_date.split('-').reverse().join('/')} → ∞</span>
                        ) : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </TableCell>
                    )}
                    {activeCard === 'active' && (
                      <TableCell className={cellCls}>
                        <Badge variant="outline" className="bg-(--bg-raise)/60 text-(--text-faint) border-(--svf-border) text-xs">
                          {otherRights.length} right{otherRights.length !== 1 ? 's' : ''}
                        </Badge>
                      </TableCell>
                    )}
                  </TableRow>
                  {hasSubRows && isExpanded && otherRights.length > 0 && (
                    <TableRow key={`${movie.id}-expanded`} className="bg-(--panel-solid)/50 border-(--svf-border)/30">
                      <TableCell colSpan={colCount} className="p-0">
                        <div className="px-8 py-2 space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            Other Rights Details
                          </p>
                          <div className="grid gap-1.5">
                            {otherRights.map((right) => (
                              <div key={right.id} className="flex flex-wrap items-center gap-3 bg-(--bg-deep)/50 border border-(--svf-border)/40 rounded px-3 py-1.5">
                                {right.right_type && (
                                  <Badge variant="outline" className="bg-(--bg-raise)/60 text-(--text-faint) border-(--svf-border) text-xs shrink-0">
                                    {right.right_type}
                                  </Badge>
                                )}
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <span className="font-mono">{right.start_date || '—'}</span>
                                  <span>→</span>
                                  <span className={cn('font-mono', right.end_date && new Date(right.end_date) < new Date() ? 'text-red-400' : '')}>
                                    {right.end_date || '—'}
                                  </span>
                                </div>
                                {right.nature && <span className="text-xs text-muted-foreground/70">{right.nature}</span>}
                                {right.territory && <span className="text-xs text-muted-foreground/70">🌍 {right.territory}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })
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
        <DataExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          data={exportData}
          fields={exportFields}
          filename="other_rights_dashboard"
        />
      </div>
    )
  }

  return (
    <Card className="glass-card">
      <div className="p-3.5 space-y-2.5">
        <div className="px-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="dsp text-[17px] font-bold tracking-tight text-(--text)">{cardLabels[activeCard]}</h2>
            <p className="text-[12px] text-(--text-faint) mt-0.5">{cardDescriptions[activeCard]}</p>
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
      <DataExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        data={exportData}
        fields={exportFields}
        filename="other_rights_dashboard"
      />
    </Card>
  )
}
