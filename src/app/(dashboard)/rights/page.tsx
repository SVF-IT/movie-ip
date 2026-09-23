"use client";

import { DisabledActionButton } from "@/components/disabled-action-button";
import { DataExportDialog, type ExportFieldDef } from "@/components/import-export/data-export-dialog";
import { RoleGate } from "@/components/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ColumnFilter,
  FilterableHead,
  SortableFilterableHead,
} from "@/components/ui/column-header-filter";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { SortableHeader } from "@/components/ui/sortable-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { submitRightChange } from "@/lib/api/pending-changes";
import { getAllRights } from "@/lib/api/rights";
import { createClient } from "@/lib/supabase/client";
import { isAdminRole, isEditorRole, type PlatformRight } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { differenceInDays, format } from "date-fns";
import {
  Download,
  Edit,
  FileText,
  Loader2,
  Plus,
  Trash2,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stringListCodec, useUrlFilterState } from "@/hooks/use-url-filter-state";
import { natureKey, natureLabel, NONE_KEY } from "@/lib/utils/rights-types";

const RIGHTS_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "movie_title", label: "Movie", getter: (r) => (r.movies as any)?.title || "" },
  { key: "platform_name", label: "Platform", getter: (r) => (r.platforms as any)?.name || "" },
  { key: "rights_type", label: "Rights Type", getter: (r) => (r.platforms as any)?.platform_type || "" },
  { key: "category", label: "Category" },
  { key: "license_type", label: "License Type" },
  { key: "nature", label: "Nature" },
  { key: "start_date", label: "Start Date" },
  { key: "end_date", label: "End Date" },
  { key: "territory", label: "Territory" },
  { key: "remarks", label: "Remarks" },
];

interface RightWithDetails extends PlatformRight {
  movies?: { id: string; title: string; source: string };
  platforms?: { id: string; name: string; platform_type?: string };
  category?: string | null;
}

interface PlatformOption { id: string; name: string; platform_type?: string }

/**
 * The stable status keys behind the Status column. The cell itself shows a
 * countdown ("12d left") for anything expiring inside 90 days, which would make
 * a per-row label useless as a filter value, so the funnel groups those under
 * one "Expiring Soon" entry.
 */
const SOURCE_OPTIONS = [
  { value: "home_production", label: "Home Production" },
  { value: "acquired", label: "Acquired" },
];

const ALL_STATUSES = ["Expired", "Expiring Soon", "Active", "Perpetual", "No End Date"] as const;

/**
 * The page opens on "active only" — everything except lapsed rights — which is
 * also what the server is asked for. "Clear all" restores exactly this.
 */
const DEFAULT_STATUS: string[] = ALL_STATUSES.filter((s) => s !== "Expired");

function sameStatusSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((v) => set.has(v));
}

/** The status key for a row, matching what the Status cell renders. */
function statusOf(endDate?: string | null): string {
  if (!endDate) return "No End Date";
  if (endDate.startsWith("3099") || endDate.startsWith("9999")) return "Perpetual";
  const days = differenceInDays(new Date(endDate), new Date());
  if (days < 0) return "Expired";
  if (days <= 90) return "Expiring Soon";
  return "Active";
}

/**
 * What to ask the server for, given the picked statuses.
 *
 * Only the lapsed/not-lapsed split exists server-side, so a selection that sits
 * wholly on one side of it narrows the fetch and anything straddling it fetches
 * both and lets the client-side predicate do the rest. Either way the rows that
 * *can* appear are never smaller than the selection.
 */
function isExpiredParam(statuses: string[]): boolean | undefined {
  if (statuses.length === 0) return undefined;
  const wantsExpired = statuses.includes("Expired");
  const wantsOther = statuses.some((s) => s !== "Expired");
  if (wantsExpired && !wantsOther) return true;
  if (!wantsExpired && wantsOther) return false;
  return undefined;
}


// Grouped type dropdown: group label → list of exact platform_type strings


