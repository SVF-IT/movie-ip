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
import {
  deleteProductionHouse,
  getProductionHousesWithStats,
  type ProductionHouseWithStats,
} from "@/lib/api/production-houses";
import { AlertTriangle, Download, Edit, Factory, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAppToast } from "@/hooks/use-app-toast";

const PRODUCTION_HOUSE_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Name" },
  { key: "movie_count", label: "Movie Count" },
];

export default function ProductionHousesPage() {
  const [houses, setHouses] = useState<ProductionHouseWithStats[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingHouse, setDeletingHouse] = useState<ProductionHouseWithStats | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportData, setExportData] = useState<ProductionHouseWithStats[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const toast = useAppToast();

  const fetchHouses = useCallback(async () => {
    try {
      setLoading(true);
      const { data, count } = await getProductionHousesWithStats({
        search: searchQuery || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      setHouses(data);
      setTotalCount(count);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load production houses");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, page]);

  useEffect(() => { fetchHouses(); }, [fetchHouses]);
  useEffect(() => { setPage(0); }, [searchQuery]);

  const handleDelete = async () => {
    if (!deletingHouse) return;
    try {
      setDeleting(true);
      await deleteProductionHouse(deletingHouse.id);
      setShowDeleteConfirm(false);
      setDeletingHouse(null);
      await fetchHouses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete production house");
    } finally {
      setDeleting(false);
    }
  };

  const handleExportClick = useCallback(async () => {
    setExportLoading(true);
    try {
      const { data } = await getProductionHousesWithStats({ search: searchQuery || undefined });
      setExportData(data);
      setShowExportDialog(true);
    } catch { /* ignore */ } finally {
      setExportLoading(false);
    }
  }, [searchQuery]);

  const { sortedData: sortedHouses, sortConfig, requestSort } = useSortableTable(houses);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Compact toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
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
          <RoleGate action="create" resource="production_house">
            <Button asChild size="sm" className="h-9 gap-2 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30">
              <Link href="/production-houses/new">
                <Plus className="h-4 w-4" />
                Add Production House
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
              placeholder="Search production houses…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-sm"
              aria-label="Search production houses"
            />
            {searchQuery && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-(--text-faint) hover:text-(--text)" onClick={() => setSearchQuery("")}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {searchQuery && (
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-(--text-faint) hover:text-(--text) hover:bg-(--hover)"
              onClick={() => setSearchQuery("")}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <span className="ml-auto text-xs text-(--text-faint) shrink-0">
            {loading ? "Loading…" : `${totalCount} house${totalCount !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="glass-card overflow-hidden">

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          </div>
        ) : houses.length === 0 ? (
          <div className="text-center py-12 text-(--text-faint)">
            No production houses found. Try adjusting your search or add a new one.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader style={{ background: "var(--bg-deep)" }}>
                  <TableRow className="border-(--svf-border) hover:bg-transparent">
                    <SortableHeader column="name" label="Name" currentSort={sortConfig} onSort={requestSort}
                      className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9" />
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedHouses.map((house) => (
                    <TableRow key={house.id} className="border-(--svf-border) hover:bg-(--hover) transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
                            <Factory className="h-3.5 w-3.5 text-orange-400" />
                          </div>
                          <span className="font-medium text-(--text) truncate max-w-[300px]">{house.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <RoleGate action="edit" resource="production_house">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" aria-label={`Edit ${house.name}`} asChild
                              className="h-7 w-7 p-0 text-(--text-faint) hover:text-amber-400 hover:bg-amber-500/10">
                              <Link href={`/production-houses/${house.id}/edit`}>
                                <Edit className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <RoleGate action="delete" resource="production_house">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Delete ${house.name}`}
                                className="h-7 w-7 p-0 text-(--text-faint) hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => { setDeletingHouse(house); setShowDeleteConfirm(true); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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
                  <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="h-7 text-xs text-(--text-faint) hover:text-(--text) hover:bg-(--hover) disabled:opacity-30">
                    Previous
                  </Button>
                  <span className="flex items-center text-xs text-(--text-faint)">
                    {page + 1} / {totalPages}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalCount}
                    className="h-7 text-xs text-(--text-faint) hover:text-(--text) hover:bg-(--hover) disabled:opacity-30">
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
        fields={PRODUCTION_HOUSE_EXPORT_FIELDS}
        filename="production_houses"
      />

      {/* ── Delete Dialog ── */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-(--panel-solid) border-(--svf-border)/60 text-(--text)">
          <DialogHeader>
            <DialogTitle className="text-(--text)">Delete Production House</DialogTitle>
            <DialogDescription className="text-(--text-faint)">
              Are you sure you want to delete &quot;{deletingHouse?.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deletingHouse && (deletingHouse.movie_count || 0) > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-[12px] bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">
                This production house has {deletingHouse.movie_count} associated movies.
                Deleting it may fail if there are active references.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}
              className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={deleting}
              className="bg-red-600 hover:bg-red-500 text-white border-0">
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
