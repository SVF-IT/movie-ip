import { useEffect, useRef, useState } from 'react'

/**
 * Multi-select filter state that seeds to "all options selected" the first
 * time a non-empty option list becomes available, then behaves as plain
 * useState after that (so the user can freely clear down to zero without
 * being re-seeded back to "all").
 */
export function useMultiSelectFilterState<T extends string>(allOptions: T[]): [T[], (v: T[]) => void] {
  const [value, setValue] = useState<T[]>(allOptions)
  const initialized = useRef(allOptions.length > 0)

  useEffect(() => {
    if (!initialized.current && allOptions.length > 0) {
      initialized.current = true
      setValue(allOptions)
    }
  }, [allOptions])

  return [value, setValue]
}
