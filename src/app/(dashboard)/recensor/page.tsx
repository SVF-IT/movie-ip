"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAppToast } from "@/hooks/use-app-toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import {
  Bell,
  CheckCircle2,
  Clock,
  Edit,
  Film,
  Loader2,
  Search,
  ShieldAlert,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
      inactive: "bg-slate-800/50 border-(--svf-border) text-(--text-faint) hover:border-rose-500/30 hover:text-rose-400",
    },
    {
      id: "done",
      label: "Censored",
      icon: CheckCircle2,
      active: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
      inactive: "bg-slate-800/50 border-(--svf-border) text-(--text-faint) hover:border-emerald-500/30 hover:text-emerald-400",
    },
    {
      id: "all",
      label: "All \"A\" Movies",
      icon: Film,
      active: "bg-red-600/15 border-red-500/40 text-red-300",
      inactive: "bg-slate-800/50 border-(--svf-border) text-(--text-faint) hover:border-red-500/30 hover:text-red-400",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Compact toolbar — icon + status pills + search + source */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="p-2 rounded-[9px] bg-rose-500/10 border border-rose-500/20">
          <ShieldAlert className="h-5 w-5 text-rose-400" />
        </div>

        {/* Status filter pills */}
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

        <div className="flex-1" />

        {/* Search */}
        <div className="relative min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--text-faint)" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search movies…"
            className="pl-9 h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint)"
          />
        </div>

        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as typeof sourceFilter); setPage(0); }}>
          <SelectTrigger className="w-40 h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text)">
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
            className="h-9 gap-1.5"
            style={{ color: "var(--text-faint)" }}
            onClick={() => { setSearch(""); setStatusFilter("all"); setSourceFilter("all"); setPage(0); }}
          >
            <X className="h-3.5 w-3.5" />Reset
          </Button>
        )}

        <p className="text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>
          {loading ? "Loading…" : `${totalCount} movie${totalCount !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-rose-400/60" />
              <p className="text-(--text-faint) text-sm">Loading movies…</p>
            </div>
          ) : movies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="p-4 rounded-full bg-slate-800/50 border border-(--svf-border)">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
              </div>
              <p className="text-(--text-faint) font-medium">
                {hasFilters ? "No movies match your filters." : "No A-certified movies found."}
              </p>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="text-(--text-faint) hover:text-(--text)"
                  onClick={() => { setSearch(""); setStatusFilter("all"); setSourceFilter("all"); }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-(--svf-border)">
                    <th className="text-left px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) w-[35%]">Movie</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden md:table-cell">Language</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden lg:table-cell">Production House</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden sm:table-cell">Source</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Status</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Censor Flag</th>
                    <th className="text-right px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--svf-border)">
                  {movies.map((movie) => (
                    <tr
                      key={movie.id}
                      className={cn(
                        "group transition-colors",
                        movie.recensor_flag ? "bg-rose-500/[0.03]" : "hover:bg-(--hover)"
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
                              className="font-semibold text-sm text-(--text) hover:text-rose-400 transition-colors line-clamp-1 block"
                            >
                              {movie.title}
                            </Link>
                            {movie.release_year && (
                              <span className="text-[10px] text-(--text-faint) font-mono">{movie.release_year}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Language */}
                      <td className="px-4 py-3.5 hidden md:table-cell text-sm text-(--text-faint)">
                        {movie.language_name || <span className="text-(--text-faint)">—</span>}
                      </td>

                      {/* Production House */}
                      <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-(--text-faint) max-w-40 truncate">
                        {movie.production_house_name || <span className="text-(--text-faint)">—</span>}
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
                          <Loader2 className="h-4 w-4 animate-spin text-(--text-faint) mx-auto" />
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
                          className="h-7 gap-1.5 text-(--text-faint) hover:text-amber-400 hover:bg-amber-500/10"
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
      </div>

      {/* Pagination */}
      {totalCount > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-(--text-faint) tabular-nums">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
          </p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-8 px-4"
              onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              Previous
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-4"
              onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * pageSize >= totalCount}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
