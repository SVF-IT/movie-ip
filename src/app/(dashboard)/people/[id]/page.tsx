"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Film,
  User,
  Video,
  Star,
  Clapperboard,
  Calendar,
  Layers,
  ArrowUpRight,
  Edit,
  Trash2
} from "lucide-react";
import { getPersonById, updatePerson, deletePerson, type PersonWithStats } from "@/lib/api/people";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface MovieEntry {
  id: string;
  movie_id: string;
  movie_title: string;
  release_year: string | null;
  source: string | null;
  role: "actor" | "director";
}

export default function PersonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const personId = params.id as string;
  const { profile } = useAuth();
  const userRole = profile?.role;
  
  const canEdit = userRole === 'admin' || userRole === 'legal' || userRole === 'editor';

  const [person, setPerson] = useState<PersonWithStats | null>(null);
  const [movies, setMovies] = useState<MovieEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();

  // Edit / Delete State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"actor" | "director" | "both" | "">("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchPerson = useCallback(async () => {
    try {
      setLoading(true);
  
      const personData = await getPersonById(personId);
      if (!personData) {
        toast.error("Person not found");
        return;
      }
      setPerson(personData);

      // Fetch movies via unified movie_people table
      const supabase = createClient();

      const { data: peopleData } = await supabase
        .from("movie_people")
        .select("id, movie_id, role, movies(id, title, release_year, source)")
        .eq("person_id", personId);

      const movieEntries: MovieEntry[] = [];

      for (const entry of peopleData || []) {
        const movie = entry.movies as unknown as {
          id: string;
          title: string;
          release_year: string | null;
          source: string | null;
        } | null;
        if (movie) {
          movieEntries.push({
            id: entry.id,
            movie_id: movie.id,
            movie_title: movie.title,
            release_year: movie.release_year,
            source: movie.source,
            role: (entry.role as string).toLowerCase() as "actor" | "director",
          });
        }
      }

      // Sort by release year (newest first)
      movieEntries.sort((a, b) => (parseInt(b.release_year || "0") || 0) - (parseInt(a.release_year || "0") || 0));

      setMovies(movieEntries);
    } catch (err) {
      console.error("Error fetching person:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load person");
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    fetchPerson();
  }, [fetchPerson]);

  useEffect(() => {
    if (person) {
      setEditName(person.name);
      setEditRole(person.role || "");
    }
  }, [person]);

  const handleUpdatePerson = async () => {
    if (!editName.trim()) return;
    setIsUpdating(true);
    try {
      await updatePerson(personId, editName.trim(), (editRole as "actor" | "director" | "both") || undefined);
      setEditDialogOpen(false);
      fetchPerson();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update person");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeletePerson = async () => {
    setIsDeleting(true);
    try {
      await deletePerson(personId);
      router.push("/people");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete person");
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const initials = useMemo(() => {
    if (!person?.name) return "?";
    return person.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  }, [person?.name]);

  const getRoleLabel = () => {
    if (!person) return "";
    switch (person.role) {
      case "actor": return "Actor";
      case "director": return "Director";
      case "both": return "Actor & Director";
      default: return "Profile";
    }
  };

  const getRoleBadgeVariant = () => {
    if (!person) return "outline";
    switch (person.role) {
      case "actor": return "secondary";
      case "director": return "default";
      case "both": return "secondary";
      default: return "outline";
    }
  };

  if (loading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <div className="h-9 w-32 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="h-48 w-full rounded-2xl bg-muted/40 animate-pulse border border-border/40" />
        <div className="grid gap-6 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted/30 animate-pulse border border-border/30" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl border border-border/40 bg-muted/20 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex items-center gap-4">
          <Link href="/people">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to People
            </Button>
          </Link>
        </div>
        <div className="flex justify-center py-20 opacity-20">
          <User className="h-32 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <Link href="/people">
          <Button variant="outline" size="sm" className="gap-2 bg-background/50 hover:bg-background border-border/60 soft-shadow">
            <ArrowLeft className="h-4 w-4" />
            Back to Directory
          </Button>
        </Link>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditDialogOpen(true)}>
              <Edit className="h-4 w-4" />
              Edit Person
            </Button>
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update the details for this person.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUpdatePerson()}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as typeof editRole)}>
                <SelectTrigger id="edit-role" className="h-11">
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
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="h-11">
              Cancel
            </Button>
            <Button onClick={handleUpdatePerson} disabled={isUpdating || !editName.trim()} className="h-11 px-8">
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete Person
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{person.name}</strong>? This action cannot be undone. Any references to this person in movies might be removed or broken.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeletePerson} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Profile"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Header */}
      <Card className="glass-card border-border/40 overflow-hidden relative soft-shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
        <CardContent className="p-8 md:p-10 relative">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            {/* Avatar Section */}
            <div className="relative">
              <div className="h-32 w-32 md:h-40 md:w-40 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/30 flex items-center justify-center text-4xl md:text-5xl font-bold text-primary shadow-xl ring-8 ring-primary/5">
                {initials}
              </div>
              <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-background border-2 border-border shadow-lg flex items-center justify-center text-primary">
                {person.role === 'director' ? <Video className="h-5 w-5" /> : <Star className="h-5 w-5" />}
              </div>
            </div>

            {/* Info Section */}
            <div className="flex-1 text-center md:text-left space-y-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight">
                    {person.name}
                  </h1>
                  <Badge variant={getRoleBadgeVariant()} className="text-sm font-bold h-7 px-3 mt-1">
                    {getRoleLabel()}
                  </Badge>
                </div>
              </div>

              <div className="pt-4 max-w-2xl text-muted-foreground leading-relaxed">
                Comprehensive filmography and career overview for {person.name}. This profile includes all contributions as both a performer and creative director within the catalog.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Career Stats Overview */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="glass-card border-border/40 bg-primary/[0.03] hover:bg-primary/[0.06] transition-colors soft-shadow border-l-4 border-l-primary group">
          <CardContent className="p-6 pt-7">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Filmography</p>
                <p className="text-4xl font-extrabold tracking-tighter text-foreground group-hover:scale-105 transition-transform origin-left">
                  {person.movies_count || 0}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                <Film className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Movies across all roles
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/40 bg-cyan-500/[0.03] hover:bg-cyan-500/[0.06] transition-colors soft-shadow border-l-4 border-l-cyan-500 group">
          <CardContent className="p-6 pt-7">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Acting Roles</p>
                <p className="text-4xl font-extrabold tracking-tighter text-foreground group-hover:scale-105 transition-transform origin-left">
                  {person.movies_as_actor || 0}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-500">
                <Star className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              Performances on screen
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/40 bg-purple-500/[0.03] hover:bg-purple-500/[0.06] transition-colors soft-shadow border-l-4 border-l-purple-500 group">
          <CardContent className="p-6 pt-7">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Directed Works</p>
                <p className="text-4xl font-extrabold tracking-tighter text-foreground group-hover:scale-105 transition-transform origin-left">
                  {person.movies_as_director || 0}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500">
                <Clapperboard className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
              Creative leadership roles
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Career Filmography Grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-border/40 pb-4">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            Career Filmography
          </h2>
          <Badge variant="outline" className="bg-muted/50 font-bold px-3">
            {person.movies_count} {person.movies_count === 1 ? 'Entry' : 'Entries'}
          </Badge>
        </div>

        {movies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-muted/10 rounded-2xl border border-dashed border-border/60">
            <Film className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <p className="text-lg font-medium text-muted-foreground">No filmography records available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(() => {
              // Group movies by normalized title
              const normalizedGroups = new Map<string, MovieEntry[]>();

              const normalize = (title: string) => title.replace(/\s*\([^)]*\)/g, "").trim();

              movies.forEach(movie => {
                const baseTitle = normalize(movie.movie_title);
                if (!normalizedGroups.has(baseTitle)) {
                  normalizedGroups.set(baseTitle, []);
                }
                normalizedGroups.get(baseTitle)!.push(movie);
              });

              return Array.from(normalizedGroups.entries()).map(([baseTitle, group]) => {
                // Use the most comprehensive entry as primary (usually the one with a year if others lack it)
                const primary = group.sort((a, b) => (parseInt(b.release_year || "0") || 0) - (parseInt(a.release_year || "0") || 0))[0];
                const roles = Array.from(new Set(group.map(m => m.role)));
                const roleLabel = roles.length > 1 ? "BOTH" : roles[0].toUpperCase();

                return (
                  <Card key={baseTitle} className="glass-card group hover:border-primary/40 border-border/40 soft-shadow-lg duration-300 overflow-hidden bg-card/50">
                    <CardContent className="p-0">
                      <div className="p-5 space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1.5 flex-1 pr-4">
                            <Link href={`/movies/${primary.movie_id}`}>
                              <h3 className="font-bold text-lg leading-snug group-hover:text-primary transition-colors line-clamp-2">
                                {baseTitle}
                              </h3>
                            </Link>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                              <Calendar className="h-3 w-3" />
                              <span>{primary.release_year || "Release Year N/A"}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <Badge
                              variant={roleLabel === "DIRECTOR" ? "default" : "secondary"}
                              className="font-bold text-[10px] h-5 px-2 flex shrink-0 gap-1 items-center"
                            >
                              {roleLabel === "DIRECTOR" ? <Video className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                              {roleLabel}
                            </Badge>
                            {group.length > 1 && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-bold border-primary/20 bg-primary/5 text-primary">
                                {group.length} VERSIONS
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/30">
                          <Badge variant="outline" className="bg-muted/30 text-[10px] font-mono h-5">
                            {primary.source === "home_production" ? "Home Prod" : "Acquired"}
                          </Badge>
                          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1 group/btn hover:text-primary hover:bg-primary/5">
                            <Link href={`/movies/${primary.movie_id}`}>
                              View Details
                              <ArrowUpRight className="h-3.5 w-3.5 opacity-50 group-hover/btn:opacity-100 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-all" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
