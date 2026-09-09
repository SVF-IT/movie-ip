/**
 * Pure aggregation for the BARC page — no Supabase import, so it can be
 * unit-tested and reused server-side.
 */

export interface BarcTelecastAggRow {
  movie_id: string | null;
  description_raw: string;
  telecast_year: number | null;
  target: string;
  channel: string | null;
  region: string | null;
  week: number | null;
  telecast_date: string;
  rat_pct: number | null;
  daily_avg_rch_pct: number | null;
  ats_sec: number | null;
  grp: number | null;
}

/**
 * Aggregates one movie's telecast rows.
 *
 * Weekly-first, per the reporting rules:
 *   rating = average across weeks of (average rat% within the week)
 *   grp    = average across weeks of (sum of grp within the week)
 *
 * Averaging per week first, rather than over all rows at once, keeps weeks
 * with more telecasts from dominating — a week is a week regardless of how
 * many times the movie ran in it. With a single week filtered, both collapse
 * to that week's own average and sum.
 *
 * NIMS is the telecast row count: a movie shown three times in a day counts
 * three times, because each airing carries its own rating.
 */
export function computeBarcMetrics(rows: BarcTelecastAggRow[]): {
  nims: number;
  grp: number | null;
  rating: number | null;
  weighted_ats_sec: number | null;
  weekCount: number;
} {
  const byWeek = new Map<number, BarcTelecastAggRow[]>();
  for (const r of rows) {
    const key = r.week ?? -1;
    const list = byWeek.get(key);
    if (list) list.push(r);
    else byWeek.set(key, [r]);
  }

  const weeklyRatings: number[] = [];
  const weeklyGrps: number[] = [];

  for (const weekRows of byWeek.values()) {
    const rated = weekRows.filter((r) => r.rat_pct !== null);
    if (rated.length > 0) {
      weeklyRatings.push(rated.reduce((sum, r) => sum + (r.rat_pct ?? 0), 0) / rated.length);
    }

    const grpRows = weekRows.filter((r) => r.grp !== null);
    if (grpRows.length > 0) {
      weeklyGrps.push(grpRows.reduce((sum, r) => sum + (r.grp ?? 0), 0));
    }
  }

  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  // Weight ATS by reach; rows with no ATS or no reach contribute nothing.
  const atsRows = rows.filter((r) => r.ats_sec !== null && (r.daily_avg_rch_pct ?? 0) > 0);
  const weightTotal = atsRows.reduce((sum, r) => sum + (r.daily_avg_rch_pct ?? 0), 0);
  const weightedAts = weightTotal
    ? atsRows.reduce((sum, r) => sum + (r.ats_sec ?? 0) * (r.daily_avg_rch_pct ?? 0), 0) / weightTotal
    : null;

  return {
    nims: rows.length,
    grp: mean(weeklyGrps),
    rating: mean(weeklyRatings),
    weighted_ats_sec: weightedAts,
    weekCount: byWeek.size,
  };
}

