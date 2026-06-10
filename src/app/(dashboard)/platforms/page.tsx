"use client";

import { DataExportDialog, type ExportFieldDef } from "@/components/import-export/data-export-dialog";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { useSortableTable } from "@/hooks/use-sortable-table";
import { deletePlatform, getPlatformsWithStats, getPlatformTypes, type PlatformWithStats } from "@/lib/api/platforms";
import { cn } from "@/lib/utils";
import { AlertTriangle, Building2, Download, Edit, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAppToast } from "@/hooks/use-app-toast";

const PLATFORM_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Name" },
  { key: "platform_type", label: "Platform Type" },
  { key: "active_rights", label: "Active Rights" },
  { key: "total_rights", label: "Total Rights" },
];

const typeStyle = (t: string | null | undefined) => {
  if (!t) return "bg-slate-700/50 text-(--text-faint) border-slate-600/30";
  const lower = t.toLowerCase();
  if (lower.includes("satellite")) return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
  if (lower.includes("dth")) return "bg-sky-500/15 text-sky-400 border-sky-500/30";
  if (lower.includes("terrestrial")) return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  if (lower === "svod") return "bg-violet-500/15 text-violet-400 border-violet-500/30";
  if (lower === "tvod") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (lower === "avod" || lower === "fvod") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (lower === "theatrical") return "bg-pink-500/15 text-pink-400 border-pink-500/30";
  return "bg-slate-700/40 text-(--text) border-slate-600/30";
};

