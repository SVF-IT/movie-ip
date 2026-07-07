import { createClient } from "@/lib/supabase/client";

export interface SavedReport {
  id: string;
  user_id: string;
  name: string;
  template_id: string;
  filters: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  chartType: "bar" | "line" | "pie" | "heatmap" | "calendar";
  icon: string;
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "rights_by_platform",
    name: "Rights by Platform",
    description: "Distribution of active rights across platforms",
    chartType: "bar",
    icon: "BarChart3",
  },
  {
    id: "expiry_forecast",
    name: "Expiry Forecast",
    description: "Upcoming rights expirations over time",
    chartType: "line",
    icon: "TrendingUp",
  },
  {
    id: "catalog_coverage",
    name: "Catalog Coverage",
    description: "Movie catalog breakdown by source and certification",
    chartType: "pie",
    icon: "PieChart",
  },
  {
    id: "monthly_activity",
    name: "Monthly Activity",
    description: "Rights operations activity over time",
    chartType: "line",
    icon: "Activity",
  },
  {
    id: "platform_concentration",
    name: "Platform Concentration",
    description: "Share of rights by platform",
    chartType: "pie",
    icon: "Target",
  },
  {
    id: "certification_breakdown",
    name: "Certification Breakdown",
    description: "Movies by certification category",
    chartType: "bar",
    icon: "Shield",
  },
  {
    id: "source_distribution",
    name: "Source Distribution",
    description: "Home production vs acquired titles",
    chartType: "pie",
    icon: "GitBranch",
  },
  {
    id: "rights_timeline",
    name: "Rights Timeline",
    description: "Calendar view of rights activity",
    chartType: "calendar",
    icon: "Calendar",
  },
  {
    id: "world_premiere",
    name: "World Premiere",
    description: "Movies with no rights ever assigned — unreleased titles available for first distribution",
    chartType: "bar",
    icon: "Sparkles",
  },
];

export async function getSavedReports(): Promise<SavedReport[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("saved_reports")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching saved reports:", error);
    return [];
  }
  return (data as SavedReport[]) || [];
}

