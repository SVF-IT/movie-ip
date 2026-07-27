/**
 * Escapes a user-supplied search term for safe use inside a Supabase/PostgREST
 * `.or()` filter string, where `,`, `(`, `)`, and `%` are syntactically significant.
 */
export function escapeOrSearchTerm(term: string): string {
  return term.replace(/[,()%]/g, "");
}
