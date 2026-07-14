"use client";

import { DataExportDialog, type ExportFieldDef } from "@/components/import-export/data-export-dialog";
import { MovieSelector } from "@/components/movies/movie-selector";
import { RoleGate } from "@/components/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { PlatformRight } from "@/lib/types/database";
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
import { useCallback, useEffect, useState } from "react";

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

// Grouped type dropdown: group label → list of exact platform_type strings
const RIGHTS_TYPE_GROUPS: { group: string; types: string[] }[] = [
  { group: "Satellite", types: ["Satellite TV", "DTH VOD", "Terrestrial TV", "Cable TV"] },
  { group: "Internet", types: ["SVOD", "TVOD", "AVOD", "FVOD", "NVOD", "IPTV"] },
  { group: "Other", types: ["Air Rights", "Ship Rights", "Surface Rights", "Hotel Rights"] },
];

export default function RightsPage() {
  const [rights, setRights] = useState<RightWithDetails[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // "all" | exact platform_type string e.g. "Satellite TV", "SVOD"
  const [rightsTypeFilter, setRightsTypeFilter] = useState("all");
  // Platform id — populated from DB scoped to selected sub-type
  const [platformFilter, setPlatformFilter] = useState("all");
  const [platformOptions, setPlatformOptions] = useState<PlatformOption[]>([]);

  const [movieIdFilter, setMovieIdFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired">("active");
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();

  const [deletingRight, setDeletingRight] = useState<RightWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { profile } = useAuth();
  const canRequestDelete = profile?.role === "admin" || profile?.role === "editor";

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportData, setExportData] = useState<RightWithDetails[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  // Load platforms from DB filtered to the exact selected platform_type
  useEffect(() => {
    const supabase = createClient();
    supabase.from("platforms").select("id, name, platform_type").order("name").then(({ data }: { data: PlatformOption[] | null }) => {
      let opts: PlatformOption[] = data || [];
      if (rightsTypeFilter !== "all") {
        opts = opts.filter((p) => (p.platform_type || "").toLowerCase() === rightsTypeFilter.toLowerCase());
      }
      setPlatformOptions(opts);
      setPlatformFilter("all");
    });
  }, [rightsTypeFilter]);

  const fetchRights = useCallback(async () => {
    try {
      setLoading(true);

      const isExpiredValue = statusFilter === "active" ? false : statusFilter === "expired" ? true : undefined;

      const { data, count } = await getAllRights({
        platformId: platformFilter !== "all" ? platformFilter : undefined,
        platformTypeExact: rightsTypeFilter !== "all" ? rightsTypeFilter : undefined,
        movieId: movieIdFilter !== "all" ? movieIdFilter : undefined,
        isExpired: isExpiredValue,
        limit: 10000,
        offset: 0,
      });

      setRights(data as RightWithDetails[]);
      setTotalCount(count);
    } catch (err) {
      console.error("Error fetching rights:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load rights");
    } finally {
      setLoading(false);
    }
  }, [platformFilter, movieIdFilter, statusFilter, rightsTypeFilter]);

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

  const handleFilterChange = (type: "movieId" | "status", value: string) => {
    if (type === "movieId") setMovieIdFilter(value);
    else if (type === "status") setStatusFilter(value as "all" | "active" | "expired");
  };

  const handleExportClick = useCallback(async () => {
    setExportLoading(true);
    try {
      const isExpiredValue = statusFilter === "active" ? false : statusFilter === "expired" ? true : undefined;
      const { data } = await getAllRights({
        platformId: platformFilter !== "all" ? platformFilter : undefined,
        platformTypeExact: rightsTypeFilter !== "all" ? rightsTypeFilter : undefined,
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
  }, [platformFilter, movieIdFilter, statusFilter, rightsTypeFilter]);

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

  const { sortedData: sortedRights, sortConfig, requestSort } = useSortableTable(rights);

  const hasFilters = platformFilter !== "all" || movieIdFilter !== "all" || statusFilter !== "active" || rightsTypeFilter !== "all";

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Compact toolbar: all filters + actions in one row ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Movie selector */}
        <div className="w-56">
          <MovieSelector selectedId={movieIdFilter} onSelect={(id) => handleFilterChange("movieId", id)} />
        </div>

        {/* Status */}
        <Select value={statusFilter} onValueChange={(v) => handleFilterChange("status", v)}>
          <SelectTrigger className="h-9 w-36 bg-(--bg-raise)/40 border-(--svf-border) text-(--text)">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="expired">Expired Only</SelectItem>
            <SelectItem value="all">All Status</SelectItem>
          </SelectContent>
        </Select>

        {/* Rights type grouped dropdown */}
        <Select value={rightsTypeFilter} onValueChange={(v) => { setRightsTypeFilter(v); }}>
          <SelectTrigger className="h-9 w-44 bg-(--bg-raise)/40 border-(--svf-border) text-(--text)">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {RIGHTS_TYPE_GROUPS.map(({ group, types }) => (
              <div key={group}>
                <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) select-none">
                  {group}
                </div>
                {types.map((t) => (
                  <SelectItem key={t} value={t} className="pl-5">{t}</SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        {/* Platform — only when a sub-type is selected */}
        {rightsTypeFilter !== "all" && (
          <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); }}>
            <SelectTrigger className="h-9 w-44 bg-(--bg-raise)/40 border-(--svf-border) text-(--text)">
              <SelectValue placeholder="All Platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {platformOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1 text-(--text-faint)" onClick={() => { setRightsTypeFilter("all"); setPlatformFilter("all"); setMovieIdFilter("all"); setStatusFilter("active"); }}>
            <X className="h-3.5 w-3.5" />Reset
          </Button>
        )}

        <div className="flex-1" />

        {/* Actions */}
        <Button variant="outline" size="sm" className="h-9 gap-2 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20" onClick={handleExportClick} disabled={exportLoading}>
          {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export
        </Button>
        <RoleGate action="create" resource="right">
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
          ) : rights.length === 0 ? (
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
                      <SortableHeader column="movies" label="Movie" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)" />
                      <SortableHeader column="platforms" label="Platform" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden md:table-cell" />
                      <SortableHeader column="license_type" label="Type" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden lg:table-cell" />
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden lg:table-cell">Category</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden lg:table-cell">Nature</TableHead>
                      <SortableHeader column="start_date" label="Start Date" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden lg:table-cell" />
                      <SortableHeader column="end_date" label="End Date" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)" />
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) hidden lg:table-cell">Holdbacks</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Status</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-(--text-faint) pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRights.map((right) => {
                      const status = getExpiryStatus(right.end_date);
                      return (
                        <TableRow key={right.id} className="border-(--svf-border)/40 hover:bg-(--hover)/30 transition-colors group">
                          <TableCell className="pl-5 py-3.5">
                            <div className="min-w-0">
                              {right.movies ? (
                                <Link href={`/movies/${right.movies.id}`} className="font-semibold text-sm text-(--text) hover:text-red-400 transition-colors truncate block max-w-[200px]">
                                  {right.movies.title}
                                </Link>
                              ) : <span className="text-(--text-faint) text-sm">—</span>}
                              <span className="text-[10px] text-(--text-faint) font-mono md:hidden">{right.platforms?.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-(--text-faint) max-w-[130px] truncate py-3.5">
                            {right.platforms?.name || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-(--text-faint) py-3.5">
                            {right.platforms?.platform_type || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-(--text-faint) py-3.5">
                            {right.category || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-(--text-faint) py-3.5">
                            {right.nature || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell tabular-nums text-xs text-emerald-400 font-medium py-3.5">
                            {right.start_date ? format(new Date(right.start_date), "dd MMM yy") : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-xs text-(--text) font-medium py-3.5">
                            {right.end_date
                              ? (right.end_date.startsWith("3099") || right.end_date.startsWith("9999"))
                                ? <span className="text-(--st-active) font-semibold">Perpetual</span>
                                : format(new Date(right.end_date), "dd MMM yy")
                              : "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-amber-400 max-w-50 truncate py-3.5" title={right.holdbacks || undefined}>
                            {right.holdbacks || <span className="text-(--text-faint)">—</span>}
                          </TableCell>
                          <TableCell className="py-3.5">
                            <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap", status.color)}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-6 py-3.5">
                            <RoleGate action="edit" resource="right">
                              <div className="flex justify-end gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-5 w-5 text-(--text-faint) hover:text-amber-400 hover:bg-amber-500/10" asChild>
                                      <Link href={`/rights/${right.id}/edit`}><Edit className="h-3.5 w-3.5" /></Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit</TooltipContent>
                                </Tooltip>
                                {canRequestDelete && (
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
                                )}
                              </div>
                            </RoleGate>
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
