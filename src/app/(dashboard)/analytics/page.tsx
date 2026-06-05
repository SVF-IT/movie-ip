"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
} from "recharts";
import { Loader2, Film, FileText, TrendingDown, Globe, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ── Types ─────────────────────────────────────────────────────────────────────
interface RightRow {
  id: string;
  movie_id: string;
  start_date: string | null;
  end_date: string | null;
  nature: string | null;
  territory: string | null;
  is_current: boolean;
  platform_name: string;
  platform_type: string;
  movie_title: string;
  movie_source: string;
  movie_language: string;
  movie_cert: string;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid rgba(148,163,184,0.15)",
  borderRadius: "8px",
  color: "#e2e8f0",
  fontSize: "12px",
};
const tickStyle = { fill: "#64748b", fontSize: 11 };
const grid = { stroke: "rgba(148,163,184,0.08)" };

// ── Small helpers ─────────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <Card className="p-4 flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </Card>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="px-5 pt-4 pb-2">
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [rights, setRights] = useState<RightRow[]>([]);
  const [allLanguages, setAllLanguages] = useState<string[]>([]);
  const [allPlatformTypes, setAllPlatformTypes] = useState<string[]>([]);

  // Filters
  const [language, setLanguage] = useState("all");
  const [source, setSource] = useState("all");
  const [platformType, setPlatformType] = useState("all");
  const [rightsStatus, setRightsStatus] = useState("active"); // active | all

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("platform_rights")
        .select(`
          id, movie_id, start_date, end_date, nature, territory, is_current,
          platforms(name, platform_type),
          movies(title, source, language, certification)
        `);

      const rows: RightRow[] = (data || []).map((r: any) => ({
        id: r.id,
        movie_id: r.movie_id,
        start_date: r.start_date,
        end_date: r.end_date,
        nature: r.nature,
        territory: r.territory,
        is_current: r.is_current,
        platform_name: r.platforms?.name || "Unknown",
        platform_type: r.platforms?.platform_type || "Unknown",
        movie_title: r.movies?.title || "Unknown",
        movie_source: r.movies?.source || "",
        movie_language: r.movies?.language || "Unknown",
        movie_cert: r.movies?.certification || "Unrated",
      }));

      setRights(rows);
      setAllLanguages([...new Set(rows.map((r) => r.movie_language).filter(Boolean))].sort());
      setAllPlatformTypes([...new Set(rows.map((r) => r.platform_type).filter(Boolean))].sort());
      setLoading(false);
    }
    load();
  }, []);

  // ── Filtered dataset ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rights.filter((r) => {
      if (rightsStatus === "active" && (!r.is_current || (r.end_date && r.end_date < today))) return false;
      if (language !== "all" && r.movie_language !== language) return false;
      if (source !== "all" && r.movie_source !== source) return false;
      if (platformType !== "all" && r.platform_type !== platformType) return false;
      return true;
    });
  }, [rights, language, source, platformType, rightsStatus, today]);

  const activeRights = useMemo(() => rights.filter((r) => r.is_current && (!r.end_date || r.end_date >= today)), [rights, today]);
  const expiring30 = useMemo(() => activeRights.filter((r) => r.end_date && r.end_date <= new Date(Date.now() + 30 * 864e5).toISOString().split("T")[0]), [activeRights]);
  const uniqueMovies = useMemo(() => new Set(filtered.map((r) => r.movie_id)).size, [filtered]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const byPlatform = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((r) => { counts[r.platform_name] = (counts[r.platform_name] || 0) + 1; });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  const byLanguage = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((r) => { counts[r.movie_language] = (counts[r.movie_language] || 0) + 1; });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [filtered]);

  const byPlatformType = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((r) => { counts[r.platform_type] = (counts[r.platform_type] || 0) + 1; });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [filtered]);

  const byNature = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((r) => {
      const n = r.nature === "exclusive" ? "Exclusive" : r.nature === "non_exclusive" ? "Non-Exclusive" : "Unspecified";
      counts[n] = (counts[n] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [filtered]);

  const expiryTimeline = useMemo(() => {
    const result = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      const ms = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
      const me = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const expiring = filtered.filter((r) => r.end_date && r.end_date >= ms && r.end_date <= me).length;
      result.push({ month: label, expiring });
    }
    return result;
  }, [filtered]);

  const topMovies = useMemo(() => {
    const counts: Record<string, { title: string; source: string; count: number }> = {};
    filtered.forEach((r) => {
      if (!counts[r.movie_id]) counts[r.movie_id] = { title: r.movie_title, source: r.movie_source, count: 0 };
      counts[r.movie_id].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [filtered]);

  const hasFilters = language !== "all" || source !== "all" || platformType !== "all" || rightsStatus !== "active";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Filter bar ── */}
      <Card className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">Filters</span>

          <Select value={rightsStatus} onValueChange={setRightsStatus}>
            <SelectTrigger className="h-8 w-32 text-xs bg-slate-800/60 border-slate-700/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="all">All rights</SelectItem>
            </SelectContent>
          </Select>

          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="h-8 w-36 text-xs bg-slate-800/60 border-slate-700/60">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              {allLanguages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-8 w-36 text-xs bg-slate-800/60 border-slate-700/60">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="home_production">Home Production</SelectItem>
              <SelectItem value="acquired">Acquired</SelectItem>
            </SelectContent>
          </Select>

          <Select value={platformType} onValueChange={setPlatformType}>
            <SelectTrigger className="h-8 w-36 text-xs bg-slate-800/60 border-slate-700/60">
              <SelectValue placeholder="Platform type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {allPlatformTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          {hasFilters && (
            <button
              onClick={() => { setLanguage("all"); setSource("all"); setPlatformType("all"); setRightsStatus("active"); }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}

          <div className="ml-auto text-xs text-slate-500">
            <span className="font-semibold text-slate-300">{filtered.length}</span> rights · <span className="font-semibold text-slate-300">{uniqueMovies}</span> titles
          </div>
        </div>
      </Card>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Matched Rights" value={filtered.length} color="#3b82f6" sub="matching current filters" />
        <StatCard label="Titles" value={uniqueMovies} color="#10b981" sub="unique movies" />
        <StatCard label="Active Rights" value={activeRights.length} color="#8b5cf6" sub="currently active (all)" />
        <StatCard label="Expiring in 30d" value={expiring30.length} color="#ef4444" sub="needs attention" />
      </div>

      {/* ── Expiry timeline + Platform type donut ── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Expiry Timeline" sub="Rights expiring per month (next 12m)" className="md:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={expiryTimeline} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={grid.stroke} vertical={false} />
              <XAxis dataKey="month" tick={tickStyle} tickLine={false} axisLine={false} />
              <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(148,163,184,0.1)" }} />
              <Area type="monotone" dataKey="expiring" name="Expiring" stroke="#ef4444" fill="url(#gExp)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Rights by Type" sub="Platform type breakdown">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byPlatformType} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="count" nameKey="name" strokeWidth={0}>
                {byPlatformType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            </PieChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* ── Platform + Language ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Top Platforms" sub="Rights count per platform">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byPlatform} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barCategoryGap="30%">
              <XAxis type="number" tick={tickStyle} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={tickStyle} width={100} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(148,163,184,0.04)" }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 3, 3, 0]}>
                <LabelList dataKey="count" position="right" style={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Language Breakdown" sub="Rights by film language">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byLanguage} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barCategoryGap="30%">
              <XAxis type="number" tick={tickStyle} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={tickStyle} width={100} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(148,163,184,0.04)" }} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 3, 3, 0]}>
                <LabelList dataKey="count" position="right" style={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* ── Nature donut + Top titles ── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Rights Nature" sub="Exclusive vs non-exclusive">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byNature} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="count" nameKey="name" strokeWidth={0}>
                {byNature.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            </PieChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Top Titles by Rights" sub="Most licensed films" className="md:col-span-2">
          <div className="space-y-1.5 pt-1">
            {topMovies.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-slate-600 w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-300 truncate">{m.title}</span>
                    <span className="text-xs font-semibold text-slate-300 tabular-nums shrink-0">{m.count}</span>
                  </div>
                  <div className="mt-0.5 h-1 rounded-full bg-slate-800">
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: `${Math.round((m.count / (topMovies[0]?.count || 1)) * 100)}%`,
                        backgroundColor: m.source === "home_production" ? "#3b82f6" : "#8b5cf6",
                      }}
                    />
                  </div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${m.source === "home_production" ? "bg-blue-500/15 text-blue-400" : "bg-violet-500/15 text-violet-400"}`}>
                  {m.source === "home_production" ? "Home" : "Acq"}
                </span>
              </div>
            ))}
            {topMovies.length === 0 && <p className="text-xs text-slate-500 text-center py-8">No data for current filters</p>}
          </div>
        </Section>
      </div>
    </div>
  );
}
