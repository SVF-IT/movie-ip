"use client";

import { DataExportDialog, type ExportFieldDef } from "@/components/import-export/data-export-dialog";
import { MovieSelector } from "@/components/movies/movie-selector";
import { RoleGate } from "@/components/role-gate";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { getAllRights } from "@/lib/api/rights";
import { submitRightChange } from "@/lib/api/pending-changes";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PlatformRight } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { differenceInDays, format } from "date-fns";
import {
  Download,
  Edit,
  FileText,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  Satellite,
  Trash2,
  Tv,
  Wifi,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

type RightsTypeFilter = "all" | "satellite" | "internet" | "other";

const rightsTypePills: { id: RightsTypeFilter; label: string; icon: React.ElementType }[] = [
  { id: "all",       label: "All Rights", icon: FileText },
  { id: "satellite", label: "Satellite",  icon: Tv },
  { id: "internet",  label: "Internet",   icon: Wifi },
  { id: "other",     label: "Other",      icon: MoreHorizontal },
];

function platformTypeCategory(platformType: string): "satellite" | "internet" | "other" {
  const pt = platformType.toLowerCase();
  if (pt.includes("satellite") || pt.includes("dth") || pt.includes("terrestrial")) return "satellite";
  if (pt.includes("svod") || pt.includes("tvod") || pt.includes("avod") || pt.includes("fvod") || pt.includes("nvod") || pt.includes("iptv")) return "internet";
  return "other";
}

export default function RightsPage() {
  const [rights, setRights] = useState<RightWithDetails[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Type filter: satellite | internet | other | all
  const [rightsTypeFilter, setRightsTypeFilter] = useState<RightsTypeFilter>("all");
  // Platform name filter — populated dynamically from DB, scoped to selected type
  const [platformFilter, setPlatformFilter] = useState("all");
  const [platformOptions, setPlatformOptions] = useState<PlatformOption[]>([]);

  const [movieIdFilter, setMovieIdFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired">("active");
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [deletingRight, setDeletingRight] = useState<RightWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { profile } = useAuth();
  const canRequestDelete = profile?.role === "admin" || profile?.role === "editor";

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportData, setExportData] = useState<RightWithDetails[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  // Load platforms from DB, filtered to the currently selected type category
  useEffect(() => {
    const supabase = createClient();
    supabase.from("platforms").select("id, name, platform_type").order("name").then(({ data }: { data: PlatformOption[] | null }) => {
      let opts: PlatformOption[] = data || [];
      if (rightsTypeFilter !== "all") {
        opts = opts.filter((p) => platformTypeCategory(p.platform_type || "") === rightsTypeFilter);
      }
      setPlatformOptions(opts);
      // Reset platform name filter when type changes — the previous platform may not exist in the new type
      setPlatformFilter("all");
    });
  }, [rightsTypeFilter]);

  const fetchRights = useCallback(async () => {
    try {
      setLoading(true);

      const isExpiredValue = statusFilter === "active" ? false : statusFilter === "expired" ? true : undefined;

      const { data, count } = await getAllRights({
        platformId: platformFilter !== "all" ? platformFilter : undefined,
        platformTypeCategory: rightsTypeFilter !== "all" ? rightsTypeFilter : undefined,
        movieId: movieIdFilter !== "all" ? movieIdFilter : undefined,
        isExpired: isExpiredValue,
        limit: rightsTypeFilter !== "all" || platformFilter !== "all" ? 10000 : pageSize,
        offset: rightsTypeFilter !== "all" || platformFilter !== "all" ? 0 : page * pageSize,
      });

      setRights(data as RightWithDetails[]);
      setTotalCount(count);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Error fetching rights:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load rights");
    } finally {
      setLoading(false);
    }
  }, [platformFilter, movieIdFilter, statusFilter, rightsTypeFilter, page]);

  useEffect(() => { fetchRights(); }, [fetchRights]);

  const getExpiryStatus = (endDate?: string) => {
    if (!endDate) return { label: "No End Date", color: "bg-slate-800/60 text-slate-400 border-slate-700/50" };
    const days = differenceInDays(new Date(endDate), new Date());
    if (days < 0) return { label: "Expired", color: "bg-red-500/10 text-red-400 border-red-500/25" };
    if (days <= 30) return { label: `${days}d left`, color: "bg-amber-500/10 text-amber-400 border-amber-500/25" };
    if (days <= 90) return { label: `${days}d left`, color: "bg-orange-500/10 text-orange-400 border-orange-500/25" };
    return { label: "Active", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" };
  };

  const handleFilterChange = (type: "movieId" | "status", value: string) => {
    if (type === "movieId") setMovieIdFilter(value);
    else if (type === "status") setStatusFilter(value as "all" | "active" | "expired");
    setPage(0);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rights.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(rights.map((r) => r.id)));
  };

  const handleExportClick = useCallback(async () => {
    setExportLoading(true);
    try {
      const isExpiredValue = statusFilter === "active" ? false : statusFilter === "expired" ? true : undefined;
      const { data } = await getAllRights({
        platformId: platformFilter !== "all" ? platformFilter : undefined,
        platformTypeCategory: rightsTypeFilter !== "all" ? rightsTypeFilter : undefined,
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
    <div className="space-y-6 min-w-0">
      {/* Cinematic Header */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-red-600 via-amber-500 to-transparent" />
        <div className="absolute top-4 right-4 w-56 h-56 bg-red-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-2 right-24 w-36 h-36 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <FileText className="h-7 w-7 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">Rights Management</h1>
              <p className="text-slate-400 text-sm mt-0.5">Manage platform rights and distribution licenses.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700/60 hover:text-slate-100 gap-2"
              onClick={handleExportClick}
              disabled={exportLoading}
            >
              {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export
            </Button>
            <RoleGate action="create" resource="right">
              <Button asChild size="sm" className="h-9 px-4 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30 gap-2">
                <Link href="/rights/new"><Plus className="h-4 w-4" />Add Right</Link>
              </Button>
            </RoleGate>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card border-slate-800/60 overflow-hidden">
        <CardHeader className="border-b border-slate-800/60 py-4 px-6">
          <CardTitle className="text-sm font-bold flex items-center gap-2.5 text-slate-200">
            <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
              <Filter className="h-3.5 w-3.5 text-red-400" />
            </div>
            Filters
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 gap-1"
                onClick={() => { setRightsTypeFilter("all"); setPlatformFilter("all"); setMovieIdFilter("all"); setStatusFilter("active"); setPage(0); }}
              >
                <X className="h-3 w-3" />Reset
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-4">

          {/* Row 1: Movie + Status */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end flex-wrap">
            <div className="w-full max-w-sm">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Movie</label>
              <MovieSelector selectedId={movieIdFilter} onSelect={(id) => handleFilterChange("movieId", id)} />
            </div>
            <div className="w-full md:w-44">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Status</label>
              <Select value={statusFilter} onValueChange={(v) => handleFilterChange("status", v)}>
                <SelectTrigger className="h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="expired">Expired Only</SelectItem>
                  <SelectItem value="all">All Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Type pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Type:</span>
            {rightsTypePills.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setRightsTypeFilter(id); setPage(0); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200",
                  rightsTypeFilter === id
                    ? "bg-red-600/15 border-red-500/40 text-red-300"
                    : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-red-500/30 hover:text-red-400"
                )}
              >
                <Icon className="h-3 w-3" />{label}
              </button>
            ))}
          </div>

          {/* Row 3: Platform name — only shown when a type is selected */}
          {rightsTypeFilter !== "all" && (
            <div className="w-full md:w-64">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Platform</label>
              <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(0); }}>
                <SelectTrigger className="h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                  <SelectValue placeholder="All Platforms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  {platformOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

        </CardContent>
      </Card>



      {/* Rights Table */}
      <Card className="glass-card border-slate-800/60 overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-slate-800/60">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
              <FileText className="h-4 w-4 text-red-400" />
              Platform Rights
              <Badge className="ml-0.5 bg-slate-800/80 text-slate-300 border-slate-700/50 font-medium text-xs">
                {loading ? "…" : totalCount}
              </Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-red-400/60" />
              <p className="text-slate-400 text-sm">Loading rights…</p>
            </div>
          ) : rights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="p-4 rounded-full bg-slate-800/50 border border-slate-700/40">
                <FileText className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-slate-400 font-medium">No rights found.</p>
              <p className="text-slate-400 text-sm">Try adjusting your filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800/60 hover:bg-transparent">
                      <TableHead className="w-10 pl-5">
                        <Checkbox
                          checked={rights.length > 0 && selectedIds.size === rights.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                          className="border-slate-600"
                        />
                      </TableHead>
                      <SortableHeader column="movies" label="Movie" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-400" />
                      <SortableHeader column="platforms" label="Platform" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden md:table-cell" />
                      <SortableHeader column="license_type" label="Type" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell" />
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell">Category</TableHead>
                      <SortableHeader column="start_date" label="Start Date" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell" />
                      <SortableHeader column="end_date" label="End Date" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-400" />
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRights.map((right) => {
                      const status = getExpiryStatus(right.end_date);
                      return (
                        <TableRow key={right.id} className="border-slate-800/40 hover:bg-slate-800/30 transition-colors group">
                          <TableCell className="pl-5 py-3.5">
                            <Checkbox
                              checked={selectedIds.has(right.id)}
                              onCheckedChange={() => toggleSelect(right.id)}
                              aria-label={`Select ${right.movies?.title || "right"}`}
                              className="border-slate-600"
                            />
                          </TableCell>
                          <TableCell className="py-3.5">
                            <div className="min-w-0">
                              {right.movies ? (
                                <Link href={`/movies/${right.movies.id}`} className="font-semibold text-sm text-slate-200 hover:text-red-400 transition-colors truncate block max-w-[200px]">
                                  {right.movies.title}
                                </Link>
                              ) : <span className="text-slate-400 text-sm">—</span>}
                              <span className="text-[10px] text-slate-400 font-mono md:hidden">{right.platforms?.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-slate-400 max-w-[130px] truncate py-3.5">
                            {right.platforms?.name || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-slate-400 py-3.5">
                            {right.platforms?.platform_type || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-slate-400 py-3.5">
                            {right.category || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell tabular-nums text-xs text-emerald-400 font-medium py-3.5">
                            {right.start_date ? format(new Date(right.start_date), "dd MMM yy") : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-xs text-slate-300 font-medium py-3.5">
                            {right.end_date ? format(new Date(right.end_date), "dd MMM yy") : "—"}
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
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" asChild>
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
                                        className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
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

              {totalCount > pageSize && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/60">
                  <p className="text-xs text-slate-400 tabular-nums">
                    {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
                  </p>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 px-4 bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-700/60" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
                    <Button variant="outline" size="sm" className="h-8 px-4 bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-700/60" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalCount}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

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
