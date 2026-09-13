'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface TokenPreviewProps {
  /** Short labels, e.g. ["AVOD", "SVOD", …]. */
  tokens: string[]
  /** Popover heading. */
  title: string
  /** 'emerald' = available, 'amber' = restricted. */
  tone: 'emerald' | 'amber'
  /** Optional richer breakdown; falls back to the token list. */
  children?: React.ReactNode
}

const TONES = {
  emerald: { bg: 'color-mix(in oklch, var(--st-active) 13%, transparent)', fg: 'var(--st-active)' },
  amber: { bg: 'color-mix(in oklch, var(--st-expiring) 14%, transparent)', fg: 'var(--st-expiring)' },
}

/**
 * One-line preview of a token list: first token + "+N", expanded on hover.
 * Table cells must never wrap — a wrapping list makes rows different heights
 * and the table hard to scan.
 */
export function TokenPreview({ tokens, title, tone, children }: TokenPreviewProps) {
  const [open, setOpen] = useState(false)

  if (tokens.length === 0) {
    return <span className="text-(--text-faint) opacity-50">—</span>
  }

  const c = TONES[tone]
  const extra = tokens.length - 1

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full max-w-[88px] items-center gap-1 overflow-hidden whitespace-nowrap rounded-[6px] text-left transition-opacity hover:opacity-75"
          title={tokens.join(', ')}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          aria-label={`${title}: ${tokens.join(', ')}`}
        >
          <span
            className="min-w-0 truncate rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide"
            style={{ background: c.bg, color: c.fg }}
          >
            {tokens[0]}
          </span>
          {extra > 0 && (
            <span className="shrink-0 text-[10.5px] font-medium text-(--text-faint)">+{extra}</span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-72 text-sm"
        align="start"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="mb-2 font-semibold text-(--text)">{title}</div>
        {children ?? (
          <div className="flex flex-wrap gap-1">
            {tokens.map((t) => (
              <span
                key={t}
                className="rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold break-words"
                style={{ background: c.bg, color: c.fg }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
