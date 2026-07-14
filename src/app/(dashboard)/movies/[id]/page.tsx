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
import { getMovieRightsOwned } from "@/lib/api/movie-rights";
import { deleteMovie, getMovieById, getMovieExpiredRights, getMovieRights, getMovieVersions } from "@/lib/api/movies";
import { submitRightChange } from "@/lib/api/pending-changes";
import { deleteRight } from "@/lib/api/rights";
import type { MovieLanguageVersion, MovieRight, MovieWithDetails, PlatformRight } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertTriangle,
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

function PosterImage({ title }: { title: string }) {
  const [failed, setFailed] = useState(false);
  const initials = title.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  return (
    <div className="relative w-28 aspect-2/3 rounded-[12px] overflow-hidden shadow-2xl ring-1 ring-(--svf-border)">
      {!failed ? (
        <img
          src={`https://fileapi.mni.agency/api/FileFolderManager/PreviewFile?path=%2Fmnt%2Fmni%2FMoviePoster%2F${encodeURIComponent(title)}.jpg&userId=1&platform=WebMicrosoft%20Windows%20NT%2010.0.20348.0`}
          alt={title}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, var(--bg-raise) 0%, var(--panel-solid) 100%)" }}>
          <Film className="h-8 w-8" style={{ color: "var(--text-faint)" }} />
          <span className="text-lg font-bold" style={{ color: "var(--text-faint)" }}>{initials}</span>
        </div>
      )}
      {!failed && <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent pointer-events-none" />}
    </div>
  );
}

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
      <div className={cn("p-1.5 rounded-[10px] border", accent ? "bg-red-500/10 border-red-500/20" : "bg-(--bg-raise) border-(--svf-border)")}>
        <Icon className={cn("h-4 w-4", accent ? "text-red-400" : "text-(--text-faint)")} />
      </div>
      <h3 className="text-sm font-bold text-(--text) tracking-tight">{title}</h3>
    </div>
  );
}

