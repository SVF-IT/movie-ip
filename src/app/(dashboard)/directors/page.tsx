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
import { getDirectorsWithMovies, type DirectorWithMovies } from "@/lib/api/directors";
import { createPerson } from "@/lib/api/people";
import {
  AlertTriangle,
  ArrowUpDown,
  Clapperboard,
  Download,
  Loader2,
  Plus,
  Search,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppToast } from "@/hooks/use-app-toast";

const DIRECTOR_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Name" },
  { key: "movies_count", label: "Movie Count" },
  { key: "movies_list", label: "Movies", getter: (r) => Array.isArray(r.movies) ? (r.movies as any[]).map((m: any) => m.movie_title || m.title || m).join(", ") : "" },
];

type SortOption = "name_asc" | "name_desc" | "movies_desc" | "movies_asc";

export default function DirectorsPage() {
  const [directors, setDirectors] = useState<DirectorWithMovies[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();

  // Create director dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newDirectorName, setNewDirectorName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const handleCreateDirector = async () => {
    if (!newDirectorName.trim()) return;
    setCreating(true);
    try {
      await createPerson(newDirectorName.trim(), "director");
      setNewDirectorName("");
      setCreateDialogOpen(false);
      fetchDirectors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create director");
    } finally {
      setCreating(false);
    }
  };

  const fetchDirectors = useCallback(async () => {
    try {
      setLoading(true);
  
      const { data, count } = await getDirectorsWithMovies({
        limit: 10000,
      });

      // Map DirectorWithMovies to PersonWithStats for PersonCard
      const normalize = (t: string) => t.replace(/\s*\([^)]*\)/g, "").trim();
      const mappedDirectors = data.map(director => {
        const seen = new Set<string>();
        const deduped = director.movies.filter(m => {
          const key = normalize(m.movie_title);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return {
          ...director,
          movies: deduped,
          role: (director as any).role || 'director',
          movies_as_director: director.movies_count,
        };
      }) as any;

      setDirectors(mappedDirectors);
      setTotalCount(count);
    } catch (err) {
      console.error("Error fetching directors:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load directors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectors();
  }, [fetchDirectors]);

  // Local sorting & pagination
  const processedDirectors = useMemo(() => {
    let result = [...directors];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(d => d.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      if (sortBy === "movies_desc") return (b.movies_count || 0) - (a.movies_count || 0);
      if (sortBy === "movies_asc") return (a.movies_count || 0) - (b.movies_count || 0);
      return 0;
    });

    return result;
  }, [directors, sortBy, searchQuery]);


  return (
    <div className="space-y-4">
      {/* ── Compact toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Button
            onClick={() => setShowExportDialog(true)}
            variant="outline"
            size="sm"
            className="h-9 gap-2 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20"
          >
            <Download className="h-4 w-4" /> Export
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 gap-2 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30">
                <Plus className="h-4 w-4" />
                Add Director
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-(--panel-solid) border-(--svf-border)/60">
              <DialogHeader>
                <DialogTitle className="text-(--text)">Add New Director</DialogTitle>
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
                    value={newDirectorName}
                    onChange={(e) => setNewDirectorName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateDirector()}
                    className="bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) focus:border-slate-500 h-10"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateDialogOpen(false); setNewDirectorName(""); }}
                  className="border-(--svf-border) text-(--text) hover:bg-(--hover)">
                  Cancel
                </Button>
                <Button onClick={handleCreateDirector} disabled={creating || !newDirectorName.trim()}
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
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-(--text-faint) hover:text-(--text) hover:bg-(--hover)"
              onClick={() => setSearchQuery("")}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}

          <span className="ml-auto text-xs text-(--text-faint)">{processedDirectors.length} directors</span>
        </div>
      </div>

      {/* Main Grid */}


      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-48 rounded-[14px] border border-(--svf-border) bg-(--panel) animate-pulse" />
          ))}
        </div>
      ) : processedDirectors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-[14px] border border-dashed border-(--svf-border) bg-(--panel)/30">
          <div className="p-4 rounded-full bg-(--bg-raise) border border-(--svf-border) mb-4">
            <Clapperboard className="h-9 w-9 text-(--text-faint)" />
          </div>
          <h3 className="font-bold text-base text-(--text)">No directors found</h3>
          <p className="text-(--text-faint) max-w-xs text-center mt-2 text-sm">
            Try adjusting your search to find the director you're looking for.
          </p>
          <Button variant="outline" className="mt-5 border-(--svf-border) text-(--text) hover:bg-(--hover)" onClick={() => setSearchQuery("")}>
            Clear Search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {processedDirectors.map((director) => (
              <PersonCard key={director.id} person={director as any} />
            ))}
          </div>
      )}

      <DataExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        data={processedDirectors as unknown as Record<string, unknown>[]}
        fields={DIRECTOR_EXPORT_FIELDS}
        filename="directors"
      />
    </div>
  );
}
