import { createClient } from "@/lib/supabase/client";
import type {
  RightsExpiryTimelinePoint,
  PlatformComparisonPoint,
  CatalogHealth,
  DistributionPoint,
  MonthlyActivityPoint,
  RightsUtilizationMetrics,
  PlatformConcentrationPoint,
  RightsWindowPoint,
  TopPerformingTitle,
} from "@/lib/types/database";
import { sanitizeError } from "@/lib/utils/sanitize-error";

const supabase = createClient();

export async function getRightsExpiryTimeline(): Promise<RightsExpiryTimelinePoint[]> {
  try {
    const today = new Date();
    const rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 12, 0);
    const startStr = rangeStart.toISOString().split("T")[0];
    const endStr = rangeEnd.toISOString().split("T")[0];

    const [rightsResult] = await Promise.all([
      supabase
        .from("platform_rights")
        .select("end_date")
        .eq("is_current", true)
        .gte("end_date", startStr)
        .lte("end_date", endStr),
  ]);

    const result: RightsExpiryTimelinePoint[] = [];

    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + i + 1, 0);
      const monthLabel = monthStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const ms = monthStart.toISOString().split("T")[0];
      const me = monthEnd.toISOString().split("T")[0];

      const expiring = (rightsResult.data || []).filter(
        (r: { end_date: string }) => r.end_date >= ms && r.end_date <= me
      ).length;

      result.push({ month: monthLabel, expiring, renewed: 0, transferred: 0 });
    }

    return result;
  } catch (error) {
    console.error("Error fetching rights expiry timeline:", error);
    return [];
  }
}

