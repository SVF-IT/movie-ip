"use client";

import { DataExportDialog, type ExportFieldDef } from "@/components/import-export/data-export-dialog";
import { PersonCard } from "@/components/people/person-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { createPerson, getPeopleWithStats, getPersonMovieTitles, type PersonWithStats } from "@/lib/api/people";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  ChevronRight,
  Clapperboard,
  Loader2,
  Plus,
  Search,
  Star,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const PEOPLE_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Name" },
  { key: "role", label: "Role" },
  { key: "movies_count", label: "Total Movies" },
  { key: "movies_as_actor", label: "Movies as Actor" },
  { key: "movies_as_director", label: "Movies as Director" },
  { key: "movies", label: "Movies (comma separated)" },
];

type SortOption = "name_asc" | "name_desc" | "movies_desc" | "movies_asc";

const inputCls = "bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) focus:border-slate-500 h-10";
const selectTriggerCls = "bg-(--bg-raise)/40 border-(--svf-border) text-(--text) h-10";

export default function PeoplePage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "legal" || profile?.role === "editor";

  const [people, setPeople] = useState<PersonWithStats[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"actor" | "director" | "both" | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [page, setPage] = useState(0);
  const pageSize = 24;
  const [viewMode, setViewMode] = useState<"highlights" | "directory">("highlights");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRole, setNewPersonRole] = useState<"actor" | "director" | "both" | "">("");
  const [creating, setCreating] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportData, setExportData] = useState<Record<string, unknown>[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  const handleCreatePerson = async () => {
    if (!newPersonName.trim()) return;
    setCreating(true);
    try {
      await createPerson(newPersonName.trim(), newPersonRole || undefined);
      setNewPersonName("");
      setNewPersonRole("");
      setCreateDialogOpen(false);
      fetchPeople();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create person");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenExport = async () => {
    setExportLoading(true);
    setShowExportDialog(true);
    try {
      let allPeople: PersonWithStats[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await getPeopleWithStats({ search: searchQuery || undefined, role: roleFilter === "all" ? undefined : roleFilter, limit: 200, offset });
        if (data.length > 0) {
          allPeople = [...allPeople, ...data];
          if (data.length < 200) hasMore = false;
          else offset += 200;
        } else {
          hasMore = false;
        }
      }
      const enriched = [];
      const CHUNK_SIZE = 50;
      for (let i = 0; i < allPeople.length; i += CHUNK_SIZE) {
        const chunk = allPeople.slice(i, i + CHUNK_SIZE);
        const chunkEnriched = await Promise.all(
          chunk.map(async (p) => ({
            name: p.name, role: p.role ?? "", movies_count: p.movies_count ?? 0,
            movies_as_actor: p.movies_as_actor ?? 0, movies_as_director: p.movies_as_director ?? 0,
            movies: await getPersonMovieTitles(p.id),
          }))
        );
        enriched.push(...chunkEnriched);
      }
      setExportData(enriched);
    } catch (err) {
      console.error("Export error:", err);
      setExportData(processedPeople as unknown as Record<string, unknown>[]);
    } finally {
      setExportLoading(false);
    }
  };

  const fetchPeople = useCallback(async () => {
    try {
      setLoading(true);
        const { data, count } = await getPeopleWithStats({ role: roleFilter === "all" ? undefined : roleFilter, limit: 10000 });
      setPeople(data);
      setTotalCount(count);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load people");
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => { fetchPeople(); }, [fetchPeople]);

  const processedPeople = useMemo(() => {
    let result = [...people];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      if (sortBy === "movies_desc") return (b.movies_count || 0) - (a.movies_count || 0);
      if (sortBy === "movies_asc") return (a.movies_count || 0) - (b.movies_count || 0);
      return 0;
    });
    return result;
  }, [people, sortBy, searchQuery]);

  const paginatedPeople = useMemo(
    () => processedPeople.slice(page * pageSize, (page + 1) * pageSize),
    [processedPeople, page, pageSize]
  );

  const keyDirectors = useMemo(
    () => [...people].filter((p) => (p.movies_as_director || 0) > 0).sort((a, b) => (b.movies_as_director || 0) - (a.movies_as_director || 0)).slice(0, 8),
    [people]
  );
  const keyActors = useMemo(
    () => [...people].filter((p) => (p.movies_as_actor || 0) > 0).sort((a, b) => (b.movies_as_actor || 0) - (a.movies_as_actor || 0)).slice(0, 8),
    [people]
  );

  useEffect(() => {
    const t = setTimeout(() => setPage(0), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const hasFilters = searchQuery || roleFilter !== "all";

  return (
    <div className="space-y-4">
      {/* ── Compact toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {viewMode === "directory" && (
          <>
            <div className="relative min-w-48 flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--text-faint)" />
              <Input
                placeholder="Search by name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
              {searchQuery && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-(--text-faint) hover:text-(--text)" onClick={() => setSearchQuery("")}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v as typeof roleFilter); setPage(0); }}>
              <SelectTrigger className="h-9 w-36 text-sm">
                <UserCheck className="h-3.5 w-3.5 text-(--text-faint)" />
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="actor">Actors</SelectItem>
                <SelectItem value="director">Directors</SelectItem>
                <SelectItem value="both">Actor &amp; Director</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="h-9 w-36 text-sm">
                <ArrowUpDown className="h-3.5 w-3.5 text-(--text-faint)" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z–A)</SelectItem>
                <SelectItem value="movies_desc">Most Movies</SelectItem>
                <SelectItem value="movies_asc">Fewest Movies</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-(--text-faint) hover:text-(--text)"
                onClick={() => { setSearchQuery(""); setRoleFilter("all"); setPage(0); }}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
            <span className="text-xs text-(--text-faint) tabular-nums">{processedPeople.length} people</span>
          </>
        )}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Button
              onClick={handleOpenExport}
              size="sm"
              className="h-9 gap-2 bg-(--bg-raise) hover:bg-(--hover) text-(--text) border border-(--svf-border)"
            >
              Export
            </Button>
            {canEdit && (
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-9 gap-2 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30">
                    <Plus className="h-4 w-4" />
                    Add Person
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md bg-(--panel-solid) border-(--svf-border)/60">
                  <DialogHeader>
                    <DialogTitle className="text-(--text)">Add New Person</DialogTitle>
                    <DialogDescription className="text-(--text-faint)">
                      Create a new profile. You can assign them to movies later.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-(--text)">Full Name *</Label>
                      <Input
                        id="name"
                        placeholder="e.g. Satyajit Ray"
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreatePerson()}
                        className={inputCls}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role" className="text-(--text)">Role</Label>
                      <Select value={newPersonRole} onValueChange={(v) => setNewPersonRole(v as typeof newPersonRole)}>
                        <SelectTrigger id="role" className={selectTriggerCls}>
                          <SelectValue placeholder="Select role…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="actor">Actor</SelectItem>
                          <SelectItem value="director">Director</SelectItem>
                          <SelectItem value="both">Actor &amp; Director</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setCreateDialogOpen(false); setNewPersonName(""); setNewPersonRole(""); }}
                      className="border-(--svf-border) text-(--text) hover:bg-(--hover)">
                      Cancel
                    </Button>
                    <Button onClick={handleCreatePerson} disabled={creating || !newPersonName.trim()}
                      className="bg-red-600 hover:bg-red-500 text-white border-0">
                      {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : "Create Profile"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
      </div>




      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-48 rounded-[14px] border border-(--svf-border) bg-(--panel) animate-pulse" />
          ))}
        </div>
      ) : viewMode === "highlights" ? (
        /* ── Highlights View ── */
        <div className="space-y-10">
          {/* Key Directors */}
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/15 border border-blue-500/30">
                  <Clapperboard className="h-4 w-4 text-blue-400" />
                </div>
                <h2 className="text-lg font-bold text-(--text) tracking-tight">Key Directors</h2>
                <span className="text-xs text-(--text-faint) tabular-nums">({keyDirectors.length})</span>
              </div>
              <button
                className="flex items-center gap-1 text-xs text-(--text-faint) hover:text-red-400 transition-colors group"
                onClick={() => { setRoleFilter("director"); setViewMode("directory"); }}
              >
                View all <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {keyDirectors.map((person) => <PersonCard key={person.id} person={person} />)}
            </div>
          </section>

          {/* Key Actors */}
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30">
                  <Star className="h-4 w-4 text-amber-400" />
                </div>
                <h2 className="text-lg font-bold text-(--text) tracking-tight">Key Actors</h2>
                <span className="text-xs text-(--text-faint) tabular-nums">({keyActors.length})</span>
              </div>
              <button
                className="flex items-center gap-1 text-xs text-(--text-faint) hover:text-red-400 transition-colors group"
                onClick={() => { setRoleFilter("actor"); setViewMode("directory"); }}
              >
                View all <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {keyActors.map((person) => <PersonCard key={person.id} person={person} />)}
            </div>
          </section>

          {/* Full directory CTA */}
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setViewMode("directory")}
              className="px-8 py-2.5 rounded-[12px] text-sm font-semibold border border-(--svf-border) text-(--text) hover:bg-(--hover) transition-all"
            >
              Explore Full Directory
            </button>
          </div>
        </div>
      ) : paginatedPeople.length === 0 ? (
        /* ── Empty State ── */
        <div className="flex flex-col items-center justify-center py-20 rounded-[14px] border border-dashed border-(--svf-border) bg-(--panel)/30">
          <div className="p-4 rounded-full bg-(--bg-raise) border border-(--svf-border) mb-4">
            <Users className="h-9 w-9 text-(--text-faint)" />
          </div>
          <h3 className="font-bold text-base text-(--text)">No one found</h3>
          <p className="text-(--text-faint) max-w-xs text-center mt-2 text-sm">
            Try adjusting your search or filters to find what you're looking for.
          </p>
          <div className="flex gap-3 mt-5">
            <Button variant="outline" size="sm" className="border-(--svf-border) text-(--text) hover:bg-(--hover)"
              onClick={() => { setSearchQuery(""); setRoleFilter("all"); }}>
              Clear Filters
            </Button>
            <Button variant="ghost" size="sm" className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover)"
              onClick={() => setViewMode("highlights")}>
              Back to Highlights
            </Button>
          </div>
        </div>
      ) : (
        /* ── Directory Grid ── */
        <>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 text-xs text-(--text-faint) hover:text-(--text) transition-colors"
              onClick={() => setViewMode("highlights")}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Highlights
            </button>
            <span className="text-(--text-faint) text-xs">/</span>
            <span className="text-xs text-(--text-faint)">Full Directory</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {paginatedPeople.map((person) => <PersonCard key={person.id} person={person} />)}
          </div>

          {processedPeople.length > pageSize && (
            <div className="flex items-center justify-between pt-4 border-t border-(--svf-border)">
              <p className="text-xs text-(--text-faint)">
                <span className="font-medium text-(--text)">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, processedPeople.length)}</span>
                {" "}of {processedPeople.length}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:bg-(--hover)"
                  onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className="h-8 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:bg-(--hover)"
                  onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * pageSize >= processedPeople.length}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <DataExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        data={exportData}
        fields={PEOPLE_EXPORT_FIELDS}
        filename="people"
      />
    </div>
  );
}
