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
  Star
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
      const mappedActors = data.map(actor => ({
        ...actor,
        role: (actor as any).role || 'actor',
        movies_as_actor: actor.movies_count, // For specific actor view, count is actor count
      })) as any;

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
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Actors</h1>
          <p className="text-muted-foreground mt-1">
            Browse and manage all actors in the film catalog.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowExportDialog(true)}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="shadow-md shadow-primary/20 gap-2 h-9 px-6">
                <Plus className="h-5 w-5" />
                <span>Add New Actor</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Actor</DialogTitle>
                <DialogDescription>
                  Create a new profile. You can assign them to movies later.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Uttam Kumar"
                    value={newActorName}
                    onChange={(e) => setNewActorName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateActor()}
                    className="h-11"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="h-11">
                  Cancel
                </Button>
                <Button onClick={handleCreateActor} disabled={creating || !newActorName.trim()} className="h-11 px-8">
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Profile"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters Section */}
      <Card className="glass-card border-border/50 shadow-sm overflow-hidden">

        <CardContent className="p-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1 block">Search Actors</label>
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9 bg-background/50 border-border/60 focus:bg-background focus:border-primary/50 focus-ring transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1 block">Sort By</label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-11 bg-background/50 border-border/60 focus-ring">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Sort order" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                  <SelectItem value="name_desc">Name (Z-A)</SelectItem>
                  <SelectItem value="movies_desc">Most Movies</SelectItem>
                  <SelectItem value="movies_asc">Fewest Movies</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid */}


      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl border border-border/40 bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : paginatedActors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-muted/10 rounded-2xl border border-dashed border-border/60">
          <div className="p-4 rounded-full bg-muted/20 mb-4 text-muted-foreground">
            <Star className="h-10 w-10" />
          </div>
          <h3 className="font-bold text-xl">No actors found</h3>
          <p className="text-muted-foreground max-w-xs text-center mt-2">
            Try adjusting your search to find the actor you're looking for.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => setSearchQuery("")}>
            Clear Search
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {paginatedActors.map((actor) => (
              <PersonCard key={actor.id} person={actor as any} />
            ))}
          </div>

          {/* Pagination */}
          {processedActors.length > pageSize && (
            <div className="flex items-center justify-between pt-8 border-t border-border/30">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {page * pageSize + 1}-{Math.min((page + 1) * pageSize, processedActors.length)}
                </span>
                {" "}of {processedActors.length} results
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="h-9 px-4 hov-bright"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * pageSize >= processedActors.length}
                  className="h-9 px-4 hov-bright"
                >
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
