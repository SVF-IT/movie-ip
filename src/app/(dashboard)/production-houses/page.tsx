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
    <div className="space-y-6 min-w-0">
      {/* ── Cinematic Header ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-orange-600 via-amber-500 to-transparent" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-orange-600/6 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-orange-500/15 border border-orange-500/30 shadow-lg shadow-orange-500/10">
              <Factory className="h-6 w-6 text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Production Houses
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">Manage production houses and studios</p>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={handleExportClick} disabled={exportLoading}
              className="text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 gap-1.5 h-8">
              {exportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export
            </Button>
            <RoleGate action="create" resource="production_house">
              <Button asChild size="sm" className="bg-orange-600 hover:bg-orange-500 text-white border-0 shadow-lg shadow-orange-900/30 h-8">
                <Link href="/production-houses/new">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Production House
                </Link>
              </Button>
            </RoleGate>
          </div>
        </div>

        {/* Stat cards */}
        <div className="relative mt-5 flex gap-3">
          <div className="flex-1 rounded-lg bg-slate-800/30 border border-slate-700/30 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Total Houses</div>
            <div className="text-xl font-bold text-slate-100 tabular-nums">{totalCount}</div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search production houses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-500 focus:border-slate-500 h-9"
              aria-label="Search production houses"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <span className="text-xs text-slate-500 shrink-0">
            {loading ? "Loading…" : `${totalCount} house${totalCount !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl shadow-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/60">
          <div className="p-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30">
            <Factory className="h-3.5 w-3.5 text-orange-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">
            Production House Directory
          </span>
          <span className="ml-auto text-xs text-slate-500">
            {loading ? "Loading…" : `${totalCount} total`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          </div>
        ) : houses.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No production houses found. Try adjusting your search or add a new one.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800/60 hover:bg-transparent">
                    <SortableHeader column="name" label="Name" currentSort={sortConfig} onSort={requestSort}
                      className="text-[10px] font-bold uppercase tracking-widest text-slate-500 h-9" />
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 h-9">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedHouses.map((house) => (
                    <TableRow key={house.id} className="border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
                            <Factory className="h-3.5 w-3.5 text-orange-400" />
                          </div>
                          <span className="font-medium text-slate-200 truncate max-w-[300px]">{house.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <RoleGate action="edit" resource="production_house">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" aria-label={`Edit ${house.name}`} asChild
                              className="h-7 w-7 p-0 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10">
                              <Link href={`/production-houses/${house.id}/edit`}>
                                <Edit className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <RoleGate action="delete" resource="production_house">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Delete ${house.name}`}
                                className="h-7 w-7 p-0 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
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
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800/60">
                <p className="text-xs text-slate-500">
                  Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="h-7 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-30">
                    Previous
                  </Button>
                  <span className="flex items-center text-xs text-slate-500">
                    {page + 1} / {totalPages}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalCount}
                    className="h-7 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-30">
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
        <DialogContent className="bg-slate-900 border-slate-700/60 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Delete Production House</DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to delete &quot;{deletingHouse?.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deletingHouse && (deletingHouse.movie_count || 0) > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">
                This production house has {deletingHouse.movie_count} associated movies.
                Deleting it may fail if there are active references.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}
              className="text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
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
