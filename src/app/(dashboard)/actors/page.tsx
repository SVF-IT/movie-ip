"use client";

import { DataExportDialog, type ExportFieldDef } from "@/components/import-export/data-export-dialog";
import { PersonCard } from "@/components/people/person-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent
} from "@/components/ui/card";
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
import { getActorsWithMovies, type ActorWithMovies } from "@/lib/api/actors";
import { createPerson } from "@/lib/api/people";
import {
  AlertTriangle,
  ArrowUpDown,
  Download,
  Loader2,
  Plus,
  Search,
  Star,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppToast } from "@/hooks/use-app-toast";

const ACTOR_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Name" },
  { key: "movies_count", label: "Movie Count" },
  { key: "movies_list", label: "Movies", getter: (r) => Array.isArray(r.movies) ? (r.movies as any[]).map((m: any) => m.movie_title || m.title || m).join(", ") : "" },
];

type SortOption = "name_asc" | "name_desc" | "movies_desc" | "movies_asc";

export default function ActorsPage() {
  const [actors, setActors] = useState<ActorWithMovies[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [page, setPage] = useState(0);
  const pageSize = 24;

  // Create actor dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newActorName, setNewActorName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const handleCreateActor = async () => {
    if (!newActorName.trim()) return;
    setCreating(true);
    try {
      await createPerson(newActorName.trim(), "actor");
      setNewActorName("");
      setCreateDialogOpen(false);
      // Note: Actor won't appear in this list until assigned to a movie
      fetchActors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create actor");
    } finally {
      setCreating(false);
    }
  };

  const fetchActors = useCallback(async () => {
    try {
      setLoading(true);
  
      const { data, count } = await getActorsWithMovies({
        limit: 10000,
      });

      // Map ActorWithMovies to PersonWithStats for PersonCard
      // ActorWithMovies has movies: any[], movies_count: number
      // PersonWithStats is Person + role, movies_count, etc.
      const normalize = (t: string) => t.replace(/\s*\([^)]*\)/g, "").trim();
      const prosenjit = data.find(a => a.name.includes("Prosenjit"));
      if (prosenjit) console.log("[ActorsAPI] Prosenjit raw movies array length:", prosenjit.movies.length, "| movies_count:", prosenjit.movies_count);
      const mappedActors = data.map(actor => {
        const seen = new Set<string>();
        const deduped = actor.movies.filter(m => {
          const key = normalize(m.movie_title);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return {
          ...actor,
          movies: deduped,
          role: (actor as any).role || 'actor',
          movies_as_actor: actor.movies_count,
        };
      }) as any;

      setActors(mappedActors);
      setTotalCount(count);
    } catch (err) {
      console.error("Error fetching actors:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load actors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActors();
  }, [fetchActors]);

  // Local sorting & pagination
  const processedActors = useMemo(() => {
    let result = [...actors];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(a => a.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      if (sortBy === "movies_desc") return (b.movies_count || 0) - (a.movies_count || 0);
      if (sortBy === "movies_asc") return (a.movies_count || 0) - (b.movies_count || 0);
      return 0;
    });

    return result;
  }, [actors, sortBy, searchQuery]);

  const paginatedActors = useMemo(() => {
    return processedActors.slice(page * pageSize, (page + 1) * pageSize);
  }, [processedActors, page, pageSize]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="space-y-4">
      {/* ── Compact toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Button
            onClick={() => setShowExportDialog(true)}
            size="sm"
            className="h-9 gap-2 bg-slate-800/80 hover:bg-slate-700/80 text-(--text) border border-(--svf-border)/60"
          >
            Export
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 gap-2 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30">
                <Plus className="h-4 w-4" />
                Add Actor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-(--panel-solid) border-(--svf-border)/60">
              <DialogHeader>
                <DialogTitle className="text-(--text)">Add New Actor</DialogTitle>
                <DialogDescription className="text-(--text-faint)">
                  Create a new profile. You can assign them to movies later.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-(--text)">Full Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Uttam Kumar"
                    value={newActorName}
                    onChange={(e) => setNewActorName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateActor()}
                    className="bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) focus:border-slate-500 h-10"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateDialogOpen(false); setNewActorName(""); }}
                  className="border-(--svf-border) text-(--text) hover:bg-slate-800/60">
                  Cancel
                </Button>
                <Button onClick={handleCreateActor} disabled={creating || !newActorName.trim()}
                  className="bg-red-600 hover:bg-red-500 text-white border-0">
                  {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : "Create Profile"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Directory Filters ── */}
      <div className="relative overflow-hidden rounded-[12px] bg-(--panel-solid)/40 border border-(--svf-border) backdrop-blur-xl p-4 shadow-xl">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--text-faint)" />
            <Input
              placeholder="Search by name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-sm"
            />
            {searchQuery && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-(--text-faint) hover:text-(--text)" onClick={() => setSearchQuery("")}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) text-sm w-[160px] gap-2">
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

          {searchQuery && (
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-(--text-faint) hover:text-(--text) hover:bg-slate-800/50"
              onClick={() => setSearchQuery("")}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}

          <span className="ml-auto text-xs text-(--text-faint)">{processedActors.length} actors</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-48 rounded-[14px] border border-(--svf-border) bg-(--panel) animate-pulse" />
          ))}
        </div>
      ) : paginatedActors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-[14px] border border-dashed border-(--svf-border) bg-(--panel)/30">
          <div className="p-4 rounded-full bg-(--bg-raise) border border-(--svf-border) mb-4">
            <Star className="h-9 w-9 text-(--text-faint)" />
          </div>
          <h3 className="font-bold text-base text-(--text)">No actors found</h3>
          <p className="text-(--text-faint) max-w-xs text-center mt-2 text-sm">
            Try adjusting your search to find the actor you're looking for.
          </p>
          <Button variant="outline" className="mt-5 border-(--svf-border) text-(--text) hover:bg-(--hover)" onClick={() => setSearchQuery("")}>
            Clear Search
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {paginatedActors.map((actor) => (
              <PersonCard key={actor.id} person={actor as any} />
            ))}
          </div>

          {processedActors.length > pageSize && (
            <div className="flex items-center justify-between pt-4 border-t border-(--svf-border)">
              <p className="text-xs text-(--text-faint)">
                <span className="font-medium text-(--text)">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, processedActors.length)}</span>
                {" "}of {processedActors.length}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="h-8 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:bg-(--hover)">
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= processedActors.length}
                  className="h-8 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:bg-(--hover)">
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
        data={processedActors as unknown as Record<string, unknown>[]}
        fields={ACTOR_EXPORT_FIELDS}
        filename="actors"
      />
    </div>
  );
}
