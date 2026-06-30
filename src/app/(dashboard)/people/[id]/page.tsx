"use client";

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
import { deletePerson, getPersonById, updatePerson, type PersonWithStats } from "@/lib/api/people";
import { createClient } from "@/lib/supabase/client";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Clapperboard,
  Download,
  Edit,
  Film,
  Loader2,
  Megaphone,
  Star,
  Ticket,
  Trash2,
  User
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

interface MovieEntry {
  id: string;
  movie_id: string;
  movie_title: string;
  release_year: string | null;
  source: string | null;
  role: "actor" | "director";
}

// Same hue palette as PersonCard for consistency
const HUE_PALETTE = [330, 20, 45, 160, 185, 210, 260, 290, 310, 140, 0];
function getAvatarHue(name: string, id: string): number {
  const s = name + (id || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return HUE_PALETTE[Math.abs(h) % HUE_PALETTE.length];
}

const inputCls = "bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) h-10";
const selectCls = "bg-(--bg-raise)/40 border-(--svf-border) text-(--text) h-10";
const labelCls = "text-xs font-semibold text-(--text-faint) uppercase tracking-wider";

export default function PersonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const personId = params.id as string;
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "legal" || profile?.role === "editor";

  const [person, setPerson] = useState<PersonWithStats | null>(null);
  const [movies, setMovies] = useState<MovieEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();

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
      if (!personData) { toast.error("Person not found"); return; }
      setPerson(personData);

      const supabase = createClient();
      const { data: peopleData } = await supabase
        .from("movie_people")
        .select("id, movie_id, role, movies(id, title, release_year, source)")
        .eq("person_id", personId);

      const movieEntries: MovieEntry[] = [];
      for (const entry of peopleData || []) {
        const movie = entry.movies as unknown as { id: string; title: string; release_year: string | null; source: string | null } | null;
        if (movie) {
          movieEntries.push({
            id: entry.id, movie_id: movie.id, movie_title: movie.title,
            release_year: movie.release_year, source: movie.source,
            role: (entry.role as string).toLowerCase() as "actor" | "director",
          });
        }
      }
      movieEntries.sort((a, b) => (parseInt(b.release_year || "0") || 0) - (parseInt(a.release_year || "0") || 0));
      // Debug: log raw counts
      const actorRaw = movieEntries.filter(m => m.role === "actor");
      const actorIds = new Set(actorRaw.map(m => m.movie_id));
      const actorTitles = new Set(Array.from(actorIds).map(id => { const m = actorRaw.find(x => x.movie_id === id); return m ? m.movie_title.replace(/\s*\([^)]*\)/g, "").trim() : ""; }));
      console.log("[PersonDetail] raw actor entries:", actorRaw.length, "| unique movie_ids:", actorIds.size, "| unique normalized titles:", actorTitles.size);
      setMovies(movieEntries);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load person");
    } finally { setLoading(false); }
  }, [personId]);

  useEffect(() => { fetchPerson(); }, [fetchPerson]);
  useEffect(() => { if (person) { setEditName(person.name); setEditRole(person.role || ""); } }, [person]);

  const handleUpdatePerson = async () => {
    if (!editName.trim()) return;
    setIsUpdating(true);
    try {
      await updatePerson(personId, editName.trim(), (editRole as "actor" | "director" | "both") || undefined);
      setEditDialogOpen(false);
      fetchPerson();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update person");
    } finally { setIsUpdating(false); }
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
    return person.name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  }, [person?.name]);

  const normalizeTitle = (title: string) => title.replace(/\s*\([^)]*\)/g, "").trim();

  // Deduplicate by normalized title only — same logic as getPeopleWithStats in the API.
  // Each version (dubbed, multi-language) is a separate movie_id but the same film.
  const { directorCount, actorCount, uniqueFilmCount } = useMemo(() => {
    const directorTitles = new Set<string>();
    const actorTitles = new Set<string>();
    movies.forEach((m) => {
      const norm = normalizeTitle(m.movie_title);
      if (m.role === "director") directorTitles.add(norm);
      else actorTitles.add(norm);
    });
    const allTitles = new Set([...directorTitles, ...actorTitles]);
    return { directorCount: directorTitles.size, actorCount: actorTitles.size, uniqueFilmCount: allTitles.size };
  }, [movies]);

  const handleExportCSV = useCallback(() => {
    if (!person || movies.length === 0) return;
    const header = ["Title", "Year", "Role", "Source"];
    const rows = movies.map((m) => [
      `"${m.movie_title.replace(/"/g, '""')}"`,
      m.release_year || "",
      m.role === "director" ? "Director" : "Actor",
      m.source || "",
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${person.name.replace(/\s+/g, "_")}_filmography.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [person, movies]);

  const hue = person ? getAvatarHue(person.name, person.id) : 260;
  const avatarBg = `linear-gradient(145deg, oklch(0.52 0.20 ${hue}), oklch(0.38 0.22 ${(hue + 30) % 360}))`;
  const glowColor = `oklch(0.52 0.20 ${hue} / 0.2)`;

  const roleLabel = useMemo(() => {
    if (!person) return "Profile";
    if (person.role === "both") return "Actor & Director";
    if (person.role === "director") return "Director";
    return "Actor";
  }, [person?.role]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-32 rounded-[9px] bg-(--panel) animate-pulse" />
        <div className="h-44 rounded-[14px] bg-(--panel) animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 rounded-[14px] bg-(--panel) animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-36 rounded-[14px] bg-(--panel) animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="space-y-4">
        <Link href="/people">
          <Button variant="ghost" size="sm" className="gap-2 text-(--text-faint) hover:text-(--text)">
            <ArrowLeft className="h-4 w-4" /> Back to People
          </Button>
        </Link>
        <div className="flex justify-center py-20 opacity-20">
          <User className="h-24 w-24 text-(--text-faint)" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-4">
        <Link href="/people">
          <Button variant="ghost" size="sm" className="gap-2 text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
            <ArrowLeft className="h-4 w-4" /> Back to Directory
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {movies.length > 0 && (
            <Button variant="outline" size="sm" className="h-9 gap-2 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20" onClick={handleExportCSV}>
              <Download className="h-4 w-4" /> Export
            </Button>
          )}
          {canEdit && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 h-8 border-(--svf-border) text-(--text) hover:bg-(--hover)" onClick={() => setEditDialogOpen(true)}>
                <Edit className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="sm" className="gap-1.5 h-8 bg-red-600/80 hover:bg-red-600 text-white border-0" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Profile header card ── */}
      <div
        className="glass-card p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6"
        style={{ borderColor: `oklch(0.52 0.20 ${hue} / 0.3)` }}
      >
        {/* Large avatar */}
        <div
          style={{
            width: 96, height: 96, borderRadius: "50%", flexShrink: 0,
            background: avatarBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, fontWeight: 800, color: "white", letterSpacing: "-0.02em",
            boxShadow: `0 0 0 3px oklch(0.52 0.20 ${hue} / 0.3), 0 8px 28px ${glowColor}`,
          }}
        >
          {initials}
        </div>

        {/* Name + role + badges */}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {person.name}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 4, fontWeight: 500 }}>{roleLabel}</p>


        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total Films", value: uniqueFilmCount, icon: Film, color: `oklch(0.52 0.20 ${hue})`, bg: `oklch(0.52 0.20 ${hue} / 0.1)`, border: `oklch(0.52 0.20 ${hue} / 0.2)` },
          { label: "Acting Roles", value: actorCount, icon: Ticket, color: "oklch(0.75 0.15 200)", bg: "oklch(0.75 0.15 200 / 0.08)", border: "oklch(0.75 0.15 200 / 0.2)" },
          { label: "Directed Works", value: directorCount, icon: Megaphone, color: "oklch(0.75 0.15 290)", bg: "oklch(0.75 0.15 290 / 0.08)", border: "oklch(0.75 0.15 290 / 0.2)" },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className="glass-card p-5" style={{ borderColor: border }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>{label}</p>
                <p style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", color, lineHeight: 1, fontFamily: "var(--font-display)" }}>{value}</p>
              </div>
              <div style={{ padding: 10, borderRadius: 10, background: bg, border: `1px solid ${border}`, flexShrink: 0 }}>
                <Icon style={{ width: 20, height: 20, color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filmography ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{ padding: 8, borderRadius: 9, background: `oklch(0.52 0.20 ${hue} / 0.1)`, border: `1px solid oklch(0.52 0.20 ${hue} / 0.25)` }}>
              <Film style={{ width: 16, height: 16, color: `oklch(0.72 0.18 ${hue})` }} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>Career Filmography</h2>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
            {uniqueFilmCount} film{uniqueFilmCount === 1 ? "" : "s"}{movies.length > uniqueFilmCount ? ` (${movies.length} versions)` : ""}
          </span>
        </div>

        {movies.length === 0 ? (
          <div className="glass-card flex flex-col items-center justify-center py-16 gap-3">
            <Film style={{ width: 40, height: 40, color: "var(--text-faint)", opacity: 0.4 }} />
            <p style={{ fontSize: 14, color: "var(--text-faint)" }}>No filmography records available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(() => {
              const groups = new Map<string, MovieEntry[]>();
              movies.forEach(m => {
                const base = normalizeTitle(m.movie_title);
                if (!groups.has(base)) groups.set(base, []);
                groups.get(base)!.push(m);
              });

              return Array.from(groups.entries()).map(([baseTitle, group]) => {
                const uniqueGroup = Array.from(new Map(group.map(m => [m.movie_id, m])).values());
                const primary = uniqueGroup.sort((a, b) => (parseInt(b.release_year || "0") || 0) - (parseInt(a.release_year || "0") || 0))[0];
                const roles = Array.from(new Set(group.map(m => m.role)));
                const isDirector = roles.includes("director");
                const isActor = roles.includes("actor");
                const roleColor = isDirector && isActor ? "oklch(0.75 0.15 290)" : isDirector ? `oklch(0.72 0.18 ${hue})` : "oklch(0.75 0.15 200)";
                const roleBg = isDirector && isActor ? "oklch(0.75 0.15 290 / 0.1)" : isDirector ? `oklch(0.52 0.20 ${hue} / 0.1)` : "oklch(0.75 0.15 200 / 0.08)";
                const roleBorder = isDirector && isActor ? "oklch(0.75 0.15 290 / 0.25)" : isDirector ? `oklch(0.52 0.20 ${hue} / 0.25)` : "oklch(0.75 0.15 200 / 0.2)";
                const roleText = isDirector && isActor ? "Both" : isDirector ? "Director" : "Actor";
                const RoleIcon = isDirector ? Clapperboard : Star;

                return (
                  <Link
                    key={baseTitle}
                    href={`/movies/${primary.movie_id}`}
                    style={{
                      display: "flex", flexDirection: "column", padding: "14px 16px", borderRadius: 12,
                      border: "1px solid var(--svf-border)", background: "var(--panel)",
                      backdropFilter: "blur(12px)", textDecoration: "none", gap: 10, transition: "all 0.18s ease",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = `oklch(0.52 0.20 ${hue} / 0.4)`;
                      el.style.background = "var(--hover)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "var(--svf-border)";
                      el.style.background = "var(--panel)";
                    }}
                  >
                    {/* Title + role badge */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", lineHeight: 1.3, flex: 1 }} className="line-clamp-2">
                        {baseTitle}
                      </h3>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px",
                        borderRadius: 6, fontSize: 10, fontWeight: 700, flexShrink: 0,
                        color: roleColor, background: roleBg, border: `1px solid ${roleBorder}`,
                      }}>
                        <RoleIcon style={{ width: 9, height: 9 }} />
                        {roleText}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-faint)", fontSize: 11 }}>
                        <Calendar style={{ width: 11, height: 11 }} />
                        {primary.release_year || "—"}
                        {primary.source && (
                          <span style={{
                            marginLeft: 4, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                            color: primary.source === "home_production" ? "oklch(0.75 0.15 260)" : "oklch(0.75 0.15 290)",
                            background: primary.source === "home_production" ? "oklch(0.75 0.15 260 / 0.1)" : "oklch(0.75 0.15 290 / 0.1)",
                            border: `1px solid ${primary.source === "home_production" ? "oklch(0.75 0.15 260 / 0.2)" : "oklch(0.75 0.15 290 / 0.2)"}`,
                          }}>
                            {primary.source === "home_production" ? "Home" : "Acq"}
                          </span>
                        )}
                      </div>
                      <ArrowUpRight style={{ width: 13, height: 13, color: "var(--text-faint)" }} />
                    </div>

                    {uniqueGroup.length > 1 && (
                      <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: -4 }}>
                        {uniqueGroup.length} versions
                      </p>
                    )}
                  </Link>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* ── Edit Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md bg-(--panel-solid) border-(--svf-border)">
          <DialogHeader>
            <DialogTitle className="text-(--text)">Edit Profile</DialogTitle>
            <DialogDescription className="text-(--text-faint)">Update the details for this person.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className={labelCls}>Full Name *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUpdatePerson()} className={inputCls} />
            </div>
            <div className="space-y-2">
              <Label className={labelCls}>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as typeof editRole)}>
                <SelectTrigger className={selectCls}><SelectValue placeholder="Select role…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="actor">Actor</SelectItem>
                  <SelectItem value="director">Director</SelectItem>
                  <SelectItem value="both">Actor &amp; Director</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="border-(--svf-border) text-(--text) hover:bg-(--hover)">
              Cancel
            </Button>
            <Button onClick={handleUpdatePerson} disabled={isUpdating || !editName.trim()} className="bg-red-600 hover:bg-red-500 text-white border-0">
              {isUpdating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md bg-(--panel-solid) border-(--svf-border)">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Delete Person
            </DialogTitle>
            <DialogDescription className="text-(--text-faint)">
              Are you sure you want to delete <strong className="text-(--text)">{person.name}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}
              className="border-(--svf-border) text-(--text) hover:bg-(--hover)">
              Cancel
            </Button>
            <Button onClick={handleDeletePerson} disabled={isDeleting} className="bg-red-600 hover:bg-red-500 text-white border-0">
              {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</> : "Delete Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
