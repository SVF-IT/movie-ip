"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Edit,
  Film,
  Loader2,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAppToast } from "@/hooks/use-app-toast";

interface RecensorMovie {
  id: string;
  title: string;
  certification: string;
  release_year?: string;
  source: string;
  language_name?: string;
  production_house_name?: string;
  recensor_flag: boolean;
  updated_at?: string;
}

type FilterStatus = "all" | "pending" | "done";

export default function RecensorPage() {
  const supabase = createClient();

  const [movies, setMovies] = useState<RecensorMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "home_production" | "acquired">("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchMovies = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("movies")
        .select(`
          id, title, certification, release_year, source, production_house_name, recensor_flag, updated_at,
          language
        `, { count: "exact" })
        .ilike("certification", "A");

      if (debouncedSearch) {
        query = query.ilike("title", `%${debouncedSearch}%`);
      }

      if (statusFilter === "pending") {
        query = query.eq("recensor_flag", true);
      } else if (statusFilter === "done") {
        query = query.eq("recensor_flag", false);
      }

      if (sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }

      query = query
        .order("recensor_flag", { ascending: false })
        .order("title")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, error: fetchError, count } = await query;
      if (fetchError) throw fetchError;

      const rows: RecensorMovie[] = (data || []).map((m: any) => ({
        ...m,
        language_name: m.language ?? undefined,
      }));

      setMovies(rows);
      setTotalCount(count || 0);
    } catch (err) {
      toast.error(sanitizeError(err instanceof Error ? err : new Error(String(err))).message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, sourceFilter, page]);

  useEffect(() => { fetchMovies(); }, [fetchMovies]);

  const toggleRecensor = async (movie: RecensorMovie) => {
    setTogglingId(movie.id);
    try {
      const { error: updateError } = await supabase
        .from("movies")
        .update({ recensor_flag: !movie.recensor_flag })
        .eq("id", movie.id);
      if (updateError) throw updateError;
      setMovies((prev) =>
        prev.map((m) => m.id === movie.id ? { ...m, recensor_flag: !m.recensor_flag } : m)
      );
      if (statusFilter !== "all") {
        setTotalCount((c) => Math.max(0, c - 1));
        setMovies((prev) => prev.filter((m) => m.id !== movie.id));
      }
    } catch (err) {
      toast.error(sanitizeError(err instanceof Error ? err : new Error(String(err))).message);
    } finally {
      setTogglingId(null);
    }
  };

  const hasFilters = search || statusFilter !== "all" || sourceFilter !== "all";

  const statusPills: { id: FilterStatus; label: string; icon: React.ElementType; active: string; inactive: string }[] = [
    {
      id: "pending",
      label: "Pending Censoring",
      icon: Bell,
      active: "bg-rose-500/15 border-rose-500/40 text-rose-300",
      inactive: "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-rose-500/30 hover:text-rose-400",
    },
    {
      id: "done",
      label: "Censored",
      icon: CheckCircle2,
      active: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
      inactive: "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-emerald-500/30 hover:text-emerald-400",
    },
    {
      id: "all",
      label: "All \"A\" Movies",
      icon: Film,
      active: "bg-red-600/15 border-red-500/40 text-red-300",
      inactive: "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-red-500/30 hover:text-red-400",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Cinematic Header */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-rose-600 via-red-500 to-transparent" />
        <div className="absolute top-4 right-4 w-56 h-56 bg-rose-600/6 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-2 right-24 w-36 h-36 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <ShieldAlert className="h-7 w-7 text-rose-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">Censor Tracker</h1>
              <p className="text-slate-400 text-sm mt-0.5">
                Manage censoring status for &ldquo;A&rdquo;-certified movies. Monthly reminders sent for all pending items.
              </p>
            </div>
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {statusPills.map(({ id, label, icon: Icon, active, inactive }) => (
              <button
                key={id}
                onClick={() => { setStatusFilter(id); setPage(0); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200",
                  statusFilter === id ? active : inactive
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>



      {/* Filters bar */}
      <Card className="glass-card border-slate-800/60">
        <CardContent className="px-5 py-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-52 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search movies…"
                className="pl-9 h-9 bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-400 text-sm focus-visible:ring-rose-500/40 focus-visible:border-rose-500/60"
              />
            </div>

            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as typeof sourceFilter); setPage(0); }}>
              <SelectTrigger className="w-40 h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="home_production">Home Production</SelectItem>
                <SelectItem value="acquired">Acquired</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 gap-1.5"
                onClick={() => { setSearch(""); setStatusFilter("all"); setSourceFilter("all"); setPage(0); }}
              >
                <X className="h-3.5 w-3.5" />Reset
              </Button>
            )}

            <p className="ml-auto text-xs text-slate-400 tabular-nums">
              {loading ? "Loading…" : `${totalCount} movie${totalCount !== 1 ? "s" : ""}`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="glass-card border-slate-800/60 overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-slate-800/60">
          <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
            <ShieldAlert className="h-4 w-4 text-rose-400" />
            A-Certified Movies
            <Badge className="ml-0.5 bg-slate-800/80 text-slate-300 border-slate-700/50 font-medium text-xs">
              {loading ? "…" : totalCount}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-rose-400/60" />
              <p className="text-slate-400 text-sm">Loading movies…</p>
            </div>
          ) : movies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="p-4 rounded-full bg-slate-800/50 border border-slate-700/40">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
              </div>
              <p className="text-slate-400 font-medium">
                {hasFilters ? "No movies match your filters." : "No A-certified movies found."}
              </p>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200"
                  onClick={() => { setSearch(""); setStatusFilter("all"); setSourceFilter("all"); }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/60">
                    <th className="text-left px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 w-[35%]">Movie</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden md:table-cell">Language</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell">Production House</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden sm:table-cell">Source</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Censor Flag</th>
                    <th className="text-right px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {movies.map((movie) => (
                    <tr
                      key={movie.id}
                      className={cn(
                        "group transition-colors hover:bg-slate-800/30",
                        movie.recensor_flag && "bg-rose-500/[0.03]"
                      )}
                    >
                      {/* Title */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Badge variant="outline" className="shrink-0 bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px] font-bold px-1.5 py-0.5">
                            A
                          </Badge>
                          <div className="min-w-0">
                            <Link
                              href={`/movies/${movie.id}`}
                              className="font-semibold text-sm text-slate-200 hover:text-rose-400 transition-colors line-clamp-1 block"
                            >
                              {movie.title}
                            </Link>
                            {movie.release_year && (
                              <span className="text-[10px] text-slate-400 font-mono">{movie.release_year}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Language */}
                      <td className="px-4 py-3.5 hidden md:table-cell text-sm text-slate-400">
                        {movie.language_name || <span className="text-slate-400">—</span>}
                      </td>

                      {/* Production House */}
                      <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-400 max-w-40 truncate">
                        {movie.production_house_name || <span className="text-slate-400">—</span>}
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-semibold px-2 py-0.5",
                          movie.source === "home_production"
                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/25"
                            : "bg-violet-500/10 text-violet-400 border-violet-500/25"
                        )}>
                          {movie.source === "home_production" ? "Home" : "Acquired"}
                        </Badge>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3.5 text-center">
                        {movie.recensor_flag ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/25 px-2.5 py-1 rounded-full">
                            <Clock className="h-3 w-3" />Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="h-3 w-3" />Done
                          </span>
                        )}
                      </td>

                      {/* Toggle */}
                      <td className="px-4 py-3.5 text-center">
                        {togglingId === movie.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400 mx-auto" />
                        ) : (
                          <Switch
                            checked={movie.recensor_flag}
                            onCheckedChange={() => toggleRecensor(movie)}
                            className="data-[state=checked]:bg-rose-500 mx-auto"
                            aria-label={`Toggle recensor flag for ${movie.title}`}
                          />
                        )}
                      </td>

                      {/* Edit */}
                      <td className="px-6 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
                          asChild
                        >
                          <Link href={`/movies/${movie.id}/edit`}>
                            <Edit className="h-3.5 w-3.5" />
                            <span className="text-xs">Edit</span>
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalCount > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 tabular-nums">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-4 bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-700/60"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-4 bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-700/60"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * pageSize >= totalCount}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