export async function getTerritoryDistribution(): Promise<DistributionPoint[]> {
  try {
    const { data, error } = await supabase
      .from("platform_rights")
      .select("territory")
      .eq("is_current", true);

    if (error) throw sanitizeError(error);

    const counts: Record<string, number> = {};
    data?.forEach((r: { territory: string | null }) => {
      const t = r.territory || "Unspecified";
      counts[t] = (counts[t] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error("Error fetching territory distribution:", error);
    return [];
  }
}

export async function getPlatformComparison(): Promise<PlatformComparisonPoint[]> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("platform_rights")
      .select(`platform_id, end_date, platforms(name)`);

    if (error) throw sanitizeError(error);

    const platforms: Record<string, { active: number; expired: number; total: number; name: string }> = {};
    const rightsData = data as unknown as Array<{
      platform_id: string;
      end_date: string | null;
      platforms: { name: string } | null;
    }>;

    rightsData?.forEach((r) => {
      const name = r.platforms?.name || "Unknown";
      if (!platforms[name]) platforms[name] = { active: 0, expired: 0, total: 0, name };
      platforms[name].total++;
      const isExpired = r.end_date && r.end_date < today;
      if (!isExpired) platforms[name].active++;
      else platforms[name].expired++;
    });

    return Object.values(platforms)
      .map((p) => ({ platform: p.name, active: p.active, expired: p.expired, total: p.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  } catch (error) {
    console.error("Error fetching platform comparison:", error);
    return [];
  }
}

export async function getMonthlyRightsActivity(): Promise<MonthlyActivityPoint[]> {
  try {
    const today = new Date();
    const rangeStart = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Count expired platform_rights per month by end_date
    const todayDate = new Date().toISOString().split("T")[0];
    const { data: expiredRights } = await supabase
      .from("platform_rights")
      .select("end_date")
      .lt("end_date", todayDate)
      .gte("end_date", rangeStart.toISOString().split("T")[0])
      .lte("end_date", rangeEnd.toISOString().split("T")[0]);

    const result: MonthlyActivityPoint[] = [];

    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      const monthLabel = monthStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const msDate = monthStart.toISOString().split("T")[0];
      const meDate = monthEnd.toISOString().split("T")[0];

      const expirations = (expiredRights || []).filter(
        (r: { end_date: string }) => r.end_date >= msDate && r.end_date <= meDate
      ).length;

      result.push({ month: monthLabel, renewals: 0, expirations, transfers: 0 });
    }

    return result;
  } catch (error) {
    console.error("Error fetching monthly rights activity:", error);
    return [];
  }
}

export async function getCatalogHealth(): Promise<CatalogHealth> {
  try {
    const [totalResult, withRightsResult] = await Promise.all([
      supabase.from("movies").select("*", { count: "exact", head: true }),
      supabase
        .from("movies")
        .select("id, platform_rights!inner(id)")
        .not("platform_rights", "is", null),
    ]);

    const totalMovies = totalResult.count || 0;
    const withActiveRights = withRightsResult.data?.length || 0;
    const withoutRights = totalMovies - withActiveRights;
    const percentCovered = totalMovies > 0 ? Math.round((withActiveRights / totalMovies) * 100) : 0;

    // Calculate metadata completeness (sample check for key fields)
    const { data: sampleMovies } = await supabase
      .from("movies")
      .select("title, release_year, certification, language, production_house_name, territory")
      .limit(200);

    let filledFields = 0;
    let totalFields = 0;
    sampleMovies?.forEach((m: Record<string, unknown>) => {
      const fields = ["title", "release_year", "certification", "language", "production_house_name", "territory"];
      fields.forEach((f) => {
        totalFields++;
        if (m[f] != null && m[f] !== "") filledFields++;
      });
    });

    const metadataCompleteness = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

    return { totalMovies, withActiveRights, withoutRights, percentCovered, metadataCompleteness };
  } catch (error) {
    console.error("Error fetching catalog health:", error);
    return { totalMovies: 0, withActiveRights: 0, withoutRights: 0, percentCovered: 0, metadataCompleteness: 0 };
  }
}

export async function getCertificationDistribution(): Promise<DistributionPoint[]> {
  try {
    const { data, error } = await supabase.from("movies").select("certification");
    if (error) throw sanitizeError(error);

    const counts: Record<string, number> = {};
    data?.forEach((m: { certification: string | null }) => {
      const cert = m.certification || "Unrated";
      counts[cert] = (counts[cert] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error("Error fetching certification distribution:", error);
    return [];
  }
}

export async function getLanguageDistribution(): Promise<DistributionPoint[]> {
  try {
    const { data, error } = await supabase
      .from("movies")
      .select("language")
      .not("language", "is", null);

    if (error) throw sanitizeError(error);

    const counts: Record<string, number> = {};
    data?.forEach((m: { language: string | null }) => {
      const lang = m.language || "Unknown";
      counts[lang] = (counts[lang] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error("Error fetching language distribution:", error);
    return [];
  }
}

export async function getRightsNatureBreakdown(): Promise<DistributionPoint[]> {
  try {
    const [exclusiveResult, nonExclusiveResult, unspecifiedResult] = await Promise.all([
      supabase.from("platform_rights").select("*", { count: "exact", head: true }).eq("nature", "exclusive").eq("is_current", true),
      supabase.from("platform_rights").select("*", { count: "exact", head: true }).eq("nature", "non_exclusive").eq("is_current", true),
      supabase.from("platform_rights").select("*", { count: "exact", head: true }).is("nature", null).eq("is_current", true),
    ]);

    return [
      { name: "Exclusive", count: exclusiveResult.count || 0 },
      { name: "Non-Exclusive", count: nonExclusiveResult.count || 0 },
      { name: "Unspecified", count: unspecifiedResult.count || 0 },
    ].filter((d) => d.count > 0);
  } catch (error) {
    console.error("Error fetching rights nature breakdown:", error);
    return [];
  }
}

export async function getRightsTypeDistribution(): Promise<DistributionPoint[]> {
  try {
    const { data, error } = await supabase
      .from("platform_rights")
      .select("platforms(platform_type)")
      .eq("is_current", true);

    if (error) throw sanitizeError(error);

    const counts: Record<string, number> = {};
    const rightsData = data as unknown as Array<{ platforms: { platform_type: string } | null }>;
    rightsData?.forEach((r) => {
      const name = r.platforms?.platform_type || "Unknown";
      counts[name] = (counts[name] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error("Error fetching rights type distribution:", error);
    return [];
  }
}

export async function getTopMoviesByRights(): Promise<{ title: string; source: string; rightsCount: number }[]> {
  try {
    const { data, error } = await supabase
      .from("platform_rights")
      .select("movie_id, movies(title, source)")
      .eq("is_current", true);

    if (error) throw sanitizeError(error);

    const counts: Record<string, { title: string; source: string; count: number }> = {};
    const rightsData = data as unknown as Array<{ movie_id: string; movies: { title: string; source: string } | null }>;
    rightsData?.forEach((r) => {
      const id = r.movie_id;
      if (!counts[id]) {
        counts[id] = { title: r.movies?.title || "Unknown", source: r.movies?.source || "", count: 0 };
      }
      counts[id].count++;
    });

    return Object.values(counts)
      .map((m) => ({ title: m.title, source: m.source, rightsCount: m.count }))
      .sort((a, b) => b.rightsCount - a.rightsCount)
      .slice(0, 10);
  } catch (error) {
    console.error("Error fetching top movies:", error);
    return [];
  }
}

export async function getRightsUtilizationMetrics(): Promise<RightsUtilizationMetrics> {
  try {
    const today = new Date();
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [activeRightsResult, totalMoviesResult] = await Promise.all([
      supabase
        .from("platform_rights")
        .select("movie_id, platform_id, start_date, end_date, nature, created_at")
        .eq("is_current", true),
      supabase.from("movies").select("*", { count: "exact", head: true }),
    ]);

    const activeRights = activeRightsResult.data || [];
    const totalMovies = totalMoviesResult.count || 0;

    // Utilization: unique movies with active rights / total movies
    const moviesWithRights = new Set(activeRights.map((r: { movie_id: string }) => r.movie_id));
    const utilizationRate = totalMovies > 0 ? Math.round((moviesWithRights.size / totalMovies) * 100) : 0;

    // Renewal rate: not applicable without rights_history; return 0
    const renewalRate = 0;

    // Average deal duration
    let totalDays = 0;
    let countWithDates = 0;
    activeRights.forEach((r: { start_date?: string; end_date?: string }) => {
      if (r.start_date && r.end_date) {
        const days = Math.round((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / (1000 * 60 * 60 * 24));
        if (days > 0) {
          totalDays += days;
          countWithDates++;
        }
      }
    });
    const averageDealDurationDays = countWithDates > 0 ? Math.round(totalDays / countWithDates) : 0;

    // Rights velocity: created in last 30 days
    const rightsVelocity = activeRights.filter((r: { created_at?: string }) => {
      if (!r.created_at) return false;
      return new Date(r.created_at) >= thirtyDaysAgo;
    }).length;

    // Platform concentration (Herfindahl index)
    const platformCounts: Record<string, number> = {};
    activeRights.forEach((r: { platform_id?: string }) => {
      const pid = r.platform_id || "unknown";
      platformCounts[pid] = (platformCounts[pid] || 0) + 1;
    });
    const totalActive = activeRights.length || 1;
    let hhi = 0;
    Object.values(platformCounts).forEach((count) => {
      const share = count / totalActive;
      hhi += share * share;
    });
    const platformConcentrationIndex = Math.round(hhi * 100);

    // Exclusive ratio
    const totalExclusiveRights = activeRights.filter((r: { nature?: string }) => r.nature === "exclusive").length;
    const totalNonExclusiveRights = activeRights.filter((r: { nature?: string }) => r.nature === "non_exclusive").length;
    const exclusiveRatio = totalActive > 0 ? Math.round((totalExclusiveRights / totalActive) * 100) : 0;

    return {
      utilizationRate,
      renewalRate,
      averageDealDurationDays,
      rightsVelocity,
      platformConcentrationIndex,
      totalExclusiveRights,
      totalNonExclusiveRights,
      exclusiveRatio,
    };
  } catch (error) {
    console.error("Error fetching rights utilization metrics:", error);
    return {
      utilizationRate: 0, renewalRate: 0, averageDealDurationDays: 0,
      rightsVelocity: 0, platformConcentrationIndex: 0,
      totalExclusiveRights: 0, totalNonExclusiveRights: 0, exclusiveRatio: 0,
    };
  }
}

export async function getPlatformConcentration(): Promise<PlatformConcentrationPoint[]> {
  try {
    const { data, error } = await supabase
      .from("platform_rights")
      .select("platform_id, platforms(name)")
      .eq("is_current", true);

    if (error) throw sanitizeError(error);

    const counts: Record<string, { name: string; count: number }> = {};
    const rightsData = data as unknown as Array<{ platform_id: string; platforms: { name: string } | null }>;
    rightsData?.forEach((r) => {
      const pid = r.platform_id;
      if (!counts[pid]) {
        counts[pid] = { name: r.platforms?.name || "Unknown", count: 0 };
      }
      counts[pid].count++;
    });

    const total = rightsData?.length || 1;

    return Object.values(counts)
      .map((p) => ({
        platform: p.name,
        share: Math.round((p.count / total) * 100),
        count: p.count,
        isTopConcentrated: (p.count / total) > 0.3,
      }))
      .sort((a, b) => b.share - a.share);
  } catch (error) {
    console.error("Error fetching platform concentration:", error);
    return [];
  }
}

export async function getRightsWindowBreakdown(): Promise<RightsWindowPoint[]> {
  try {
    const { data, error } = await supabase
      .from("platform_rights")
      .select("start_date, end_date");

    if (error) throw sanitizeError(error);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    let active = 0;
    let upcoming = 0;
    let expired30 = 0;
    let expired90 = 0;

    (data || []).forEach((r: { start_date?: string; end_date?: string }) => {
      const isExpired = r.end_date && r.end_date < todayStr;
      if (!isExpired) {
        if (r.start_date && r.start_date > todayStr) {
          upcoming++;
        } else {
          active++;
        }
      } else if (r.end_date) {
        const endDate = new Date(r.end_date);
        if (endDate >= thirtyDaysAgo) {
          expired30++;
        } else if (endDate >= ninetyDaysAgo) {
          expired90++;
        }
      }
    });

    return [
      { status: "active", count: active, label: "Active" },
      { status: "upcoming", count: upcoming, label: "Upcoming" },
      { status: "expired_30d", count: expired30, label: "Expired (30d)" },
      { status: "expired_90d", count: expired90, label: "Expired (90d)" },
    ];
  } catch (error) {
    console.error("Error fetching rights window breakdown:", error);
    return [];
  }
}

export async function getAverageDealDuration(): Promise<{ overall: number; byPlatform: { platform: string; avgDays: number }[] }> {
  try {
    const { data, error } = await supabase
      .from("platform_rights")
      .select("platform_id, start_date, end_date, platforms(name)")
      .not("start_date", "is", null)
      .not("end_date", "is", null);

    if (error) throw sanitizeError(error);

    const rightsData = data as unknown as Array<{
      platform_id: string;
      start_date: string;
      end_date: string;
      platforms: { name: string } | null;
    }>;

    let totalDays = 0;
    let totalCount = 0;
    const platformAgg: Record<string, { name: string; totalDays: number; count: number }> = {};

    rightsData?.forEach((r) => {
      const days = Math.round((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 0) {
        totalDays += days;
        totalCount++;

        const pid = r.platform_id;
        if (!platformAgg[pid]) {
          platformAgg[pid] = { name: r.platforms?.name || "Unknown", totalDays: 0, count: 0 };
        }
        platformAgg[pid].totalDays += days;
        platformAgg[pid].count++;
      }
    });

    return {
      overall: totalCount > 0 ? Math.round(totalDays / totalCount) : 0,
      byPlatform: Object.values(platformAgg)
        .map((p) => ({ platform: p.name, avgDays: Math.round(p.totalDays / p.count) }))
        .sort((a, b) => b.avgDays - a.avgDays)
        .slice(0, 10),
    };
  } catch (error) {
    console.error("Error fetching deal duration:", error);
    return { overall: 0, byPlatform: [] };
  }
}

export async function getTopPerformingTitles(): Promise<TopPerformingTitle[]> {
  try {
    const { data, error } = await supabase
      .from("platform_rights")
      .select("movie_id, platform_id, territory, movies(title, source)")
      .eq("is_current", true);

    if (error) throw sanitizeError(error);

    const rightsData = data as unknown as Array<{
      movie_id: string;
      platform_id: string;
      territory?: string;
      movies: { title: string; source: string } | null;
    }>;

    const movies: Record<string, {
      title: string;
      source: string;
      platforms: Set<string>;
      territories: Set<string>;
      count: number;
    }> = {};

    rightsData?.forEach((r) => {
      const mid = r.movie_id;
      if (!movies[mid]) {
        movies[mid] = {
          title: r.movies?.title || "Unknown",
          source: r.movies?.source || "",
          platforms: new Set(),
          territories: new Set(),
          count: 0,
        };
      }
      movies[mid].count++;
      if (r.platform_id) movies[mid].platforms.add(r.platform_id);
      if (r.territory) movies[mid].territories.add(r.territory);
    });

    return Object.entries(movies)
      .map(([movieId, m]) => ({
        movieId,
        title: m.title,
        source: m.source,
        activeRightsCount: m.count,
        territories: m.territories.size,
        platforms: m.platforms.size,
      }))
      .sort((a, b) => b.activeRightsCount - a.activeRightsCount)
      .slice(0, 10);
  } catch (error) {
    console.error("Error fetching top performing titles:", error);
    return [];
  }
}
