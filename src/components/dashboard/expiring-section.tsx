'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SortableHeader } from '@/components/ui/sortable-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSortableTable } from '@/hooks/use-sortable-table'
import { getExpiringRights } from '@/lib/api/movies'
import type { ExpiringRight } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { addDays, format } from 'date-fns'
import { Calendar as CalendarIcon, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

const PLATFORM_OPTIONS = [
  { label: 'Star', keyword: 'star' },
  { label: 'Echo', keyword: 'echo' },
  { label: 'Viacom 18', keyword: 'viacom' },
  { label: 'Hoichoi', keyword: 'hoichoi' },
  { label: 'YouTube', keyword: 'youtube' },
]
const KNOWN_KEYWORDS = PLATFORM_OPTIONS.map((o) => o.keyword)

export function ExpiringSection() {
  const [activeFilter, setActiveFilter] = useState<'7d' | '30d' | '90d' | 'custom'>('90d')
  const [customFromDate, setCustomFromDate] = useState<Date>()
  const [customToDate, setCustomToDate] = useState<Date>()
  const [expiringRights, setExpiringRights] = useState<ExpiringRight[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [rightsTypeFilter, setRightsTypeFilter] = useState<string>('all')

  const rightsTypeOptions = useMemo(() => {
    const names = [...new Set(expiringRights.map(r => r.rights_type_name).filter((n): n is string => Boolean(n)))]
    names.sort()
    return names
  }, [expiringRights])

  const filteredRights = useMemo(() => {
    let data = expiringRights
    if (platformFilter !== 'all') {
      const name = (r: typeof expiringRights[0]) => (r.platform_name || '').toLowerCase()
      if (platformFilter === 'others') {
        data = data.filter(r => !KNOWN_KEYWORDS.some(k => name(r).includes(k)))
      } else {
        data = data.filter(r => name(r).includes(platformFilter))
      }
    }
    if (rightsTypeFilter !== 'all') data = data.filter(r => r.rights_type_name === rightsTypeFilter)
    return data
  }, [expiringRights, platformFilter, rightsTypeFilter])

  const { sortedData: sortedRights, sortConfig: rightsSortConfig, requestSort: requestRightsSort } = useSortableTable(filteredRights)

  useEffect(() => {
    loadExpiringData()
  }, [activeFilter, customFromDate, customToDate])

  const loadExpiringData = async () => {
    setIsLoading(true)
    try {
      const today = new Date()
      let fromDate = today.toISOString().split('T')[0]
      let toDate = ''

      if (activeFilter === 'custom') {
        if (!customFromDate || !customToDate) { setIsLoading(false); return }
        fromDate = customFromDate.toISOString().split('T')[0]
        toDate = customToDate.toISOString().split('T')[0]
      } else {
        const days = activeFilter === '7d' ? 7 : activeFilter === '30d' ? 30 : 90
        toDate = addDays(today, days).toISOString().split('T')[0]
      }

      const rights = await getExpiringRights(fromDate, toDate)
      setExpiringRights(rights)
      setPlatformFilter('all')
      setRightsTypeFilter('all')
    } catch (error) {
      console.error('Error loading expiring data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getUrgencyBadge = (days: number) => {
    if (days < 0) {
      return <Badge variant="destructive" className="bg-red-600/30 text-red-300 border-red-600/50">Expired</Badge>
    } else if (days <= 7) {
      return <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">Critical - {days}d</Badge>
    } else if (days <= 30) {
      return <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/30">Urgent - {days}d</Badge>
    } else {
      return <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Upcoming - {days}d</Badge>
    }
  }

  return (
    <Card className="glass-card border-border/50">
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <TrendingDown className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Upcoming Expiries</h2>
              <p className="text-sm text-muted-foreground">Monitor platform rights expirations</p>
            </div>
          </div>
        </div>

        {/* Date Range Filters */}
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex gap-2">
            <Button variant={activeFilter === '7d' ? 'default' : 'outline'} size="sm" onClick={() => setActiveFilter('7d')}>Next 7 Days</Button>
            <Button variant={activeFilter === '30d' ? 'default' : 'outline'} size="sm" onClick={() => setActiveFilter('30d')}>Next 30 Days</Button>
            <Button variant={activeFilter === '90d' ? 'default' : 'outline'} size="sm" onClick={() => setActiveFilter('90d')}>Next 90 Days</Button>
            <Button variant={activeFilter === 'custom' ? 'default' : 'outline'} size="sm" onClick={() => setActiveFilter('custom')}>Custom Range</Button>
          </div>

          {activeFilter === 'custom' && (
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-[200px] justify-start text-left font-normal h-9', !customFromDate && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customFromDate ? format(customFromDate, 'PP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFromDate} onSelect={setCustomFromDate} captionLayout="dropdown" startMonth={new Date(2000, 0)} endMonth={new Date(2050, 11)} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-[200px] justify-start text-left font-normal h-9', !customToDate && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customToDate ? format(customToDate, 'PP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single" selected={customToDate} onSelect={setCustomToDate}
                      captionLayout="dropdown" startMonth={new Date(2000, 0)} endMonth={new Date(2050, 11)}
                      defaultMonth={customFromDate ? new Date(customFromDate.getFullYear(), customFromDate.getMonth() + 1, 1) : undefined}
                      disabled={(date) => {
                        if (!customFromDate) return false
                        const fromDateOnly = new Date(customFromDate.getFullYear(), customFromDate.getMonth(), customFromDate.getDate())
                        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
                        return dateOnly < fromDateOnly
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 max-w-md">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="bg-background/50 h-9 border-border/60"><SelectValue placeholder="Platform" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {PLATFORM_OPTIONS.map((o) => (<SelectItem key={o.keyword} value={o.keyword}>{o.label}</SelectItem>))}
              <SelectItem value="others">Others</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rightsTypeFilter} onValueChange={setRightsTypeFilter}>
            <SelectTrigger className="bg-background/50 h-9 border-border/60"><SelectValue placeholder="Rights Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rights Types</SelectItem>
              {rightsTypeOptions.map((name) => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        {/* Rights Table */}
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30">
                <SortableHeader column="movie_title" label="Movie" currentSort={rightsSortConfig} onSort={requestRightsSort} />
                <SortableHeader column="movie_source" label="Source" currentSort={rightsSortConfig} onSort={requestRightsSort} />
                <SortableHeader column="platform_name" label="Platform" currentSort={rightsSortConfig} onSort={requestRightsSort} />
                <SortableHeader column="rights_type_name" label="Rights Type" currentSort={rightsSortConfig} onSort={requestRightsSort} />
                <SortableHeader column="end_date" label="End Date" currentSort={rightsSortConfig} onSort={requestRightsSort} />
                <SortableHeader column="days_until_expiry" label="Urgency" currentSort={rightsSortConfig} onSort={requestRightsSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={7}><div className="h-10 bg-muted/50 rounded animate-pulse" /></TableCell></TableRow>
                ))
              ) : sortedRights.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No expiring rights in the selected date range</TableCell></TableRow>
              ) : (
                sortedRights.map((right) => (
                  <TableRow key={right.id} className="border-border/50 hover:bg-muted/20">
                    <TableCell className="font-medium">
                      <Link href={`/movies/${right.movie_id}`} className="hover:text-primary transition-colors">{right.movie_title}</Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(right.movie_source === 'home_production' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-purple-500/10 text-purple-400 border-purple-500/30')}>
                        {right.movie_source === 'home_production' ? 'Home' : 'Acquired'}
                      </Badge>
                    </TableCell>
                    <TableCell>{right.platform_name || '-'}</TableCell>
                    <TableCell>{right.rights_type_name || '-'}</TableCell>
                    <TableCell>{right.end_date ? format(new Date(right.end_date), 'MMM dd, yyyy') : '-'}</TableCell>
                    <TableCell>{getUrgencyBadge(right.days_until_expiry)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild><Link href={`/movies/${right.movie_id}`}>View</Link></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/expiring">View All Expiring Items →</Link>
          </Button>
        </div>
      </div>
    </Card>
  )
}
