"use client";

import { DisabledActionButton } from "@/components/disabled-action-button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppToast } from "@/hooks/use-app-toast";
import { useUrlMultiSelectFilterState } from "@/hooks/use-url-multi-select-filter-state";
import { usePermission } from "@/hooks/use-permission";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import { orContains } from "@/lib/utils/search";
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
import { stringCodec, useUrlFilterState } from "@/hooks/use-url-filter-state";

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
  const { allowed: canEditMovie } = usePermission("edit", "movie");

  const [movies, setMovies] = useState<RecensorMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [search, setSearch] = useUrlFilterState("q", "", stringCodec);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useUrlFilterState<FilterStatus>(
    "status",
    "all",
    {
      encode: (v) => (v === "all" ? null : v),
      decode: (raw) => (raw === "pending" || raw === "done" ? raw : "all"),
    }
  );
  const SOURCE_OPTIONS: ("home_production" | "acquired")[] = ["home_production", "acquired"];
  const [sourceFilter, setSourceFilter] = useUrlMultiSelectFilterState<"home_production" | "acquired">("src", SOURCE_OPTIONS);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchMovies = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      let query = supabase
        .from("movies")
        .select(`
          id, title, certification, release_year, source, production_house_name, recensor_flag, updated_at,
          language, home_sold, agreement_end_date
        `)
        .ilike("certification", "A");

      if (debouncedSearch) {
        query = query.or(orContains(debouncedSearch, ["title", "production_no"]));
      }

      if (statusFilter === "pending") {
        query = query.eq("recensor_flag", true);
      } else if (statusFilter === "done") {
        query = query.eq("recensor_flag", false);
      }

      if (sourceFilter.length === 0) {
        setMovies([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
      if (sourceFilter.length < SOURCE_OPTIONS.length) {
        query = query.in("source", sourceFilter);
      }

      query = query
        .order("recensor_flag", { ascending: false })
        .order("title")
        .range(0, 9999);

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      // Always exclude sold (home) and expired-agreement (acquired) movies from the tracker
      const validRows = (data || []).filter((m: any) => {
        if (m.source === "home_production") return m.home_sold !== true;
        if (m.agreement_end_date && m.agreement_end_date < today) return false;
        return true;
      });

      const rows: RecensorMovie[] = validRows.map((m: any) => ({
        ...m,
        language_name: m.language ?? undefined,
      }));

      setMovies(rows);
      setTotalCount(rows.length);
    } catch (err) {
      toast.error(sanitizeError(err instanceof Error ? err : new Error(String(err))).message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, sourceFilter]);

  useEffect(() => { fetchMovies(); }, [fetchMovies]);

  const toggleRecensor = async (movie: RecensorMovie) => {
    if (!canEditMovie) return;
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

  const hasFilters = search || statusFilter !== "all" || sourceFilter.length < SOURCE_OPTIONS.length;

  const statusPills: { id: FilterStatus; label: string; icon: React.ElementType; active: string; inactive: string }[] = [
    {
      id: "pending",
      label: "Pending Censoring",
      icon: Bell,
      active: "bg-rose-500/15 border-rose-500/40 text-rose-300",
      inactive: "bg-(--bg-raise) border-(--svf-border) text-(--text-faint) hover:border-rose-500/30 hover:text-rose-400",
    },
    {
      id: "done",
      label: "Censored",
      icon: CheckCircle2,
      active: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
      inactive: "bg-(--bg-raise) border-(--svf-border) text-(--text-faint) hover:border-emerald-500/30 hover:text-emerald-400",
    },
    {
      id: "all",
      label: "All \"A\" Movies",
      icon: Film,
      active: "bg-red-600/15 border-red-500/40 text-red-300",
      inactive: "bg-(--bg-raise) border-(--svf-border) text-(--text-faint) hover:border-red-500/30 hover:text-red-400",
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
            onClick={() => { setStatusFilter(id); }}
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
            placeholder="Search by title or production no…"
            className="pl-9 h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint)"
          />
        </div>

        <MultiSelectFilter
          label="All Sources"
          options={[{ value: "home_production", label: "Home Production" }, { value: "acquired", label: "Acquired" }]}
          value={sourceFilter}
          onChange={(v) => setSourceFilter(v as ("home_production" | "acquired")[])}
          triggerWidth="w-40"
        />

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5"
            style={{ color: "var(--text-faint)" }}
            onClick={() => { setSearch(""); setStatusFilter("all"); setSourceFilter(SOURCE_OPTIONS); }}
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
              <div className="p-4 rounded-full bg-(--bg-raise) border border-(--svf-border)">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
              </div>
              <p className="text-(--text-faint) font-medium">
                {hasFilters ? "No movies match your filters." : "No A-certified movies found."}
              </p>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="text-(--text-faint) hover:text-(--text)"
                  onClick={() => { setSearch(""); setStatusFilter("all"); setSourceFilter(SOURCE_OPTIONS); }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-[16px] border border-(--tbl-border) overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[35%]">Movie</TableHead>
                    <TableHead className="hidden md:table-cell">Language</TableHead>
                    <TableHead className="hidden lg:table-cell">Production House</TableHead>
                    <TableHead className="hidden sm:table-cell">Source</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Censor Flag</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movies.map((movie) => (
                    <TableRow
                      key={movie.id}
                      className={cn(
                        "group",
                        // Flagged rows keep their rose tint; others use the shared hover.
                        movie.recensor_flag && "bg-rose-500/[0.03]"
                      )}
                    >
                      {/* Title */}
                      <TableCell>
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
                      </TableCell>

                      {/* Language */}
                      <TableCell className="hidden md:table-cell text-(--text-faint)">
                        {movie.language_name || <span className="text-(--text-faint)">—</span>}
                      </TableCell>

                      {/* Production House */}
                      <TableCell className="hidden lg:table-cell text-(--text-faint) max-w-40 truncate">
                        {movie.production_house_name || <span className="text-(--text-faint)">—</span>}
                      </TableCell>

                      {/* Source */}
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-semibold px-2 py-0.5",
                          movie.source === "home_production"
                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/25"
                            : "bg-violet-500/10 text-violet-400 border-violet-500/25"
                        )}>
                          {movie.source === "home_production" ? "Home" : "Acquired"}
                        </Badge>
                      </TableCell>

                      {/* Status badge */}
                      <TableCell className="text-center">
                        {movie.recensor_flag ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/25 px-2.5 py-1 rounded-full">
                            <Clock className="h-3 w-3" />Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="h-3 w-3" />Done
                          </span>
                        )}
                      </TableCell>

                      {/* Toggle */}
                      <TableCell className="text-center">
                        {togglingId === movie.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-(--text-faint) mx-auto" />
                        ) : canEditMovie ? (
                          <Switch
                            checked={movie.recensor_flag}
                            onCheckedChange={() => toggleRecensor(movie)}
                            className="data-[state=checked]:bg-rose-500 mx-auto"
                            aria-label={`Toggle recensor flag for ${movie.title}`}
                          />
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-block cursor-not-allowed mx-auto">
                                <Switch
                                  checked={movie.recensor_flag}
                                  disabled
                                  className="data-[state=checked]:bg-rose-500 pointer-events-none"
                                  aria-label={`Toggle recensor flag for ${movie.title}`}
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>You don&apos;t have permission to change censor status.</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>

                      {/* Edit */}
                      <TableCell className="text-right">
                        {canEditMovie ? (
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
                        ) : (
                          <DisabledActionButton size="sm" variant="ghost" className="h-7 gap-1.5" reason="You don't have permission to edit movies.">
                            <Edit className="h-3.5 w-3.5" />
                            <span className="text-xs">Edit</span>
                          </DisabledActionButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      </div>

    </div>
  );
}
