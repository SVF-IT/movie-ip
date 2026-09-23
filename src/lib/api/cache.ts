/**
 * Shared invalidation hook for the dashboard's read caches.
 *
 * The rights dashboard caches its stat-card results and the movie_rights rows
 * behind them, so switching tabs or re-applying a filter doesn't re-run work
 * that was just done. Those caches must be dropped whenever rights are edited,
 * or the dashboard would keep serving pre-edit numbers until they expire.
 *
 * This lives in its own module rather than in dashboard.ts so the mutation
 * modules (rights.ts, movie-rights.ts) can trigger invalidation without
 * importing the dashboard — which would create an import cycle.
 */

const listeners = new Set<() => void>()

/** Register a cache-clearing callback. Returns an unsubscribe function. */
export function onRightsMutated(clear: () => void): () => void {
  listeners.add(clear)
  return () => listeners.delete(clear)
}

/** Call after any write that changes rights data. */
export function notifyRightsMutated(): void {
  for (const clear of listeners) clear()
}

/**
 * Call after any write that changes movie data.
 *
 * Movie edits invalidate the same read caches, so this is an alias kept
 * separate for readability at the call sites.
 */
export const notifyDataMutated = notifyRightsMutated;

/**
 * Keyed, short-lived cache for read queries.
 *
 * Returning to a list — via the back button, or by re-applying a filter you
 * just cleared — asks the database the same question again. This holds the
 * answer briefly so that round trip is skipped and the list paints instantly.
 *
 * The key must name every input that changes the result, so a hit always means
 * the identical question was asked recently; a new filter can never be served
 * another filter's rows. In-flight promises are cached too, so two components
 * mounting at once share one request rather than racing.
 *
 * The TTL is deliberately short. This makes navigation feel instant without
 * holding data long enough to show someone a figure that has since changed —
 * and any rights write clears it outright, via notifyRightsMutated.
 */
const QUERY_TTL_MS = 30_000
const queryCache = new Map<string, { at: number; value: Promise<unknown> }>()

export function cachedQuery<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = queryCache.get(key)
  if (hit && Date.now() - hit.at < QUERY_TTL_MS) return hit.value as Promise<T>

  const value = compute().catch((err) => {
    // Never cache a failure: the next call should retry rather than be handed
    // a rejected promise for the rest of the TTL.
    queryCache.delete(key)
    throw err
  })
  queryCache.set(key, { at: Date.now(), value })
  return value
}

/** Drop every cached read. */
export function invalidateQueryCache(): void {
  queryCache.clear()
}

// A write to rights data invalidates these reads too, so an edit shows up
// immediately rather than after the TTL expires.
onRightsMutated(invalidateQueryCache)