export default function RightsPage() {
  const [rights, setRights] = useState<RightWithDetails[]>([]);

  const [sourceFilter, setSourceFilter] = useUrlFilterState<string[]>(
    "src", [], stringListCodec, (v) => v.length === 0
  );
  // Platform id — populated from DB scoped to selected sub-type(s).
  // "Every option ticked" is the same as no narrowing, so it stays out of the
  // URL; the option list only arrives after a fetch, hence the ref.
  const platformOptionsRef = useRef<PlatformOption[]>([]);
  const [platformFilter, setPlatformFilter] = useUrlFilterState<string[]>(
    "plat",
    [],
    stringListCodec,
    (v) => platformOptionsRef.current.length > 0 && v.length >= platformOptionsRef.current.length
  );
  const [platformOptions, setPlatformOptions] = useState<PlatformOption[]>([]);
  const platformSeeded = useRef(false);
  const platformFromUrl = useRef(platformFilter.length > 0);

  // Kept for the ?movie=<id> deep link other pages use; the toolbar picker is
  // gone because the searchable Movie column funnel replaces it.
  const [movieIdFilter, setMovieIdFilter] = useUrlFilterState<string>(
    "movie",
    "all",
    { encode: (v) => (v === "all" ? null : v), decode: (raw) => raw || "all" }
  );
  /**
   * Status is now a header funnel, but it still decides *what gets fetched*:
   * lapsed rights are excluded server-side unless they are asked for. Turning
   * it into a purely client-side filter would have meant fetching every right
   * ever recorded on every visit, so the selection is translated back into the
   * single `isExpired` server param below and only the remaining distinction
   * (Perpetual / Expiring soon / Active / No end date) is applied client-side.
   */
  const [statusFilter, setStatusFilter] = useUrlFilterState<string[]>(
    "status",
    DEFAULT_STATUS,
    {
      // Legacy single-value links (`?status=expired` from Expiring Rights, and
      // any bookmark made before this page had funnels) still resolve.
      encode: (v) => (sameStatusSet(v, DEFAULT_STATUS) ? null : v.join(",")),
      decode: (raw) => {
        if (raw === "active") return DEFAULT_STATUS;
        if (raw === "expired") return ["Expired"];
        if (raw === "all") return ALL_STATUSES.slice();
        const picked = raw.split(",").filter((x) => (ALL_STATUSES as readonly string[]).includes(x));
        return picked.length ? picked : DEFAULT_STATUS;
      },
    },
    (v) => sameStatusSet(v, DEFAULT_STATUS)
  );
  // The remaining header funnels follow expiring/page.tsx's convention: an
  // empty array means "no narrowing", so the default never reaches the URL and
  // the option lists can shrink as siblings narrow without a stale selection
  // reading as an active filter.
  const [movieTitleFilter, setMovieTitleFilter] = useUrlFilterState<string[]>(
    "mv", [], stringListCodec, (v) => v.length === 0
  );
  const [platformTypeFilter, setPlatformTypeFilter] = useUrlFilterState<string[]>(
    "ptype", [], stringListCodec, (v) => v.length === 0
  );
  const [categoryFilter, setCategoryFilter] = useUrlFilterState<string[]>(
    "cat", [], stringListCodec, (v) => v.length === 0
  );
  const [natureFilter, setNatureFilter] = useUrlFilterState<string[]>(
    "nature", [], stringListCodec, (v) => v.length === 0
  );
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();

  const [deletingRight, setDeletingRight] = useState<RightWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { profile } = useAuth();
  const canRequestDelete = isAdminRole(profile?.role) || isEditorRole(profile?.role);

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportData, setExportData] = useState<RightWithDetails[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  // Load platforms from DB filtered to the selected platform_type(s)
  useEffect(() => {
    const supabase = createClient();
    supabase.from("platforms").select("id, name, platform_type").order("name").then(({ data }: { data: PlatformOption[] | null }) => {
      // Every platform: the Type column funnel narrows by platform type
      // client-side, so there is no toolbar control to scope this list by.
      const opts: PlatformOption[] = data || [];
      setPlatformOptions(opts);
      platformOptionsRef.current = opts;
      // Changing the type reseeds the platform ticks to "all", as before — but
      // the FIRST run is skipped unconditionally, not just when the URL happened
      // to carry a platform. A guard that only checks one filter wipes whatever
      // the URL restored for the others the moment the options arrive.
      if (platformSeeded.current) {
        setPlatformFilter(opts.map((p) => p.id));
      } else if (!platformFromUrl.current) {
        // No platform in the URL: seed the ticks so "all selected" reads as
        // "no narrowing" rather than an empty, zero-row selection.
        setPlatformFilter(opts.map((p) => p.id));
      }
      platformSeeded.current = true;
    });
  }, []);

  const fetchRights = useCallback(async () => {
    try {
      setLoading(true);

      const isExpiredValue = isExpiredParam(statusFilter);

      // A filter is only sent to the server when it's a genuine narrowing. Platform is only
      // meaningful once its (dependent) option list has loaded and the user has narrowed it;
      // sending an empty/partial array before options finish loading would incorrectly restrict
      // to zero platforms instead of "no restriction."
      const platformParam = platformOptions.length > 0 && platformFilter.length < platformOptions.length ? platformFilter : undefined;

      const { data } = await getAllRights({
        platformId: platformParam,
        movieId: movieIdFilter !== "all" ? movieIdFilter : undefined,
        isExpired: isExpiredValue,
        limit: 10000,
        offset: 0,
      });

      setRights(data as RightWithDetails[]);
    } catch (err) {
      console.error("Error fetching rights:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load rights");
    } finally {
      setLoading(false);
    }
  }, [platformFilter, platformOptions.length, movieIdFilter, statusFilter]);

  useEffect(() => { fetchRights(); }, [fetchRights]);

  const getExpiryStatus = (endDate?: string) => {
    if (!endDate) return { label: "No End Date", color: "bg-(--bg-raise) text-(--text-faint) border-(--svf-border)" };
    if (endDate.startsWith("3099") || endDate.startsWith("9999")) return { label: "Perpetual", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" };
    const days = differenceInDays(new Date(endDate), new Date());
    if (days < 0) return { label: "Expired", color: "bg-red-500/10 text-red-400 border-red-500/25" };
    if (days <= 30) return { label: `${days}d left`, color: "bg-amber-500/10 text-amber-400 border-amber-500/25" };
    if (days <= 90) return { label: `${days}d left`, color: "bg-orange-500/10 text-orange-400 border-orange-500/25" };
    return { label: "Active", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" };
  };


  const handleExportClick = useCallback(async () => {
    setExportLoading(true);
    try {
      const isExpiredValue = isExpiredParam(statusFilter);
      const platformParam = platformOptions.length > 0 && platformFilter.length < platformOptions.length ? platformFilter : undefined;
      const { data } = await getAllRights({
        platformId: platformParam,
        movieId: movieIdFilter !== "all" ? movieIdFilter : undefined,
        isExpired: isExpiredValue,
        limit: 10000,
      });
      setExportData(data as RightWithDetails[]);
      setShowExportDialog(true);
    } catch (err) {
      console.error("Error loading export data:", err);
    } finally {
      setExportLoading(false);
    }
  }, [platformFilter, platformOptions.length, movieIdFilter, statusFilter]);

  const handleDeleteRequest = async () => {
    if (!deletingRight || !profile) return;
    setIsDeleting(true);
    try {
      await submitRightChange(
        deletingRight.movie_id,
        "right_delete",
        deletingRight,
        profile.full_name || profile.email,
        profile.id,
        deletingRight
      );
      toast.success("Deletion request submitted for approval");
      setDeletingRight(null);
      // Auto-hide success after 3s
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit deletion request");
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * One predicate per header funnel, applied independently so a column's option
   * list can be built from the rows the *other* filters leave visible — the
   * Excel behaviour where a funnel never offers a choice that yields zero rows,
   * yet still shows its own unpicked siblings.
   */
  const matchMovie = useCallback((r: RightWithDetails) =>
    movieTitleFilter.length === 0
    || movieTitleFilter.includes(r.movies?.title || NONE_KEY), [movieTitleFilter]);
  const matchPlatform = useCallback((r: RightWithDetails) =>
    platformFilter.length === 0 || platformOptions.length === 0
    || platformFilter.length >= platformOptions.length
    || platformFilter.includes(r.platforms?.id || NONE_KEY),
  [platformFilter, platformOptions.length]);
  const matchPlatformType = useCallback((r: RightWithDetails) =>
    platformTypeFilter.length === 0
    || platformTypeFilter.includes(r.platforms?.platform_type || NONE_KEY), [platformTypeFilter]);
  const matchCategory = useCallback((r: RightWithDetails) =>
    categoryFilter.length === 0
    || categoryFilter.includes(r.category?.trim() ? r.category : NONE_KEY), [categoryFilter]);
  const matchNature = useCallback((r: RightWithDetails) =>
    natureFilter.length === 0
    || natureFilter.includes(r.nature && r.nature.trim() ? natureKey(r.nature) : NONE_KEY), [natureFilter]);
  const matchStatus = useCallback((r: RightWithDetails) =>
    statusFilter.length === 0 || statusFilter.includes(statusOf(r.end_date)), [statusFilter]);
  const matchSource = useCallback((r: RightWithDetails) =>
    sourceFilter.length === 0 || sourceFilter.includes(r.movies?.source || NONE_KEY), [sourceFilter]);

  /** Rows visible to a given column's funnel: everything except its own filter. */
  const rowsExcept = useCallback((skip: "movie" | "platform" | "ptype" | "category" | "nature" | "status") =>
    rights.filter((r) =>
      // Source has no column of its own, so it narrows every funnel's options.
      matchSource(r)
      && (skip === "movie" || matchMovie(r))
      && (skip === "platform" || matchPlatform(r))
      && (skip === "ptype" || matchPlatformType(r))
      && (skip === "category" || matchCategory(r))
      && (skip === "nature" || matchNature(r))
      && (skip === "status" || matchStatus(r))
    ),
  [rights, matchSource, matchMovie, matchPlatform, matchPlatformType, matchCategory, matchNature, matchStatus]);

  const movieOptions = useMemo(() => {
    const set = new Set<string>();
    let hasBlank = false;
    for (const r of rowsExcept("movie")) {
      if (r.movies?.title) set.add(r.movies.title);
      else hasBlank = true;
    }
    const opts = Array.from(set).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
    return hasBlank ? [...opts, { value: NONE_KEY, label: "— Not set —" }] : opts;
  }, [rowsExcept]);

  /**
   * Platform choices come from the rows in view, not the whole platforms table:
   * that table holds one row per platform *per type*, so a brand carried on both
   * satellite and internet appears twice with nothing to tell the entries apart.
   * Every entry is qualified by its type, not just the colliding ones, so the
   * list reads consistently rather than only explaining itself on collisions.
   */
  const platformChoices = useMemo(() => {
    const byId = new Map<string, string>();
    const typeById = new Map<string, string>();
    let hasBlank = false;
    for (const r of rowsExcept("platform")) {
      if (!r.platforms?.id) { hasBlank = true; continue; }
      byId.set(r.platforms.id, r.platforms.name || "—");
      if (r.platforms.platform_type) typeById.set(r.platforms.id, r.platforms.platform_type);
    }
    const opts = Array.from(byId.entries())
      .map(([value, name]) => {
        const type = typeById.get(value);
        return { value, label: type ? `${name} — ${type}` : name };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    return hasBlank ? [...opts, { value: NONE_KEY, label: "— Not set —" }] : opts;
  }, [rowsExcept]);

  const platformTypeOptions = useMemo(() => {
    const set = new Set<string>();
    let hasBlank = false;
    for (const r of rowsExcept("ptype")) {
      if (r.platforms?.platform_type) set.add(r.platforms.platform_type);
      else hasBlank = true;
    }
    const opts = Array.from(set).sort().map((value) => ({ value, label: value }));
    return hasBlank ? [...opts, { value: NONE_KEY, label: "— Not set —" }] : opts;
  }, [rowsExcept]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    let hasBlank = false;
    for (const r of rowsExcept("category")) {
      if (r.category?.trim()) set.add(r.category);
      else hasBlank = true;
    }
    const opts = Array.from(set).sort().map((value) => ({ value, label: value }));
    return hasBlank ? [...opts, { value: NONE_KEY, label: "— Not set —" }] : opts;
  }, [rowsExcept]);

  const natureOptions = useMemo(() => {
    // Keyed by the folded value, so "Non-exclusive" and "Non-Exclusive" become
    // one option rather than two that each match half the rows.
    const byKey = new Map<string, string>();
    for (const r of rowsExcept("nature")) {
      if (!r.nature || !r.nature.trim()) byKey.set(NONE_KEY, "— Not set —");
      else byKey.set(natureKey(r.nature), natureLabel(r.nature));
    }
    return Array.from(byKey.entries())
      .map(([value, label]) => ({ value, label }))
      // "Not set" belongs at the end rather than sorted among real values.
      .sort((a, b) =>
        a.value === NONE_KEY ? 1
        : b.value === NONE_KEY ? -1
        : a.label.localeCompare(b.label));
  }, [rowsExcept]);

  /**
   * Status is the one funnel whose options are NOT derived from the rows in
   * view: lapsed rights are excluded from the fetch itself, so deriving from
   * the rows would drop "Expired" from the list and make it unpickable — the
   * user could never widen the fetch again. The fixed list is offered instead.
   */
  const statusOptions = useMemo(() => ALL_STATUSES.map((value) => ({ value, label: value })), []);

  const filteredRights = useMemo(() => rights.filter((r) =>
    matchSource(r) && matchMovie(r) && matchPlatform(r) && matchPlatformType(r)
    && matchCategory(r) && matchNature(r) && matchStatus(r)
  ), [rights, matchSource, matchMovie, matchPlatform, matchPlatformType, matchCategory, matchNature, matchStatus]);

  const { sortedData: sortedRights, sortConfig, requestSort } = useSortableTable(filteredRights);

  const hasFilters =
    (platformOptions.length > 0 && platformFilter.length > 0 && platformFilter.length < platformOptions.length)
    || movieIdFilter !== "all"
    || !sameStatusSet(statusFilter, DEFAULT_STATUS)
    || sourceFilter.length > 0
    || movieTitleFilter.length > 0 || platformTypeFilter.length > 0
    || categoryFilter.length > 0 || natureFilter.length > 0;

  /** Restores the page's opening default state — note status defaults to "active". */
  const clearAllFilters = () => {
    setSourceFilter([]);
    setPlatformFilter(platformOptions.map((p) => p.id));
    setMovieIdFilter("all");
    setStatusFilter(DEFAULT_STATUS);
    setMovieTitleFilter([]);
    setPlatformTypeFilter([]);
    setCategoryFilter([]);
    setNatureFilter([]);
  };

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Compact toolbar: all filters + actions in one row ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Source — the one narrowing the table has no column for. Types live
            in the Type column funnel, so no duplicate control here. */}
        <MultiSelectFilter
          label="All Sources"
          options={SOURCE_OPTIONS}
          value={sourceFilter}
          onChange={setSourceFilter}
          triggerWidth="w-44"
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1 text-(--text-faint)" onClick={clearAllFilters}>
            <X className="h-3.5 w-3.5" />Clear all
          </Button>
        )}

        <div className="flex-1" />

        {/* Actions */}
        <Button variant="outline" size="sm" className="h-9 gap-2 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20" onClick={handleExportClick} disabled={exportLoading}>
          {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export
        </Button>
        <RoleGate
          action="create"
          resource="right"
          fallback={
            <DisabledActionButton className="h-9 gap-2 bg-red-600 border-0 shadow-lg shadow-red-900/30" reason="You don't have permission to add rights.">
              <Plus className="h-4 w-4" />Add Right
            </DisabledActionButton>
          }
        >
          <Button asChild size="sm" className="h-9 gap-2 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30">
            <Link href="/rights/new"><Plus className="h-4 w-4" />Add Right</Link>
          </Button>
        </RoleGate>
      </div>



      {/* Rights Table */}
      <div className="glass-card overflow-hidden">
        <div>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-red-400/60" />
              <p className="text-(--text-faint) text-sm">Loading rights…</p>
            </div>
          ) : sortedRights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="p-4 rounded-full bg-(--bg-raise) border border-(--svf-border)">
                <FileText className="h-8 w-8 text-(--text-faint)" />
              </div>
              <p className="text-(--text-faint) font-medium">No rights found.</p>
              <p className="text-(--text-faint) text-sm">Try adjusting your filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader style={{ background: "var(--bg-deep)" }}>
                    <TableRow className="border-(--svf-border) hover:bg-transparent">
                      <SortableFilterableHead column="movies" label="Movie" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">
                        <ColumnFilter options={movieOptions} value={movieTitleFilter} onChange={setMovieTitleFilter} searchable searchPlaceholder="Search movie…" />
                      </SortableFilterableHead>
                      <SortableFilterableHead column="platforms" label="Platform" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden md:table-cell">
                        <ColumnFilter options={platformChoices} value={platformFilter} onChange={setPlatformFilter} searchable searchPlaceholder="Search platform…" />
                      </SortableFilterableHead>
                      {/* Sorted on license_type as before, but filtered on the
                          platform's type — which is what the cell actually shows. */}
                      <SortableFilterableHead column="license_type" label="Type" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden lg:table-cell">
                        <ColumnFilter options={platformTypeOptions} value={platformTypeFilter} onChange={setPlatformTypeFilter} />
                      </SortableFilterableHead>
                      <FilterableHead label="Category" className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden lg:table-cell">
                        <ColumnFilter options={categoryOptions} value={categoryFilter} onChange={setCategoryFilter} />
                      </FilterableHead>
                      <FilterableHead label="Nature" className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden lg:table-cell">
                        <ColumnFilter options={natureOptions} value={natureFilter} onChange={setNatureFilter} />
                      </FilterableHead>
                      <SortableHeader column="start_date" label="Start Date" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden lg:table-cell" />
                      <SortableHeader column="end_date" label="End Date" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)" />
                      {/* Holdbacks is free text (e.g. "FVOD, Theatrical
                          Exploitation"), so it has no small set of distinct
                          values to funnel on and stays unfiltered. */}
                      <TableHead className="text-(--text-faint) hidden lg:table-cell">Holdbacks</TableHead>
                      <FilterableHead label="Status" className="text-(--text-faint)">
                        <ColumnFilter options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
                      </FilterableHead>
                      <TableHead className="text-right text-(--text-faint) pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRights.map((right) => {
                      const status = getExpiryStatus(right.end_date);
                      return (
                        <TableRow key={right.id} className="border-(--svf-border)/40 hover:bg-(--hover)/30 transition-colors group">
                          <TableCell className="pl-5">
                            <div className="min-w-0">
                              {right.movies ? (
                                <Link href={`/movies/${right.movies.id}`} className="font-semibold text-sm text-(--text) hover:text-red-400 transition-colors truncate block max-w-[200px]">
                                  {right.movies.title}
                                </Link>
                              ) : <span className="text-(--text-faint) text-sm">—</span>}
                              <span className="text-[10px] text-(--text-faint) font-mono md:hidden">{right.platforms?.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-(--text-faint) max-w-[130px] truncate">
                            {right.platforms?.name || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-(--text-faint)">
                            {right.platforms?.platform_type || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-(--text-faint)">
                            {right.category || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-(--text-faint)">
                            {right.nature?.trim() ? natureLabel(right.nature) : "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell tabular-nums text-emerald-400 font-medium">
                            {right.start_date ? format(new Date(right.start_date), "dd MMM yy") : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-(--text) font-medium">
                            {right.end_date
                              ? (right.end_date.startsWith("3099") || right.end_date.startsWith("9999"))
                                ? <span className="text-(--st-active) font-semibold">Perpetual</span>
                                : format(new Date(right.end_date), "dd MMM yy")
                              : "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-amber-400 max-w-50 truncate" title={right.holdbacks || undefined}>
                            {right.holdbacks || <span className="text-(--text-faint)">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap", status.color)}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="flex justify-end gap-0.5">
                              <RoleGate
                                action="edit"
                                resource="right"
                                fallback={
                                  <DisabledActionButton size="icon" variant="ghost" className="h-5 w-5" reason="You don't have permission to edit rights.">
                                    <Edit className="h-3.5 w-3.5" />
                                  </DisabledActionButton>
                                }
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-5 w-5 text-(--text-faint) hover:text-amber-400 hover:bg-amber-500/10" asChild>
                                      <Link href={`/rights/${right.id}/edit`}><Edit className="h-3.5 w-3.5" /></Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit</TooltipContent>
                                </Tooltip>
                              </RoleGate>
                              {canRequestDelete ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-5 w-5 text-(--text-faint) hover:text-red-400 hover:bg-red-500/10"
                                      onClick={() => setDeletingRight(right)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Request Deletion</TooltipContent>
                                </Tooltip>
                              ) : (
                                <DisabledActionButton size="icon" variant="ghost" className="h-5 w-5" reason="You don't have permission to request deletion of rights.">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </DisabledActionButton>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

            </>
          )}
        </div>
      </div>

      <DataExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        data={exportData as unknown as Record<string, unknown>[]}
        fields={RIGHTS_EXPORT_FIELDS}
        filename="rights"
      />

      <ConfirmDialog
        open={!!deletingRight}
        onOpenChange={(open) => !open && setDeletingRight(null)}
        onConfirm={handleDeleteRequest}
        title="Request Deletion"
        description={`Are you sure you want to request deletion of this right for "${deletingRight?.movies?.title}" on "${deletingRight?.platforms?.name}"? This will go through the approval process.`}
        confirmText="Request Delete"
        isLoading={isDeleting}
      />
    </div>
  );
}
