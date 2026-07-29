'use client'

import { DataExportDialog, type ExportFieldDef } from '@/components/import-export/data-export-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  fullPage?: boolean
}

export function ClipRightsTable({ language, fullPage = false }: ClipRightsTableProps) {
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
        language: language.length > 0 ? language : undefined,
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
  }, [debouncedSearch, language, sourceFilter, clipFilter, agreementEndBy])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExportClick = useCallback(async () => {
    setExportLoading(true)
    try {
      const { data } = await getClipRightsMovies({
        search: debouncedSearch || undefined,
        language: language.length > 0 ? language : undefined,
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
  }, [debouncedSearch, language, sourceFilter, clipFilter, agreementEndBy])

  const getSourceBadge = (source: string) =>
    source === 'home_production' ? (
      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">Home</Badge>
    ) : (
      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">Acquired</Badge>
    )

  const cellCls = fullPage ? 'py-1 px-3 text-xs' : ''
  const headCls = fullPage ? 'py-1.5 px-3 text-xs font-medium' : 'text-xs font-medium'
  const inputCls = "h-9 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:border-(--svf-border-strong) focus-visible:border-(--svf-accent-line) focus-visible:ring-0 transition-colors"
  const selectTriggerCls = "h-9 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:border-(--svf-border-strong) hover:bg-(--hover) transition-colors text-xs"

  const filtersBar = (
    <div className={fullPage ? 'px-4 py-3 border-b border-(--svf-border)/40 bg-(--panel-solid)/30' : 'rounded-lg border border-(--svf-border)/40 bg-(--panel-solid)/30 p-3'}>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-45 max-w-65">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--text-faint)" />
          <Input placeholder="Search by title or production no…" value={search} onChange={(e) => setSearch(e.target.value)}
            className={`pl-9 text-xs placeholder:text-(--text-faint) ${inputCls}`} />
        </div>

        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as SourceFilter) }}>
          <SelectTrigger className={`w-35 ${selectTriggerCls}`}>
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="home">Home Production</SelectItem>
            <SelectItem value="acquired">Acquired</SelectItem>
            <SelectItem value="bangladeshi">Bangladesh</SelectItem>
          </SelectContent>
        </Select>

        <Select value={clipFilter} onValueChange={(v) => { setClipFilter(v as ClipFilter) }}>
          <SelectTrigger className={`w-40 ${selectTriggerCls}`}>
            <SelectValue placeholder="Clip Rights" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="yes">Clip Rights: Yes</SelectItem>
            <SelectItem value="no">Clip Rights: No</SelectItem>
          </SelectContent>
        </Select>

        <div className={`flex items-center gap-1 bg-(--bg-raise) border rounded-md px-2 h-9 transition-colors ${agreementEndBy ? 'border-amber-500/60' : 'border-(--svf-border) hover:border-(--svf-border-strong)'}`}>
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

        {fullPage && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 h-9 px-3 text-xs bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20 transition-colors" onClick={handleExportClick} disabled={exportLoading}>
              {exportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Export
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  const tableEl = (
    <div className={fullPage ? 'flex-1 overflow-auto' : 'rounded-lg border border-(--svf-border) overflow-hidden'}>
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
                    <Link href={`/movies/${movie.id}`} className="hover:text-primary transition-colors line-clamp-1">
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
      <div className="p-6 space-y-4">
        <div className="px-1 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-(--text)">Clip Rights</h2>
            <p className="text-sm text-(--text-faint) mt-0.5">Which movies have clip rights acquired</p>
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
