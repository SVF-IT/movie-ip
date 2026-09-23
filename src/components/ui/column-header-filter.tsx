'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TableHead } from '@/components/ui/table'
import type { SortConfig } from '@/hooks/use-sortable-table'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronsUpDown, ChevronUp, Filter, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'

export type ColumnFilterOption = string | { value: string; label: string }

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const set = new Set(b)
  return a.every((v) => set.has(v))
}

function normalize(options: ColumnFilterOption[]): { value: string; label: string }[] {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
}

/**
 * Excel-style filter funnel that lives inside a column header.
 *
 * Renders only the funnel button + popover — the caller supplies the label,
 * so this composes with either a plain TableHead or a SortableHeader.
 */
export function ColumnFilter({
  options,
  value,
  onChange,
  searchable = false,
  align = 'start',
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
}: {
  options: ColumnFilterOption[]
  value: string[]
  onChange: (next: string[]) => void
  searchable?: boolean
  align?: 'start' | 'center' | 'end'
  /**
   * Makes the search box controlled by the caller, so typing drives the
   * query that fetches rows rather than only narrowing the checkbox list.
   * Omit both to keep the box local to this popover.
   */
  searchValue?: string
  onSearchChange?: (next: string) => void
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  // Excel-style: ticking boxes edits a local draft, and the filter is applied
  // once when the popover closes. Without this every click refetches the rows.
  const [draft, setDraft] = useState<string[] | null>(null)
  const isControlledSearch = onSearchChange !== undefined
  const search = isControlledSearch ? (searchValue ?? '') : localSearch
  const setSearch = isControlledSearch ? onSearchChange : setLocalSearch

  const opts = useMemo(() => normalize(options), [options])
  const allValues = useMemo(() => opts.map((o) => o.value), [opts])
  const visible = useMemo(() => {
    // A controlled search already narrowed the rows these options came from,
    // so filtering the list again here would hide valid choices.
    if (!searchable || isControlledSearch || !search.trim()) return opts
    const q = search.trim().toLowerCase()
    return opts.filter((o) => o.label.toLowerCase().includes(q))
  }, [opts, search, searchable, isControlledSearch])

  // While the popover is open the checkboxes reflect the uncommitted draft.
  const selected = draft ?? value

  // "Filtered" means a strict subset — all-selected reads as no filter.
  // A live search term counts too, since it narrows what the column shows.
  const isFiltered =
    (selected.length > 0 && selected.length < allValues.length) ||
    (isControlledSearch && search.trim().length > 0)
  const allChecked = selected.length >= allValues.length

  const toggle = (v: string) =>
    setDraft(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])

  // Committing on close keeps the draft from lingering into the next open, and
  // skips the update entirely when nothing actually changed.
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      if (draft && !sameSet(draft, value)) onChange(draft)
      setDraft(null)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center justify-center h-4 w-4 rounded-[4px] shrink-0 transition-colors align-middle',
            isFiltered
              ? 'text-amber-400 bg-amber-500/15'
              : 'text-(--text-faint) opacity-60 hover:opacity-100 hover:bg-(--hover)'
          )}
          aria-label={isFiltered ? 'Column filtered' : 'Filter column'}
        >
          <Filter className={cn('h-3 w-3', isFiltered && 'fill-current')} />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-52 p-0 rounded-[10px]" onClick={(e) => e.stopPropagation()}>
        {searchable && (
          <div className="relative border-b border-(--svf-border) p-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3 w-3 text-(--text-faint)" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className={cn('h-7 pl-7 text-xs rounded-[6px]', search && 'pr-7')}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 text-(--text-faint) hover:text-red-400 transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-(--svf-border)">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={allChecked}
              onCheckedChange={(c) => setDraft(c === true ? allValues : [])}
              className="h-3.5 w-3.5"
            />
            <span className="text-xs text-(--text)">Select all</span>
          </label>
          {isFiltered && (
            <button
              onClick={() => setDraft(allValues)}
              className="text-[10px] text-(--text-faint) hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {visible.length === 0 && (
            <p className="px-3 py-2 text-xs text-(--text-faint)">No matches</p>
          )}
          {visible.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-(--hover)"
            >
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={() => toggle(o.value)}
                className="h-3.5 w-3.5"
              />
              <span className="text-xs text-(--text) truncate" title={o.label}>{o.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A plain (non-sortable) header cell with a filter funnel beside its label. */
export function FilterableHead({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <TableHead className={className}>
      <span className="inline-flex items-center whitespace-nowrap">
        {label}
        {children}
      </span>
    </TableHead>
  )
}

/**
 * A sortable header cell that also carries a filter funnel.
 *
 * SortableHeader renders its own TableHead, so this reimplements the sort
 * affordance inline rather than nesting one TableHead inside another. The
 * funnel sits outside the sort-triggering region and stops propagation, so
 * clicking it never re-sorts the column.
 */
export function SortableFilterableHead({
  column,
  label,
  currentSort,
  onSort,
  className,
  children,
}: {
  column: string
  label: string
  currentSort: SortConfig | null
  onSort: (column: string) => void
  className?: string
  children?: React.ReactNode
}) {
  const isActive = currentSort?.column === column
  const direction = isActive ? currentSort.direction : null

  return (
    <TableHead className={cn('select-none', isActive && 'text-(--text)', className)}>
      <div className="flex items-center gap-0.5 whitespace-nowrap">
        <button
          type="button"
          onClick={() => onSort(column)}
          className="flex items-center gap-0.5 cursor-pointer hover:underline"
        >
          <span>{label}</span>
          <span className="inline-flex shrink-0">
            {direction === 'asc' ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : direction === 'desc' ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
            )}
          </span>
        </button>
        {children}
      </div>
    </TableHead>
  )
}

/** Inline date-range picker for a column header (e.g. Sunset Date). */
export function ColumnDateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  renderInput,
}: {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  renderInput: (value: string, onChange: (v: string) => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const isFiltered = Boolean(from || to)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center justify-center h-4 w-4 rounded-[4px] shrink-0 transition-colors align-middle',
            isFiltered
              ? 'text-amber-400 bg-amber-500/15'
              : 'text-(--text-faint) opacity-60 hover:opacity-100 hover:bg-(--hover)'
          )}
          aria-label={isFiltered ? 'Date range filtered' : 'Filter date range'}
        >
          <Filter className={cn('h-3 w-3', isFiltered && 'fill-current')} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2.5 rounded-[10px]" onClick={(e) => e.stopPropagation()}>
        <p className="text-[10px] font-medium uppercase tracking-[.06em] text-(--filter-label) mb-1.5">
          Rights window
        </p>
        <div className="flex items-center gap-1.5">
          {renderInput(from, onFromChange)}
          <span className="text-(--filter-label) text-[10px] font-medium uppercase px-0.5">to</span>
          {renderInput(to, onToChange)}
          {isFiltered && (
            <button
              onClick={() => { onFromChange(''); onToChange('') }}
              className="ml-0.5 p-0.5 text-(--text-faint) hover:text-red-400 transition-colors"
              aria-label="Clear date range"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
