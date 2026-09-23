'use client'

import { stringListCodec, useUrlFilterState } from '@/hooks/use-url-filter-state'
import { useEffect, useRef } from 'react'

/**
 * useMultiSelectFilterState, but mirrored to the URL so the selection survives
 * navigating away and coming back.
 *
 * Keeps the original's seeding rule: the first time a non-empty option list
 * arrives, seed to "all selected" — but only when the URL carried no value, or
 * a link's explicit selection would be overwritten the moment options load.
 *
 * "All selected" is treated as the default and so is never written to the URL:
 * it means the same as no filter, and would otherwise put every option in every
 * link.
 */
export function useUrlMultiSelectFilterState<T extends string>(
  key: string,
  allOptions: T[]
): [T[], (v: T[]) => void] {
  const isAll = (v: string[]) =>
    allOptions.length > 0 && v.length >= allOptions.length

  const [value, setValue] = useUrlFilterState<string[]>(
    key,
    allOptions,
    stringListCodec,
    isAll
  )

  const initialized = useRef(allOptions.length > 0)
  const hadUrlValue = useRef(value.length > 0 && !isAll(value))

  useEffect(() => {
    if (initialized.current || allOptions.length === 0) return
    initialized.current = true
    // A selection restored from the URL wins over the "seed to all" default.
    if (!hadUrlValue.current) setValue(allOptions)
    // setValue changes identity with the query string; re-running on it would
    // reseed mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOptions])

  return [value as T[], setValue as (v: T[]) => void]
}
