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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { deleteMovie, getMovieById, getMovieRights, getMovieExpiredRights, getMovieVersions } from "@/lib/api/movies";
import { deleteRight } from "@/lib/api/rights";
import { submitRightChange } from "@/lib/api/pending-changes";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { MovieLanguageVersion, MovieWithDetails, PlatformRight } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
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

interface RightWithDetails extends PlatformRight {
  platforms?: { name: string; platform_type?: string };
  category?: string | null;
}


function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <span className={cn("text-sm text-slate-200 leading-snug", mono && "font-mono text-xs")}>
        {value || <span className="text-slate-400">—</span>}
      </span>
    </div>
  );
}

function SectionCard({ icon: Icon, title, children, className }: { icon: React.ElementType; title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("glass-card border-slate-800/60", className)}>
      <CardHeader className="pb-3 pt-5 px-5 border-b border-slate-800/50">
        <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
          <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
            <Icon className="h-3.5 w-3.5 text-red-400" />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">{children}</CardContent>
    </Card>
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
    try { return format(new Date(dateStr), "MMM dd, yyyy"); }
    catch { return dateStr; }
  };

  if (loading && !movie) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-red-400/60" />
        <p className="text-slate-400 text-sm">Loading movie…</p>
      </div>
    );
  }

  if (!movie && !loading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="text-slate-400 hover:text-slate-200">
          <Link href="/movies"><ArrowLeft className="mr-2 h-4 w-4" />Back to Movies</Link>
        </Button>
        <p className="text-slate-400 text-sm">Movie not found.</p>
      </div>
    );
  }

  if (!movie) return null;

  const currentVersion = languageVersions.find(v => v.id === selectedVersionId) || movie;
  const isExpired = movie.agreement_end_date && new Date(movie.agreement_end_date) < new Date();

  return (
    <div className="space-y-6">
      {/* Version switch loading overlay */}
      {loading && movie && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-700/60 px-6 py-4 rounded-xl shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-red-400" />
            <span className="text-slate-300 text-sm font-medium">Loading version…</span>
          </div>
        </div>
      )}

      {/* Cinematic Hero Banner */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-red-600 via-amber-500 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/40 to-transparent pointer-events-none" />
        <div className="absolute top-4 right-16 w-64 h-64 bg-red-600/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex items-start gap-6 p-6">
          {/* Back button */}
          <Button variant="ghost" size="sm" asChild className="absolute top-5 left-5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 h-8 w-8 p-0">
            <Link href="/movies"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>

          {/* Version selector — top right */}
          {languageVersions.length > 1 && (
            <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
              <Select value={selectedVersionId} onValueChange={handleVersionChange}>
                <SelectTrigger className="h-9 w-auto min-w-44 bg-slate-900/80 border border-slate-700/60 text-slate-200 text-sm font-medium backdrop-blur-md shadow-lg shadow-black/30 hover:bg-slate-800/80 hover:border-slate-600/60 transition-all gap-2 pr-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-slate-900/95 border-slate-700/60 backdrop-blur-xl shadow-2xl">
                  <div className="px-2 py-1.5 border-b border-slate-800/60 mb-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Select Version</p>
                  </div>
                  {languageVersions.map((version) => (
                    <SelectItem
                      key={version.id}
                      value={version.id}
                      className="text-slate-300 focus:bg-slate-800/60 focus:text-slate-100 py-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${version.id === selectedVersionId ? "bg-red-500" : "bg-slate-600"}`} />
                        <span className="font-medium">{version.language || "Unknown"}</span>
                        {version.is_primary && (
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Primary ( {languageVersions.length} Versions )
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
            {movie.poster_url ? (
              <div className="relative w-32 aspect-[2/3] rounded-lg overflow-hidden shadow-2xl ring-1 ring-slate-700/50">
                <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
            ) : (
              <div className="w-32 aspect-[2/3] rounded-lg bg-slate-800/60 border border-slate-700/40 flex items-center justify-center shadow-xl">
                <Film className="h-10 w-10 text-slate-400" />
              </div>
            )}
          </div>

          {/* Title block */}
          <div className="flex-1 mt-8 space-y-3 min-w-0">
            <div>
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-100 leading-tight">
                  {movie.title}
                </h1>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn(
                  "text-xs font-semibold px-2.5 py-0.5",
                  movie.source === "home_production"
                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/25"
                    : "bg-violet-500/10 text-violet-400 border-violet-500/25"
                )}>
                  {movie.source === "home_production" ? "Home Production" : "Acquired"}
                </Badge>

                {isExpired && (
                  <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-red-500/10 text-red-400 border-red-500/25">
                    Expired
                  </Badge>
                )}

                {movie.release_year && (
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Calendar className="h-3.5 w-3.5" />
                    <span className="text-sm font-medium">{movie.release_year}</span>
                  </div>
                )}

                {movie.certification && (
                  <Badge variant="outline" className="text-xs font-bold px-2.5 py-0.5 bg-slate-800/60 text-slate-300 border-slate-700/50">
                    {movie.certification}
                  </Badge>
                )}

                {movie.language && (
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Languages className="h-3.5 w-3.5" />
                    <span className="text-sm">{movie.language}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Director / Cast */}
            <div className="space-y-1">
              {movie.director_names && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-slate-400 min-w-17.5 text-xs pt-0.5">Director</span>
                  <span className="text-slate-300 font-medium">{movie.director_names}</span>
                </div>
              )}
              {movie.cast_names && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-slate-400 min-w-17.5 text-xs pt-0.5">Cast</span>
                  <span className="text-slate-400 line-clamp-2">{movie.cast_names}</span>
                </div>
              )}
              {movie.source !== "acquired" && movie.production_house_name && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-slate-400 min-w-17.5 text-xs pt-0.5">Production</span>
                  <span className="text-slate-300 font-medium">{movie.production_house_name}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1 flex-wrap">
              <Button asChild size="sm" className="h-8 px-4 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30 gap-2">
                <Link href={`/movies/${selectedVersionId}/edit`}>
                  <Edit className="h-3.5 w-3.5" />Edit Movie
                </Link>
              </Button>
              {movie.trailer_link && movie.trailer_link !== "N/A" && (
                <Button variant="outline" size="sm" className="h-8 px-4 bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-700/60 gap-2" asChild>
                  <a href={movie.trailer_link} target="_blank" rel="noopener noreferrer">
                    <PlayCircle className="h-3.5 w-3.5" />Trailer
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="h-8 px-3 bg-red-950/30 border-red-800/40 text-red-400 hover:bg-red-950/60 hover:border-red-700/60 hover:text-red-300 gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="space-y-5">
        <TabsList className="bg-slate-900/60 border border-slate-800/60 p-1 h-auto gap-1">
          <TabsTrigger value="details" className="gap-2 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-slate-100 text-slate-400 h-8 px-4">
            <Info className="h-3.5 w-3.5" />Details
          </TabsTrigger>
          <TabsTrigger value="rights" className="gap-2 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-slate-100 text-slate-400 h-8 px-4">
            <FileText className="h-3.5 w-3.5" />Rights Exploitation
            {rights.length > 0 && <Badge className="ml-0.5 bg-red-600/80 text-white text-[10px] px-1.5 py-0 h-4">{rights.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-slate-100 text-slate-400 h-8 px-4">
            <History className="h-3.5 w-3.5" />Rights History
            {expiredRights.length > 0 && <Badge className="ml-0.5 bg-slate-600/80 text-white text-[10px] px-1.5 py-0 h-4">{expiredRights.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4 mt-0">
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard icon={Film} title="Basic Information">
              <div className="grid grid-cols-2 gap-4">
                {movie.source !== "acquired" && <InfoRow label="Production No" value={currentVersion.production_no} mono />}
                <InfoRow label="Language" value={currentVersion.language} />
                <InfoRow label="Release Date" value={formatDate(currentVersion.release_date)} />
                <InfoRow label="Release Year" value={currentVersion.release_year?.toString()} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Certification</span>
                  {currentVersion.certification ? (
                    <Badge variant="outline" className="text-xs w-fit font-bold bg-slate-800/60 text-slate-300 border-slate-700/50 mt-0.5">{currentVersion.certification}</Badge>
                  ) : <span className="text-slate-400 text-sm">—</span>}
                </div>
                {movie.source !== "acquired" && (
                  <div className="col-span-2">
                    <InfoRow label="Production House" value={currentVersion.production_house_name} />
                  </div>
                )}
                <div className="col-span-2">
                  <InfoRow label="Color / B&W" value={currentVersion.color_or_bw} />
                </div>
              </div>
            </SectionCard>

            <SectionCard icon={Users} title="Cast & Crew">
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Director(s)</span>
                  <p className="text-sm text-slate-200 font-medium leading-relaxed">{currentVersion.director_names || <span className="text-slate-400">—</span>}</p>
                </div>
                <div className="pt-3 border-t border-slate-800/50">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Cast</span>
                  <p className="text-sm text-slate-300 leading-relaxed">{currentVersion.cast_names || <span className="text-slate-400">—</span>}</p>
                </div>
              </div>
            </SectionCard>

            {movie.source === "home_production" ? (
              <SectionCard icon={ShieldCheck} title="Rights Information">
                {/* Nature of Rights + Territory */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Nature of Rights</span>
                    {currentVersion.nature_of_rights ? (
                      <Badge variant="outline" className={cn("text-xs font-semibold px-2 py-0.5",
                        currentVersion.nature_of_rights.toLowerCase().includes("exclusive")
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                          : currentVersion.nature_of_rights.toLowerCase().includes("jointly")
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                            : "bg-slate-800/60 text-slate-300 border-slate-700/50"
                      )}>
                        {currentVersion.nature_of_rights}
                      </Badge>
                    ) : <span className="text-slate-400 text-sm">—</span>}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Territory</span>
                    <div className="flex items-center gap-1.5 text-slate-300 text-sm">
                      <Globe className="h-3.5 w-3.5 text-slate-400" />
                      {currentVersion.territory || "World"}
                    </div>
                  </div>
                </div>

                {/* All rights are Yes for home — shown as a note */}
                <div className="pt-3 border-t border-slate-800/50">
                  <div className="flex flex-wrap gap-1.5">
                    {["Satellite", "Internet", "Negative", "Other", "Prequel/Sequel", "Character", "Sub-Titling", "Dubbing"].map(r => (
                      <span key={r} className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{r}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5">All rights exclusively owned — Yes by default for home production</p>
                </div>

                {/* Jointly Owned extras */}
                {currentVersion.nature_of_rights?.toLowerCase().includes("jointly") && (
                  <div className="pt-3 border-t border-slate-800/50 grid grid-cols-2 gap-4">
                    <InfoRow label="Revenue Share" value={currentVersion.revenue_share} />
                    <InfoRow label="Buy-Back Opening Date" value={formatDate(currentVersion.joint_prod_buy_back_date)} />
                    {currentVersion.jointly_exploitation_rights && (
                      <div className="col-span-2">
                        <InfoRow label="Exploitation Rights Held By" value={currentVersion.jointly_exploitation_rights} />
                      </div>
                    )}
                  </div>
                )}

                {/* Holdbacks if set */}
                {currentVersion.holdbacks && (
                  <div className="pt-3 border-t border-slate-800/50">
                    <InfoRow label="Holdbacks" value={currentVersion.holdbacks} />
                  </div>
                )}
              </SectionCard>
            ) : (
              <SectionCard icon={ShieldCheck} title="Rights Information">
                {/* Territory */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Territory</span>
                    <div className="flex items-center gap-1.5 text-slate-300 text-sm">
                      <Globe className="h-3.5 w-3.5 text-slate-400" />
                      {currentVersion.territory || "World"}
                    </div>
                  </div>
                </div>

                {/* Primary Rights grid */}
                {(currentVersion.satellite_rights || currentVersion.internet_rights || currentVersion.negative_rights || currentVersion.other_rights) && (
                  <div className="pt-3 border-t border-slate-800/50">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Primary Rights</span>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Satellite", flag: currentVersion.satellite_rights, classification: currentVersion.satellite_rights_classification, nature: currentVersion.nature_of_satellite_rights, start: currentVersion.satellite_rights_start_date, end: currentVersion.satellite_rights_end_date },
                        { label: "Internet", flag: currentVersion.internet_rights, classification: currentVersion.internet_rights_classification, nature: currentVersion.nature_of_internet_rights, start: currentVersion.internet_rights_start_date, end: currentVersion.internet_rights_end_date },
                        { label: "Negative", flag: currentVersion.negative_rights, classification: undefined, nature: currentVersion.nature_of_negative_rights, start: currentVersion.negative_rights_start_date, end: currentVersion.negative_rights_end_date },
                        { label: "Other", flag: currentVersion.other_rights, classification: undefined, nature: currentVersion.nature_of_other_rights, start: currentVersion.other_rights_start_date, end: currentVersion.other_rights_end_date },
                      ].filter(r => r.flag).map(({ label, flag, classification, nature, start, end }) => (
                        <div key={label} className="rounded-lg border border-slate-800/50 bg-slate-950/20 p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4",
                              flag === "Yes" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-slate-800/60 text-slate-400 border-slate-700/40"
                            )}>{flag}</Badge>
                          </div>
                          {classification && <p className="text-xs text-slate-300">{classification}</p>}
                          {nature && <p className="text-xs text-slate-400 italic">{nature}</p>}
                          {(start || end) && (
                            <p className="text-[10px] text-slate-500 font-mono">
                              {formatDate(start)} → {formatDate(end)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Syndication */}
                {currentVersion.syndication_internet_rights && (
                  <div className="pt-3 border-t border-slate-800/50">
                    <InfoRow label="Syndication – Internet Rights" value={currentVersion.syndication_internet_rights} />
                  </div>
                )}

                {/* Clip Rights */}
                {(currentVersion.clip_rights || currentVersion.clip_rights_duration || currentVersion.holdbacks) && (
                  <div className="pt-3 border-t border-slate-800/50 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Clip Rights</span>
                    <div className="grid grid-cols-2 gap-3">
                      {currentVersion.clip_rights && <InfoRow label="Clip Rights" value={currentVersion.clip_rights} />}
                      {currentVersion.clip_rights_duration && <InfoRow label="Duration" value={currentVersion.clip_rights_duration} />}
                    </div>
                    {currentVersion.holdbacks && <InfoRow label="Holdback" value={currentVersion.holdbacks} />}
                  </div>
                )}

                {/* Derivative rows */}
                {[
                  { label: "Prequel / Sequel Rights", value: currentVersion.prequel_sequel_rights },
                  { label: "Character Rights", value: currentVersion.character_rights },
                  { label: "Sub-Titling Rights", value: currentVersion.subtitling_rights },
                  { label: "Dubbing Rights", value: currentVersion.dubbing_rights },
                ].filter(f => f.value).map(({ label, value }) => (
                  <div key={label} className="pt-3 border-t border-slate-800/50">
                    <InfoRow label={label} value={value ?? undefined} />
                  </div>
                ))}
              </SectionCard>
            )}

            {movie.source === "acquired" && (
              <SectionCard icon={Calendar} title="Acquisition Details">
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Assignor / Licensor" value={currentVersion.assignor_licensor} />
                  <InfoRow label="Licensee" value={currentVersion.licensee} />
                  <InfoRow label="Agreement Date" value={formatDate(currentVersion.agreement_date)} />
                  <div className="col-span-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Agreement Period</span>
                    <span className="text-sm text-slate-300 font-mono">
                      {formatDate(currentVersion.agreement_start_date)} → {formatDate(currentVersion.agreement_end_date)}
                    </span>
                  </div>
                  {(currentVersion.satellite_rights_start_date || currentVersion.satellite_rights_end_date) && (
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Satellite Rights Period</span>
                      <span className="text-sm text-slate-300 font-mono">
                        {formatDate(currentVersion.satellite_rights_start_date)} → {formatDate(currentVersion.satellite_rights_end_date)}
                      </span>
                    </div>
                  )}
                  {(currentVersion.internet_rights_start_date || currentVersion.internet_rights_end_date) && (
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Internet Rights Period</span>
                      <span className="text-sm text-slate-300 font-mono">
                        {formatDate(currentVersion.internet_rights_start_date)} → {formatDate(currentVersion.internet_rights_end_date)}
                      </span>
                    </div>
                  )}
                  {currentVersion.syndication_internet_rights && (
                    <div className="col-span-2">
                      <InfoRow label="Syndication – Internet Rights" value={currentVersion.syndication_internet_rights} />
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {(currentVersion.remarks || currentVersion.actionables || currentVersion.wtp_library) && (
              <Card className={cn("glass-card border-slate-800/60", movie.source !== "acquired" && "md:col-span-2")}>
                <CardHeader className="pb-3 pt-5 px-5 border-b border-slate-800/50">
                  <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
                    <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
                      <Info className="h-3.5 w-3.5 text-red-400" />
                    </div>
                    Additional Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  {currentVersion.wtp_library && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">WTP / Library</span>
                      <p className="text-sm text-slate-300 bg-slate-800/40 border border-slate-700/40 px-3 py-2 rounded">{currentVersion.wtp_library}</p>
                    </div>
                  )}
                  {currentVersion.remarks && (
                    <div className={currentVersion.wtp_library ? "pt-3 border-t border-slate-800/50" : ""}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Remarks</span>
                      <p className="text-sm text-slate-300 bg-slate-800/40 border border-slate-700/40 px-3 py-2 rounded leading-relaxed">{currentVersion.remarks}</p>
                    </div>
                  )}
                  {currentVersion.actionables && (
                    <div className={(currentVersion.wtp_library || currentVersion.remarks) ? "pt-3 border-t border-slate-800/50" : ""}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Actionables</span>
                      <p className="text-sm text-slate-300 bg-slate-800/40 border border-slate-700/40 px-3 py-2 rounded leading-relaxed">{currentVersion.actionables}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Rights Tab */}
        <TabsContent value="rights" className="mt-0">
          {(() => {
            const isSatellite = (pt: string) =>
              pt.includes("satellite") || pt.includes("dth") || pt.includes("terrestrial");
            const isInternet = (pt: string) =>
              pt.includes("svod") || pt.includes("tvod") || pt.includes("avod") || pt.includes("fvod");

            const satelliteRights = rights.filter((r) => isSatellite((r.platforms?.platform_type || "").toLowerCase()));
            const internetRights = rights.filter((r) => {
              const pt = (r.platforms?.platform_type || "").toLowerCase();
              return !isSatellite(pt) && isInternet(pt);
            });
            const otherRights = rights.filter((r) => {
              const pt = (r.platforms?.platform_type || "").toLowerCase();
              return !isSatellite(pt) && !isInternet(pt);
            });

            const RightsTable = ({ items }: { items: RightWithDetails[] }) =>
              items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="p-3 rounded-full bg-slate-800/50 border border-slate-700/40">
                    <FileText className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-slate-400 text-sm">No rights in this category</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800/60 hover:bg-transparent">
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Platform</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Type</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Category</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nature</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start Date</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">End Date</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Territory</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((right) => (
                      <TableRow key={right.id} className="border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                        <TableCell className="font-semibold text-sm text-slate-200">{right.platforms?.name || "—"}</TableCell>
                        <TableCell className="text-sm text-slate-400">{right.platforms?.platform_type || "—"}</TableCell>
                        <TableCell className="text-xs text-slate-400">{right.category || "—"}</TableCell>
                        <TableCell>
                          {right.nature ? (
                            <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0.5",
                              right.nature.toLowerCase().includes("exclusive")
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                : "bg-slate-800/60 text-slate-400 border-slate-700/50"
                            )}>
                              {right.nature.replace(/_/g, '-').replace(/\b\w/g, c => c.toUpperCase())}
                            </Badge>
                          ) : <span className="text-slate-400 text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-slate-400">{formatDate(right.start_date)}</TableCell>
                        <TableCell className="text-xs tabular-nums text-slate-400">{formatDate(right.end_date)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Globe className="h-3 w-3 text-slate-400" />{right.territory || "World"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {right.is_current ? (
                            <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/25">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-slate-800/60 text-slate-400 border-slate-700/50">Expired</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" asChild>
                              <Link href={`/rights/${right.id}/edit`}><Edit className="h-3.5 w-3.5" /></Link>
                            </Button>
                            {canRequestDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => setRequestDeletingRight(right)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              );

            return (
              <Card className="glass-card border-slate-800/60">
                <CardHeader className="pb-3 pt-5 px-5 border-b border-slate-800/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
                          <FileText className="h-3.5 w-3.5 text-red-400" />
                        </div>
                        Exploitation Rights
                      </CardTitle>
                      <CardDescription className="mt-1 text-slate-400 text-xs">
                        Active licenses and distribution rights for this version
                      </CardDescription>
                    </div>
                    <Link href={`/rights/new?movieId=${selectedVersionId}&movieTitle=${encodeURIComponent(currentVersion?.title || "")}`}>
                      <Button size="sm" className="h-8 px-4 bg-red-600 hover:bg-red-500 text-white border-0 gap-2 text-xs">
                        <Plus className="h-3.5 w-3.5" />Add Right
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Tabs defaultValue="satellite">
                    <div className="px-5 pt-4 border-b border-slate-800/50">
                      <TabsList className="bg-transparent p-0 h-auto gap-0 border-b-0">
                        <TabsTrigger value="satellite" className="gap-2 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:text-red-400 data-[state=active]:bg-transparent text-slate-400 h-9 px-4 pb-3">
                          <Tv className="h-3.5 w-3.5" />Satellite
                          {satelliteRights.length > 0 && <span className="text-[10px] text-slate-400">({satelliteRights.length})</span>}
                        </TabsTrigger>
                        <TabsTrigger value="internet" className="gap-2 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:text-red-400 data-[state=active]:bg-transparent text-slate-400 h-9 px-4 pb-3">
                          <Wifi className="h-3.5 w-3.5" />Internet
                          {internetRights.length > 0 && <span className="text-[10px] text-slate-400">({internetRights.length})</span>}
                        </TabsTrigger>
                        <TabsTrigger value="other" className="gap-2 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:text-red-400 data-[state=active]:bg-transparent text-slate-400 h-9 px-4 pb-3">
                          <MoreHorizontal className="h-3.5 w-3.5" />Other
                          {otherRights.length > 0 && <span className="text-[10px] text-slate-400">({otherRights.length})</span>}
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    <TabsContent value="satellite" className="mt-0 overflow-x-auto">
                      <RightsTable items={satelliteRights} />
                    </TabsContent>
                    <TabsContent value="internet" className="mt-0 overflow-x-auto">
                      <RightsTable items={internetRights} />
                    </TabsContent>
                    <TabsContent value="other" className="mt-0 overflow-x-auto">
                      <RightsTable items={otherRights} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* Rights History Tab */}
        <TabsContent value="history" className="mt-0">
          {(() => {
            const isSatellite = (pt: string) =>
              pt.includes("satellite") || pt.includes("dth") || pt.includes("terrestrial");
            const isInternet = (pt: string) =>
              pt.includes("svod") || pt.includes("tvod") || pt.includes("avod") || pt.includes("fvod");

            const expiredSatellite = expiredRights.filter((r) => isSatellite((r.platforms?.platform_type || "").toLowerCase()));
            const expiredInternet = expiredRights.filter((r) => {
              const pt = (r.platforms?.platform_type || "").toLowerCase();
              return !isSatellite(pt) && isInternet(pt);
            });
            const expiredOther = expiredRights.filter((r) => {
              const pt = (r.platforms?.platform_type || "").toLowerCase();
              return !isSatellite(pt) && !isInternet(pt);
            });

            const HistoryTable = ({ items }: { items: RightWithDetails[] }) =>
              items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="p-3 rounded-full bg-slate-800/50 border border-slate-700/40">
                    <History className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-slate-400 text-sm">No expired rights in this category</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800/60 hover:bg-transparent">
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Platform</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Type</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Category</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nature</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start Date</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">End Date</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Territory</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((right) => (
                      <TableRow key={right.id} className="border-slate-800/40 hover:bg-slate-800/20 transition-colors opacity-75">
                        <TableCell className="font-semibold text-sm text-slate-300">{right.platforms?.name || "—"}</TableCell>
                        <TableCell className="text-sm text-slate-400">{right.platforms?.platform_type || "—"}</TableCell>
                        <TableCell className="text-xs text-slate-400">{right.category || "—"}</TableCell>
                        <TableCell>
                          {right.nature ? (
                            <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0.5",
                              right.nature.toLowerCase().includes("exclusive")
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                : "bg-slate-800/60 text-slate-400 border-slate-700/50"
                            )}>
                              {right.nature.replace(/_/g, '-').replace(/\b\w/g, c => c.toUpperCase())}
                            </Badge>
                          ) : <span className="text-slate-400 text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-slate-400">{formatDate(right.start_date)}</TableCell>
                        <TableCell className="text-xs tabular-nums text-slate-500">{formatDate(right.end_date)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Globe className="h-3 w-3 text-slate-400" />{right.territory || "World"}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              );

            return (
              <Card className="glass-card border-slate-800/60">
                <CardHeader className="pb-3 pt-5 px-5 border-b border-slate-800/50">
                  <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-slate-700/50 border border-slate-600/40">
                      <History className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    Rights History
                  </CardTitle>
                  <CardDescription className="mt-1 text-slate-400 text-xs">
                    Expired licenses and past distribution rights for this version
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Tabs defaultValue="satellite">
                    <div className="px-5 pt-4 border-b border-slate-800/50">
                      <TabsList className="bg-transparent p-0 h-auto gap-0 border-b-0">
                        <TabsTrigger value="satellite" className="gap-2 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-slate-500 data-[state=active]:text-slate-300 data-[state=active]:bg-transparent text-slate-500 h-9 px-4 pb-3">
                          <Tv className="h-3.5 w-3.5" />Satellite
                          {expiredSatellite.length > 0 && <span className="text-[10px] text-slate-500">({expiredSatellite.length})</span>}
                        </TabsTrigger>
                        <TabsTrigger value="internet" className="gap-2 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-slate-500 data-[state=active]:text-slate-300 data-[state=active]:bg-transparent text-slate-500 h-9 px-4 pb-3">
                          <Wifi className="h-3.5 w-3.5" />Internet
                          {expiredInternet.length > 0 && <span className="text-[10px] text-slate-500">({expiredInternet.length})</span>}
                        </TabsTrigger>
                        <TabsTrigger value="other" className="gap-2 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-slate-500 data-[state=active]:text-slate-300 data-[state=active]:bg-transparent text-slate-500 h-9 px-4 pb-3">
                          <MoreHorizontal className="h-3.5 w-3.5" />Other
                          {expiredOther.length > 0 && <span className="text-[10px] text-slate-500">({expiredOther.length})</span>}
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    <TabsContent value="satellite" className="mt-0 overflow-x-auto">
                      <HistoryTable items={expiredSatellite} />
                    </TabsContent>
                    <TabsContent value="internet" className="mt-0 overflow-x-auto">
                      <HistoryTable items={expiredInternet} />
                    </TabsContent>
                    <TabsContent value="other" className="mt-0 overflow-x-auto">
                      <HistoryTable items={expiredOther} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

      </Tabs>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-700/60 shadow-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <AlertDialogTitle className="text-slate-100 text-lg">Delete Movie?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-slate-400 leading-relaxed">
              <span className="font-semibold text-slate-300">{movie.title}</span> will be permanently deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
              className="bg-slate-800 border-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-500 text-white border-0 gap-2"
            >
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