export async function saveReport(params: {
  name: string;
  templateId: string;
  filters: Record<string, unknown>;
}): Promise<SavedReport | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("saved_reports")
    .insert({
      user_id: user.id,
      name: params.name,
      template_id: params.templateId,
      filters: params.filters,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save report: ${error.message}`);

  return data as SavedReport;
}

export async function deleteReport(id: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("saved_reports")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(`Failed to delete report: ${error.message}`);
}

export async function getReportData(
  templateId: string,
  filters: Record<string, unknown> = {}
): Promise<Record<string, unknown>[]> {
  const supabase = createClient();

  switch (templateId) {
    case "rights_by_platform": {
      const { data } = await supabase
        .from("platform_rights")
        .select("platform_id, platforms(name)")
        .eq("is_current", true);

      const counts: Record<string, number> = {};
      (data || []).forEach((r: Record<string, unknown>) => {
        const platform = r.platforms as Record<string, unknown> | null;
        const name = (platform?.name as string) || "Unknown";
        counts[name] = (counts[name] || 0) + 1;
      });

      return Object.entries(counts)
        .map(([platform, count]) => ({ platform, rights: count }))
        .sort((a, b) => (b.rights as number) - (a.rights as number))
        .slice(0, 15);
    }

    case "expiry_forecast": {
      const months = (filters.months as number) || 12;
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + months);

      const { data } = await supabase
        .from("platform_rights")
        .select("end_date")
        .eq("is_current", true)
        .gte("end_date", new Date().toISOString().split("T")[0])
        .lte("end_date", endDate.toISOString().split("T")[0])
        .order("end_date");

      const monthly: Record<string, number> = {};
      (data || []).forEach((r: Record<string, unknown>) => {
        const month = (r.end_date as string).substring(0, 7);
        monthly[month] = (monthly[month] || 0) + 1;
      });

      return Object.entries(monthly).map(([month, count]) => ({
        month,
        expiring: count,
      }));
    }

    case "catalog_coverage": {
      const { data } = await supabase.from("movies").select("source, certification");

      const bySource: Record<string, number> = {};
      (data || []).forEach((m: Record<string, unknown>) => {
        const source = (m.source as string) || "unknown";
        bySource[source] = (bySource[source] || 0) + 1;
      });

      return Object.entries(bySource).map(([id, value]) => ({
        id: id === "home_production" ? "Home Production" : id === "acquired" ? "Acquired" : id,
        label: id === "home_production" ? "Home Production" : id === "acquired" ? "Acquired" : id,
        value,
      }));
    }

    case "monthly_activity": {
      const { data } = await supabase
        .from("platform_rights")
        .select("created_at")
        .order("created_at", { ascending: true });

      const monthly: Record<string, Record<string, number>> = {};
      (data || []).forEach((r: Record<string, unknown>) => {
        const month = (r.created_at as string).substring(0, 7);
        if (!monthly[month]) monthly[month] = {};
        monthly[month]["created"] = (monthly[month]["created"] || 0) + 1;
      });

      return Object.entries(monthly).map(([month, actions]) => ({
        month,
        ...actions,
      }));
    }

    case "platform_concentration": {
      const { data } = await supabase
        .from("platform_rights")
        .select("platform_id, platforms(name)")
        .eq("is_current", true);

      const counts: Record<string, number> = {};
      (data || []).forEach((r: Record<string, unknown>) => {
        const platform = r.platforms as Record<string, unknown> | null;
        const name = (platform?.name as string) || "Unknown";
        counts[name] = (counts[name] || 0) + 1;
      });

      return Object.entries(counts)
        .map(([id, value]) => ({ id, label: id, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
    }

    case "certification_breakdown": {
      const { data } = await supabase.from("movies").select("certification");

      const counts: Record<string, number> = {};
      (data || []).forEach((m: Record<string, unknown>) => {
        const cert = (m.certification as string) || "Not Rated";
        counts[cert] = (counts[cert] || 0) + 1;
      });

      return Object.entries(counts).map(([certification, count]) => ({
        certification,
        count,
      }));
    }

    case "source_distribution": {
      const { data } = await supabase.from("movies").select("source");

      const counts: Record<string, number> = {};
      (data || []).forEach((m: Record<string, unknown>) => {
        const source = (m.source as string) || "unknown";
        counts[source] = (counts[source] || 0) + 1;
      });

      return Object.entries(counts).map(([id, value]) => ({
        id: id === "home_production" ? "Home Production" : id === "acquired" ? "Acquired" : id,
        label: id === "home_production" ? "Home Production" : id === "acquired" ? "Acquired" : id,
        value,
      }));
    }

    case "rights_timeline": {
      const year = (filters.year as number) || new Date().getFullYear();

      const { data } = await supabase
        .from("platform_rights")
        .select("created_at")
        .gte("created_at", `${year}-01-01`)
        .lte("created_at", `${year}-12-31`);

      const daily: Record<string, number> = {};
      (data || []).forEach((r: Record<string, unknown>) => {
        const day = (r.created_at as string).substring(0, 10);
        daily[day] = (daily[day] || 0) + 1;
      });

      return Object.entries(daily).map(([day, value]) => ({
        day,
        value,
      }));
    }

    case "world_premiere": {
      // Find movies that have NEVER had any rights assigned (zero records in platform_rights)
      const [moviesRes, rightsRes] = await Promise.all([
        supabase.from("movies_with_details").select("id, title, release_year, source, language_name, certification"),
        supabase.from("platform_rights").select("movie_id"),
      ]);

      const moviesWithRights = new Set(
        (rightsRes.data || []).map((r: Record<string, unknown>) => r.movie_id as string)
      );

      let unreleased = (moviesRes.data || []).filter(
        (m: Record<string, unknown>) => !moviesWithRights.has(m.id as string)
      );

      // Apply optional source filter
      const sourceFilter = filters.source as string | undefined;
      if (sourceFilter && sourceFilter !== "all") {
        unreleased = unreleased.filter((m: Record<string, unknown>) => m.source === sourceFilter);
      }

      // Sort by release year descending (newest first)
      unreleased.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const ya = parseInt(a.release_year as string) || 0;
        const yb = parseInt(b.release_year as string) || 0;
        return yb - ya;
      });

      return unreleased as Record<string, unknown>[];
    }

    default:
      return [];
  }
}
