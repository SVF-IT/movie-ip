'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { HoldbackInfo } from '@/lib/utils/holdbacks'
import { Info } from 'lucide-react'

export function HoldbackInfoIcon({ info }: { info: HoldbackInfo }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!info.hasAny}
          className="inline-flex items-center justify-center rounded-full p-1 transition-colors disabled:cursor-default"
          style={{
            color: info.hasAny ? 'var(--st-expiring)' : 'var(--text-faint)',
            opacity: info.hasAny ? 1 : 0.4,
          }}
          aria-label={info.hasAny ? 'View holdback details' : 'No holdbacks'}
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      {info.hasAny && (
        <PopoverContent className="w-72 text-sm" align="start">
          <div className="font-semibold mb-2 text-(--text)">Holdbacks</div>
          <div className="space-y-2">
            {info.entries.map((entry, i) => (
              <div key={i}>
                <div className="text-xs font-medium text-(--text-faint)">{entry.source}</div>
                <div className="text-(--text)">{entry.tokens.join(', ')}</div>
              </div>
            ))}
          </div>
        </PopoverContent>
      )}
    </Popover>
  )
}
