import { createClient } from '@/lib/supabase/client'

/**
 * Prefix mapping for auto-generated entity codes.
 */
export const CODE_PREFIXES = {
  movies: 'MOV',
} as const

/**
 * Generates the next sequential code for an entity.
 * Format: PREFIX-0001, PREFIX-0002, etc.
 *
 * Queries the given table for the highest existing code with that prefix,
 * parses the numeric suffix, and increments by 1.
 *
 * Race condition is mitigated by a UNIQUE constraint on the code column
 * in the database — if two concurrent inserts generate the same code,
 * one will fail and can be retried.
 */
export async function generateNextCode(prefix: string, table: string, codeField: string = 'code'): Promise<string> {
  const supabase = createClient()

  const { data, error } = await supabase.from(table).select(codeField).like(codeField, `${prefix}-%`).order(codeField, { ascending: false }).limit(1)

  if (error || !data || data.length === 0) {
    return `${prefix}-0001`
  }

  const lastCode = data[0][codeField] as string
  const numericPart = parseInt(lastCode.split('-').pop() || '0', 10)
  const nextNum = numericPart + 1
  return `${prefix}-${String(nextNum).padStart(4, '0')}`
}