export default function PlatformsPage() {
  const [platforms, setPlatforms] = useState<PlatformWithStats[]>([]);
  const [platformTypes, setPlatformTypes] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingPlatform, setDeletingPlatform] = useState<PlatformWithStats | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportData, setExportData] = useState<PlatformWithStats[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const toast = useAppToast();

  useEffect(() => {
    getPlatformTypes().then(setPlatformTypes).catch(() => { });
  }, []);

  const fetchPlatforms = useCallback(async () => {
    try {
      setLoading(true);
      const { data, count } = await getPlatformsWithStats({
        search: searchQuery || undefined,
        platformType: typeFilter !== "all" ? typeFilter : undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      setPlatforms(data);
      setTotalCount(count);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load platforms");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, typeFilter, page]);

  useEffect(() => { fetchPlatforms(); }, [fetchPlatforms]);
  useEffect(() => { setPage(0); }, [searchQuery, typeFilter]);

  const handleDelete = async () => {
    if (!deletingPlatform) return;
    try {
      setDeleting(true);
      await deletePlatform(deletingPlatform.id);
      setShowDeleteConfirm(false);
      setDeletingPlatform(null);
      await fetchPlatforms();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete platform");
    } finally {
      setDeleting(false);
    }
  };

  const handleExportClick = useCallback(async () => {
    setExportLoading(true);
    try {
      const { data } = await getPlatformsWithStats({
        search: searchQuery || undefined,
        platformType: typeFilter !== "all" ? typeFilter : undefined,
      });
      setExportData(data);
      setShowExportDialog(true);
    } catch (err) {
      console.error("Error loading export data:", err);
    } finally {
      setExportLoading(false);
    }
  }, [searchQuery, typeFilter]);

  const { sortedData: sortedPlatforms, sortConfig, requestSort } = useSortableTable(platforms);

  const totalActiveRights = platforms.reduce((sum, p) => sum + (p.active_rights || 0), 0);
  const totalAllRights = platforms.reduce((sum, p) => sum + (p.total_rights || 0), 0);
  const hasFilters = searchQuery || typeFilter !== "all";

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Compact toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-xs text-emerald-400 font-medium">{totalActiveRights} active rights</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <span className="text-xs text-cyan-400 font-medium">{totalAllRights} all-time rights</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Button
            onClick={handleExportClick}
            disabled={exportLoading}
            size="sm"
            className="h-9 gap-2 bg-(--bg-raise) hover:bg-(--hover) text-(--text) border border-(--svf-border)/60"
          >
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </Button>
          <RoleGate action="create" resource="platform">
            <Button asChild size="sm" className="h-9 gap-2 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30">
              <Link href="/platforms/new">
                <Plus className="h-4 w-4" />
                Add Platform
              </Link>
            </Button>
          </RoleGate>
        </div>
      </div>

      {/* ── Directory Filters ── */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--text-faint)" />
            <Input
              placeholder="Search platforms by name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-sm"
              aria-label="Search platforms"
            />
            {searchQuery && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-(--text-faint) hover:text-(--text)" onClick={() => setSearchQuery("")}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) text-sm w-[180px]" aria-label="Filter by platform type">
              <SelectValue placeholder="Platform Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {platformTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-(--text-faint) hover:text-(--text) hover:bg-(--hover)"
              onClick={() => { setSearchQuery(""); setTypeFilter("all"); }}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}

          <span className="ml-auto text-xs text-(--text-faint)">{totalCount} platforms</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="glass-card overflow-hidden">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          </div>
        ) : platforms.length === 0 ? (
          <div className="text-center py-16 text-(--text-faint) text-sm">
            No platforms found. Try adjusting your search or add a new platform.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader style={{ background: "var(--bg-deep)" }}>
                  <TableRow className="border-(--svf-border) hover:bg-transparent">
                    <SortableHeader column="name" label="Platform Name" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)" />
                    <SortableHeader column="platform_type" label="Type" currentSort={sortConfig} onSort={requestSort} className="hidden md:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint)" />
                    <SortableHeader column="active_rights" label="Active Rights" currentSort={sortConfig} onSort={requestSort} className="hidden sm:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint)" />
                    <SortableHeader column="total_rights" label="Total Rights" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)" />
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPlatforms.map((platform) => (
                    <TableRow key={platform.id} className="border-(--svf-border) hover:bg-(--hover) transition-colors">
                      <TableCell>
                        <div className="min-w-0">
                          <span className="font-medium text-(--text) truncate block max-w-[280px]">{platform.name}</span>
                          <span className="text-xs text-(--text-faint) md:hidden">
                            {platform.platform_type || "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {platform.platform_type ? (
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border", typeStyle(platform.platform_type))}>
                            {platform.platform_type}
                          </span>
                        ) : (
                          <span className="text-(--text-faint)">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="font-bold tabular-nums text-emerald-400">{platform.active_rights || 0}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold tabular-nums text-(--text)">{platform.total_rights || 0}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <RoleGate action="edit" resource="platform">
                          <div className="flex justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-amber-500/10 hover:text-amber-400" asChild aria-label={`Edit ${platform.name}`}>
                              <Link href={`/platforms/${platform.id}/edit`}>
                                <Edit className="h-3.5 w-3.5 text-amber-500" />
                              </Link>
                            </Button>
                            <RoleGate action="delete" resource="platform">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
                                aria-label={`Delete ${platform.name}`}
                                onClick={() => { setDeletingPlatform(platform); setShowDeleteConfirm(true); }}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </RoleGate>
                          </div>
                        </RoleGate>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalCount > pageSize && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-(--svf-border)">
                <p className="text-xs text-(--text-faint)">
                  Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-8 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:bg-(--hover)"
                    onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:bg-(--hover)"
                    onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * pageSize >= totalCount}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <DataExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        data={exportData as unknown as Record<string, unknown>[]}
        fields={PLATFORM_EXPORT_FIELDS}
        filename="platforms"
      />

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-(--panel-solid) border-(--svf-border)/60">
          <DialogHeader>
            <DialogTitle className="text-(--text)">Delete Platform</DialogTitle>
            <DialogDescription className="text-(--text-faint)">
              Are you sure you want to delete &quot;{deletingPlatform?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deletingPlatform && (deletingPlatform.total_rights || 0) > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">
                This platform has {deletingPlatform.total_rights} associated rights. Deleting it may fail if there are active references.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="border-(--svf-border) text-(--text) hover:bg-(--hover)">
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-500 text-white border-0">
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
