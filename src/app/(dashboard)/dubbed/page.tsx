'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getGroupedMovies } from '@/lib/api/movies'
import type { GroupedMovie } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { Check, ChevronDown, Download, Film, Languages, Loader2, Search, X, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAppToast } from '@/hooks/use-app-toast'

type DubbedFilter = 'all' | 'dubbed' | 'not_dubbed' | 'cannot_be_dubbed'

const ALL_LANGUAGES = ["Assamese", "Bengali", "Bhojpuri", "English", "Gujarati", "Hindi", "Kannada", "Malayalam", "Marathi", "Oriya", "Punjabi", "Tamil", "Telugu"]

export default function DubbedPage() {
  const [groups, setGroups] = useState<GroupedMovie[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useAppToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [dubbedFilter, setDubbedFilter] = useState<DubbedFilter[]>(['dubbed'])
  const [languageFilter, setLanguageFilter] = useState<string[]>([])
  const [langPopoverOpen, setLangPopoverOpen] = useState(false)
  const [dubbedPopoverOpen, setDubbedPopoverOpen] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'home_production' | 'acquired'>('all')


  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const g = await getGroupedMovies()
        setGroups(g.data)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load dubbed data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // langColumns: all languages except Bengali (the primary/original language)
  const langColumns = ALL_LANGUAGES.filter((l) => l.toLowerCase() !== 'bengali')

  const toggleLanguage = (id: string) => {
    setLanguageFilter((prev) => prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id])
  }

  const toggleDubbedFilter = (val: DubbedFilter) => {
    if (val === 'all') { setDubbedFilter(['all']); return }
    setDubbedFilter((prev) => {
      const withoutAll = prev.filter((v) => v !== 'all')
      if (withoutAll.includes(val)) {
        const next = withoutAll.filter((v) => v !== val)
        return next.length === 0 ? ['all'] : next
      }
      return [...withoutAll, val]
    })
  }

  const isDubbedFilterActive = (val: DubbedFilter) => dubbedFilter.includes(val)

  const getDubbingRightsLanguages = (dubbingRights: string | undefined): string[] | null => {
    if (!dubbingRights) return null
    const dr = dubbingRights.trim().toUpperCase()
    // Explicit NO values
    if (dr === 'N' || dr === 'N/A' || dr === 'NO' || dr.startsWith('NO ')) return []

    const match = dubbingRights.match(/Yes\s*\((.+)\)/i)
    if (!match) {
      // If it has "Yes" but no parens, assume all
      if (dr.includes('YES')) return null
      return null
    }
    const inner = match[1].trim()
    if (inner.toLowerCase() === 'all') return null
    return inner.split(',').map((s) => s.trim()).filter(Boolean)
  }

  const isAcquiredEligibleForDubbing = (g: GroupedMovie, langs: string[]): boolean => {
    const rights = g.primary_version?.dubbing_rights
    const allowedLangs = getDubbingRightsLanguages(rights)
    if (allowedLangs === null) return true
    if (allowedLangs.length === 0) return false
    if (langs.length === 0) return true
    return langs.some((l) => allowedLangs.some((al) => al.toLowerCase() === l.toLowerCase()))
  }

  const filtered = useMemo(() => {
    let data = groups
    if (sourceFilter !== 'all') data = data.filter((g) => g.source === sourceFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      data = data.filter((g) => g.title.toLowerCase().includes(q) || g.versions.some((v) => v.title.toLowerCase().includes(q)))
    }

    const isAllDubbed = dubbedFilter.includes('all')
    const wantDubbed = dubbedFilter.includes('dubbed')
    const wantNotDubbed = dubbedFilter.includes('not_dubbed')
    const wantCannotBeDubbed = dubbedFilter.includes('cannot_be_dubbed')

    data = data.filter((g) => {
      const hasDub = g.total_versions > 1
      const isEligible = g.source === 'home_production' || isAcquiredEligibleForDubbing(g, []) // general eligibility

      // 1. First check the dubbed status filter
      let matchesStatus = isAllDubbed
      if (!isAllDubbed) {
        if (wantDubbed && hasDub) matchesStatus = true
        if (wantNotDubbed && !hasDub && isEligible) matchesStatus = true
        if (wantCannotBeDubbed && !hasDub && !isEligible) matchesStatus = true
      }
      if (!matchesStatus) return false

      // 2. Then check the language filter
      if (languageFilter.length > 0) {
        // If we want dubbed: movie must have a version in one of these languages that is NOT the primary version
        const hasSpecificDub = g.versions.some((v) =>
          v.language &&
          languageFilter.includes(v.language) &&
          v.id !== g.primary_version?.id
        )

        // If we want not dubbed: movie must NOT have a version in these languages but MUST be eligible for them
        const couldHaveSpecificDub = !hasSpecificDub &&
          isAcquiredEligibleForDubbing(g, languageFilter) &&
          !languageFilter.includes(g.primary_version?.language || '')

        if (isAllDubbed) return hasSpecificDub || couldHaveSpecificDub
        if (wantDubbed && hasSpecificDub) return true
        if (wantNotDubbed && couldHaveSpecificDub) return true
        if (wantCannotBeDubbed) {
          // For cannot be dubbed, we want to see movies where these languages are EXPLICITLY restricted
          const isRestrictedForTheseLangs = languageFilter.length > 0 && !isAcquiredEligibleForDubbing(g, languageFilter)
          return isRestrictedForTheseLangs
        }
        return false
      }

      return true
    })

    return data
  }, [groups, searchQuery, dubbedFilter, languageFilter, sourceFilter])

  const handleExport = () => {
    const headerBase = ['Title', 'Source', 'Year', 'Status']
    const headers = [...headerBase, ...langColumns]
    const rows = filtered.map((group) => {
      const isDubbed = group.total_versions > 1
      const base = [
        group.title,
        group.source === 'home_production' ? 'Home' : 'Acquired',
        group.release_year ?? '',
        isDubbed ? `Dubbed (${group.total_versions} versions)` : 'Not Dubbed Yet',
      ]
      const langValues = langColumns.map((langName) => group.versions.some((v) => v.language === langName) ? 'Yes' : '')
      return [...base, ...langValues]
    })
    const csvContent = [headers, ...rows].map((row) =>
      row.map((cell) => {
        const str = String(cell ?? '')
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str
      }).join(',')
    ).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'dubbed-movies.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const dubbedCount = groups.filter((g) => g.total_versions > 1).length
  const eligibleNotDubbedCount = groups.filter((g) => g.total_versions <= 1 && (g.source === 'home_production' || isAcquiredEligibleForDubbing(g, []))).length
  const cannotBeDubbedCount = groups.filter((g) => g.total_versions <= 1 && g.source === 'acquired' && !isAcquiredEligibleForDubbing(g, [])).length

  const dubbedLabel =
    dubbedFilter.includes('all') || (dubbedFilter.includes('dubbed') && dubbedFilter.includes('not_dubbed') && dubbedFilter.includes('cannot_be_dubbed'))
      ? 'All Status'
      : dubbedFilter.map((v) => (v === 'dubbed' ? 'Dubbed' : v === 'not_dubbed' ? 'Eligible to Dub' : 'Cannot be Dubbed')).join(', ')

  const langLabel =
    languageFilter.length === 0
      ? 'All Languages'
      : languageFilter.length === 1
        ? languageFilter[0]
        : `${languageFilter.length} languages`

  const hasActiveFilters = searchQuery || !dubbedFilter.includes('dubbed') || dubbedFilter.length !== 1 || languageFilter.length > 0 || sourceFilter !== 'all'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Compact toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-48 flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-faint)" }} />
          <Input placeholder="Search movies…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
          {searchQuery && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }} onClick={() => setSearchQuery('')}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Dubbed status multi-select */}
        <Popover open={dubbedPopoverOpen} onOpenChange={setDubbedPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Film className="h-3.5 w-3.5" style={{ color: "var(--text-faint)" }} />
              {dubbedLabel}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start" style={{ background: "var(--panel-solid)", border: "1px solid var(--svf-border-strong)", borderRadius: 11 }}>
            <div className="space-y-0.5">
              {(['all', 'dubbed', 'not_dubbed', 'cannot_be_dubbed'] as DubbedFilter[]).map((val) => (
                <label key={val} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer text-sm" style={{ color: "var(--text-dim)" }}>
                  <Checkbox checked={isDubbedFilterActive(val)} onCheckedChange={() => toggleDubbedFilter(val)} />
                  {val === 'all' ? 'All Status' : val === 'dubbed' ? 'Dubbed' : val === 'not_dubbed' ? 'Eligible to Dub' : 'Cannot be Dubbed'}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Source filter pills */}
        <div className="flex items-center glass-card p-1 rounded-[10px] h-9">
          {(['all', 'home_production', 'acquired'] as const).map((s) => (
            <button key={s} onClick={() => setSourceFilter(s)}
              className={cn('px-3 py-1 rounded-[7px] text-xs font-semibold transition-all',
                sourceFilter === s ? 'bg-(--bg-raise) text-(--text) shadow-sm' : 'text-(--text-faint) hover:text-(--text)'
              )}>
              {s === 'all' ? 'All' : s === 'home_production' ? 'Home' : 'Acquired'}
            </button>
          ))}
        </div>

        {/* Language multi-select */}
        <Popover open={langPopoverOpen} onOpenChange={setLangPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Languages className="h-3.5 w-3.5" style={{ color: "var(--text-faint)" }} />
              {langLabel}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 max-h-72 overflow-y-auto" align="start" style={{ background: "var(--panel-solid)", border: "1px solid var(--svf-border-strong)", borderRadius: 11 }}>
            <div className="space-y-0.5">
              {ALL_LANGUAGES.map((lang) => (
                <label key={lang} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer text-sm" style={{ color: "var(--text-dim)" }}>
                  <Checkbox checked={languageFilter.includes(lang)} onCheckedChange={() => toggleLanguage(lang)} />
                  {lang}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1.5" style={{ color: "var(--text-faint)" }}
            onClick={() => { setSearchQuery(''); setDubbedFilter(['dubbed']); setLanguageFilter([]); setSourceFilter('all'); }}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}

        <div className="flex-1" />
        <Button onClick={handleExport} disabled={filtered.length === 0} variant="outline" size="sm" className="h-9 gap-2 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>{filtered.length} titles</span>
      </div>

      {dubbedFilter.includes('not_dubbed') && !dubbedFilter.includes('dubbed') && !dubbedFilter.includes('all') && languageFilter.length > 0 && (
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          Showing movies <span className="font-medium" style={{ color: "var(--text)" }}>not dubbed</span> in: {languageFilter.join(', ')}
        </p>
      )}

      {/* ── Table ── */}
      <div className="glass-card overflow-hidden">
        <div className="w-full overflow-x-auto">
          <Table className="min-w-max">
            <TableHeader style={{ background: "var(--bg-deep)" }}>
              <TableRow className="border-(--svf-border) hover:bg-transparent">
                <TableHead className="w-65 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Title</TableHead>
                <TableHead className="w-20 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Source</TableHead>
                <TableHead className="w-16 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Year</TableHead>
                <TableHead className="w-36 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Status</TableHead>
                {langColumns.map((lc) => (
                  <TableHead key={lc} className="text-center w-24 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">{lc}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4 + langColumns.length} className="text-center py-16" style={{ color: "var(--text-faint)" }}>
                    No movies found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((group) => {
                  const isDubbed = group.total_versions > 1
                  const groupLangs = new Set(group.versions.map((v) => v.language).filter(Boolean))
                  const allowedDubbingLangs = group.source === 'acquired'
                    ? getDubbingRightsLanguages(group.primary_version?.dubbing_rights)
                    : null
                  return (
                    <TableRow key={group.production_no}
                      className={cn("transition-colors", isDubbed && "border-l-2 border-l-emerald-500/50")}
                    >
                      <TableCell className="font-medium">
                        <Link href={`/movies/${group.primary_version?.id ?? ''}`}
                          className="hover:text-red-400 transition-colors" style={{ color: "var(--text)" }}>
                          {group.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border",
                          group.source === 'home_production'
                            ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                            : "bg-violet-500/15 text-violet-400 border-violet-500/30"
                        )}>
                          {group.source === 'home_production' ? 'Home' : 'Acquired'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm" style={{ color: "var(--text-faint)" }}>
                        {group.release_year ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </TableCell>
                      <TableCell>
                        {isDubbed ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Dubbed ({group.total_versions - 1}v)
                          </span>
                        ) : (group.source === 'acquired' && allowedDubbingLangs?.length === 0) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
                            Cannot be Dubbed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Not Dubbed Yet
                          </span>
                        )}
                      </TableCell>
                      {langColumns.map((lc) => {
                        const hasDub = group.versions.some(v => v.language?.toLowerCase() === lc.toLowerCase() && v.id !== group.primary_version?.id)
                        const isPrimary = group.primary_version?.language?.toLowerCase() === lc.toLowerCase()
                        const isNotAllowed =
                          !isPrimary &&
                          group.source === 'acquired' &&
                          allowedDubbingLangs !== null &&
                          !allowedDubbingLangs.some((al) => al.toLowerCase() === lc.toLowerCase())
                        return (
                          <TableCell key={lc} className="text-center">
                            {hasDub ? (
                              <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                            ) : isNotAllowed ? (
                              <XCircle className="h-4 w-4 text-red-500/60 mx-auto" />
                            ) : null}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

      </div>
    </div>
  )
}
