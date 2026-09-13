'use client'

import { ActiveFilterChips, type ActiveFilterChip } from '@/components/dashboard/active-filter-chips'
import { DataExportDialog, type ExportFieldDef } from '@/components/import-export/data-export-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getClipRightsMovies } from '@/lib/api/dashboard'
import type { MovieWithDetails } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { CalendarIcon, ChevronRight, Download, Loader2, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

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

const EXPORT_FIELDS: ExportFieldDef[] = [
  { key: 'sl_no', label: 'Sl No' },
  { key: 'title', label: 'Title' },
  { key: 'source', label: 'Source' },
  { key: 'clip_rights', label: 'Clip Rights' },
  { key: 'clip_rights_duration', label: 'Duration' },
  { key: 'language', label: 'Language' },
  { key: 'certification', label: 'Censor' },
  { key: 'release_date', label: 'Release Date' },
]

type SourceFilter = 'all' | 'home' | 'acquired' | 'bangladeshi'
type ClipFilter = 'all' | 'yes' | 'no'

interface ClipRightsTableProps {
  language: string[]
  /**
   * Language options + setter, so the selector can live in this filter bar rather
   * than in the page header. Optional — omit and no selector renders.
   */
  languageOptions?: string[]
  onLanguageChange?: (next: string[]) => void
  totalLanguageCount: number
  fullPage?: boolean
}

export function ClipRightsTable({ language, languageOptions, onLanguageChange, totalLanguageCount, fullPage = false }: ClipRightsTableProps) {
  const [movies, setMovies] = useState<MovieWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [clipFilter, setClipFilter] = useState<ClipFilter>('all')
  const [agreementEndBy, setAgreementEndBy] = useState('')
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportData, setExportData] = useState<Record<string, unknown>[]>([])
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await getClipRightsMovies({
        search: debouncedSearch || undefined,
        language: language.length < totalLanguageCount ? language : undefined,
        sourceFilter,
        clipRightsFilter: clipFilter,
        agreementEndBy: agreementEndBy || undefined,
        sortBy: 'title_asc',
      })
      setMovies(data)
    } catch (error) {
      console.error('Error loading clip rights table:', error)
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearch, language, totalLanguageCount, sourceFilter, clipFilter, agreementEndBy])

  useEffect(() => { fetchData() }, [fetchData])

  // Chips describe only genuine narrowing: a filter with every option selected is
  // the same as no filter, so it must not appear as "active".
  const activeChips: ActiveFilterChip[] = []
  if (debouncedSearch) activeChips.push({ key: 'search', label: 'Search', value: debouncedSearch, onClear: () => setSearch('') })
  if (sourceFilter !== 'all') activeChips.push({
    key: 'source', label: 'Source',
    value: sourceFilter === 'home' ? 'Home Production' : sourceFilter === 'acquired' ? 'Acquired' : 'Bangladesh',
    onClear: () => setSourceFilter('all'),
  })
  if (clipFilter !== 'all') activeChips.push({
    key: 'clip', label: 'Clip rights',
    value: clipFilter === 'yes' ? 'Yes' : 'No',
    onClear: () => setClipFilter('all'),
  })
  if (languageOptions && onLanguageChange && language.length > 0 && language.length < totalLanguageCount) activeChips.push({
    key: 'language', label: 'Language',
    value: language.length === 1 ? language[0] : `${language.length} selected`,
    onClear: () => onLanguageChange(languageOptions),
  })
  if (agreementEndBy) activeChips.push({
    key: 'agmt', label: 'Agreement ends by', value: agreementEndBy,
    onClear: () => setAgreementEndBy(''),
  })

  const clearAllFilters = () => {
    setSearch('')
    setSourceFilter('all')
    setClipFilter('all')
    if (languageOptions && onLanguageChange) onLanguageChange(languageOptions)
    setAgreementEndBy('')
  }

  const handleExportClick = useCallback(async () => {
    setExportLoading(true)
    try {
      const { data } = await getClipRightsMovies({
        search: debouncedSearch || undefined,
        language: language.length < totalLanguageCount ? language : undefined,
        sourceFilter,
        clipRightsFilter: clipFilter,
        agreementEndBy: agreementEndBy || undefined,
        sortBy: 'title_asc',
      })
      const preparedData = (data || []).map((row: any, idx) => ({
        ...row,
        sl_no: idx + 1,
        source: row.source === 'home_production' ? 'Home' : 'Acquired',
        clip_rights: (row.clip_rights || '').trim().toLowerCase() === 'yes' ? 'Yes' : 'No',
        clip_rights_duration: row.clip_rights_duration || '',
        release_date: row.release_date || row.release_year || '',
      }))
      setExportData(preparedData)
      setShowExportDialog(true)
    } catch (error) {
      console.error('Error loading export data:', error)
    } finally {
      setExportLoading(false)
    }
  }, [debouncedSearch, language, totalLanguageCount, sourceFilter, clipFilter, agreementEndBy])

  const getSourceBadge = (source: string) =>
    source === 'home_production' ? (
      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">Home</Badge>
    ) : (
      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">Acquired</Badge>
    )

  const cellCls = ''
  const headCls = ''
  const inputCls = "h-9 rounded-[8px] bg-(--filter-panel-bg) border-(--filter-border) text-(--text) hover:border-(--filter-border-hover) focus-visible:border-(--filter-border-hover) focus-visible:ring-0 transition-colors"
  const labelCls = "text-[11px] font-medium uppercase tracking-[.06em] text-(--filter-label)"
  const selectTriggerCls = "h-9 rounded-[8px] bg-(--filter-panel-bg) border-(--filter-border) text-(--text) hover:border-(--filter-border-hover) focus-visible:border-(--filter-border-hover) focus-visible:ring-0 transition-colors text-sm"

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

        {/* Clip rights */}
        <div className="flex flex-col gap-1 min-w-0">
          <span className={labelCls}>Clip rights</span>
          <Select value={clipFilter} onValueChange={(v) => { setClipFilter(v as ClipFilter) }}>
            <SelectTrigger className={`w-full ${selectTriggerCls}`}>
              <SelectValue placeholder="Clip Rights" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="yes">Clip Rights: Yes</SelectItem>
              <SelectItem value="no">Clip Rights: No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Agreement ends by */}
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
      </div>

      <ActiveFilterChips chips={activeChips} onClearAll={clearAllFilters} />

      {fullPage && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 h-9 rounded-[8px] px-3 text-xs bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20 transition-colors" onClick={handleExportClick} disabled={exportLoading}>
              {exportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Export
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  const tableEl = (
    <div className={fullPage ? 'flex-1 overflow-auto' : 'rounded-[16px] border border-(--tbl-border) overflow-hidden'}>
      <Table className={fullPage ? 'border-collapse' : ''}>
        <TableHeader className={fullPage ? 'sticky top-0 z-10' : ''}>
          <TableRow className={`border-(--svf-border)/40 ${fullPage ? 'bg-(--bg-deep) backdrop-blur-sm' : 'bg-(--bg-deep)/60'}`}>
            <TableHead className={cn('pl-4', headCls)}>Title</TableHead>
            <TableHead className={headCls}>Source</TableHead>
            <TableHead className={headCls}>Clip Rights</TableHead>
            <TableHead className={headCls}>Language</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            [...Array(fullPage ? 14 : 6)].map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={4} className={cellCls}>
                  <div className={`bg-(--hover) rounded animate-pulse ${fullPage ? 'h-6' : 'h-9'}`} />
                </TableCell>
              </TableRow>
            ))
          ) : movies.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-10 text-muted-foreground text-sm">
                No movies found matching your filters
              </TableCell>
            </TableRow>
          ) : (
            movies.map((movie: any, idx: number) => {
              const hasClip = (movie.clip_rights || '').trim().toLowerCase() === 'yes'
              return (
                <TableRow
                  key={movie.id}
                  className={cn('border-(--svf-border)/30 hover:bg-(--hover) transition-colors', fullPage && idx % 2 === 0 && 'bg-(--panel-solid)/30')}
                >
                  <TableCell className={cn('pl-4 font-medium max-w-70', cellCls)}>
                    <Link href={`/movies/${movie.id}`} title={movie.title} className="hover:text-primary transition-colors line-clamp-1">
                      {movie.title}
                      {(movie.release_year || movie.release_date?.split('-')[0]) && (
                        <span className="font-normal ml-1" style={{ color: 'var(--text-faint)' }}>({movie.release_year || movie.release_date?.split('-')[0]})</span>
                      )}
                    </Link>
                    {hasClip && movie.clip_rights_duration && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--text-faint)' }}>· {movie.clip_rights_duration}</span>
                    )}
                  </TableCell>
                  <TableCell className={cellCls}>{getSourceBadge(movie.source)}</TableCell>
                  <TableCell className={cellCls}>
                    {hasClip ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">Yes</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-(--bg-raise) text-(--text-faint) border-(--svf-border-strong) text-xs">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className={cellCls}>{movie.language || '—'}</TableCell>
                </TableRow>
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
          fields={EXPORT_FIELDS}
          filename="clip_rights"
        />
      </div>
    )
  }

  return (
    <Card className="glass-card">
      <div className="p-3.5 space-y-2.5">
        <div className="px-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="dsp text-[17px] font-bold tracking-tight text-(--text)">Clip Rights</h2>
            <p className="text-[12px] text-(--text-faint) mt-0.5">Which movies have clip rights acquired</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3 text-xs bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20 transition-colors" onClick={handleExportClick} disabled={exportLoading}>
              {exportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Export
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3 text-xs bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20 transition-colors" asChild>
              <Link href="/movies">Full Catalog <ChevronRight className="h-3 w-3" /></Link>
            </Button>
          </div>
        </div>
        {filtersBar}
        {tableEl}
      </div>
      <DataExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        data={exportData}
        fields={EXPORT_FIELDS}
        filename="clip_rights"
      />
    </Card>
  )
}
