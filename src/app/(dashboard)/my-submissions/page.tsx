"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { getMovieApprovalHistory, getPendingMovies, type PendingMovieForApproval } from "@/lib/api/approvals";
import { resubmitMovie } from "@/lib/api/approvals";
import { getPendingChanges, type PendingChange, type PendingChangeStatus } from "@/lib/api/pending-changes";
import type { ApprovalStatus, MovieApproval } from "@/lib/types/database";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit,
  Film,
  FileEdit,
  Info,
  Loader2,
  RotateCcw,
  Search,
  SendHorizonal,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// ── Shared status badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApprovalStatus | PendingChangeStatus }) {
  if (status === "approved")
    return (
      <Badge className="bg-green-500/10 text-green-400 border border-green-500/25 text-[11px] font-semibold">
        <CheckCircle className="h-3 w-3 mr-1" /> Approved
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge className="bg-red-500/10 text-red-400 border border-red-500/25 text-[11px] font-semibold">
        <XCircle className="h-3 w-3 mr-1" /> Rejected
      </Badge>
    );
  return (
    <Badge className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 text-[11px] font-semibold">
      <Clock className="h-3 w-3 mr-1" /> Pending Review
    </Badge>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Change type label ──────────────────────────────────────────────────────────

function changeTypeLabel(t: string) {
  const map: Record<string, string> = {
    movie_fields: "Movie Fields Edit",
    right_create: "Rights Added",
    right_update: "Rights Updated",
    right_delete: "Rights Removed",
    movie_right_create: "Right Owned Added",
    movie_right_update: "Right Owned Updated",
    movie_right_delete: "Right Owned Removed",
    person_add: "Cast/Crew Added",
    person_remove: "Cast/Crew Removed",
  };
  return map[t] || t;
}

// ── New-movie submission card ──────────────────────────────────────────────────

function SubmissionCard({ movie, onResubmit }: { movie: PendingMovieForApproval; onResubmit: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<MovieApproval[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const toast = useAppToast();

  const lastRejection = history.find(h => h.status === "rejected");

  const loadHistory = async () => {
    if (history.length > 0) return;
    setHistoryLoading(true);
    try {
      const h = await getMovieApprovalHistory(movie.id);
      setHistory(h);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) loadHistory();
  };

  const handleResubmit = async () => {
    setResubmitting(true);
    try {
      await resubmitMovie(movie.id);
      onResubmit(movie.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resubmit");
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <Card className="bg-(--panel-solid) border-(--svf-border)">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/movies/${movie.id}`} className="font-bold text-(--text) hover:text-red-400 transition-colors line-clamp-1">
                {movie.title}
              </Link>
              <StatusBadge status={movie.approval_status} />
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {movie.production_no && <span className="text-[10px] text-(--text-faint) font-mono">{movie.production_no}</span>}
              <span className="text-[10px] text-(--text-faint)">
                {movie.source === "home_production" ? "Home Production" : "Acquired"}
              </span>
              {movie.created_at && (
                <span className="text-[10px] text-(--text-faint)">Added {fmtDate(movie.created_at)}</span>
              )}
            </div>
          </div>

          <div className="flex gap-2 shrink-0 flex-wrap">
            <Link href={`/movies/${movie.id}/edit?tab=approval`}>
              <Button size="sm" variant="outline" className="h-8 px-3 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover)">
                <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
            </Link>
            {movie.approval_status === "rejected" && (
              <Button size="sm" variant="outline" onClick={handleResubmit} disabled={resubmitting}
                className="h-8 px-3 bg-yellow-600/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-600/20">
                {resubmitting
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Resubmitting…</>
                  : <><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Resubmit</>}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {movie.approval_status === "rejected" && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Rejection reason
            </div>
            {lastRejection?.reason || !expanded ? (
              lastRejection?.reason
                ? <p className="text-sm text-(--text-dim) italic">"{lastRejection.reason}"</p>
                : <p className="text-xs text-(--text-faint)">Load history to see reason.</p>
            ) : null}
            {!expanded && (
              <button onClick={handleExpand} className="text-xs text-red-400/70 hover:text-red-300 transition-colors">
                Show history for reason →
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {movie.language && <div><span className="text-(--text-faint)">Language: </span><span className="text-(--text)">{movie.language}</span></div>}
          {movie.release_year && <div><span className="text-(--text-faint)">Year: </span><span className="text-(--text)">{movie.release_year}</span></div>}
          {movie.certification && <div><span className="text-(--text-faint)">Cert: </span><span className="text-(--text)">{movie.certification}</span></div>}
          {movie.director_names && <div className="col-span-2"><span className="text-(--text-faint)">Director: </span><span className="text-(--text)">{movie.director_names}</span></div>}
        </div>

        <button onClick={handleExpand} className="flex items-center gap-1.5 text-xs text-(--text-faint) hover:text-(--text) transition-colors">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Hide" : "Show"} approval history
        </button>

        {expanded && (
          <div className="space-y-3 pt-2 border-t border-(--svf-border)">
            {historyLoading ? (
              <div className="flex items-center gap-2 text-(--text-faint) text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : history.length === 0 ? (
              <p className="text-(--text-faint) text-sm flex items-center gap-2"><Info className="h-4 w-4" /> No activity yet — awaiting first review.</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 shrink-0">
                    {h.status === "approved" ? <CheckCircle className="h-4 w-4 text-green-400" />
                      : h.status === "rejected" ? <XCircle className="h-4 w-4 text-red-400" />
                      : <Clock className="h-4 w-4 text-yellow-400" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-(--text) font-medium capitalize">{h.status}</p>
                    {h.reviewer_name && <p className="text-(--text-faint) text-xs">by {h.reviewer_name}</p>}
                    {h.reason && <p className="text-(--text-faint) text-xs mt-0.5 italic">"{h.reason}"</p>}
                    <p className="text-(--text-faint) text-xs mt-0.5">{h.created_at ? fmtDateTime(h.created_at) : "—"}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Pending change card ────────────────────────────────────────────────────────

function ChangeCard({ change }: { change: PendingChange }) {
  const [expanded, setExpanded] = useState(false);

  const after = (change.payload as any)?.after as Record<string, unknown> | undefined;
  const before = (change.payload as any)?.before as Record<string, unknown> | undefined;
  const changedFields = after && before ? Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])) : [];

  return (
    <Card className="bg-(--panel-solid) border-(--svf-border)">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/movies/${change.movie_id}`} className="font-bold text-(--text) hover:text-red-400 transition-colors line-clamp-1">
                {(change.movie as any)?.title || "Unknown Movie"}
              </Link>
              <StatusBadge status={change.status} />
              <Badge variant="outline" className="text-[10px] border-(--svf-border) text-(--text-faint)">
                {changeTypeLabel(change.change_type)}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3 mt-1">
              <span className="text-[10px] text-(--text-faint)">{change.change_summary}</span>
              <span className="text-[10px] text-(--text-faint)">Submitted {fmtDate(change.created_at)}</span>
            </div>
          </div>

          <Link href={`/movies/${change.movie_id}/edit`}>
            <Button size="sm" variant="outline" className="h-8 px-3 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shrink-0">
              <Edit className="h-3.5 w-3.5 mr-1.5" /> View Movie
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Rejection reason */}
        {change.status === "rejected" && change.reason && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 mb-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Rejection reason
            </div>
            <p className="text-sm text-(--text-dim) italic">"{change.reason}"</p>
            {change.reviewer_name && <p className="text-xs text-(--text-faint) mt-1">by {change.reviewer_name}</p>}
          </div>
        )}

        {/* Approved note */}
        {change.status === "approved" && (
          <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3 flex items-center gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
            <p className="text-xs text-green-400">
              Approved{change.reviewer_name ? ` by ${change.reviewer_name}` : ""}
              {change.reviewed_at ? ` on ${fmtDate(change.reviewed_at)}` : ""}
            </p>
          </div>
        )}

        {/* Field diff toggle — movie_fields and movie_right_update show a before/after table */}
        {(change.change_type === "movie_fields" || change.change_type === "movie_right_update") && changedFields.length > 0 && (
          <>
            <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1.5 text-xs text-(--text-faint) hover:text-(--text) transition-colors">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "Hide" : "Show"} field changes ({changedFields.length})
            </button>

            {expanded && (
              <div className="border border-(--svf-border) rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 gap-0 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) bg-(--bg-deep) px-3 py-2">
                  <span>Field</span><span>Before</span><span>After</span>
                </div>
                {changedFields.map(field => (
                  <div key={field} className="grid grid-cols-3 gap-0 text-xs px-3 py-2 border-t border-(--svf-border) hover:bg-(--hover)">
                    <span className="text-(--text-faint) font-medium">{field.replace(/_/g, " ")}</span>
                    <span className="text-red-400/80 line-clamp-1">{String(before?.[field] ?? "—")}</span>
                    <span className="text-green-400/80 line-clamp-1">{String(after?.[field] ?? "—")}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* movie_right_create — list the submitted fields (no "before" to diff against) */}
        {change.change_type === "movie_right_create" && after && (
          <div className="space-y-1 text-xs">
            {(["right_type", "classification", "nature", "territory", "start_date", "end_date", "syndication", "holdbacks"] as const)
              .filter(k => after[k])
              .map(k => (
                <div key={k} className="flex gap-2">
                  <span className="text-(--text-faint) w-24 shrink-0">{k.replace(/_/g, " ")}</span>
                  <span className="text-(--text)">{String(after[k])}</span>
                </div>
              ))}
          </div>
        )}

        {/* movie_right_delete */}
        {change.change_type === "movie_right_delete" && (
          <p className="text-xs text-red-400/80">This will permanently remove the right record from the movie once approved.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "movies" | "changes";

export default function MySubmissionsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && profile && profile.role !== "editor") {
      router.replace("/");
    }
  }, [authLoading, profile, router]);

  const [tab, setTab] = useState<Tab>("movies");

  // ── New movie submissions ──
  const [movies, setMovies] = useState<PendingMovieForApproval[]>([]);
  const [moviesLoading, setMoviesLoading] = useState(true);
  const [movieSearch, setMovieSearch] = useState("");
  const [movieStatus, setMovieStatus] = useState<ApprovalStatus | "all">("all");

  // ── Pending changes ──
  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [changesLoading, setChangesLoading] = useState(true);
  const [changeSearch, setChangeSearch] = useState("");
  const [changeStatus, setChangeStatus] = useState<PendingChangeStatus | "all">("all");

  const toast = useAppToast();

  const fetchMovies = useCallback(async () => {
    setMoviesLoading(true);
    try {
      const { data } = await getPendingMovies({ status: movieStatus === "all" ? "all" : movieStatus, search: movieSearch || undefined, limit: 10000, offset: 0 });
      setMovies(data.filter(m => m.approval_status !== "approved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load submissions");
    } finally {
      setMoviesLoading(false);
    }
  }, [movieSearch, movieStatus]);

  const fetchChanges = useCallback(async () => {
    setChangesLoading(true);
    try {
      const { data } = await getPendingChanges({ status: changeStatus === "all" ? "all" : changeStatus, search: changeSearch || undefined, limit: 10000, offset: 0 });
      setChanges(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load change requests");
    } finally {
      setChangesLoading(false);
    }
  }, [changeSearch, changeStatus]);

  useEffect(() => { fetchMovies(); }, [fetchMovies]);
  useEffect(() => { fetchChanges(); }, [fetchChanges]);

  const handleResubmit = (movieId: string) => {
    setMovies(prev => prev.map(m => m.id === movieId ? { ...m, approval_status: "pending" as ApprovalStatus } : m));
  };

  const pendingMovies = movies.filter(m => m.approval_status === "pending").length;
  const rejectedMovies = movies.filter(m => m.approval_status === "rejected").length;
  const pendingChanges = changes.filter(c => c.status === "pending").length;
  const rejectedChanges = changes.filter(c => c.status === "rejected").length;

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
      tab === t
        ? "bg-(--svf-accent) text-white"
        : "text-(--text-faint) hover:text-(--text) hover:bg-(--hover)"
    }`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <SendHorizonal className="h-8 w-8 text-yellow-400" />
            My Submissions
          </h1>
          <p className="text-(--text-faint) mt-1">
            Track approval status for new movies you&apos;ve added and edit requests you&apos;ve submitted.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {pendingMovies > 0 && (
            <Badge className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 text-sm px-3 py-1.5 h-fit">
              <Clock className="h-3.5 w-3.5 mr-1.5" />{pendingMovies} movie{pendingMovies > 1 ? "s" : ""} pending
            </Badge>
          )}
          {pendingChanges > 0 && (
            <Badge className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 text-sm px-3 py-1.5 h-fit">
              <Clock className="h-3.5 w-3.5 mr-1.5" />{pendingChanges} change{pendingChanges > 1 ? "s" : ""} pending
            </Badge>
          )}
          {(rejectedMovies > 0 || rejectedChanges > 0) && (
            <Badge className="bg-red-500/10 text-red-400 border border-red-500/25 text-sm px-3 py-1.5 h-fit">
              <XCircle className="h-3.5 w-3.5 mr-1.5" />{rejectedMovies + rejectedChanges} rejected
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-(--svf-border) pb-3">
        <button className={tabCls("movies")} onClick={() => setTab("movies")}>
          <Film className="h-4 w-4" />
          New Movies
          {(pendingMovies > 0 || rejectedMovies > 0) && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/20 text-yellow-400">
              {pendingMovies + rejectedMovies}
            </span>
          )}
        </button>
        <button className={tabCls("changes")} onClick={() => setTab("changes")}>
          <FileEdit className="h-4 w-4" />
          Change Requests
          {(pendingChanges > 0 || rejectedChanges > 0) && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/20 text-yellow-400">
              {pendingChanges + rejectedChanges}
            </span>
          )}
        </button>
      </div>

      {/* ── New Movies tab ── */}
      {tab === "movies" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--text-faint)" />
              <Input placeholder="Search by title…" value={movieSearch} onChange={(e) => setMovieSearch(e.target.value)}
                className="pl-10 h-9 bg-(--bg-raise) border-(--svf-border) text-(--text)" />
            </div>
            <Select value={movieStatus} onValueChange={(v) => setMovieStatus(v as ApprovalStatus | "all")}>
              <SelectTrigger className="h-9 w-44 bg-(--bg-raise) border-(--svf-border) text-(--text)">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Link href="/movies/new">
              <Button size="sm" className="h-9 bg-red-600 hover:bg-red-500 text-white gap-2">
                <Film className="h-4 w-4" /> New Movie
              </Button>
            </Link>
          </div>

          {pendingMovies > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/8 p-4 flex items-start gap-3">
              <Clock className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {pendingMovies} movie{pendingMovies > 1 ? "s are" : " is"} awaiting legal review. {pendingMovies > 1 ? "They" : "It"} will appear in the main catalog once approved.
              </p>
            </div>
          )}

          {moviesLoading ? (
            <div className="flex items-center justify-center py-20 text-(--text-faint) gap-3">
              <Loader2 className="h-6 w-6 animate-spin" /> Loading submissions…
            </div>
          ) : movies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-(--svf-border)">
              <CheckCircle className="h-12 w-12 text-green-400/40 mb-4" />
              <h3 className="font-bold text-xl text-(--text)">Nothing pending</h3>
              <p className="text-(--text-faint) text-sm mt-2">All your submissions have been approved, or you haven&apos;t added any yet.</p>
              <Link href="/movies/new" className="mt-4">
                <Button size="sm" variant="outline" className="gap-2"><Film className="h-4 w-4" /> Add a Movie</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {movies.map((movie) => (
                <SubmissionCard key={movie.id} movie={movie} onResubmit={handleResubmit} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Change Requests tab ── */}
      {tab === "changes" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--text-faint)" />
              <Input placeholder="Search by movie title or change…" value={changeSearch} onChange={(e) => setChangeSearch(e.target.value)}
                className="pl-10 h-9 bg-(--bg-raise) border-(--svf-border) text-(--text)" />
            </div>
            <Select value={changeStatus} onValueChange={(v) => setChangeStatus(v as PendingChangeStatus | "all")}>
              <SelectTrigger className="h-9 w-44 bg-(--bg-raise) border-(--svf-border) text-(--text)">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {pendingChanges > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/8 p-4 flex items-start gap-3">
              <Clock className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {pendingChanges} change request{pendingChanges > 1 ? "s are" : " is"} awaiting review by admin/legal.
              </p>
            </div>
          )}

          {changesLoading ? (
            <div className="flex items-center justify-center py-20 text-(--text-faint) gap-3">
              <Loader2 className="h-6 w-6 animate-spin" /> Loading change requests…
            </div>
          ) : changes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-(--svf-border)">
              <FileEdit className="h-12 w-12 text-(--text-faint)/40 mb-4" />
              <h3 className="font-bold text-xl text-(--text)">No change requests</h3>
              <p className="text-(--text-faint) text-sm mt-2">You haven&apos;t submitted any edit requests yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {changes.map((change) => (
                <ChangeCard key={change.id} change={change} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
