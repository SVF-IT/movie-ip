"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { deleteMovie, getMovieById, getMovieExpiredRights, getMovieRights, getMovieVersions } from "@/lib/api/movies";
import { submitRightChange } from "@/lib/api/pending-changes";
import { deleteRight } from "@/lib/api/rights";
import type { MovieLanguageVersion, MovieWithDetails, PlatformRight } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Edit,
  ExternalLink,
  FileText,
  Film,
  Globe,
  History,
  Info,
  Languages,
  Loader2,
  MoreHorizontal,
  PlayCircle,
  Plus,
  ShieldCheck,
  Trash2,
  Tv,
  Users,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function parseOtherRights(value: string): { isYes: boolean; types: string[] } {
  if (!value) return { isYes: false, types: [] };
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "no" || lower === "") return { isYes: false, types: [] };

  if (lower.startsWith("yes")) {
    const openParenIndex = trimmed.indexOf("(");
    const closeParenIndex = trimmed.lastIndexOf(")");
    if (openParenIndex !== -1 && closeParenIndex !== -1 && closeParenIndex > openParenIndex) {
      const content = trimmed.substring(openParenIndex + 1, closeParenIndex);
      const types = content.split(",").map(s => s.trim()).filter(Boolean);
      return { isYes: true, types };
    }
    return { isYes: true, types: [] };
  }

  // Handle legacy/other values that are comma-separated without starting with "Yes"
  const types = trimmed.split(",").map(s => s.trim()).filter(Boolean);
  return { isYes: true, types };
}

interface RightWithDetails extends PlatformRight {
  platforms?: { name: string; platform_type?: string };
  category?: string | null;
}

type NavSection = "basic" | "cast" | "rights" | "acquisition" | "notes" | "exploitation" | "history";

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">{label}</span>
      <span className={cn("text-sm text-(--text) leading-snug", mono && "font-mono text-xs")}>
        {value || <span className="text-(--text-faint)">—</span>}
      </span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, accent = false }: { icon: React.ElementType; title: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div className={cn("p-1.5 rounded-[10px] border", accent ? "bg-red-500/10 border-red-500/20" : "bg-slate-800/60 border-(--svf-border)")}>
        <Icon className={cn("h-4 w-4", accent ? "text-red-400" : "text-(--text-faint)")} />
      </div>
      <h3 className="text-sm font-bold text-(--text) tracking-tight">{title}</h3>
    </div>
  );
}

