"use client";

import { useEffect, useState } from "react";
import { Loader2, Film, FileText, TrendingDown, ShieldCheck, BarChart3 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EnhancedStatsCard } from "@/components/dashboard/enhanced-stats-card";
import {
  RightsExpiryTimelineChart,
  PlatformComparisonChart,
  MonthlyActivityChart,
  DistributionDonutChart,
  DistributionBarChart,
  RightsTypeChart,
} from "@/components/dashboard/analytics-charts";
import { TerritoryCoverageTreemap, CatalogHealthRadial } from "@/components/dashboard/advanced-charts";
import {
  getRightsExpiryTimeline,
  getTerritoryDistribution,
  getPlatformComparison,
  getMonthlyRightsActivity,
  getCatalogHealth,
  getCertificationDistribution,
  getLanguageDistribution,
  getRightsNatureBreakdown,
  getRightsTypeDistribution,
  getTopMoviesByRights,
} from "@/lib/api/analytics";
import { getDashboardStats } from "@/lib/api/dashboard";
import type {
  DashboardStats,
  RightsExpiryTimelinePoint,
  PlatformComparisonPoint,
  CatalogHealth,
  DistributionPoint,
  MonthlyActivityPoint,
} from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { useAppToast } from "@/hooks/use-app-toast";

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [expiryTimeline, setExpiryTimeline] = useState<RightsExpiryTimelinePoint[]>([]);
  const [territories, setTerritories] = useState<DistributionPoint[]>([]);
  const [platformComparison, setPlatformComparison] = useState<PlatformComparisonPoint[]>([]);
  const [monthlyActivity, setMonthlyActivity] = useState<MonthlyActivityPoint[]>([]);
  const [catalogHealth, setCatalogHealth] = useState<CatalogHealth | null>(null);
  const [certifications, setCertifications] = useState<DistributionPoint[]>([]);
  const [languages, setLanguages] = useState<DistributionPoint[]>([]);
  const [rightsNature, setRightsNature] = useState<DistributionPoint[]>([]);
  const [rightsTypes, setRightsTypes] = useState<DistributionPoint[]>([]);
  const [topMovies, setTopMovies] = useState<{ title: string; source: string; rightsCount: number }[]>([]);

  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true);
    
        const [
          statsData,
          timelineData,
          territoryData,
          platformData,
          activityData,
          healthData,
          certData,
          langData,
          natureData,
          typeData,
          topData,
        ] = await Promise.all([
          getDashboardStats(),
          getRightsExpiryTimeline(),
          getTerritoryDistribution(),
          getPlatformComparison(),
          getMonthlyRightsActivity(),
          getCatalogHealth(),
          getCertificationDistribution(),
          getLanguageDistribution(),
          getRightsNatureBreakdown(),
          getRightsTypeDistribution(),
          getTopMoviesByRights(),
        ]);

        setStats(statsData);
        setExpiryTimeline(timelineData);
        setTerritories(territoryData);
        setPlatformComparison(platformData);
        setMonthlyActivity(activityData);
        setCatalogHealth(healthData);
        setCertifications(certData);
        setLanguages(langData);
        setRightsNature(natureData);
        setRightsTypes(typeData);
        setTopMovies(topData);
      } catch (err) {
        console.error("Error loading analytics:", err);
        toast.error(err instanceof Error ? err.message : "Failed to load analytics data");
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  const glassSection = "relative overflow-hidden rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl shadow-xl";

  return (
    <div className="space-y-6">
      {/* ── Cinematic Header ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-red-600 via-amber-500 to-transparent" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-600/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 left-1/3 w-48 h-48 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/30 shadow-lg shadow-blue-500/10">
            <BarChart3 className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Analytics
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Comprehensive insights into your film catalog and rights portfolio
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <EnhancedStatsCard
          title="Total Movies"
          value={stats?.total_movies || 0}
          description="Films in catalog"
          icon={Film}
          accentColor="#3b82f6"
          sparklineData={[40, 45, 42, 48, 52, 50, stats?.total_movies || 55]}
        />
        <EnhancedStatsCard
          title="Active Rights"
          value={stats?.active_rights || 0}
          description="Current licenses"
          icon={FileText}
          accentColor="#10b981"
          sparklineData={[100, 110, 105, 115, 120, 118, stats?.active_rights || 125]}
        />
        <EnhancedStatsCard
          title="Expiring (30d)"
          value={stats?.rights_expiring_30_days || 0}
          description="Needs attention"
          icon={TrendingDown}
          accentColor="#ef4444"
        />
        <EnhancedStatsCard
          title="Catalog Coverage"
          value={`${catalogHealth?.percentCovered || 0}%`}
          description={`${catalogHealth?.withActiveRights || 0} of ${catalogHealth?.totalMovies || 0} movies`}
          icon={ShieldCheck}
          accentColor="#8b5cf6"
        />
      </div>

      {/* ── Rights Expiry Timeline — Full Width ── */}
      <div className={glassSection}>
        <RightsExpiryTimelineChart data={expiryTimeline} />
      </div>

      {/* ── Territory + Platform ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={glassSection}><TerritoryCoverageTreemap data={territories} /></div>
        <div className={glassSection}><PlatformComparisonChart data={platformComparison} /></div>
      </div>

      {/* ── Monthly Activity + Rights Nature ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={glassSection}><MonthlyActivityChart data={monthlyActivity} /></div>
        <div className={glassSection}>
          <DistributionDonutChart
            data={rightsNature}
            title="Rights Nature"
            description="Exclusive vs non-exclusive distribution"
          />
        </div>
      </div>

      {/* ── Language + Certification ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={glassSection}>
          <DistributionBarChart
            data={languages}
            title="Language Distribution"
            description="Movies by language"
          />
        </div>
        <div className={glassSection}>
          <DistributionDonutChart
            data={certifications}
            title="Certification Distribution"
            description="Movies by certification type"
          />
        </div>
      </div>

      {/* ── Rights Type + Catalog Health ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={glassSection}><RightsTypeChart data={rightsTypes} /></div>
        {catalogHealth && <div className={glassSection}><CatalogHealthRadial health={catalogHealth} /></div>}
      </div>

      {/* ── Top Movies Table ── */}
      <div className={glassSection}>
        <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-200">Top Movies by Active Rights</p>
            <p className="text-xs text-slate-500 mt-0.5">Movies with the most active platform licenses</p>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800/60 hover:bg-transparent">
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-500 w-12">Rank</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Movie</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Source</TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">Active Rights</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topMovies.map((movie, i) => (
              <TableRow key={i} className="border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                <TableCell className="font-bold text-slate-400 tabular-nums">{i + 1}</TableCell>
                <TableCell className="font-medium text-slate-200">{movie.title}</TableCell>
                <TableCell>
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border",
                    movie.source === "home_production"
                      ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                      : "bg-violet-500/15 text-violet-400 border-violet-500/30"
                  )}>
                    {movie.source === "home_production" ? "Home" : "Acquired"}
                  </span>
                </TableCell>
                <TableCell className="text-right font-bold text-slate-200 tabular-nums">{movie.rightsCount}</TableCell>
              </TableRow>
            ))}
            {topMovies.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-slate-500">
                  No data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
