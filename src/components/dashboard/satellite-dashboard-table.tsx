'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from '@/components/ui/calendar'
import { Search, ChevronLeft, ChevronRight, Download, Loader2, CalendarRange, X, CalendarIcon, Filter } from 'lucide-react'
import {
  getOpenTitlesForMode,
  getExpiringSatelliteTitles,
  getMoviesForDashboard,
  type MovieWithSatelliteRights,
} from '@/lib/api/dashboard'
import { useSortableTable } from '@/hooks/use-sortable-table'
import { SortableHeader } from '@/components/ui/sortable-header'
import type { MovieWithDetails } from '@/lib/types/database'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { DataExportDialog, type ExportFieldDef } from '@/components/import-export/data-export-dialog'

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
type SourceFilter = 'all' | 'home' | 'acquired'

interface SatelliteDashboardTableProps {
  activeCard: ActiveCard
  languages: string[]
  language: string
  onLanguageChange: (lang: string) => void
  expiryYear: string
  onExpiryYearChange: (year: string) => void
  expiryFrom: string
  expiryTo: string
  onExpiryFromChange: (v: string) => void
  onExpiryToChange: (v: string) => void
  yearOptions: number[]
  fullPage?: boolean
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
  languages,
  language,
  onLanguageChange,
  expiryYear,
  onExpiryYearChange,
  expiryFrom,
  expiryTo,
  onExpiryFromChange,
  onExpiryToChange,
  yearOptions,
  fullPage = false,
}: SatelliteDashboardTableProps) {
  const CERT_OPTIONS = ['U', 'UA', 'UA 7+', 'UA 13+', 'UA 16+', 'A', 'S']
  const pageSize = fullPage ? 50 : 10

  const [movies, setMovies] = useState<MovieWithSatelliteRights[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [certFilter, setCertFilter] = useState<string[]>([])
  const [certOpen, setCertOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('title_asc')
  const [openFrom, setOpenFrom] = useState('')
  const [openTo, setOpenTo] = useState('')
  const [wtpFilter, setWtpFilter] = useState<'all' | 'wtp' | 'wtp_bd' | 'library'>('all')
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportData, setExportData] = useState<Record<string, unknown>[]>([])
  const [exportLoading, setExportLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => { setCurrentPage(1) }, [activeCard, language, expiryFrom, expiryTo, sourceFilter, certFilter, openFrom, openTo, wtpFilter])

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setCurrentPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setSortBy(activeCard === 'expiring' ? 'expiry_asc' : 'title_asc')
    setOpenFrom('')
    setOpenTo('')
    setWtpFilter('all')
  }, [activeCard])

  const toggleCert = (cert: string) => {
    setCertFilter((prev) =>
      prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert]
    )
    setCurrentPage(1)
  }

  const fetchData = useCallback(async (forExport = false) => {
    if (!forExport) setIsLoading(true)
    try {
      const limit = forExport ? 10000 : pageSize
      const offset = forExport ? 0 : (currentPage - 1) * pageSize
      const safeSortBy = (sortBy === 'expiry_asc' || sortBy === 'expiry_desc') ? 'title_asc' : sortBy

      if (activeCard === 'open_titles') {
        const { data, count } = await getOpenTitlesForMode('satellite', {
          search: debouncedSearch || undefined,
          language: language || undefined,
          sourceFilter,
          sortBy: safeSortBy,
          certification: certFilter.length > 0 ? certFilter : undefined,
          openFrom: openFrom || undefined,
          openTo: openTo || undefined,
          wtpFilter: wtpFilter !== 'all' ? wtpFilter : undefined,
          limit,
          offset,
        })
        if (forExport) return data
        setMovies(data)
        setTotalCount(count)
      } else if (activeCard === 'expiring') {
        const { data, count } = await getExpiringSatelliteTitles({
          fromDate: expiryFrom || undefined,
          toDate: expiryTo || undefined,
          language: language || undefined,
          sourceFilter,
          search: debouncedSearch || undefined,
          sortBy,
          certification: certFilter.length > 0 ? certFilter : undefined,
          limit,
          offset,
        })
        if (forExport) return data
        setMovies(data)
        setTotalCount(count)
      } else {
        // WTP — server-side filtering with language, source, search, and pagination
        const { data, count } = await getMoviesForDashboard({
          category: 'wtp',
          search: debouncedSearch || undefined,
          language: language || undefined,
          sourceFilter,
          sortBy: safeSortBy,
          certification: certFilter.length > 0 ? certFilter : undefined,
          limit,
          offset,
        })
        if (forExport) return data as MovieWithSatelliteRights[]
        setMovies(data as MovieWithSatelliteRights[])
        setTotalCount(count)
      }
    } catch (error) {
      console.error('Error loading satellite table:', error)
    } finally {
      if (!forExport) setIsLoading(false)
    }
  }, [activeCard, debouncedSearch, language, sourceFilter, certFilter, expiryFrom, expiryTo, sortBy, currentPage, openFrom, openTo, wtpFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExportClick = useCallback(async () => {
    setExportLoading(true)
    try {
      const data = await fetchData(true)
      let preparedData: Record<string, unknown>[]
      if (activeCard === 'expiring') {
        const rows: Record<string, unknown>[] = []
        let idx = 1
        for (const movie of (data as MovieWithSatelliteRights[]) || []) {
          const rights = movie.satellite_rights_list || []
          if (rights.length === 0) {
            rows.push({ sl_no: idx++, title: movie.title, source: movie.source, certification: movie.certification, release_date: movie.release_date, language: (movie as any).language })
          } else {
            for (const right of rights) {
              const days = right.end_date ? Math.ceil((new Date(right.end_date).getTime() - Date.now()) / 86400000) : null
              rows.push({
                sl_no: idx++,
                title: movie.title,
                source: movie.source === 'home_production' ? 'Home' : 'Acquired',
                platform_name: right.platform_name || '',
                rights_type_name: right.rights_type_name || '',
                nature: right.nature || '',
                start_date: right.start_date || '',
                end_date: right.end_date || '',
                days_remaining: days !== null ? days : '',
                territory: right.territory || 'World',
                certification: movie.certification || '',
                release_date: (movie as any).release_date || '',
                language: (movie as any).language || '',
              })
            }
          }
        }
        preparedData = rows
      } else {
        preparedData = ((data as any[]) || []).map((row, idx) => ({ ...row, sl_no: idx + 1 }))
      }
      setExportData(preparedData)
      setShowExportDialog(true)
    } catch (error) {
      console.error('Error loading export data:', error)
    } finally {
      setExportLoading(false)
    }
  }, [fetchData, activeCard])

  const { sortedData, sortConfig, requestSort } = useSortableTable(movies)
  const totalPages = Math.ceil(totalCount / pageSize)

  const getSourceBadge = (source: string) =>
    source === 'home_production' ? (
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

  const showExpiryFilters = activeCard === 'expiring'
  const showWtpCol = activeCard === 'open_titles'
  // Expiring card: flat per-right rows (no expand/collapse)
  const flatExpiryRows = activeCard === 'expiring'
  const colSpan = flatExpiryRows ? 9 : showWtpCol ? 8 : 7

  // ── row / cell sizing based on mode ──
  const rowCls = fullPage ? 'border-slate-800/30 hover:bg-slate-800/30' : 'border-slate-800/30 hover:bg-slate-800/25'
  const cellCls = fullPage ? 'py-1 px-3 text-xs' : ''
  const headCls = fullPage ? 'py-1.5 px-3 text-xs' : 'text-xs font-medium'

  const inputCls = "h-9 bg-slate-800/40 border-slate-700/50 text-slate-200 hover:border-slate-600/70 focus-visible:border-slate-500/70 focus-visible:ring-slate-500/20 transition-colors"
  const selectTriggerCls = "h-9 bg-slate-800/40 border-slate-700/50 text-slate-300 hover:border-slate-600/70 hover:bg-slate-800/60 transition-colors text-xs"

  const filtersBar = (
    <div className={fullPage ? 'px-4 py-3 border-b border-slate-800/40 bg-slate-900/30' : 'rounded-lg border border-slate-800/40 bg-slate-900/30 p-3'}>
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-45 max-w-65">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search movies…" value={search} onChange={(e) => setSearch(e.target.value)}
            className={`pl-9 text-xs placeholder:text-slate-400 ${inputCls}`} />
        </div>

        {/* Source filter */}
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as SourceFilter); setCurrentPage(1) }}>
          <SelectTrigger className={`w-[140px] ${selectTriggerCls}`}>
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="home">Home Production</SelectItem>
            <SelectItem value="acquired">Acquired</SelectItem>
          </SelectContent>
        </Select>

        {/* Certification multi-select */}
        <Popover open={certOpen} onOpenChange={setCertOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm"
              className={`h-9 gap-1.5 text-xs font-normal bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600/70 transition-colors ${certFilter.length > 0 ? 'border-purple-500/60 text-purple-400 bg-purple-500/5' : 'text-slate-300'}`}>
              <Filter className="h-3 w-3 shrink-0" />
              {certFilter.length === 0
                ? 'Certification'
                : (certFilter.length > 0 && !certFilter.includes('A') && CERT_OPTIONS.filter(c => c !== 'A').every(c => certFilter.includes(c)))
                  ? 'Except A'
                  : certFilter.length === 1
                    ? certFilter[0]
                    : `${certFilter.length} selected`}
              {certFilter.length > 0 && (
                <span onClick={(e) => { e.stopPropagation(); setCertFilter([]); setCurrentPage(1) }}
                  className="ml-0.5 hover:text-red-400 transition-colors">
                  <X className="h-3 w-3" />
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2 bg-slate-900 border-slate-700/60 shadow-xl" align="start">
            <p className="text-xs font-semibold text-slate-400 px-1 pb-1.5 uppercase tracking-wide">Certification</p>
            <div className="border-b border-slate-800/60 mb-1.5 pb-1.5 space-y-0.5">
              <div className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-slate-800/60 cursor-pointer transition-colors"
                onClick={() => { setCertFilter([]); setCurrentPage(1) }}>
                <Checkbox checked={certFilter.length === 0} className="h-3.5 w-3.5" />
                <span className="text-xs text-slate-300">All</span>
              </div>
              <div className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-slate-800/60 cursor-pointer transition-colors"
                onClick={() => { setCertFilter(CERT_OPTIONS.filter(c => c !== 'A')); setCurrentPage(1) }}>
                <Checkbox
                  checked={certFilter.length > 0 && !certFilter.includes('A') && CERT_OPTIONS.filter(c => c !== 'A').every(c => certFilter.includes(c))}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-slate-300">Except A</span>
              </div>
            </div>
            {CERT_OPTIONS.map((cert) => (
              <div key={cert} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-slate-800/60 cursor-pointer transition-colors"
                onClick={() => toggleCert(cert)}>
                <Checkbox checked={certFilter.includes(cert)} className="h-3.5 w-3.5" />
                <span className="text-xs text-slate-300">{cert}</span>
              </div>
            ))}
          </PopoverContent>
        </Popover>

        {/* Language filter (only in non-fullPage — header has it in fullPage) */}
        {!fullPage && (
          <Select value={language || 'all'} onValueChange={(v) => onLanguageChange(v === 'all' ? '' : v)}>
            <SelectTrigger className={`w-[140px] ${selectTriggerCls}`}>
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              {languages.map((lang) => (
                <SelectItem key={lang} value={lang}>{lang}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Expiry year + date range */}
        {showExpiryFilters && (
          <>
            <Select value={expiryYear} onValueChange={onExpiryYearChange}>
              <SelectTrigger className={`w-[140px] ${selectTriggerCls}`}>
                <CalendarRange className="h-3 w-3 mr-1 text-slate-400 shrink-0" />
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

            <div className="flex items-center gap-1 bg-slate-800/40 border border-slate-700/50 rounded-md px-2 h-9 hover:border-slate-600/70 transition-colors">
              <span className="text-[10px] font-medium text-slate-400 uppercase px-1">From</span>
              <DateInput value={expiryFrom} onChange={onExpiryFromChange} />
              <span className="text-slate-700 px-1">|</span>
              <span className="text-[10px] font-medium text-slate-400 uppercase px-1">To</span>
              <DateInput value={expiryTo} onChange={onExpiryToChange} />
              {(expiryFrom || expiryTo) && (
                <button
                  onClick={(e) => { e.stopPropagation(); onExpiryFromChange(''); onExpiryToChange(''); onExpiryYearChange('all') }}
                  className="ml-1 p-0.5 text-slate-400 hover:text-red-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </>
        )}

        {/* Open titles filters: open date range + WTP */}
        {activeCard === 'open_titles' && (
          <>
            <div className="flex items-center gap-1 bg-slate-800/40 border border-slate-700/50 rounded-md px-2 h-9 hover:border-slate-600/70 transition-colors">
              <span className="text-[10px] font-medium text-slate-400 uppercase px-1">Open</span>
              <DateInput value={openFrom} onChange={(v) => { setOpenFrom(v); setCurrentPage(1) }} placeholder="From" />
              <span className="text-slate-700 px-1">|</span>
              <DateInput value={openTo} onChange={(v) => { setOpenTo(v); setCurrentPage(1) }} placeholder="To" />
              {(openFrom || openTo) && (
                <button onClick={() => { setOpenFrom(''); setOpenTo('') }}
                  className="ml-1 p-0.5 text-slate-400 hover:text-red-400 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <Select value={wtpFilter} onValueChange={(v) => { setWtpFilter(v as typeof wtpFilter); setCurrentPage(1) }}>
              <SelectTrigger className={`w-32.5 ${selectTriggerCls} ${wtpFilter !== 'all' ? 'border-violet-500/60 text-violet-400 bg-violet-500/5' : ''}`}>
                <SelectValue placeholder="WTP" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All WTP</SelectItem>
                <SelectItem value="wtp">WTP</SelectItem>
                <SelectItem value="wtp_bd">WTP/BD</SelectItem>
                <SelectItem value="library">Library</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}

        {/* Sort */}
        <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortOption); setCurrentPage(1) }}>
          <SelectTrigger className={`w-[180px] ${selectTriggerCls}`}>
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          {fullPage && (
            <Button variant="outline" size="sm" className="gap-1.5 h-9 px-3 text-xs bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-700/60 hover:border-slate-600/70 hover:text-slate-100 transition-colors" onClick={handleExportClick} disabled={exportLoading}>
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-700/50 text-slate-400 border border-slate-600/30">
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
    <div className={fullPage ? 'flex-1 overflow-auto' : 'rounded-lg border border-slate-800/50 overflow-hidden'}>
      <Table className={fullPage ? 'border-collapse' : ''}>
        <TableHeader className={fullPage ? 'sticky top-0 z-10' : ''}>
          <TableRow className={`border-slate-800/40 ${fullPage ? 'bg-slate-800/60 backdrop-blur-sm' : 'bg-slate-800/40'}`}>
            {flatExpiryRows ? (
              <>
                <TableHead className={headCls}>Movie</TableHead>
                <TableHead className={headCls}>Source</TableHead>
                <TableHead className={headCls}>Platform</TableHead>
                <TableHead className={headCls}>Type</TableHead>
                <TableHead className={headCls}>Nature</TableHead>
                <TableHead className={headCls}>Start Date</TableHead>
                <TableHead className={headCls}>Expiry</TableHead>
                <TableHead className={headCls}>Days</TableHead>
                <TableHead className={headCls}>Territory</TableHead>
                <TableHead className={`text-right ${headCls}`}>Actions</TableHead>
              </>
            ) : (
              <>
                <SortableHeader column="title" label="Title" currentSort={sortConfig} onSort={requestSort} className={headCls} />
                <SortableHeader column="source" label="Type" currentSort={sortConfig} onSort={requestSort} className={headCls} />
                <SortableHeader column="certification" label="Cert" currentSort={sortConfig} onSort={requestSort} className={headCls} />
                <SortableHeader column="release_date" label="Release" currentSort={sortConfig} onSort={requestSort} className={headCls} />
                <SortableHeader column="language" label="Language" currentSort={sortConfig} onSort={requestSort} className={headCls} />
                {showWtpCol && <TableHead className={headCls}>WTP Library</TableHead>}
                <TableHead className={`text-right ${headCls}`}>Actions</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            [...Array(fullPage ? 12 : 6)].map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={colSpan} className={cellCls}>
                  <div className={`bg-slate-800/50 rounded animate-pulse ${fullPage ? 'h-6' : 'h-9'}`} />
                </TableCell>
              </TableRow>
            ))
          ) : flatExpiryRows ? (
            flatRightRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                  No expiring rights found matching your filters
                </TableCell>
              </TableRow>
            ) : (
              flatRightRows.map(({ movie, right }) => (
                <TableRow
                  key={right.id}
                  className={cn('border-slate-800/30 hover:bg-slate-800/25 transition-colors', getUrgencyRowCls(right.end_date))}
                >
                  <TableCell className={cn('font-medium max-w-48', cellCls)}>
                    <Link href={`/movies/${movie.id}`} className="hover:text-primary transition-colors line-clamp-2">
                      {movie.title}
                    </Link>
                  </TableCell>
                  <TableCell className={cellCls}>{getSourceBadge(movie.source)}</TableCell>
                  <TableCell className={cn('whitespace-nowrap', cellCls)}>
                    {right.platform_name || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={cellCls}>
                    {right.rights_type_name ? (
                      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs whitespace-nowrap">
                        {right.rights_type_name}
                      </Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className={cellCls}>
                    {right.nature ? (
                      <Badge variant="outline" className={cn('text-xs whitespace-nowrap',
                        right.nature === 'exclusive'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          : 'bg-slate-700/40 text-slate-400 border-slate-600/30'
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
                  <TableCell className={cn('text-right', cellCls)}>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 hover:text-primary" asChild>
                      <Link href={`/movies/${movie.id}`}><span className="text-xs">View</span><ChevronRight className="h-3 w-3" /></Link>
                    </Button>
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
              <TableRow key={movie.id} className={cn(rowCls, fullPage && idx % 2 === 0 ? 'bg-slate-900/30' : '')}>
                <TableCell className={cn('font-medium max-w-55', cellCls)}>
                  <Link href={`/movies/${movie.id}`} className="hover:text-primary transition-colors line-clamp-1">
                    {movie.title}
                  </Link>
                </TableCell>
                <TableCell className={cellCls}>{getSourceBadge(movie.source)}</TableCell>
                <TableCell className={cellCls}>{movie.certification ? getCertBadge(movie.certification) : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
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
                <TableCell className={cn('text-right', cellCls)}>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 hover:text-primary" asChild>
                    <Link href={`/movies/${movie.id}`}><span className="text-xs">View</span><ChevronRight className="h-3 w-3" /></Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )

  const paginationEl = totalCount > pageSize ? (
    <div className={`flex items-center justify-between ${fullPage ? 'px-4 py-2 border-t border-slate-800/40 bg-slate-950/30 shrink-0' : 'pt-1'}`}>
      <p className="text-xs text-muted-foreground">
        {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
      </p>
      <div className="flex gap-1 items-center">
        <Button variant="outline" size="sm" className="h-7 px-2 border-slate-800/60 bg-slate-950/50 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {(() => {
          const pages: (number | 'ellipsis')[] = []
          if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i)
          } else {
            pages.push(1)
            if (currentPage > 3) pages.push('ellipsis')
            const start = Math.max(2, currentPage - 1)
            const end = Math.min(totalPages - 1, currentPage + 1)
            for (let i = start; i <= end; i++) pages.push(i)
            if (currentPage < totalPages - 2) pages.push('ellipsis')
            pages.push(totalPages)
          }
          return pages.map((p, idx) =>
            p === 'ellipsis' ? (
              <span key={`e${idx}`} className="w-7 h-7 flex items-center justify-center text-xs text-slate-400">…</span>
            ) : (
              <Button key={p} variant="outline" size="sm"
                onClick={() => setCurrentPage(p)}
                className={cn('w-7 h-7 text-xs border-slate-800/60 transition-colors',
                  currentPage === p
                    ? 'bg-slate-700 text-slate-100 border-slate-600 shadow-sm'
                    : 'bg-slate-950/50 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                )}>
                {p}
              </Button>
            )
          )
        })()}
        <Button variant="outline" size="sm" className="h-7 px-2 border-slate-800/60 bg-slate-950/50 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  ) : null

  if (fullPage) {
    return (
      <div className="flex flex-col h-full">
        {filtersBar}
        {tableEl}
        {paginationEl}
        <DataExportDialog open={showExportDialog} onOpenChange={setShowExportDialog}
          data={exportData}
          fields={activeCard === 'expiring' ? EXPORT_FIELDS_EXPIRING : EXPORT_FIELDS} filename="satellite_dashboard" />
      </div>
    )
  }

  return (
    <Card className="glass-card">
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="px-1 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-100">{cardLabels[activeCard]}</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {activeCard === 'open_titles' && 'Movies without active satellite rights — available to exploit'}
              {activeCard === 'expiring' && 'Movies whose satellite rights are expiring in the selected period (stat shows current year)'}
              {activeCard === 'wtp' && 'World Television Premiere titles'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3 text-xs bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-700/60 hover:border-slate-600/70 hover:text-slate-100 transition-colors" onClick={handleExportClick} disabled={exportLoading}>
              {exportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Export
            </Button>
            {!fullPage && (
              <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3 text-xs bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-700/60 hover:border-slate-600/70 hover:text-slate-100 transition-colors" asChild>
                <Link href="/movies">Full Catalog <ChevronRight className="h-3 w-3" /></Link>
              </Button>
            )}
          </div>
        </div>
        {filtersBar}
        {tableEl}
        {paginationEl}
      </div>
      <DataExportDialog open={showExportDialog} onOpenChange={setShowExportDialog}
        data={exportData}
        fields={activeCard === 'expiring' ? EXPORT_FIELDS_EXPIRING : EXPORT_FIELDS} filename="satellite_dashboard" />
    </Card>
  )
}
