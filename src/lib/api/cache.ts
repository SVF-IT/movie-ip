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
