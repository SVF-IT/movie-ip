"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { ApprovalStatus, MovieApproval } from "@/lib/types/database";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit,
  Film,
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

function StatusBadge({ status }: { status: ApprovalStatus }) {
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
              <Link
                href={`/movies/${movie.id}`}
                className="font-bold text-slate-100 hover:text-red-400 transition-colors line-clamp-1"
              >
                {movie.title}
              </Link>
              <StatusBadge status={movie.approval_status} />
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
{movie.production_no && <span className="text-[10px] text-slate-400 font-mono">{movie.production_no}</span>}
              <span className="text-[10px] text-slate-400">
                {movie.source === "home_production" ? "Home Production" : "Acquired"}
              </span>
              {movie.created_at && (
                <span className="text-[10px] text-(--text-faint)">
                  Added{" "}
                  {new Date(movie.created_at).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 shrink-0 flex-wrap">
            <Link href={`/movies/${movie.id}/edit?tab=approval`}>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover)"
              >
                <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
            </Link>
            {movie.approval_status === "rejected" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleResubmit}
                disabled={resubmitting}
                className="h-8 px-3 bg-yellow-600/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-600/20"
              >
                {resubmitting
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Resubmitting…</>
                  : <><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Resubmit</>}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Rejection reason inline */}
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
              <button
                onClick={handleExpand}
                className="text-xs text-red-400/70 hover:text-red-300 transition-colors"
              >
                Show history for reason →
              </button>
            )}
          </div>
        )}

        {/* Details grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {movie.language && (
            <div><span className="text-(--text-faint)">Language: </span><span className="text-(--text)">{movie.language}</span></div>
          )}
          {movie.release_year && (
            <div><span className="text-(--text-faint)">Year: </span><span className="text-(--text)">{movie.release_year}</span></div>
          )}
          {movie.certification && (
            <div><span className="text-(--text-faint)">Cert: </span><span className="text-(--text)">{movie.certification}</span></div>
          )}
          {movie.director_names && (
            <div className="col-span-2"><span className="text-(--text-faint)">Director: </span><span className="text-(--text)">{movie.director_names}</span></div>
          )}
        </div>

        {/* History toggle */}
        <button
          onClick={handleExpand}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Hide" : "Show"} approval history
        </button>

        {expanded && (
          <div className="space-y-3 pt-2 border-t border-slate-800/40">
            {historyLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : history.length === 0 ? (
              <p className="text-(--text-faint) text-sm flex items-center gap-2">
                <Info className="h-4 w-4" /> No activity yet — awaiting first review.
              </p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 shrink-0">
                    {h.status === "approved"
                      ? <CheckCircle className="h-4 w-4 text-green-400" />
                      : h.status === "rejected"
                      ? <XCircle className="h-4 w-4 text-red-400" />
                      : <Clock className="h-4 w-4 text-yellow-400" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300 font-medium capitalize">{h.status}</p>
                    {h.reviewer_name && <p className="text-slate-400 text-xs">by {h.reviewer_name}</p>}
                    {h.reason && <p className="text-slate-400 text-xs mt-0.5 italic">"{h.reason}"</p>}
                    <p className="text-(--text-faint) text-xs mt-0.5">
                      {h.created_at
                        ? new Date(h.created_at).toLocaleString("en-GB", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })
                        : "—"}
                    </p>
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

export default function MySubmissionsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  // Client-side guard: only editors can access this page
  useEffect(() => {
    if (!authLoading && profile && profile.role !== "editor") {
      router.replace("/");
    }
  }, [authLoading, profile, router]);

  const [movies, setMovies] = useState<PendingMovieForApproval[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "all">("all");

  const fetchMovies = useCallback(async () => {
    setLoading(true);
    try {
      // Exclude approved — editors see those in the main catalog
      const status = statusFilter === "all" ? undefined : statusFilter;
      const { data, count } = await getPendingMovies({
        status: status ?? "all",
        search: search || undefined,
        limit: 10000,
        offset: 0,
      });
      // For editors, filter out approved so the page stays focused on actionable items
      const isEditorOnly = profile?.role === "editor";
      const filtered = isEditorOnly
        ? data.filter(m => m.approval_status !== "approved")
        : data;
      setMovies(filtered);
      setTotalCount(isEditorOnly ? filtered.length : count);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, profile?.role]);

  useEffect(() => { fetchMovies(); }, [fetchMovies]);

  const handleResubmit = (movieId: string) => {
    setMovies(prev =>
      prev.map(m => m.id === movieId ? { ...m, approval_status: "pending" as ApprovalStatus } : m)
    );
  };

  const pendingCount = movies.filter(m => m.approval_status === "pending").length;
  const rejectedCount = movies.filter(m => m.approval_status === "rejected").length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <SendHorizonal className="h-8 w-8 text-yellow-400" />
            My Submissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Track the approval status of movies you&apos;ve submitted. Fix rejected movies and resubmit.
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          {pendingCount > 0 && (
            <Badge className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 text-sm px-3 py-1.5 h-fit">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              {pendingCount} pending
            </Badge>
          )}
          {rejectedCount > 0 && (
            <Badge className="bg-red-500/10 text-red-400 border border-red-500/25 text-sm px-3 py-1.5 h-fit">
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              {rejectedCount} rejected
            </Badge>
          )}
        </div>
      </div>

      {/* Info banner for pending */}
      {pendingCount > 0 && statusFilter !== "rejected" && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-start gap-3">
          <Clock className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-300">
            {pendingCount} movie{pendingCount > 1 ? "s are" : " is"} awaiting legal review. You&apos;ll be able to see{" "}
            {pendingCount > 1 ? "them" : "it"} in the main catalog once approved.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 bg-slate-950/40 border-slate-700/50 text-(--text)"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ApprovalStatus | "all")}>
          <SelectTrigger className="h-9 w-44 bg-slate-950/40 border-slate-700/50 text-(--text)">
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



      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="h-6 w-6 animate-spin" /> Loading submissions…
        </div>
      ) : movies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-slate-700/60">
          <CheckCircle className="h-12 w-12 text-green-400/40 mb-4" />
          <h3 className="font-bold text-xl text-(--text)">
            {statusFilter === "rejected" ? "No rejected movies" : "Nothing pending"}
          </h3>
          <p className="text-(--text-faint) text-sm mt-2">
            {statusFilter === "rejected"
              ? "Great — no movies were rejected."
              : "All your submissions have been approved, or you haven't added any yet."}
          </p>
          <Link href="/movies/new" className="mt-4">
            <Button size="sm" variant="outline" className="gap-2">
              <Film className="h-4 w-4" /> Add a Movie
            </Button>
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
  );
}
