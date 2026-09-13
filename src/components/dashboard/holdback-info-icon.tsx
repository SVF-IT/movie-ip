'use client'

import { TokenPreview } from '@/components/dashboard/token-preview'
import type { HoldbackInfo } from '@/lib/utils/holdbacks'

/** Dedupe tokens across sources so "AVOD" listed twice shows once. */
function uniqueTokens(info: HoldbackInfo): string[] {
  const seen = new Map<string, string>()
  for (const entry of info.entries) {
    for (const t of entry.tokens) {
      const key = t.toLowerCase()
      if (!seen.has(key)) seen.set(key, t.toUpperCase())
    }
  }
  return Array.from(seen.values())
}

/**
 * Compact holdback cell: first token + "+N" on one line, full per-source
 * breakdown on hover. Uses the same preview as the "Open for" column so both
 * behave identically and never change row height.
 */
export function HoldbackInfoIcon({ info }: { info: HoldbackInfo }) {
  return (
    <TokenPreview title="Holdbacks" tone="amber" tokens={uniqueTokens(info)}>
      <div className="space-y-2">
        {info.entries.map((entry, i) => (
          <div key={i}>
            <div className="text-xs font-medium text-(--text-faint)">{entry.source}</div>
            <div className="text-(--text) break-words">{entry.tokens.join(', ')}</div>
          </div>
        ))}
      </div>
    </TokenPreview>
  )
}
