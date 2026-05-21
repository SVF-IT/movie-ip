'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { getMoviesForDashboard, getOpenTitlesForMode, type RightsMode } from '@/lib/api/dashboard'
import { useSortableTable } from '@/hooks/use-sortable-table'
import { SortableHeader } from '@/components/ui/sortable-header'
import type { MovieWithDetails } from '@/lib/types/database'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { DataExportDialog, type ExportFieldDef } from '@/components/import-export/data-export-dialog'

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

type SortOption = 'title_asc' | 'title_desc' | 'created_at_desc' | 'release_date_desc' | 'release_date_asc'

interface RightsModeTableProps {
  mode: RightsMode
  selectedCategory?: string
  onCategoryChange?: (category: string) => void
}

export function RightsModeTable({ mode, selectedCategory, onCategoryChange }: RightsModeTableProps) {
  const [movies, setMovies] = useState<MovieWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState<string>(selectedCategory || 'all')
  const [sortBy, setSortBy] = useState<SortOption>('title_asc')
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportData, setExportData] = useState<MovieWithDetails[]>([])
  const [exportLoading, setExportLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 10

  useEffect(() => {
    if (selectedCategory !== undefined) {
      setCategory(selectedCategory)
      setCurrentPage(1)
    }
  }, [selectedCategory])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadMovies = useCallback(async () => {
    setIsLoading(true)
    try {
      if (category === 'open_titles') {
        const { data, count } = await getOpenTitlesForMode(mode, {
          search: debouncedSearch || undefined,
          sortBy,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        })
        setMovies(data)
        setTotalCount(count)
      } else {
        const { data, count } = await getMoviesForDashboard({
          category: category === 'all' ? undefined : category as 'upcoming' | 'open_titles' | 'wtp' | 'acquired',
          search: debouncedSearch || undefined,
          sortBy,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        })
        setMovies(data)
        setTotalCount(count)
      }
    } catch (error) {
      console.error('Error loading movies:', error)
    } finally {
      setIsLoading(false)
    }
  }, [category, debouncedSearch, sortBy, currentPage, mode])

  useEffect(() => {
    loadMovies()
  }, [loadMovies])

  const handleExportClick = useCallback(async () => {
    setExportLoading(true)
    try {
      let data: MovieWithDetails[]
      if (category === 'open_titles') {
        const result = await getOpenTitlesForMode(mode, {
          search: debouncedSearch || undefined,
          sortBy,
        })
        data = result.data
      } else {
        const result = await getMoviesForDashboard({
          category: category === 'all' ? undefined : category as 'upcoming' | 'open_titles' | 'wtp' | 'acquired',
          search: debouncedSearch || undefined,
          sortBy,
        })
        data = result.data
      }
      const preparedData = (data || []).map((row, idx) => ({ ...row, sl_no: idx + 1 }))
      setExportData(preparedData)
      setShowExportDialog(true)
    } catch (error) {
      console.error('Error loading export data:', error)
    } finally {
      setExportLoading(false)
    }
  }, [category, debouncedSearch, sortBy, mode])

  const { sortedData, sortConfig, requestSort } = useSortableTable(movies)
  const totalPages = Math.ceil(totalCount / pageSize)

  const getSourceBadge = (source: string) =>
    source === 'home_production' ? (
      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">Home Production</Badge>
    ) : (
      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">Acquired</Badge>
    )

  const getCertBadge = (cert: string) => {
    const colors: Record<string, string> = {
      U: 'bg-green-500/10 text-green-400 border-green-500/30',
      UA: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      'U/A': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      A: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
      S: 'bg-red-500/10 text-red-400 border-red-500/30',
    }
    return <Badge variant="outline" className={colors[cert] || 'bg-muted text-muted-foreground'}>{cert}</Badge>
  }

  return (
    <Card className="glass-card border-border/50">
      <div className="p-6 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-1">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Movie Catalog</h2>
            <p className="text-sm text-muted-foreground">
              {category === 'open_titles'
                ? `Open titles filtered by ${mode === 'satellite' ? 'Satellite' : 'Internet'} rights logic`
                : 'Quick access to your film library and IP status.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2 h-9 px-4" onClick={handleExportClick} disabled={exportLoading}>
              {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="font-medium">Export</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-2 h-9 px-4 soft-shadow" asChild>
              <Link href="/movies">
                <span className="font-medium">View Full Catalog</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-12">
          <div className="relative md:col-span-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search movies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/50 h-10 border-border/60"
            />
          </div>
          <div className="md:col-span-7 grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Select value={category} onValueChange={(v) => { setCategory(v); setCurrentPage(1); onCategoryChange?.(v) }}>
              <SelectTrigger className="bg-background/50 h-10 border-border/60">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="upcoming">Upcoming Movies</SelectItem>
                <SelectItem value="open_titles">Open Titles</SelectItem>
                <SelectItem value="wtp">WTP (World TV Premiere)</SelectItem>
                <SelectItem value="acquired">Acquired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v: string) => { setSortBy(v as SortOption); setCurrentPage(1) }}>
              <SelectTrigger className="bg-background/50 h-10 border-border/60">
                <SelectValue placeholder="Sort Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="title_asc">A-Z (Title)</SelectItem>
                <SelectItem value="title_desc">Z-A (Title)</SelectItem>
                <SelectItem value="release_date_desc">Newest Release</SelectItem>
                <SelectItem value="release_date_asc">Oldest Release</SelectItem>
                <SelectItem value="created_at_desc">Newly Created</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30">
                <SortableHeader column="title" label="Title" currentSort={sortConfig} onSort={requestSort} />
                <SortableHeader column="source" label="Source" currentSort={sortConfig} onSort={requestSort} />
                <SortableHeader column="certification" label="Certification" currentSort={sortConfig} onSort={requestSort} />
                <SortableHeader column="release_year" label="Release Year" currentSort={sortConfig} onSort={requestSort} />
                <SortableHeader column="language" label="Language" currentSort={sortConfig} onSort={requestSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><div className="h-10 bg-muted/50 rounded animate-pulse" /></TableCell>
                  </TableRow>
                ))
              ) : sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No movies found matching your filters
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((movie: MovieWithDetails) => (
                  <TableRow key={movie.id} className="border-border/50 hover:bg-muted/20">
                    <TableCell className="font-medium">
                      <Link href={`/movies/${movie.id}`} className="hover:text-primary transition-colors">{movie.title}</Link>
                    </TableCell>
                    <TableCell>{getSourceBadge(movie.source)}</TableCell>
                    <TableCell>{movie.certification ? getCertBadge(movie.certification) : '-'}</TableCell>
                    <TableCell>{movie.release_year || '-'}</TableCell>
                    <TableCell>{movie.language || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-8 gap-1 hover:text-primary" asChild>
                        <Link href={`/movies/${movie.id}`}>
                          <span>View Details</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalCount > pageSize && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} results
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2 h-9 px-3" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous Page</span>
              </Button>
              <div className="flex items-center gap-1">
                {[...Array(Math.min(totalPages, 5))].map((_, i) => (
                  <Button
                    key={i + 1}
                    variant={currentPage === i + 1 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(i + 1)}
                    className={cn('w-9 h-9', currentPage === i + 1 && 'shadow-sm shadow-primary/20')}
                  >
                    {i + 1}
                  </Button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="gap-2 h-9 px-3" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                <span className="hidden sm:inline">Next Page</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <DataExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        data={exportData as unknown as Record<string, unknown>[]}
        fields={EXPORT_FIELDS}
        filename={`${mode}_dashboard_movies`}
      />
    </Card>
  )
}
