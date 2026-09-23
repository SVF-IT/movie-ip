'use client'

import { ActiveFilterChips, type ActiveFilterChip } from '@/components/dashboard/active-filter-chips'
import { DataExportDialog, type ExportFieldDef } from '@/components/import-export/data-export-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import { ColumnFilter, SortableFilterableHead } from '@/components/ui/column-header-filter'
import { useSortableTable } from '@/hooks/use-sortable-table'
import { getClipRightsMovies } from '@/lib/api/dashboard'
import type { MovieWithDetails } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { ChevronRight, Download, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUrlMultiSelectFilterState } from '@/hooks/use-url-multi-select-filter-state'
import { stringCodec, stringListCodec, useUrlFilterState } from '@/hooks/use-url-filter-state'

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
  fullPage?: boolean
}

export function ClipRightsTable({ language, languageOptions, onLanguageChange, defaultLanguage, totalLanguageCount, languagesReady = true, fullPage = false }: ClipRightsTableProps) {
  const [movies, setMovies] = useState<MovieWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useUrlFilterState('clip_q', '', stringCodec)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // Source and Clip Rights are multi-selects in the column headers; the API takes
  // a single value for each, so an all-or-one selection maps to it directly.
  const SOURCE_OPTIONS = [
    { value: 'home', label: 'Home Production' },
    { value: 'acquired', label: 'Acquired' },
    { value: 'bangladeshi', label: 'Bangladesh' },
  ]
  const [sourceSel, setSourceSel] = useUrlMultiSelectFilterState('clip_src', SOURCE_OPTIONS.map(o => o.value))
  const sourceFilter: SourceFilter =
    sourceSel.length === 1 ? (sourceSel[0] as SourceFilter) : 'all'
  const CLIP_OPTIONS = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ]
  const [clipSel, setClipSel] = useUrlMultiSelectFilterState('clip_clip', CLIP_OPTIONS.map(o => o.value))
  const clipFilter: ClipFilter = clipSel.length === 1 ? (clipSel[0] as ClipFilter) : 'all'
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportData, setExportData] = useState<Record<string, unknown>[]>([])
  const [exportLoading, setExportLoading] = useState(false)

  // Title gets a searchable multi-select of the titles currently loaded, with the
  // search box driving the server query rather than only narrowing the list.
  const titleOptions = useMemo(() => {
    const set = new Set<string>()
    for (const m of movies as any[]) if (m.title) set.add(m.title)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [movies])
  const [titleSel, setTitleSel] = useUrlFilterState<string[]>('clip_title', [], stringListCodec, (v) => v.length === 0)
  const titleFilter = titleSel.length === 0 ? titleOptions : titleSel
  const setTitleFilter = (next: string[]) =>
    setTitleSel(next.length >= titleOptions.length ? [] : next)

  const visibleMovies = (movies as any[]).filter(
    (m: any) => titleFilter.length >= titleOptions.length || !m.title || titleFilter.includes(m.title)
  )
  const { sortedData, sortConfig, requestSort } = useSortableTable(visibleMovies)

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchData = useCallback(async () => {
    // The parent resolves its language options asynchronously and only then applies
    // the default (Bengali). Fetching before that lands would send no language filter
    // at all — `language.length < totalLanguageCount` is `0 < 0`, i.e. false — and the
    // table would report an all-language count to the stat card. `languagesReady`
    // distinguishes "options not fetched yet" from "fetched and genuinely empty", so a
    // failed language fetch still renders rather than hanging on a skeleton forever.
    if (!languagesReady) return
    setIsLoading(true)
    try {
      const { data } = await getClipRightsMovies({
        search: debouncedSearch || undefined,
        language: language.length > 0 && language.length < totalLanguageCount ? language : undefined,
        sourceFilter,
        clipRightsFilter: clipFilter,
        sortBy: 'title_asc',
      })
      setMovies(data)
    } catch (error) {
      console.error('Error loading clip rights table:', error)
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearch, language, totalLanguageCount, languagesReady, sourceFilter, clipFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // Chips describe only genuine narrowing: a filter with every option selected is
  // the same as no filter, so it must not appear as "active".
  const activeChips: ActiveFilterChip[] = []
  if (sourceSel.length > 0 && sourceSel.length < SOURCE_OPTIONS.length) activeChips.push({
    key: 'source', label: 'Source',
    value: sourceSel.map((v) => SOURCE_OPTIONS.find(o => o.value === v)?.label ?? v).join(', '),
    onClear: () => setSourceSel(SOURCE_OPTIONS.map(o => o.value)),
  })
  if (titleSel.length > 0) activeChips.push({
    key: 'title', label: 'Title',
    value: titleSel.length === 1 ? titleSel[0] : `${titleSel.length} selected`,
    onClear: () => setTitleSel([]),
  })
  if (clipSel.length > 0 && clipSel.length < CLIP_OPTIONS.length) activeChips.push({
    key: 'clip', label: 'Clip rights',
    value: clipSel.map((v) => CLIP_OPTIONS.find(o => o.value === v)?.label ?? v).join(', '),
    onClear: () => setClipSel(CLIP_OPTIONS.map(o => o.value)),
  })
  if (languageOptions && onLanguageChange && language.length > 0 && language.length < totalLanguageCount) activeChips.push({
    key: 'language', label: 'Language',
    value: language.length === 1 ? language[0] : `${language.length} selected`,
    onClear: () => onLanguageChange(defaultLanguage ?? languageOptions),
  })

  const clearAllFilters = () => {
    setSearch('')
    setSourceSel(SOURCE_OPTIONS.map(o => o.value))
    setClipSel(CLIP_OPTIONS.map(o => o.value))
    setTitleSel([])
    if (onLanguageChange) onLanguageChange(defaultLanguage ?? languageOptions ?? [])
  }

  const handleExportClick = useCallback(async () => {
    setExportLoading(true)
    try {
      const { data } = await getClipRightsMovies({
        search: debouncedSearch || undefined,
        language: language.length > 0 && language.length < totalLanguageCount ? language : undefined,
        sourceFilter,
        clipRightsFilter: clipFilter,
        sortBy: 'title_asc',
      })
      const preparedData = (data || []).map((row: any, idx) => ({
        ...row,
        sl_no: idx + 1,
        source: row.is_bangladeshi ? 'Bangladesh' : row.source === 'home_production' ? 'Home' : 'Acquired',
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
  }, [debouncedSearch, language, totalLanguageCount, languagesReady, sourceFilter, clipFilter])

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

  const cellCls = ''
  const headCls = ''

  const filtersBar = (
    <div className={fullPage
      ? 'px-4 py-3 bg-(--filter-panel-bg) border-b border-(--filter-border)'
      : 'rounded-[14px] border border-(--filter-border) bg-(--filter-panel-bg) p-3.5'}>
      {/* Every filter now lives in a column header, so this bar carries only the
          active-filter chips and the actions row. */}
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
            <SortableFilterableHead column="title" label="Title" currentSort={sortConfig} onSort={requestSort} className={cn('pl-4', headCls)}>
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
            <SortableFilterableHead column="source" label="Source" currentSort={sortConfig} onSort={requestSort} className={headCls}>
              <ColumnFilter options={SOURCE_OPTIONS} value={sourceSel} onChange={setSourceSel} />
            </SortableFilterableHead>
            <SortableFilterableHead column="clip_rights" label="Clip Rights" currentSort={sortConfig} onSort={requestSort} className={headCls}>
              <ColumnFilter options={CLIP_OPTIONS} value={clipSel} onChange={setClipSel} />
            </SortableFilterableHead>
            <SortableFilterableHead column="language" label="Language" currentSort={sortConfig} onSort={requestSort} className={headCls}>
              {languageOptions && onLanguageChange && (
                <ColumnFilter options={languageOptions} value={language} onChange={onLanguageChange} searchable />
              )}
            </SortableFilterableHead>
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
          ) : sortedData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-10 text-muted-foreground text-sm">
                No movies found matching your filters
              </TableCell>
            </TableRow>
          ) : (
            sortedData.map((movie: any, idx: number) => {
              const hasClip = (movie.clip_rights || '').trim().toLowerCase() === 'yes'
              return (
                <TableRow
                  key={movie.id}
                  className={cn('border-(--svf-border)/30 hover:bg-(--hover) transition-colors', fullPage && idx % 2 === 0 && 'bg-(--panel-solid)/30')}
                >
                  <TableCell className={cn('pl-4 font-medium whitespace-normal', cellCls)}>
                    <Link href={`/movies/${movie.id}`} title={movie.title} className="hover:text-primary transition-colors break-words">
                      {movie.title}
                      {(movie.release_year || movie.release_date?.split('-')[0]) && (
                        <span className="font-normal ml-1" style={{ color: 'var(--text-faint)' }}>({movie.release_year || movie.release_date?.split('-')[0]})</span>
                      )}
                    </Link>
                    {hasClip && movie.clip_rights_duration && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--text-faint)' }}>· {movie.clip_rights_duration}</span>
                    )}
                  </TableCell>
                  <TableCell className={cellCls}>{getSourceBadge(movie)}</TableCell>
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