function HoldbacksBlock({ value }: { value: string }) {
  return (
    <div className="rounded-[12px] border border-amber-500/25 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80">Holdbacks</span>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line">{value}</p>
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
  const [ownedRights, setOwnedRights] = useState<MovieRight[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
        const [rightsData, expiredData, ownedData] = await Promise.all([
          getMovieRights(movieId),
          getMovieExpiredRights(movieId),
          movieData?.source === "acquired" ? getMovieRightsOwned(movieId) : Promise.resolve([] as MovieRight[]),
        ]);
        setRights(rightsData as RightWithDetails[]);
        setExpiredRights(expiredData as RightWithDetails[]);
        setOwnedRights(ownedData);
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

  const RightsTable = ({ items, expired = false }: { items: RightWithDetails[]; expired?: boolean }) =>
    items.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-14 gap-3">
        <div className="p-3 rounded-full bg-(--bg-raise) border border-(--svf-border)">
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
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Holdbacks</TableHead>
              {!expired && <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Status</TableHead>}
              {!expired && <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((right) => (
              <TableRow key={right.id} className={cn("border-(--svf-border) hover:bg-(--hover) transition-colors", expired && "opacity-65")}>
                <TableCell className="font-semibold text-sm text-(--text)">{right.platforms?.name || "—"}</TableCell>
                <TableCell className="text-xs text-(--text-faint)">{right.platforms?.platform_type || "—"}</TableCell>
                <TableCell className="text-xs text-(--text-faint)">{right.category || "—"}</TableCell>
                <TableCell>
                  {right.nature ? (
                    <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0.5",
                      right.nature.toLowerCase().includes("exclusive")
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                        : "bg-(--bg-raise) text-(--text-faint) border-(--svf-border)"
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
                <TableCell className="text-xs text-amber-400 max-w-50 truncate" title={right.holdbacks || undefined}>
                  {right.holdbacks || <span className="text-(--text-faint)">—</span>}
                </TableCell>
                {!expired && (
                  <TableCell>
                    {right.is_current ? (
                      <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/25">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-(--bg-raise) text-(--text-faint) border-(--svf-border)">Expired</Badge>
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
                  ? expired ? "border-(--svf-border-strong) text-(--text)" : "border-red-500 text-red-400"
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
    <div className="space-y-4 pb-10">
      {loading && movie && (
        <div className="fixed inset-0 bg-(--bg-deep)/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex items-center gap-3 bg-(--panel-solid) border border-(--svf-border) px-6 py-4 rounded-[12px] shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-red-400" />
            <span className="text-(--text) text-sm font-medium">Loading version…</span>
          </div>
        </div>
      )}

      {/* ── Cinematic Hero ── */}
      <div className="relative overflow-hidden rounded-[12px] bg-(--panel-solid) border border-(--svf-border) shadow-sm">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to right, color-mix(in oklch, var(--bg-raise) 80%, transparent) 0%, transparent 60%)" }} />

        <div className="relative flex items-start gap-6 p-6">
          <Button variant="ghost" size="sm" asChild className="absolute top-5 left-5 text-(--text-faint) hover:text-(--text) hover:bg-(--hover) h-8 w-8 p-0">
            <Link href="/movies"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>

          {languageVersions.length > 1 && (
            <div className="absolute top-4 right-4">
              <Select value={selectedVersionId} onValueChange={handleVersionChange}>
                <SelectTrigger className="h-9 w-auto min-w-44 bg-(--panel-solid) border border-(--svf-border-strong) text-(--text) text-sm font-medium gap-2 pr-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0"><SelectValue /></div>
                </SelectTrigger>
                <SelectContent className="bg-(--panel-solid) border-(--svf-border-strong) shadow-2xl">
                  <div className="px-2 py-1.5 border-b border-(--svf-border) mb-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Select Version</p>
                  </div>
                  {languageVersions.map((version) => (
                    <SelectItem key={version.id} value={version.id} className="text-(--text) py-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${version.id === selectedVersionId ? "bg-red-500" : "bg-(--text-faint)"}`} />
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
            <PosterImage title={movie.title} />
          </div>

          {/* Title block */}
          <div className="flex-1 mt-8 space-y-3 min-w-0">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-(--text) leading-tight mb-2">{movie.title}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn("text-xs font-semibold px-2.5 py-0.5",
                  movie.source === "home_production"
                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/25"
                    : "bg-violet-500/10 text-violet-400 border-violet-500/25"
                )}>
                  {movie.source === "home_production" ? "Home Production" : "Acquired"}
                </Badge>
                {isExpired && <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-red-500/10 text-red-400 border-red-500/25">Agreement Expired</Badge>}
                {movie.source === "home_production" && currentVersion.home_sold && (
                  <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-red-500/10 text-red-400 border-red-500/25">Sold — Expired</Badge>
                )}
                {movie.release_year && (
                  <div className="flex items-center gap-1.5 text-(--text-faint)"><Calendar className="h-3.5 w-3.5" /><span className="text-sm font-medium">{movie.release_year}</span></div>
                )}
                {movie.certification && (
                  <Badge variant="outline" className="text-xs font-bold px-2.5 py-0.5 bg-(--bg-raise) text-(--text) border-(--svf-border)">{movie.certification}</Badge>
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
                <Button variant="outline" size="sm" className="h-8 px-4 bg-(--bg-raise) border-(--svf-border) text-(--text) hover:bg-(--hover) gap-2" asChild>
                  <a href={movie.trailer_link} target="_blank" rel="noopener noreferrer">
                    <PlayCircle className="h-3.5 w-3.5" />Trailer<ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                </Button>
              )}
              {canDelete && (
                <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(true)}
                  className="h-8 px-3 bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20 hover:border-red-500/50 gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" />Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Basic Info ── */}
      <div className="bg-(--panel-solid) border border-(--svf-border) rounded-[12px] p-6">
        <SectionTitle icon={Film} title="Basic Information" accent />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-5">
          {movie.source !== "acquired" && <InfoRow label="Production No" value={currentVersion.production_no} mono />}
          <InfoRow label="Language" value={currentVersion.language} />
          <InfoRow label="Release Date" value={formatDate(currentVersion.release_date)} />
          <InfoRow label="Release Year" value={currentVersion.release_year?.toString()} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Certification</span>
            {currentVersion.certification
              ? <Badge variant="outline" className="text-xs w-fit font-bold bg-(--bg-raise) text-(--text) border-(--svf-border) mt-0.5">{currentVersion.certification}</Badge>
              : <span className="text-(--text-faint) text-sm">—</span>}
          </div>
          <InfoRow label="Color / B&W" value={currentVersion.color_or_bw} />
          {movie.source !== "acquired" && <InfoRow label="Production House" value={currentVersion.production_house_name} />}
        </div>
      </div>

      {/* ── Cast & Crew ── */}
      <div className="bg-(--panel-solid) border border-(--svf-border) rounded-[12px] p-6">
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

      {/* ── Rights Info ── */}
      <div className="bg-(--panel-solid) border border-(--svf-border) rounded-[12px] p-6">
        <SectionTitle icon={ShieldCheck} title="Rights Information" accent />
        {movie.source === "home_production" ? (
          <div className="space-y-5">
            {/* Static read-only Rights Owned section — all rights owned by default for home production */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-3">Rights Owned</span>
              <div className="flex flex-wrap gap-2">
                {["Satellite", "Internet", "Negative", "Airborne", "Ship", "Other", "Clip", "Derivative", "Ancillary"].map(right => (
                  <Badge key={right} variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/25 text-xs font-semibold px-2 py-0.5">
                    {right}
                  </Badge>
                ))}
              </div>
            </div>
            {/* Jointly Owned info */}
            {(currentVersion.jointly_owned || currentVersion.jointly_exploitation_rights) && (
              <div className="pt-4 border-t border-(--svf-border)">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/25 text-xs font-semibold">Jointly Owned</Badge>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <InfoRow label="Revenue Share" value={currentVersion.revenue_share} />
                  <InfoRow label="Buy-Back Opening Date" value={formatDate(currentVersion.joint_prod_buy_back_date)} />
                  {currentVersion.jointly_exploitation_rights && <div className="col-span-2"><InfoRow label="Exploitation Rights Held By" value={currentVersion.jointly_exploitation_rights} /></div>}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {ownedRights.length > 0 && (
              <div className="pt-4 border-t border-(--svf-border)">
                <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-3">Rights We Own</span>
                {/* Group by right_type */}
                {(() => {
                  const groups = new Map<string, typeof ownedRights>();
                  ownedRights.forEach(r => {
                    if (!groups.has(r.right_type)) groups.set(r.right_type, []);
                    groups.get(r.right_type)!.push(r);
                  });
                  const natureStyle = (n: string) => {
                    const l = n.toLowerCase();
                    if (l.includes("non") && l.includes("exclusive")) {
                      return {
                        border: "border-amber-500/40",
                        glow: "shadow-[0_0_0_1px_rgba(245,158,11,0.15)]",
                        badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
                        bar: "bg-amber-500",
                      };
                    }
                    if (l.includes("exclusive") && !l.includes("shared")) {
                      return {
                        border: "border-emerald-500/40",
                        glow: "shadow-[0_0_0_1px_rgba(16,185,129,0.15)]",
                        badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
                        bar: "bg-emerald-500",
                      };
                    }
                    if (l.includes("shared")) {
                      return {
                        border: "border-blue-500/40",
                        glow: "shadow-[0_0_0_1px_rgba(59,130,246,0.15)]",
                        badge: "bg-blue-500/15 text-blue-300 border-blue-500/40",
                        bar: "bg-blue-500",
                      };
                    }
                    return {
                      border: "border-(--svf-border)",
                      glow: "",
                      badge: "bg-(--bg-deep) text-(--text-faint) border-(--svf-border)",
                      bar: "bg-(--text-faint)",
                    };
                  };
                  return Array.from(groups.entries()).map(([type, rows]) => (
                    <div key={type} className="mb-4 last:mb-0">
                      {/* Group header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">{type}</span>
                        <div className="flex-1 h-px bg-(--svf-border)" />
                        <span className="text-[10px] text-(--text-faint)">{rows.length} right{rows.length > 1 ? "s" : ""}</span>
                      </div>
                      <div className="space-y-2.5 pl-1">
                        {rows.map(r => {
                          const style = natureStyle(r.nature || "");
                          return (
                            <div key={r.id} className={`relative overflow-hidden rounded-[10px] border ${style.border} ${style.glow} bg-(--bg-raise)/60 pl-4 pr-3.5 py-3.5`}>
                              {/* Accent bar */}
                              <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.bar}`} />
                              {/* Row 1: nature badge, bold & prominent + classification */}
                              <div className="flex items-center gap-2 flex-wrap mb-2.5">
                                {r.nature && <Badge variant="outline" className={`text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 ${style.badge}`}>{r.nature}</Badge>}
                                {r.classification && (
                                  <span className="text-[10px] font-medium text-(--text-faint) bg-(--bg-deep) border border-(--svf-border) rounded px-1.5 py-0.5">{r.classification}</span>
                                )}
                              </div>
                              {/* Row 2: Territory + dates in a mini grid */}
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                {r.territory && (
                                  <div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-(--text-faint) block mb-0.5">Territory</span>
                                    <div className="flex items-center gap-1 text-xs text-(--text)">
                                      <Globe className="h-3 w-3 text-(--text-faint) shrink-0" />
                                      {r.territory}
                                    </div>
                                  </div>
                                )}
                                {(r.start_date || r.end_date) && (
                                  <div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-(--text-faint) block mb-0.5">Period</span>
                                    <span className="text-xs font-mono text-(--text-faint)">
                                      {formatDate(r.start_date) || "—"} <span className="opacity-50">→</span> {formatDate(r.end_date) || "Perpetual"}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {(r.holdbacks || r.syndication) && (
                                <div className="mt-2 pt-2 border-t border-(--svf-border) grid grid-cols-2 gap-x-6 gap-y-1.5">
                                  {r.holdbacks && (
                                    <div>
                                      <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500/70 block mb-0.5">Holdbacks</span>
                                      <span className="text-xs text-amber-400">{r.holdbacks}</span>
                                    </div>
                                  )}
                                  {r.syndication && (
                                    <div>
                                      <span className="text-[9px] font-bold uppercase tracking-widest text-(--text-faint) block mb-0.5">Syndication</span>
                                      <span className="text-xs text-(--text)">{r.syndication}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Derivative Rights group */}
            {(currentVersion.clip_rights || currentVersion.clip_rights_duration ||
              currentVersion.prequel_sequel_rights || currentVersion.character_rights ||
              currentVersion.subtitling_rights || currentVersion.dubbing_rights) && (
                <div className="pt-4 border-t border-(--svf-border)">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">Derivative Rights</span>
                    <div className="flex-1 h-px bg-(--svf-border)" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Clip Rights", value: currentVersion.clip_rights },
                      { label: "Clip Duration", value: currentVersion.clip_rights_duration },
                      { label: "Prequel / Sequel", value: currentVersion.prequel_sequel_rights },
                      { label: "Character Rights", value: currentVersion.character_rights },
                      { label: "Sub-Titling", value: currentVersion.subtitling_rights },
                      { label: "Dubbing Rights", value: currentVersion.dubbing_rights },
                    ].filter(f => f.value).map(({ label, value }) => (
                      <div key={label} className="rounded-[10px] border border-(--svf-border) bg-(--bg-raise)/60 px-3.5 py-2.5">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-(--text-faint) block mb-1">{label}</span>
                        <span className="text-sm text-(--text) font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* ── Acquisition (acquired only) ── */}
      {movie.source === "acquired" && (
        <div className="bg-(--panel-solid) border border-(--svf-border) rounded-[12px] p-6">
          <SectionTitle icon={Calendar} title="Acquisition Details" accent />
          <div className="grid grid-cols-3 gap-x-10 gap-y-5">
            <InfoRow label="Assignor / Licensor" value={currentVersion.assignor_licensor} />
            <InfoRow label="Licensee" value={currentVersion.licensee} />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-1.5">Agreement Period</span>
              <span className="text-sm text-(--text) font-mono tracking-tight">
                {formatDate(currentVersion.agreement_start_date)} <span className="text-(--text-faint) mx-1">→</span> {formatDate(currentVersion.agreement_end_date)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Notes (only when data exists) ── */}
      {(currentVersion.wtp_library || currentVersion.remarks || currentVersion.actionables || currentVersion.syndication_holdback || movie.is_bangladeshi != null) && (
        <div className="bg-(--panel-solid) border border-(--svf-border) rounded-[12px] p-6">
          <SectionTitle icon={Info} title="Notes & Additional Information" accent />
          <div className="space-y-5">
            {movie.is_bangladeshi != null && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">Bangladeshi Film</span>
                <Badge variant="outline" className={movie.is_bangladeshi
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 text-xs font-semibold"
                  : "bg-(--bg-raise) text-(--text-faint) border-(--svf-border) text-xs font-semibold"}>
                  {movie.is_bangladeshi ? "Yes" : "No"}
                </Badge>
              </div>
            )}
            {currentVersion.wtp_library && (
              <div className={movie.is_bangladeshi != null ? "pt-4 border-t border-(--svf-border)" : ""}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">WTP / Library</span>
                <p className="text-sm text-(--text) bg-(--bg-raise) border border-(--svf-border) px-4 py-3 rounded-[12px]">{currentVersion.wtp_library}</p>
              </div>
            )}
            {currentVersion.remarks && (
              <div className={(movie.is_bangladeshi != null || currentVersion.wtp_library) ? "pt-4 border-t border-(--svf-border)" : ""}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">Remarks</span>
                <p className="text-sm text-(--text) bg-(--bg-raise) border border-(--svf-border) px-4 py-3 rounded-[12px] leading-relaxed">{currentVersion.remarks}</p>
              </div>
            )}
            {currentVersion.actionables && (
              <div className={(movie.is_bangladeshi != null || currentVersion.wtp_library || currentVersion.remarks) ? "pt-4 border-t border-(--svf-border)" : ""}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) block mb-2">Actionables</span>
                <p className="text-sm text-(--text) bg-amber-500/5 border border-amber-500/20 px-4 py-3 rounded-[12px] leading-relaxed">{currentVersion.actionables}</p>
              </div>
            )}
            {currentVersion.syndication_holdback && (
              <div className={(movie.is_bangladeshi != null || currentVersion.wtp_library || currentVersion.remarks || currentVersion.actionables) ? "pt-4 border-t border-(--svf-border)" : ""}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-400/80 block mb-2">Syndication Holdback</span>
                <p className="text-sm text-(--text) bg-red-500/5 border border-red-500/20 px-4 py-3 rounded-[12px] leading-relaxed whitespace-pre-line">{currentVersion.syndication_holdback}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Syndication Holdback (movie-wide exploitation restriction) ── */}
      {currentVersion.syndication_holdback && (
        <div className="rounded-[12px] border border-red-500/25 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-400/80">Syndication Holdback — Permanently Restricted</span>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">{currentVersion.syndication_holdback}</p>
          <p className="text-[11px] text-(--text-faint) mt-2">These types cannot be exploited for this movie regardless of individual platform availability.</p>
        </div>
      )}

      {/* ── Exploitation Rights ── */}
      <div className="bg-(--panel-solid) border border-(--svf-border) rounded-[12px] overflow-hidden">
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

      {/* ── Rights History ── */}
      <div className="bg-(--panel-solid) border border-(--svf-border) rounded-[12px] overflow-hidden">
        <div className="flex items-center gap-2.5 px-6 py-4 border-b border-(--svf-border)">
          <div className="p-1.5 rounded-[10px] bg-(--bg-raise) border border-(--svf-border)">
            <History className="h-4 w-4 text-(--text-faint)" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-(--text)">Rights History</h3>
            <p className="text-[11px] text-(--text-faint)">Expired licenses and past distribution rights</p>
          </div>
          {expiredRights.length > 0 && (
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-(--bg-deep) text-(--text-faint)">{expiredRights.length}</span>
          )}
        </div>
        <RightsSubTabs sat={expiredSatellite} inet={expiredInternet} other={expiredOther} expired />
      </div>

      {/* ── Dialogs ── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-(--panel-solid) border-(--svf-border-strong) shadow-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-[10px] bg-red-500/10 border border-red-500/20">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <AlertDialogTitle className="text-(--text) text-lg">Delete Movie?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-(--text-faint) leading-relaxed">
              <span className="font-semibold text-(--text)">{movie.title}</span> will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}
              className="bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover)">Cancel</Button>
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
