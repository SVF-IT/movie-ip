'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Filter state that survives navigating away and coming back.
 *
 * Filters held in plain React state are lost the moment the component unmounts,
 * so opening a movie from a filtered list and pressing back returned you to an
 * unfiltered one. Keeping them in the URL means the browser restores them for
 * free — back, forward, refresh and a pasted link all rebuild the same view.
 *
 * Values are written with `replace`, not `push`, so adjusting a filter never
 * adds a history entry: back should leave the list, not undo six filter clicks.
 */

/** Serializes to/from a query-string value. */
export interface UrlCodec<T> {
  encode: (value: T) => string | null
  decode: (raw: string) => T
}

export const stringCodec: UrlCodec<string> = {
  encode: (v) => v || null,
  decode: (raw) => raw,
}

export const stringListCodec: UrlCodec<string[]> = {
  // Commas are the separator, so any in a value are escaped on the way out.
  encode: (v) => (v.length ? v.map((s) => s.replace(/,/g, '%2C')).join(',') : null),
  decode: (raw) => (raw ? raw.split(',').map((s) => s.replace(/%2C/g, ',')) : []),
}

/**
 * Several filters can be set from one event handler — picking an expiry year
 * writes the year, the from-date and the to-date. Each hook instance builds its
 * next query string from the `searchParams` of the render it was created in, so
 * without this the second write would be based on pre-first-write params and
 * silently drop the first one. Writes within the same tick are therefore
 * accumulated here and applied on top of each other; the batch is discarded as
 * soon as the router hands back a new query string.
 */
let pendingParams: { base: string; params: URLSearchParams } | null = null

function applyPending(searchParams: URLSearchParams): URLSearchParams {
  const base = searchParams.toString()
  if (pendingParams && pendingParams.base === base) return pendingParams.params
  const params = new URLSearchParams(Array.from(searchParams.entries()))
  pendingParams = { base, params }
  return params
}

/**
 * One filter value, mirrored to `?key=`.
 *
 * `defaultValue` is never written to the URL — a default carries no information
 * and would bloat every link — so a value equal to it removes the parameter.
 */
export function useUrlFilterState<T>(
  key: string,
  defaultValue: T,
  codec: UrlCodec<T>,
  isDefault: (value: T) => boolean = (v) => codec.encode(v) === codec.encode(defaultValue)
): [T, (next: T) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const raw = searchParams.get(key)
  // The URL is the source of truth, but decoding on every render would rebuild
  // arrays and retrigger effects downstream, so the decoded value is memoized
  // against the raw string it came from.
  const [value, setValue] = useState<T>(() => (raw === null ? defaultValue : codec.decode(raw)))
  const lastRaw = useRef<string | null>(raw)

  useEffect(() => {
    if (raw === lastRaw.current) return
    lastRaw.current = raw
    setValue(raw === null ? defaultValue : codec.decode(raw))
    // defaultValue and codec are stable per call site; tracking them would
    // reset the value whenever the caller re-created an inline object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw])

  const update = useCallback(
    (next: T) => {
      setValue(next)
      const params = applyPending(searchParams)
      const encoded = isDefault(next) ? null : codec.encode(next)
      if (encoded === null) params.delete(key)
      else params.set(key, encoded)
      lastRaw.current = encoded
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [codec, isDefault, key, pathname, router, searchParams]
  )

  return [value, update]
}
