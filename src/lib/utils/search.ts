/**
 * Escapes a user-supplied search term for safe use inside a Supabase/PostgREST
 * `.or()` filter string, where `,`, `(`, `)`, and `%` are syntactically significant.
 */
export function escapeOrSearchTerm(term: string): string {
  return term.replace(/[,()%]/g, "");
}

/**
 * A term wrapped for a substring (contains) match: `%term%`.
 *
 * Searches match anywhere in the value, not just at the start — people
 * remember a word from the middle of a title far more often than its first
 * word ("bridge" finds "Howrah Bridge").
 */
export function containsTerm(term: string): string {
  return `%${escapeOrSearchTerm(term)}%`;
}

/**
 * A PostgREST `.or()` clause matching the term anywhere in any of `columns`.
 *
 *   query.or(orContains(search, ["title", "production_no"]))
 */
export function orContains(term: string, columns: string[]): string {
  const escaped = escapeOrSearchTerm(term);
  return columns.map((c) => `${c}.ilike.%${escaped}%`).join(",");
}
