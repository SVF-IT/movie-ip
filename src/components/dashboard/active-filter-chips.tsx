'use client'

import { X } from 'lucide-react'

export interface ActiveFilterChip {
  /** Stable key, used for React keys and dedupe. */
  key: string
  /** Greyed field name, e.g. "Language". */
  label: string
  /** Bold current value, e.g. "Bengali". */
  value: string
  /** Resets just this filter. */
  onClear: () => void
}

interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[]
  /** Resets every filter at once. */
  onClearAll: () => void
  /**
   * Whether controls are rendered above this row. The divider only makes sense
   * as a separator — with the filters now in the column headers there is often
   * nothing above it, and the rule would float on its own.
   */
  divider?: boolean
}

/**
 * Shows which filters are currently narrowing the list, each removable on its own.
 *
 * With no filters active it still renders a short "No filters applied" line
 * rather than nothing: the surrounding panel is drawn by the caller, so
 * returning null left a bordered box with nothing in it.
 */
export function ActiveFilterChips({ chips, onClearAll, divider = false }: ActiveFilterChipsProps) {
  const wrapperCls = divider
    ? 'mt-3 pt-2.5 border-t border-(--filter-border) flex flex-wrap items-center gap-1.5'
    : 'flex flex-wrap items-center gap-1.5'

  if (chips.length === 0) {
    return (
      <div className={wrapperCls}>
        <span className="text-[12px] text-(--text-dim)">No filters applied</span>
      </div>
    )
  }

  return (
    <div className={wrapperCls}>
      <span className="text-[12px] text-(--text-dim)">Filtering by</span>

      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-[8px] bg-(--coral-bg) px-2 py-1 text-[12px] text-(--coral-text)"
        >
          <span>{chip.label}: <b className="font-semibold">{chip.value}</b></span>
          <button
            type="button"
            onClick={chip.onClear}
            aria-label={`Remove ${chip.label} filter`}
            className="grid h-4 w-4 place-items-center rounded-[4px] text-(--coral-text) transition-opacity hover:opacity-70"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="ml-0.5 cursor-pointer border-0 bg-transparent text-[12px] text-(--coral-border) hover:underline"
      >
        Clear all
      </button>
    </div>
  )
}