export default function MovieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const movieId = params.id as string;
  const { profile } = useAuth();
  const [movie, setMovie] = useState<MovieWithDetails | null>(null);
  const [languageVersions, setLanguageVersions] = useState<MovieLanguageVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(movieId);
  const [rights, setRights] = useState<RightWithDetails[]>([]);
  const [expiredRights, setExpiredRights] = useState<RightWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeSection, setActiveSection] = useState<NavSection>("basic");
  const [requestDeletingRight, setRequestDeletingRight] = useState<RightWithDetails | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  const canDelete = profile?.role === "admin" || profile?.role === "legal" || (profile?.role === "editor" && movie?.approval_status !== "approved");
  const canRequestDelete = profile?.role === "admin" || profile?.role === "legal" || profile?.role === "editor";

  const handleDelete = async () => {
    if (!movie) return;
    setDeleting(true);
    try {
      await deleteMovie(movie.id);
      router.replace("/movies");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete movie");
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleDeleteRightRequest = async () => {
    if (!requestDeletingRight || !profile || !movie) return;
    setIsSubmittingDelete(true);
    try {
      if (profile.role === "admin" || profile.role === "legal") {
        await deleteRight(requestDeletingRight.id);
        setRights(prev => prev.filter(r => r.id !== requestDeletingRight.id));
        toast.success("Right deleted successfully");
      } else {
        await submitRightChange(
          movie.id,
          "right_delete",
          requestDeletingRight,
          profile.full_name || profile.email,
          profile.id,
          requestDeletingRight
        );
        toast.success("Deletion request submitted for approval");
      }
      setRequestDeletingRight(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete right");
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  useEffect(() => {
    async function fetchData() {
      if (!movieId) return;
      try {
        setLoading(true);
        const movieData = await getMovieById(movieId);
        setMovie(movieData);
        if (movieData?.production_no) {
          const versions = await getMovieVersions(movieData.production_no);
          setLanguageVersions(versions);
        } else {
          setLanguageVersions([]);
        }
        const [rightsData, expiredData] = await Promise.all([
          getMovieRights(movieId),
          getMovieExpiredRights(movieId),
        ]);
        setRights(rightsData as RightWithDetails[]);
        setExpiredRights(expiredData as RightWithDetails[]);
      } catch (err) {
        console.error("Error fetching movie data:", err);
        toast.error(err instanceof Error ? err.message : "Failed to load movie");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [movieId]);

  const handleVersionChange = async (versionId: string) => {
    if (versionId === selectedVersionId) return;
    try {
      setLoading(true);
      setSelectedVersionId(versionId);
      const [movieData, rightsData, expiredData] = await Promise.all([
        getMovieById(versionId),
        getMovieRights(versionId),
        getMovieExpiredRights(versionId),
      ]);
      setMovie(movieData);
      setRights(rightsData as RightWithDetails[]);
      setExpiredRights(expiredData as RightWithDetails[]);
      router.push(`/movies/${versionId}`, { scroll: false });
    } catch (err) {
      console.error("Error switching version:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load version");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    if (dateStr.startsWith("3099") || dateStr.startsWith("9999")) return "Perpetual";
    try { return format(new Date(dateStr), "MMM dd, yyyy"); }
    catch { return dateStr; }
  };

  if (loading && !movie) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-red-400/60" />
        <p className="text-(--text-faint) text-sm">Loading movie…</p>
      </div>
    );
  }

  if (!movie && !loading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="text-(--text-faint) hover:text-(--text)">
          <Link href="/movies"><ArrowLeft className="mr-2 h-4 w-4" />Back to Movies</Link>
        </Button>
        <p className="text-(--text-faint) text-sm">Movie not found.</p>
      </div>
    );
  }

  if (!movie) return null;

  const currentVersion = languageVersions.find(v => v.id === selectedVersionId) || movie;
  const isExpired = movie.agreement_end_date && new Date(movie.agreement_end_date) < new Date();

  const isSatellite = (pt: string) => pt.includes("satellite") || pt.includes("dth") || pt.includes("terrestrial");
  const isInternet = (pt: string) => pt.includes("svod") || pt.includes("tvod") || pt.includes("avod") || pt.includes("fvod") || pt.includes("nvod") || pt.includes("iptv");

  const satelliteRights = rights.filter(r => isSatellite((r.platforms?.platform_type || "").toLowerCase()));
  const internetRights = rights.filter(r => { const pt = (r.platforms?.platform_type || "").toLowerCase(); return !isSatellite(pt) && isInternet(pt); });
  const otherRights = rights.filter(r => { const pt = (r.platforms?.platform_type || "").toLowerCase(); return !isSatellite(pt) && !isInternet(pt); });
  const expiredSatellite = expiredRights.filter(r => isSatellite((r.platforms?.platform_type || "").toLowerCase()));
  const expiredInternet = expiredRights.filter(r => { const pt = (r.platforms?.platform_type || "").toLowerCase(); return !isSatellite(pt) && isInternet(pt); });
  const expiredOther = expiredRights.filter(r => { const pt = (r.platforms?.platform_type || "").toLowerCase(); return !isSatellite(pt) && !isInternet(pt); });

  // Nav items
  const navItems: { id: NavSection; label: string; icon: React.ElementType; badge?: number; dim?: boolean }[] = [
    { id: "basic", label: "Basic Info", icon: Film },
    { id: "cast", label: "Cast & Crew", icon: Users },
    { id: "rights", label: "Rights Info", icon: ShieldCheck },
    ...(movie.source === "acquired" ? [{ id: "acquisition" as NavSection, label: "Acquisition", icon: Calendar }] : []),
    ...(currentVersion.remarks || currentVersion.actionables || currentVersion.wtp_library ? [{ id: "notes" as NavSection, label: "Notes", icon: Info }] : []),
    { id: "exploitation", label: "Exploitation", icon: FileText, badge: rights.length },
    { id: "history", label: "Rights History", icon: History, badge: expiredRights.length, dim: true },
  ];

  const RightsTable = ({ items, expired = false }: { items: RightWithDetails[]; expired?: boolean }) =>
    items.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-14 gap-3">
        <div className="p-3 rounded-full bg-slate-800/50 border border-(--svf-border)">
          {expired ? <History className="h-5 w-5 text-(--text-faint)" /> : <FileText className="h-5 w-5 text-(--text-faint)" />}
        </div>
        <p className="text-(--text-faint) text-sm">{expired ? "No expired rights in this category" : "No rights in this category"}</p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader style={{ background: "var(--bg-deep)" }}>
            <TableRow className="border-(--svf-border) hover:bg-transparent">
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Platform</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Type</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Category</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Nature</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Start</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">End</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Territory</TableHead>
              {!expired && <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Status</TableHead>}
              {!expired && <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((right) => (
              <TableRow key={right.id} className={cn("border-slate-800/40 hover:bg-slate-800/20 transition-colors", expired && "opacity-65")}>
                <TableCell className="font-semibold text-sm text-(--text)">{right.platforms?.name || "—"}</TableCell>
                <TableCell className="text-xs text-(--text-faint)">{right.platforms?.platform_type || "—"}</TableCell>
                <TableCell className="text-xs text-(--text-faint)">{right.category || "—"}</TableCell>
                <TableCell>
                  {right.nature ? (
                    <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0.5",
                      right.nature.toLowerCase().includes("exclusive")
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                        : "bg-slate-800/60 text-(--text-faint) border-(--svf-border)"
                    )}>
                      {right.nature.replace(/_/g, '-').replace(/\b\w/g, c => c.toUpperCase())}
                    </Badge>
                  ) : <span className="text-(--text-faint) text-xs">—</span>}
                </TableCell>
                <TableCell className="text-xs tabular-nums text-(--text-faint)">{formatDate(right.start_date)}</TableCell>
                <TableCell className="text-xs tabular-nums text-(--text-faint)">
                  {right.end_date === "3099-12-31" ? <span className="text-emerald-400/70 text-xs">Perpetual</span> : formatDate(right.end_date)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-xs text-(--text-faint)">
                    <Globe className="h-3 w-3 text-(--text-faint)" />{right.territory || "World"}
                  </div>
                </TableCell>
                {!expired && (
                  <TableCell>
                    {right.is_current ? (
                      <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/25">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-slate-800/60 text-(--text-faint) border-(--svf-border)">Expired</Badge>
                    )}
                  </TableCell>
                )}
                {!expired && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-(--text-faint) hover:text-amber-400 hover:bg-amber-500/10" asChild>
                        <Link href={`/rights/${right.id}/edit`}><Edit className="h-3.5 w-3.5" /></Link>
                      </Button>
                      {canRequestDelete && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-(--text-faint) hover:text-red-400 hover:bg-red-500/10" onClick={() => setRequestDeletingRight(right)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );

  const RightsSubTabs = ({ sat, inet, other, expired = false }: { sat: RightWithDetails[]; inet: RightWithDetails[]; other: RightWithDetails[]; expired?: boolean }) => {
    const [sub, setSub] = useState<"satellite" | "internet" | "other">("satellite");
    return (
      <div>
        <div className="flex gap-0 border-b border-(--svf-border) mb-0">
          {[
            { id: "satellite" as const, label: "Satellite", icon: Tv, count: sat.length },
            { id: "internet" as const, label: "Internet", icon: Wifi, count: inet.length },
            { id: "other" as const, label: "Other", icon: MoreHorizontal, count: other.length },
          ].map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setSub(id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all",
                sub === id
                  ? expired ? "border-slate-500 text-(--text)" : "border-red-500 text-red-400"
                  : "border-transparent text-(--text-faint) hover:text-(--text-faint)"
              )}
            >
              <Icon className="h-3.5 w-3.5" />{label}
              {count > 0 && <span className={cn("text-[10px] ml-0.5", sub === id ? (expired ? "text-(--text-faint)" : "text-red-400/70") : "text-(--text-faint)")}>({count})</span>}
            </button>
          ))}
        </div>
        <RightsTable items={sub === "satellite" ? sat : sub === "internet" ? inet : other} expired={expired} />
      </div>
    );
  };

  return (
    <div className="space-y-0 min-h-screen">
      {loading && movie && (
        <div className="fixed inset-0 bg-(--bg-deep)/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex items-center gap-3 bg-(--panel-solid)/90 border border-slate-700/60 px-6 py-4 rounded-[12px] shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-red-400" />
            <span className="text-(--text) text-sm font-medium">Loading version…</span>
          </div>
        </div>
      )}

      {/* ── Cinematic Hero ── */}
      <div className="relative overflow-hidden rounded-[12px] bg-(--bg-raise)/60 border border-(--svf-border) backdrop-blur-xl shadow-2xl mb-4">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/50 to-transparent pointer-events-none" />

        <div className="relative flex items-start gap-6 p-6">
          <Button variant="ghost" size="sm" asChild className="absolute top-5 left-5 text-(--text-faint) hover:text-(--text) hover:bg-slate-800/60 h-8 w-8 p-0">
            <Link href="/movies"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>

          {languageVersions.length > 1 && (
            <div className="absolute top-4 right-4">
              <Select value={selectedVersionId} onValueChange={handleVersionChange}>
                <SelectTrigger className="h-9 w-auto min-w-44 bg-(--panel-solid)/80 border border-slate-700/60 text-(--text) text-sm font-medium backdrop-blur-md gap-2 pr-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0"><SelectValue /></div>
                </SelectTrigger>
                <SelectContent className="bg-(--panel-solid)/95 border-slate-700/60 backdrop-blur-xl shadow-2xl">
                  <div className="px-2 py-1.5 border-b border-(--svf-border) mb-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Select Version</p>
                  </div>
                  {languageVersions.map((version) => (
                    <SelectItem key={version.id} value={version.id} className="text-(--text) focus:bg-slate-800/60 focus:text-slate-100 py-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${version.id === selectedVersionId ? "bg-red-500" : "bg-slate-600"}`} />
                        <span className="font-medium">{version.language || "Unknown"}</span>
                        {version.is_primary && (
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Primary ({languageVersions.length} Versions)
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Poster */}
          <div className="mt-8 ml-2 shrink-0">
            <div className="relative w-28 aspect-[2/3] rounded-[12px] overflow-hidden shadow-2xl ring-1 ring-white/10">
              <img
                src={`https://fileapi.mni.agency/api/FileFolderManager/PreviewFile?path=%2Fmnt%2Fmni%2FMoviePoster%2F${encodeURIComponent(movie.title)}.jpg&userId=1&platform=WebMicrosoft%20Windows%20NT%2010.0.20348.0`}
                alt={movie.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  el.parentElement!.innerHTML = `<div class="w-full h-full bg-slate-800/60 border border-[var(--svf-border)] flex items-center justify-center"><svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' class='text-slate-600'><rect width='18' height='18' x='3' y='3' rx='2'/><path d='m9 8 6 8'/><path d='m15 8-6 8'/></svg></div>`;
                }}
                onLoad={(e) => {
                  const target = e.currentTarget;
                  target.style.display = "";
                  target.nextElementSibling?.classList.add("hidden");
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
            </div>
          </div>

          {/* Title block */}
          <div className="flex-1 mt-8 space-y-3 min-w-0">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight mb-2">{movie.title}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn("text-xs font-semibold px-2.5 py-0.5",
                  movie.source === "home_production"
                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/25"
                    : "bg-violet-500/10 text-violet-400 border-violet-500/25"
                )}>
                  {movie.source === "home_production" ? "Home Production" : "Acquired"}
                </Badge>
                {isExpired && <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-red-500/10 text-red-400 border-red-500/25">Agreement Expired</Badge>}
                {movie.release_year && (
                  <div className="flex items-center gap-1.5 text-(--text-faint)"><Calendar className="h-3.5 w-3.5" /><span className="text-sm font-medium">{movie.release_year}</span></div>
                )}
                {movie.certification && (
                  <Badge variant="outline" className="text-xs font-bold px-2.5 py-0.5 bg-slate-800/60 text-(--text) border-(--svf-border)">{movie.certification}</Badge>
                )}
                {movie.language && (
                  <div className="flex items-center gap-1.5 text-(--text-faint)"><Languages className="h-3.5 w-3.5" /><span className="text-sm">{movie.language}</span></div>
                )}
                {rights.length > 0 && (
                  <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                    <CheckCircle2 className="h-3 w-3 mr-1" />{rights.length} Active Rights
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-0.5">
              {movie.director_names && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-(--text-faint) w-16 text-xs pt-0.5 shrink-0">Director</span>
                  <span className="text-(--text) font-medium">{movie.director_names}</span>
                </div>
              )}
              {movie.cast_names && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-(--text-faint) w-16 text-xs pt-0.5 shrink-0">Cast</span>
                  <span className="text-(--text-faint) line-clamp-1">{movie.cast_names}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1 flex-wrap items-center">
              <Button asChild size="sm" className="h-8 px-4 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30 gap-2">
                <Link href={`/movies/${selectedVersionId}/edit`}><Edit className="h-3.5 w-3.5" />Edit Movie</Link>
              </Button>
              {movie.trailer_link && movie.trailer_link !== "N/A" && (
                <Button variant="outline" size="sm" className="h-8 px-4 bg-slate-800/60 border-(--svf-border) text-(--text) hover:bg-(--hover) gap-2" asChild>
                  <a href={movie.trailer_link} target="_blank" rel="noopener noreferrer">
                    <PlayCircle className="h-3.5 w-3.5" />Trailer<ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                </Button>
              )}

              {canDelete && (
                <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(true)}
                  className="h-8 px-3 bg-red-950/30 border-red-800/40 text-red-400 hover:bg-red-950/60 hover:border-red-700/60 hover:text-red-300 gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" />Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Layout: Vertical Nav + Content ── */}
      <div className="flex gap-4 min-h-[600px]">
        {/* Vertical Nav */}
        <aside className="w-52 shrink-0">
          <nav className="sticky top-4 space-y-1 bg-(--panel-solid)/50 border border-(--svf-border) rounded-[12px] p-2 backdrop-blur-sm">
            {navItems.map(({ id, label, icon: Icon, badge, dim }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all text-left",
                  activeSection === id
                    ? "bg-slate-800/80 text-slate-100 shadow-sm"
                    : dim
                      ? "text-(--text-faint) hover:bg-slate-800/40 hover:text-(--text-faint)"
                      : "text-(--text-faint) hover:bg-slate-800/40 hover:text-(--text)"
                )}
              >
                <div className={cn("p-1 rounded-[9px] shrink-0",
                  activeSection === id ? "bg-red-500/15 text-red-400" : dim ? "bg-slate-800/60 text-(--text-faint)" : "bg-slate-800/60 text-(--text-faint)"
                )}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="flex-1 truncate">{label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center",
                    activeSection === id ? "bg-red-600/30 text-red-300" : dim ? "bg-slate-800 text-(--text-faint)" : "bg-slate-800 text-(--text-faint)"
                  )}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content Panel */}
        <main className="flex-1 min-w-0">
          <div className="bg-(--panel-solid)/50 border border-(--svf-border) rounded-[12px] backdrop-blur-sm min-h-full">

            {/* ── Basic Info ── */}
            {activeSection === "basic" && (
              <div className="p-6">
                <SectionTitle icon={Film} title="Basic Information" accent />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-5">
                  {movie.source !== "acquired" && <InfoRow label="Production No" value={currentVersion.production_no} mono />}
                  <InfoRow label="Language" value={currentVersion.language} />
                  <InfoRow label="Release Date" value={formatDate(currentVersion.release_date)} />
                  <InfoRow label="Release Year" value={currentVersion.release_year?.toString()} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Certification</span>
                    {currentVersion.certification
                      ? <Badge variant="outline" className="text-xs w-fit font-bold bg-slate-800/60 text-(--text) border-(--svf-border) mt-0.5">{currentVersion.certification}</Badge>
                      : <span className="text-(--text-faint) text-sm">—</span>}
                  </div>
                  <InfoRow label="Color / B&W" value={currentVersion.color_or_bw} />
                  {movie.source !== "acquired" && <InfoRow label="Production House" value={currentVersion.production_house_name} />}
                  {currentVersion.territory && <InfoRow label="Territory" value={currentVersion.territory} />}
                </div>
              </div>
            )}

            {/* ── Cast & Crew ── */}
            {activeSection === "cast" && (
              <div className="p-6">
                <SectionTitle icon={Users} title="Cast & Crew" accent />
                <div className="space-y-5">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">Director(s)</span>
                    <p className="text-sm text-(--text) font-medium leading-relaxed">{currentVersion.director_names || <span className="text-(--text-faint)">—</span>}</p>
                  </div>
                  <div className="pt-4 border-t border-(--svf-border)">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">Cast</span>
                    <p className="text-sm text-(--text) leading-relaxed">{currentVersion.cast_names || <span className="text-(--text-faint)">—</span>}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Rights Info ── */}
            {activeSection === "rights" && (
              <div className="p-6">
                <SectionTitle icon={ShieldCheck} title="Rights Information" accent />
                {movie.source === "home_production" ? (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">Nature of Rights</span>
                        {currentVersion.nature_of_rights
                          ? <Badge variant="outline" className={cn("text-xs font-semibold px-2 py-0.5",
                            currentVersion.nature_of_rights.toLowerCase().includes("exclusive") ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                              : currentVersion.nature_of_rights.toLowerCase().includes("jointly") ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                                : "bg-slate-800/60 text-(--text) border-(--svf-border)")}>{currentVersion.nature_of_rights}</Badge>
                          : <span className="text-(--text-faint) text-sm">—</span>}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">Territory</span>
                        <div className="flex items-center gap-1.5 text-(--text) text-sm"><Globe className="h-3.5 w-3.5 text-(--text-faint)" />{currentVersion.territory || "World"}</div>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-(--svf-border)">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2.5">Rights Owned</span>
                      <div className="flex flex-wrap gap-2">
                        {["Satellite", "Internet", "Negative", "Other", "Prequel/Sequel", "Character", "Sub-Titling", "Dubbing"].map(r => (
                          <span key={r} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/8 border border-emerald-500/20 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />{r}
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-(--text-faint) mt-2">All rights exclusively owned — Yes by default for home production</p>
                    </div>
                    {currentVersion.nature_of_rights?.toLowerCase().includes("jointly") && (
                      <div className="pt-4 border-t border-(--svf-border) grid grid-cols-2 gap-8">
                        <InfoRow label="Revenue Share" value={currentVersion.revenue_share} />
                        <InfoRow label="Buy-Back Opening Date" value={formatDate(currentVersion.joint_prod_buy_back_date)} />
                        {currentVersion.jointly_exploitation_rights && <div className="col-span-2"><InfoRow label="Exploitation Rights Held By" value={currentVersion.jointly_exploitation_rights} /></div>}
                      </div>
                    )}
                    {currentVersion.holdbacks && (
                      <div className="pt-4 border-t border-(--svf-border)"><InfoRow label="Holdbacks" value={currentVersion.holdbacks} /></div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">Territory</span>
                      <div className="flex items-center gap-1.5 text-(--text) text-sm"><Globe className="h-3.5 w-3.5 text-(--text-faint)" />{currentVersion.territory || "World"}</div>
                    </div>
                    {(currentVersion.satellite_rights || currentVersion.internet_rights || currentVersion.negative_rights || currentVersion.other_rights) && (
                      <div className="pt-4 border-t border-(--svf-border)">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-3">Primary Rights</span>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: "Satellite", flag: currentVersion.satellite_rights, classification: currentVersion.satellite_rights_classification, nature: currentVersion.nature_of_satellite_rights, start: currentVersion.satellite_rights_start_date, end: currentVersion.satellite_rights_end_date },
                            { label: "Internet", flag: currentVersion.internet_rights, classification: currentVersion.internet_rights_classification, nature: currentVersion.nature_of_internet_rights, start: currentVersion.internet_rights_start_date, end: currentVersion.internet_rights_end_date },
                            { label: "Negative", flag: currentVersion.negative_rights, classification: undefined, nature: currentVersion.nature_of_negative_rights, start: currentVersion.negative_rights_start_date, end: currentVersion.negative_rights_end_date },
                            { label: "Other", flag: currentVersion.other_rights, classification: undefined, nature: currentVersion.nature_of_other_rights, start: currentVersion.other_rights_start_date, end: currentVersion.other_rights_end_date },
                          ].filter(r => r.flag).map(({ label, flag, classification, nature, start, end }) => (
                            <div key={label} className="rounded-[12px] border border-(--svf-border) bg-(--bg-deep)/30 p-3 space-y-1.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-bold text-(--text)">{label}</span>
                                {(() => {
                                  const parsed = parseOtherRights(flag || "");
                                  if (parsed.isYes && parsed.types.length === 0) {
                                    return (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/25">Yes</Badge>
                                    );
                                  }
                                  if (parsed.isYes && parsed.types.length > 0) {
                                    return (
                                      <div className="flex flex-wrap gap-1">
                                        {parsed.types.map(s => (
                                          <span key={s} className="text-[10px] px-1.5 py-0 rounded-full bg-emerald-500/10 text-emerald-400 border-emerald-500/25 font-semibold">{s}</span>
                                        ))}
                                      </div>
                                    );
                                  }
                                  return (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-slate-800/60 text-(--text-faint) border-(--svf-border)">{flag || "No"}</Badge>
                                  );
                                })()}
                              </div>
                              {classification && <p className="text-xs text-(--text)">{classification}</p>}
                              {nature && <p className="text-xs text-(--text-faint) italic">{nature}</p>}
                              {(start || end) && <p className="text-[10px] text-(--text-faint) font-mono">{formatDate(start)} → {formatDate(end)}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(currentVersion.clip_rights || currentVersion.clip_rights_duration || currentVersion.holdbacks) && (
                      <div className="pt-4 border-t border-(--svf-border) grid grid-cols-2 gap-8">
                        {currentVersion.clip_rights && <InfoRow label="Clip Rights" value={currentVersion.clip_rights} />}
                        {currentVersion.clip_rights_duration && <InfoRow label="Clip Duration" value={currentVersion.clip_rights_duration} />}
                        {currentVersion.holdbacks && <div className="col-span-2"><InfoRow label="Holdbacks" value={currentVersion.holdbacks} /></div>}
                      </div>
                    )}
                    {[
                      { label: "Syndication – Internet Rights", value: currentVersion.syndication_internet_rights },
                      { label: "Prequel / Sequel Rights", value: currentVersion.prequel_sequel_rights },
                      { label: "Character Rights", value: currentVersion.character_rights },
                      { label: "Sub-Titling Rights", value: currentVersion.subtitling_rights },
                      { label: "Dubbing Rights", value: currentVersion.dubbing_rights },
                    ].filter(f => f.value).map(({ label, value }) => (
                      <div key={label} className="pt-4 border-t border-(--svf-border)">
                        <InfoRow label={label} value={value ?? undefined} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Acquisition ── */}
            {activeSection === "acquisition" && movie.source === "acquired" && (
              <div className="p-6">
                <SectionTitle icon={Calendar} title="Acquisition Details" accent />
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                  <InfoRow label="Assignor / Licensor" value={currentVersion.assignor_licensor} />
                  <InfoRow label="Licensee" value={currentVersion.licensee} />
                  <InfoRow label="Agreement Date" value={formatDate(currentVersion.agreement_date)} />
                  <div className="col-span-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-1.5">Agreement Period</span>
                    <span className="text-sm text-(--text) font-mono tracking-tight">
                      {formatDate(currentVersion.agreement_start_date)} <span className="text-(--text-faint) mx-1">→</span> {formatDate(currentVersion.agreement_end_date)}
                    </span>
                  </div>
                  {(currentVersion.satellite_rights_start_date || currentVersion.satellite_rights_end_date) && (
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-1.5">Satellite Rights Period</span>
                      <span className="text-sm text-(--text) font-mono tracking-tight">
                        {formatDate(currentVersion.satellite_rights_start_date)} <span className="text-(--text-faint) mx-1">→</span> {formatDate(currentVersion.satellite_rights_end_date)}
                      </span>
                    </div>
                  )}
                  {(currentVersion.internet_rights_start_date || currentVersion.internet_rights_end_date) && (
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-1.5">Internet Rights Period</span>
                      <span className="text-sm text-(--text) font-mono tracking-tight">
                        {formatDate(currentVersion.internet_rights_start_date)} <span className="text-(--text-faint) mx-1">→</span> {formatDate(currentVersion.internet_rights_end_date)}
                      </span>
                    </div>
                  )}
                  {currentVersion.syndication_internet_rights && (
                    <div className="col-span-2"><InfoRow label="Syndication – Internet Rights" value={currentVersion.syndication_internet_rights} /></div>
                  )}
                </div>
              </div>
            )}

            {/* ── Notes ── */}
            {activeSection === "notes" && (
              <div className="p-6">
                <SectionTitle icon={Info} title="Notes & Additional Information" accent />
                <div className="space-y-5">
                  {currentVersion.wtp_library && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">WTP / Library</span>
                      <p className="text-sm text-(--text) bg-slate-800/40 border border-(--svf-border) px-4 py-3 rounded-[12px]">{currentVersion.wtp_library}</p>
                    </div>
                  )}
                  {currentVersion.remarks && (
                    <div className={currentVersion.wtp_library ? "pt-4 border-t border-(--svf-border)" : ""}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">Remarks</span>
                      <p className="text-sm text-(--text) bg-slate-800/40 border border-(--svf-border) px-4 py-3 rounded-[12px] leading-relaxed">{currentVersion.remarks}</p>
                    </div>
                  )}
                  {currentVersion.actionables && (
                    <div className={(currentVersion.wtp_library || currentVersion.remarks) ? "pt-4 border-t border-(--svf-border)" : ""}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">Actionables</span>
                      <p className="text-sm text-(--text) bg-amber-500/5 border border-amber-500/20 px-4 py-3 rounded-[12px] leading-relaxed">{currentVersion.actionables}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Exploitation Rights ── */}
            {activeSection === "exploitation" && (
              <div>
                <div className="flex items-center justify-between px-6 py-4 border-b border-(--svf-border)">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-[10px] bg-red-500/10 border border-red-500/20">
                      <FileText className="h-4 w-4 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-(--text)">Exploitation Rights</h3>
                      <p className="text-[11px] text-(--text-faint)">Active licenses and distribution rights for this version</p>
                    </div>
                  </div>
                  <Link href={`/rights/new?movieId=${selectedVersionId}&movieTitle=${encodeURIComponent(currentVersion?.title || "")}`}>
                    <Button size="sm" className="h-8 px-4 bg-red-600 hover:bg-red-500 text-white border-0 gap-2 text-xs">
                      <Plus className="h-3.5 w-3.5" />Add Right
                    </Button>
                  </Link>
                </div>
                <RightsSubTabs sat={satelliteRights} inet={internetRights} other={otherRights} />
              </div>
            )}

            {/* ── Rights History ── */}
            {activeSection === "history" && (
              <div>
                <div className="flex items-center gap-2.5 px-6 py-4 border-b border-(--svf-border)">
                  <div className="p-1.5 rounded-[10px] bg-slate-800/60 border border-(--svf-border)">
                    <History className="h-4 w-4 text-(--text-faint)" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-(--text)">Rights History</h3>
                    <p className="text-[11px] text-(--text-faint)">Expired licenses and past distribution rights</p>
                  </div>
                </div>
                <RightsSubTabs sat={expiredSatellite} inet={expiredInternet} other={expiredOther} expired />
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ── Dialogs ── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-(--panel-solid) border-slate-700/60 shadow-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-[10px] bg-red-500/10 border border-red-500/20">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <AlertDialogTitle className="text-slate-100 text-lg">Delete Movie?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-(--text-faint) leading-relaxed">
              <span className="font-semibold text-(--text)">{movie.title}</span> will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}
              className="bg-slate-800 border-slate-700/60 text-(--text) hover:bg-slate-700 hover:text-slate-100">Cancel</Button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-500 text-white border-0 gap-2">
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin" />Deleting…</> : <><Trash2 className="h-4 w-4" />Delete Movie</>}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        open={!!requestDeletingRight}
        onOpenChange={(open) => !open && setRequestDeletingRight(null)}
        onConfirm={handleDeleteRightRequest}
        title={profile?.role === "admin" || profile?.role === "legal" ? "Delete Right" : "Request Deletion"}
        description={profile?.role === "admin" || profile?.role === "legal"
          ? `Are you sure you want to delete the right on "${requestDeletingRight?.platforms?.name}"? This cannot be undone.`
          : `Are you sure you want to request deletion of this right on "${requestDeletingRight?.platforms?.name}"? This will go through the approval process.`}
        confirmText={profile?.role === "admin" || profile?.role === "legal" ? "Delete" : "Request Delete"}
        isLoading={isSubmittingDelete}
      />
    </div>
  );
}
