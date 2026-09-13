'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Search, X } from 'lucide-react'

export type MultiSelectOption = string | { value: string; label: string }

export interface MultiSelectExtraPresetRow {
  key: string
  label: string
  isActive: (value: string[]) => boolean
  onSelect: () => void
}

export interface MultiSelectFilterProps {
  label: string
  options: MultiSelectOption[]
  value: string[]
  onChange: (next: string[]) => void
  searchable?: boolean
  accent?: 'purple' | 'blue' | 'emerald' | 'amber'
  triggerWidth?: string
  extraPresetRows?: MultiSelectExtraPresetRow[]
  disabled?: boolean
  icon?: React.ReactNode
}

const ACCENT_CLASSES: Record<NonNullable<MultiSelectFilterProps['accent']>, string> = {
  purple: 'border-purple-500/60 text-purple-400 bg-purple-500/5',
  blue: 'border-blue-500/60 text-blue-400 bg-blue-500/5',
  emerald: 'border-emerald-500/60 text-emerald-400 bg-emerald-500/5',
  amber: 'border-amber-500/60 text-amber-400 bg-amber-500/5',
}

function normalizeOptions(options: MultiSelectOption[]): { value: string; label: string }[] {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
}

export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  searchable = false,
  accent = 'blue',
  triggerWidth = 'w-40',
  extraPresetRows = [],
  disabled = false,
  icon,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const opts = useMemo(() => normalizeOptions(options), [options])
  const allValues = useMemo(() => opts.map((o) => o.value), [opts])

  const filteredOpts = useMemo(() => {
    if (!searchable || !search.trim()) return opts
    const q = search.toLowerCase()
    return opts.filter((o) => o.label.toLowerCase().includes(q))
  }, [opts, search, searchable])

  const isAllSelected = value.length > 0 && value.length === opts.length
  const isPartial = value.length > 0 && value.length < opts.length
  const isNoneSelected = value.length === 0

  const triggerLabel = isNoneSelected || isAllSelected
    ? label
    : value.length === 1
      ? (opts.find((o) => o.value === value[0])?.label ?? value[0])
      : `${value.length} selected`

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch('') }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={`h-9 rounded-[8px] ${triggerWidth} justify-start gap-1.5 text-sm font-normal bg-(--filter-panel-bg) hover:border-(--filter-border-hover) transition-colors ${isPartial || isNoneSelected ? 'border-(--coral-border) bg-(--coral-bg) text-(--coral-text)' : 'border-(--filter-border) text-(--text)'}`}
        >
          {icon}
          <span className="truncate flex-1 text-left">{triggerLabel}</span>
          {(isPartial || isNoneSelected) && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(allValues) }}
              className="hover:text-red-400 transition-colors shrink-0"
              title="Reset to all"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 bg-(--panel-solid) border-(--svf-border)/60 shadow-xl" align="start">
        {searchable && (
          <div className="relative mb-1.5">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-(--text-faint)" />
            <Input
              autoFocus
              placeholder={`Search ${label.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs placeholder:text-(--text-faint)"
            />
          </div>
        )}

        <div className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-(--hover) cursor-pointer transition-colors"
          onClick={() => onChange(isAllSelected ? [] : allValues)}>
          <Checkbox checked={isAllSelected} className="h-3.5 w-3.5" />
          <span className="text-xs text-(--text)">Select All</span>
        </div>

        {extraPresetRows.length > 0 && (
          <div className="border-t border-(--svf-border) mt-1 pt-1 mb-1 space-y-0.5">
            {extraPresetRows.map((row) => (
              <div key={row.key} className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-(--hover) cursor-pointer transition-colors"
                onClick={row.onSelect}>
                <Checkbox checked={row.isActive(value)} className="h-3.5 w-3.5" />
                <span className="text-xs text-(--text)">{row.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-(--svf-border) mt-1 pt-1 max-h-56 overflow-y-auto space-y-0.5">
          {filteredOpts.length === 0 ? (
            <p className="text-xs text-(--text-faint) px-1.5 py-2">No matches</p>
          ) : (
            filteredOpts.map((o) => (
              <div key={o.value} className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-(--hover) cursor-pointer transition-colors"
                onClick={() => toggle(o.value)}>
                <Checkbox checked={value.includes(o.value)} className="h-3.5 w-3.5" />
                <span className="text-xs text-(--text) truncate">{o.label}</span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
