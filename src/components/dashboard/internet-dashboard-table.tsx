'use client'

import { DataExportDialog, type ExportFieldDef } from '@/components/import-export/data-export-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  getActiveInternetTitles,
  getExpiringInternetTitles,
  getOpenTitlesForMode,
  type InternetRight,
  type MovieWithInternetRights,
} from '@/lib/api/dashboard'
import type { MovieWithDetails } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import {
  Calendar,
  CalendarIcon,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Filter,
  Globe,
  Loader2,
  Monitor,
  Search,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { Fragment, useCallback, useEffect, useState } from 'react'

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

interface InternetDashboardTableProps {
  activeCard: ActiveCard
  language: string
  expiryYear: string
  onExpiryYearChange: (year: string) => void
  expiryFrom: string
  expiryTo: string
  onExpiryFromChange: (v: string) => void
  onExpiryToChange: (v: string) => void
  yearOptions: number[]
  fullPage?: boolean
}

const cardLabels: Record<ActiveCard, string> = {
  open_titles: 'Open Internet Titles',
  expiring: 'Expiring Internet Rights',
  active: 'Active Internet Rights',
}

const cardDescriptions: Record<ActiveCard, string> = {
  open_titles: 'Movies without active internet/SVOD rights — available to license',
  expiring: 'Movies whose internet rights are expiring in the selected period',
  active: 'Movies with currently active internet/SVOD rights',
}

const EXPORT_FIELDS_OPEN: ExportFieldDef[] = [
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

const EXPORT_FIELDS_ACTIVE: ExportFieldDef[] = [
  { key: 'sl_no', label: 'Sl No' },
  { key: 'title', label: 'Title' },
  { key: 'cast_names', label: 'Cast' },
  { key: 'director_names', label: 'Director' },
  { key: 'release_date', label: 'Release Date' },
  { key: 'trailer_link', label: 'YT Trailer Link' },
  { key: 'certification', label: 'Censor' },
  { key: 'wtp_library', label: 'WTP/Library' },
]

export function InternetDashboardTable({
  activeCard,
  language,
  expiryYear,
  onExpiryYearChange,
  expiryFrom,
  expiryTo,
  onExpiryFromChange,
  onExpiryToChange,
  yearOptions,
  fullPage = false,
}: InternetDashboardTableProps) {
  const CERT_OPTIONS = ['U', 'UA', 'UA 7+', 'UA 13+', 'UA 16+', 'A', 'S']

  const [movies, setMovies] = useState<(MovieWithDetails | MovieWithInternetRights)[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [certFilter, setCertFilter] = useState<string[]>([])
  const [certOpen, setCertOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('title_asc')
  const [wtpFilter, setWtpFilter] = useState<'all' | 'wtp' | 'wtp_bd' | 'library'>('all')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportData, setExportData] = useState<Record<string, unknown>[]>([])
  const [exportLoading, setExportLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  const toggleCert = (cert: string) => {
    setCertFilter((prev) =>
      prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert]
    )
  }

  // Reset selection on filter changes
  useEffect(() => { setSelectedIds(new Set()) }, [activeCard, language, expiryFrom, expiryTo, sourceFilter, certFilter, wtpFilter])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset sort on card change
  useEffect(() => {
    setSortBy(activeCard === 'expiring' ? 'expiry_asc' : 'title_asc')
    setExpandedRows(new Set())
    setWtpFilter('all')
  }, [activeCard])

  const fetchData = useCallback(async (forExport = false): Promise<any[] | undefined> => {
    if (!forExport) setIsLoading(true)
    try {
      const limit = 10000
      const offset = 0
      const safeSortBy = (sortBy === 'expiry_asc' || sortBy === 'expiry_desc')
        ? 'title_asc'
        : sortBy as 'title_asc' | 'title_desc' | 'release_date_desc' | 'release_date_asc'

      const certParam = certFilter.length > 0 ? certFilter : undefined
      if (activeCard === 'open_titles') {
        const { data } = await getOpenTitlesForMode('internet', {
          search: debouncedSearch || undefined,
          language: language || undefined,
          sourceFilter,
          certification: certParam,
          sortBy: safeSortBy,
          wtpFilter: wtpFilter !== 'all' ? wtpFilter : undefined,
          limit,
          offset,
        })
        if (forExport) return data
        setMovies(data)
      } else if (activeCard === 'expiring') {
        const { data } = await getExpiringInternetTitles({
          fromDate: expiryFrom || undefined,
          toDate: expiryTo || undefined,
          language: language || undefined,
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
        const { data } = await getActiveInternetTitles({
          language: language || undefined,
          sourceFilter,
          search: debouncedSearch || undefined,
          certification: certParam,
          sortBy: safeSortBy,
          limit,
          offset,
        })
        if (forExport) return data
        setMovies(data)
      }
    } catch (error) {
      console.error('Error loading internet table:', error)
    } finally {
      if (!forExport) setIsLoading(false)
    }
  }, [activeCard, debouncedSearch, language, sourceFilter, certFilter, expiryFrom, expiryTo, sortBy, wtpFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // For expiring card: flatten to one row per internet right
  const flatExpiryRows = activeCard === 'expiring'
  const flatRightRows: Array<{ movie: any; right: InternetRight }> = flatExpiryRows
    ? movies.flatMap((movie: any) =>
        ((movie as MovieWithInternetRights).internet_rights_list || []).map((right) => ({ movie, right }))
      )
    : []

  const toggleSelectAll = () => {
    const ids = flatExpiryRows
      ? flatRightRows.map(({ right }) => right.id)
      : movies.map((m: any) => m.id)
    setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids))
  }

  const handleExportClick = useCallback(async () => {
    setExportLoading(true)
    try {
      const data = await fetchData(true)
      let preparedData: Record<string, unknown>[]
      if (activeCard === 'expiring') {
        const rows: Record<string, unknown>[] = []
        let idx = 1
        const sourceData = selectedIds.size > 0
          ? (data as MovieWithInternetRights[]).filter(m =>
              (m.internet_rights_list || []).some(r => selectedIds.has(r.id))
            )
          : (data as MovieWithInternetRights[])
        for (const movie of sourceData || []) {
          const rights = movie.internet_rights_list || []
          if (rights.length === 0) {
            rows.push({ sl_no: idx++, title: movie.title, source: movie.source, certification: (movie as any).certification, release_date: (movie as any).release_date, language: (movie as any).language })
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
                certification: (movie as any).certification || '',
                release_date: (movie as any).release_date || '',
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
        preparedData = (sourceData || []).map((row, idx) => ({ ...row, sl_no: idx + 1 })) as Record<string, unknown>[]
      }
      setExportData(preparedData)
      setShowExportDialog(true)
    } catch (error) {
      console.error('Error loading export data:', error)
    } finally {
      setExportLoading(false)
    }
  }, [fetchData, activeCard, selectedIds])

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getSourceBadge = (source: string) =>
    source === 'home_production' ? (
      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">Home</Badge>
    ) : (
      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">Acquired</Badge>
    )

  const getActiveBadge = (dateStr?: string) => {
    if (!dateStr) return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">Active</Badge>
    const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
    if (days < 0) return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">Expired</Badge>
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
        Active · {days}d left
      </Badge>
    )
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

  const hasSubRows = activeCard === 'active'
  const showWtpCol = activeCard === 'open_titles'
  const showLicensorCol = activeCard === 'open_titles' && sourceFilter === 'acquired'
  // +1 for checkbox column in each branch
  const colCount = flatExpiryRows ? 10 : hasSubRows ? 8 : showWtpCol ? (showLicensorCol ? 11 : 10) : 7

  const exportFields = activeCard === 'open_titles' ? EXPORT_FIELDS_OPEN
    : activeCard === 'expiring' ? EXPORT_FIELDS_EXPIRING
      : EXPORT_FIELDS_ACTIVE

  const cellCls = fullPage ? 'py-1 px-3 text-xs' : ''
  const headCls = fullPage ? 'py-1.5 px-3 text-xs font-medium' : 'text-xs font-medium'

  const inputCls = "h-9 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:border-(--svf-border-strong) focus-visible:border-(--svf-accent-line) focus-visible:ring-0 transition-colors"
  const selectTriggerCls = "h-9 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:border-(--svf-border-strong) hover:bg-(--hover) transition-colors text-xs"

  const filtersBar = (
    <div className={fullPage ? 'px-4 py-3 border-b border-(--svf-border)/40 bg-(--panel-solid)/30' : 'rounded-lg border border-(--svf-border)/40 bg-(--panel-solid)/30 p-3'}>
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-45 max-w-65">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--text-faint)" />
          <Input placeholder="Search movies…" value={search} onChange={(e) => setSearch(e.target.value)}
            className={`pl-9 text-xs placeholder:text-(--text-faint) ${inputCls}`} />
        </div>

        {/* Source filter */}
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as SourceFilter) }}>
          <SelectTrigger className={`w-[140px] ${selectTriggerCls}`}>
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="home">Home Production</SelectItem>
            <SelectItem value="acquired">Acquired</SelectItem>
            <SelectItem value="bangladeshi">Bangladeshi</SelectItem>
          </SelectContent>
        </Select>

        {/* Certification multi-select */}
        <Popover open={certOpen} onOpenChange={setCertOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm"
              className={`h-9 gap-1.5 text-xs font-normal bg-(--bg-raise) border-(--svf-border) hover:bg-(--hover) hover:border-(--svf-border-strong) transition-colors ${certFilter.length > 0 ? 'border-blue-500/60 text-blue-400 bg-blue-500/5' : 'text-(--text)'}`}>
              <Filter className="h-3 w-3 shrink-0" />
              {certFilter.length === 0
                ? 'Certification'
                : (certFilter.length > 0 && !certFilter.includes('A') && CERT_OPTIONS.filter(c => c !== 'A').every(c => certFilter.includes(c)))
                  ? 'Except A'
                  : certFilter.length === 1
                    ? certFilter[0]
                    : `${certFilter.length} selected`}
              {certFilter.length > 0 && (
                <span onClick={(e) => { e.stopPropagation(); setCertFilter([]) }}
                  className="ml-0.5 hover:text-red-400 transition-colors">
                  <X className="h-3 w-3" />
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2 bg-(--panel-solid) border-(--svf-border)/60 shadow-xl" align="start">
            <p className="text-xs font-semibold text-(--text-faint) px-1 pb-1.5 uppercase tracking-wide">Certification</p>
            <div className="border-b border-(--svf-border) mb-1.5 pb-1.5 space-y-0.5">
              <div className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-(--hover) cursor-pointer transition-colors"
                onClick={() => { setCertFilter([]) }}>
                <Checkbox checked={certFilter.length === 0} className="h-3.5 w-3.5" />
                <span className="text-xs text-(--text)">All</span>
              </div>
              <div className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-(--hover) cursor-pointer transition-colors"
                onClick={() => { setCertFilter(CERT_OPTIONS.filter(c => c !== 'A')) }}>
                <Checkbox
                  checked={certFilter.length > 0 && !certFilter.includes('A') && CERT_OPTIONS.filter(c => c !== 'A').every(c => certFilter.includes(c))}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-(--text)">Except A</span>
              </div>
            </div>
            {CERT_OPTIONS.map((cert) => (
              <div key={cert} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-(--hover) cursor-pointer transition-colors"
                onClick={() => toggleCert(cert)}>
                <Checkbox checked={certFilter.includes(cert)} className="h-3.5 w-3.5" />
                <span className="text-xs text-(--text)">{cert}</span>
              </div>
            ))}
          </PopoverContent>
        </Popover>


        {/* Expiry year + date range */}
        {activeCard === 'expiring' && (
          <>
            <Select value={expiryYear} onValueChange={onExpiryYearChange}>
              <SelectTrigger className={`w-[140px] ${selectTriggerCls}`}>
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

            <div className="flex items-center gap-1 bg-(--bg-raise) border border-(--svf-border) rounded-md px-2 h-9 hover:border-(--svf-border-strong) transition-colors">
              <span className="text-[10px] font-medium text-(--text-faint) uppercase px-1">From</span>
              <DateInput value={expiryFrom} onChange={onExpiryFromChange} />
              <span className="text-(--svf-border-strong) px-1">|</span>
              <span className="text-[10px] font-medium text-(--text-faint) uppercase px-1">To</span>
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
          </>
        )}

        {/* Open titles filters: WTP */}
        {activeCard === 'open_titles' && (
          <>
            <Select value={wtpFilter} onValueChange={(v) => { setWtpFilter(v as typeof wtpFilter) }}>
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
        <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortOption) }}>
          <SelectTrigger className={`w-[180px] ${selectTriggerCls}`}>
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-red-500">
              {selectedIds.size} selected
            </span>
          )}
          {fullPage && (
            <Button variant="outline" size="sm" className="gap-1.5 h-9 px-3 text-xs bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20 transition-colors" onClick={handleExportClick} disabled={exportLoading}>
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

  const tableEl = (
    <div className={fullPage ? 'flex-1 overflow-auto' : 'rounded-lg border border-(--svf-border) overflow-hidden'}>
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
                    checked={movies.length > 0 && selectedIds.size === movies.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                {hasSubRows && <TableHead className={cn('w-8', headCls)} />}
                <TableHead className={headCls}>Title</TableHead>
                <TableHead className={headCls}>Type</TableHead>
                <TableHead className={headCls}>Cert</TableHead>
                <TableHead className={headCls}>Release</TableHead>
                <TableHead className={headCls}>Language</TableHead>
                {showWtpCol && <TableHead className={headCls}>WTP Library</TableHead>}
                {showLicensorCol && <TableHead className={headCls}>Licensor</TableHead>}
                {activeCard === 'open_titles' && <TableHead className={headCls}>Internet Rights</TableHead>}
                {activeCard === 'open_titles' && <TableHead className={headCls}>Sunset Date</TableHead>}
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
                <TableCell colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
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
                    <Link href={`/movies/${movie.id}`} className="hover:text-primary transition-colors line-clamp-2">
                      {movie.title}
                      {(movie.release_year || movie.release_date?.split('-')[0]) && (
                        <span className="font-normal ml-1" style={{ color: 'var(--text-faint)' }}>({movie.release_year || movie.release_date?.split('-')[0]})</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className={cellCls}>{getSourceBadge(movie.source)}</TableCell>
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
          ) : movies.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="text-center py-10 text-muted-foreground text-sm">
                No movies found matching your filters
              </TableCell>
            </TableRow>
          ) : (
            movies.map((movie: any, idx: number) => {
              const isExpanded = expandedRows.has(movie.id)
              const internetRights: InternetRight[] = (movie as MovieWithInternetRights).internet_rights_list || []
              return (
                <Fragment key={movie.id}>
                  <TableRow
                    className={cn(
                      'border-(--svf-border)/30 hover:bg-(--hover) transition-colors',
                      hasSubRows && internetRights.length > 0 && 'cursor-pointer',
                      fullPage && idx % 2 === 0 && 'bg-(--panel-solid)/30',
                      selectedIds.has(movie.id) && 'bg-red-500/5',
                    )}
                    onClick={() => hasSubRows && internetRights.length > 0 && toggleRow(movie.id)}
                  >
                    <TableCell className={cn('pl-4 w-10', cellCls)} onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(movie.id)} onCheckedChange={() => toggleSelect(movie.id)} />
                    </TableCell>
                    {hasSubRows && (
                      <TableCell className={cn('w-8', cellCls)}>
                        {internetRights.length > 0 ? (
                          <div className="flex items-center justify-center h-5 w-5 rounded hover:bg-muted/50">
                            {isExpanded
                              ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                              : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                          </div>
                        ) : <div className="w-5" />}
                      </TableCell>
                    )}
                    <TableCell className={cn('font-medium max-w-50', cellCls)}>
                      <Link href={`/movies/${movie.id}`} className="hover:text-primary transition-colors line-clamp-1" onClick={(e) => e.stopPropagation()}>
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
                    {showWtpCol && (
                      <TableCell className={cellCls} onClick={(e) => e.stopPropagation()}>
                        {movie.wtp_library
                          ? <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-xs">{movie.wtp_library}</Badge>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}
                    {showLicensorCol && (
                      <TableCell className={cn('max-w-35', cellCls)} style={{ color: 'var(--text-faint)' }} onClick={(e) => e.stopPropagation()}>
                        <span className="line-clamp-1 text-xs">{movie.assignor_licensor || '—'}</span>
                      </TableCell>
                    )}
                    {activeCard === 'open_titles' && (
                      <TableCell className={cn('whitespace-nowrap text-xs', cellCls)} style={{ color: 'var(--text-faint)' }} onClick={(e) => e.stopPropagation()}>
                        {movie.internet_rights_start_date || movie.internet_rights_end_date ? (
                          <span>{movie.internet_rights_start_date ? movie.internet_rights_start_date.split('-').reverse().join('/') : '—'} → {movie.internet_rights_end_date ? movie.internet_rights_end_date.split('-').reverse().join('/') : '∞'}</span>
                        ) : '—'}
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
                          {internetRights.length} right{internetRights.length !== 1 ? 's' : ''}
                        </Badge>
                      </TableCell>
                    )}
                  </TableRow>
                  {hasSubRows && isExpanded && internetRights.length > 0 && (
                    <TableRow key={`${movie.id}-expanded`} className="bg-(--panel-solid)/50 border-(--svf-border)/30">
                      <TableCell colSpan={colCount} className="p-0">
                        <div className="px-8 py-2 space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5" />
                            Internet Rights Details
                          </p>
                          <div className="grid gap-1.5">
                            {internetRights.map((right) => (
                              <div key={right.id} className="flex flex-wrap items-center gap-3 bg-(--bg-deep)/50 border border-(--svf-border)/40 rounded px-3 py-1.5">
                                <div className="flex items-center gap-2 min-w-40">
                                  <Monitor className="h-3 w-3 text-(--text-faint) shrink-0" />
                                  <span className="text-xs font-medium">{right.platform_name}</span>
                                </div>
                                {right.rights_type_name && (
                                  <Badge variant="outline" className="bg-(--bg-raise)/60 text-(--text-faint) border-(--svf-border) text-xs shrink-0">
                                    {right.rights_type_name}
                                  </Badge>
                                )}
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3 shrink-0" />
                                  <span className="font-mono">{right.start_date || '—'}</span>
                                  <span>→</span>
                                  <span className={cn('font-mono', right.end_date && new Date(right.end_date) < new Date() ? 'text-red-400' : '')}>
                                    {right.end_date || '—'}
                                  </span>
                                </div>
                                <div className="ml-auto shrink-0">{getActiveBadge(right.end_date)}</div>
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
          filename="internet_dashboard"
        />
      </div>
    )
  }

  return (
    <Card className="glass-card">
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="px-1 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-(--text)">{cardLabels[activeCard]}</h2>
            <p className="text-sm text-(--text-faint) mt-0.5">{cardDescriptions[activeCard]}</p>
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
        filename="internet_dashboard"
      />
    </Card>
  )
}
