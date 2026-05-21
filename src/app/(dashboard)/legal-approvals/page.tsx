"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import {
  approveMovie,
  getMovieApprovalHistory,
  getPendingMovies,
  rejectMovie,
  type PendingMovieForApproval,
} from "@/lib/api/approvals";
import {
  getPendingChanges,
  approvePendingChange,
  rejectPendingChange,
  type PendingChange,
} from "@/lib/api/pending-changes";
import type { ApprovalStatus, MovieApproval } from "@/lib/types/database";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Film,
  Gavel,
  GitPullRequest,
  Info,
  Loader2,
  Search,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
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
      <Clock className="h-3 w-3 mr-1" /> Pending
    </Badge>
  );
}

function HistoryEntry({ entry }: { entry: MovieApproval }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="mt-0.5">
        {entry.status === "approved" ? (
          <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
        ) : entry.status === "rejected" ? (
          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
        ) : (
          <Clock className="h-4 w-4 text-yellow-400 shrink-0" />
        )}
      </div>
      <div className="flex-1">
        <p className="text-slate-300 font-medium capitalize">{entry.status}</p>
        {entry.reviewer_name && (
          <p className="text-slate-400 text-xs">by {entry.reviewer_name}</p>
        )}
        {entry.reason && (
          <p className="text-slate-400 text-xs mt-1 italic">"{entry.reason}"</p>
        )}
        <p className="text-slate-500 text-xs mt-0.5">
          {entry.created_at
            ? new Date(entry.created_at).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </p>
      </div>
    </div>
  );
}

function MovieDetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      <span className="text-sm text-slate-300">{value}</span>
    </div>
  );
}

interface MovieCardProps {
  movie: PendingMovieForApproval;
  onApprove: (movie: PendingMovieForApproval) => void;
  onReject: (movie: PendingMovieForApproval) => void;
  isLegalOrAdmin: boolean;
}

function MovieCard({ movie, onApprove, onReject, isLegalOrAdmin }: MovieCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<MovieApproval[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  return (
    <Card className="bg-slate-900/60 border-slate-800/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/movies/${movie.id}`}
                className="font-bold text-slate-100 hover:text-red-400 transition-colors line-clamp-1"
              >
                {movie.title}
              </Link>
              <ApprovalStatusBadge status={movie.approval_status} />
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
{movie.production_no && (
                <span className="text-[10px] text-slate-400 font-mono">{movie.production_no}</span>
              )}
              <span className="text-[10px] text-slate-400">
                {movie.source === "home_production" ? "Home Production" : "Acquired"}
              </span>
              {movie.created_at && (
                <span className="text-[10px] text-slate-500">
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

          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
            {movie.approval_status === "rejected" && (
              <Link href={`/movies/${movie.id}/edit?tab=approval`}>
                <Button
                  size="sm"
                  className="bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 border border-slate-600/30 h-8 px-3"
                  variant="outline"
                >
                  Edit &amp; Resubmit
                </Button>
              </Link>
            )}
            {isLegalOrAdmin && movie.approval_status === "pending" && (
              <>
                <Button
                  size="sm"
                  onClick={() => onApprove(movie)}
                  className="bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/30 h-8 px-3"
                  variant="outline"
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  onClick={() => onReject(movie)}
                  className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 h-8 px-3"
                  variant="outline"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <MovieDetailRow label="Language" value={movie.language} />
          <MovieDetailRow label="Release Year" value={movie.release_year} />
          <MovieDetailRow label="Certification" value={movie.certification} />
          <MovieDetailRow label="Production House" value={movie.production_house_name} />
          <MovieDetailRow label="Nature of Rights" value={movie.nature_of_rights} />
          <MovieDetailRow label="Territory" value={movie.territory} />
          {movie.nature_of_rights?.toLowerCase().includes("jointly") && (
            <>
              <MovieDetailRow label="Revenue Share" value={movie.revenue_share} />
              <MovieDetailRow label="Buy-Back Date" value={movie.joint_prod_buy_back_date} />
              <MovieDetailRow label="Exploitation Rights Held By" value={movie.jointly_exploitation_rights} />
            </>
          )}
        </div>

        {(movie.cast_names || movie.director_names) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800/40">
            {movie.director_names && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Directors</span>
                <p className="text-sm text-slate-300 mt-0.5">{movie.director_names}</p>
              </div>
            )}
            {movie.cast_names && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cast</span>
                <p className="text-sm text-slate-300 mt-0.5 line-clamp-2">{movie.cast_names}</p>
              </div>
            )}
          </div>
        )}

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
                <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
              </div>
            ) : history.length === 0 ? (
              <p className="text-slate-500 text-sm flex items-center gap-2">
                <Info className="h-4 w-4" /> No approval activity yet.
              </p>
            ) : (
              history.map((h) => <HistoryEntry key={h.id} entry={h} />)
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pending Changes Card ─────────────────────────────────────────────────────

const CHANGE_TYPE_LABELS: Record<string, string> = {
  movie_fields: "Movie Fields",
  right_create: "New Right",
  right_update: "Right Update",
  right_delete: "Right Deletion",
  person_add: "Cast/Crew Add",
  person_remove: "Cast/Crew Remove",
};

function PendingChangeCard({
  change,
  isLegalOrAdmin,
  onApprove,
  onReject,
}: {
  change: PendingChange;
  isLegalOrAdmin: boolean;
  onApprove: (c: PendingChange) => void;
  onReject: (c: PendingChange) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const movieTitle = (change.movie as any)?.title || "Unknown Movie";

  const before = (change.payload.before || {}) as Record<string, unknown>;
  const after = (change.payload.after || {}) as Record<string, unknown>;
  const changedFields = change.change_type === "movie_fields"
    ? Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    : [];

  return (
    <Card className="bg-slate-900/60 border-slate-800/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-100 line-clamp-1">{movieTitle}</span>
              <Badge className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 text-[11px] font-semibold">
                <Clock className="h-3 w-3 mr-1" /> Pending
              </Badge>
              <Badge variant="outline" className="text-[11px] text-slate-400 border-slate-700/50">
                {CHANGE_TYPE_LABELS[change.change_type] || change.change_type}
              </Badge>
            </div>
            <p className="text-sm text-slate-300 mt-1">{change.change_summary}</p>
            <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-slate-500">
              {change.changed_by_name && <span>by {change.changed_by_name}</span>}
              <span>{new Date(change.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </div>

          {isLegalOrAdmin && change.status === "pending" && (
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={() => onApprove(change)}
                className="bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/30 h-8 px-3" variant="outline">
                <Check className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
              <Button size="sm" onClick={() => onReject(change)}
                className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 h-8 px-3" variant="outline">
                <X className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Field diff for movie_fields */}
        {change.change_type === "movie_fields" && changedFields.length > 0 && (
          <>
            <button onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-2">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "Hide" : "Show"} {changedFields.length} changed field{changedFields.length !== 1 ? "s" : ""}
            </button>
            {expanded && (
              <div className="rounded-lg border border-slate-800/60 overflow-hidden">
                <div className="grid grid-cols-3 gap-0 text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-1.5 bg-slate-950/40 border-b border-slate-800/60">
                  <span>Field</span><span className="text-red-400">Before</span><span className="text-emerald-400">After</span>
                </div>
                {changedFields.map(k => (
                  <div key={k} className="grid grid-cols-3 gap-0 text-xs px-3 py-2 border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                    <span className="text-slate-400 font-medium">{k.replace(/_/g, " ")}</span>
                    <span className="text-red-400 truncate pr-2">{String(before[k] ?? "—") || "—"}</span>
                    <span className="text-emerald-400 truncate">{String(after[k] ?? "—") || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Right create/update details */}
        {(change.change_type === "right_create" || change.change_type === "right_update") && (
          <>
            <button onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-2">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "Hide" : "Show"} details
            </button>
            {expanded && (
              <div className="rounded-lg border border-slate-800/60 p-3 space-y-1.5 text-xs">
                {change.change_type === "right_update" && Object.keys(before).length > 0 && (
                  <div className="rounded border border-slate-700/40 overflow-hidden mb-2">
                    <div className="grid grid-cols-3 gap-0 text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-1.5 bg-slate-950/40 border-b border-slate-800/60">
                      <span>Field</span><span className="text-red-400">Before</span><span className="text-emerald-400">After</span>
                    </div>
                    {(["platform_id","nature","start_date","end_date","territory","remarks"] as const).filter(k => {
                      const bv = (before as any)[k]; const av = (after as any)[k];
                      return bv !== av && (bv || av);
                    }).map(k => (
                      <div key={k} className="grid grid-cols-3 gap-0 text-xs px-3 py-1.5 border-b border-slate-800/40 last:border-0">
                        <span className="text-slate-400">{k.replace(/_/g," ")}</span>
                        <span className="text-red-400 truncate pr-2">{String((before as any)[k] ?? "—") || "—"}</span>
                        <span className="text-emerald-400 truncate">{String((after as any)[k] ?? "—") || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {change.change_type === "right_create" && (
                  <div className="space-y-1">
                    {(["nature","start_date","end_date","territory","remarks"] as const).filter(k => (after as any)[k]).map(k => (
                      <div key={k} className="flex gap-2">
                        <span className="text-slate-500 w-24 shrink-0">{k.replace(/_/g," ")}</span>
                        <span className="text-slate-300">{String((after as any)[k])}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Right delete */}
        {change.change_type === "right_delete" && (
          <p className="text-xs text-red-400/80 mt-1">
            This will permanently remove the right record from the movie.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LegalApprovalsPage() {
  const { profile } = useAuth();
  const isLegalOrAdmin = profile?.role === "legal" || profile?.role === "admin";

  // ── New-movie approval state ──
  const [movies, setMovies] = useState<PendingMovieForApproval[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "all">("pending");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Approve dialog (new movies)
  const [approveTarget, setApproveTarget] = useState<PendingMovieForApproval | null>(null);
  const [approving, setApproving] = useState(false);

  // Reject dialog (new movies)
  const [rejectTarget, setRejectTarget] = useState<PendingMovieForApproval | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // ── Pending changes state ──
  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [changesCount, setChangesCount] = useState(0);
  const [changesLoading, setChangesLoading] = useState(true);
  const [changesSearch, setChangesSearch] = useState("");
  const [changesStatusFilter, setChangesStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [changesPage, setChangesPage] = useState(0);

  // Approve dialog (changes)
  const [changeApproveTarget, setChangeApproveTarget] = useState<PendingChange | null>(null);
  const [changeApproving, setChangeApproving] = useState(false);

  // Reject dialog (changes)
  const [changeRejectTarget, setChangeRejectTarget] = useState<PendingChange | null>(null);
  const [changeRejectReason, setChangeRejectReason] = useState("");
  const [changeRejecting, setChangeRejecting] = useState(false);

  const fetchMovies = useCallback(async () => {
    setLoading(true);
    try {
      const { data, count } = await getPendingMovies({
        status: statusFilter,
        search: searchQuery || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      setMovies(data);
      setTotalCount(count);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load movies");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, page]);

  const fetchChanges = useCallback(async () => {
    setChangesLoading(true);
    try {
      const { data, count } = await getPendingChanges({
        status: changesStatusFilter,
        search: changesSearch || undefined,
        limit: pageSize,
        offset: changesPage * pageSize,
      });
      setChanges(data);
      setChangesCount(count);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load pending changes");
    } finally {
      setChangesLoading(false);
    }
  }, [changesStatusFilter, changesSearch, changesPage]);

  useEffect(() => { fetchMovies(); }, [fetchMovies]);
  useEffect(() => { fetchChanges(); }, [fetchChanges]);

  useEffect(() => { setPage(0); }, [searchQuery, statusFilter]);
  useEffect(() => { setChangesPage(0); }, [changesSearch, changesStatusFilter]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await approveMovie(approveTarget.id, profile?.full_name || profile?.email || "Legal", profile?.id);
      setApproveTarget(null);
      fetchMovies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      await rejectMovie(rejectTarget.id, rejectReason.trim(), profile?.full_name || profile?.email || "Legal", profile?.id);
      setRejectTarget(null);
      setRejectReason("");
      fetchMovies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setRejecting(false);
    }
  };

  const handleChangeApprove = async () => {
    if (!changeApproveTarget) return;
    setChangeApproving(true);
    try {
      await approvePendingChange(changeApproveTarget.id, profile?.full_name || profile?.email || "Legal", profile?.id);
      setChangeApproveTarget(null);
      fetchChanges();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve change");
    } finally {
      setChangeApproving(false);
    }
  };

  const handleChangeReject = async () => {
    if (!changeRejectTarget || !changeRejectReason.trim()) return;
    setChangeRejecting(true);
    try {
      await rejectPendingChange(changeRejectTarget.id, changeRejectReason.trim(), profile?.full_name || profile?.email || "Legal", profile?.id);
      setChangeRejectTarget(null);
      setChangeRejectReason("");
      fetchChanges();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject change");
    } finally {
      setChangeRejecting(false);
    }
  };

  const pendingMovieCount = statusFilter === "pending" ? totalCount : 0;
  const pendingChangesCount = changesStatusFilter === "pending" ? changesCount : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Gavel className="h-8 w-8 text-green-400" />
            Legal Approvals
          </h1>
          <p className="text-muted-foreground mt-1">
            Review new movies and pending edit requests before changes go live.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 text-sm px-3 py-1.5 h-fit">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {pendingMovieCount} new movies
          </Badge>
          <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/25 text-sm px-3 py-1.5 h-fit">
            <GitPullRequest className="h-3.5 w-3.5 mr-1.5" />
            {pendingChangesCount} edit requests
          </Badge>
        </div>
      </div>



      <Tabs defaultValue="movies" className="w-full">
        <TabsList className="bg-slate-900/60 border border-slate-800/60 p-1 h-auto">
          <TabsTrigger value="movies" className="data-[state=active]:bg-slate-800 data-[state=active]:text-slate-100 text-slate-400 gap-2">
            <Film className="h-3.5 w-3.5" />
            New Movie Approvals
            {pendingMovieCount > 0 && (
              <span className="ml-1 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingMovieCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="changes" className="data-[state=active]:bg-slate-800 data-[state=active]:text-slate-100 text-slate-400 gap-2">
            <GitPullRequest className="h-3.5 w-3.5" />
            Pending Edit Requests
            {pendingChangesCount > 0 && (
              <span className="ml-1 bg-blue-500/20 text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingChangesCount}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: New Movie Approvals ── */}
        <TabsContent value="movies" className="space-y-6 mt-6">
          <Card className="bg-slate-900/60 border-slate-800/60">
            <CardHeader className="py-4 px-6 border-b border-slate-800/40">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Film className="h-4 w-4 text-slate-400" /> Filter Movies
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search by title…" value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-9 bg-slate-950/40 border-slate-700/50 text-slate-300" />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ApprovalStatus | "all")}>
                  <SelectTrigger className="h-9 bg-slate-950/40 border-slate-700/50 text-slate-300">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
              <Loader2 className="h-6 w-6 animate-spin" /> Loading movies…
            </div>
          ) : movies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-slate-700/60">
              <CheckCircle className="h-12 w-12 text-green-400/40 mb-4" />
              <h3 className="font-bold text-xl text-slate-300">
                {statusFilter === "pending" ? "No pending approvals" : "No movies found"}
              </h3>
              <p className="text-slate-500 text-sm mt-2">
                {statusFilter === "pending" ? "All movies have been reviewed." : "Try adjusting your search or filter."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {movies.map((movie) => (
                <MovieCard key={movie.id} movie={movie} onApprove={setApproveTarget} onReject={setRejectTarget} isLegalOrAdmin={isLegalOrAdmin} />
              ))}
              {totalCount > pageSize && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-800/40">
                  <span className="text-sm text-slate-400">
                    {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-9">Previous</Button>
                    <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= totalCount} onClick={() => setPage(p => p + 1)} className="h-9">Next</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: Pending Edit Requests ── */}
        <TabsContent value="changes" className="space-y-6 mt-6">
          <Card className="bg-slate-900/60 border-slate-800/60">
            <CardHeader className="py-4 px-6 border-b border-slate-800/40">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 text-slate-400" /> Filter Edit Requests
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search by movie title or change summary…" value={changesSearch}
                    onChange={(e) => setChangesSearch(e.target.value)}
                    className="pl-10 h-9 bg-slate-950/40 border-slate-700/50 text-slate-300" />
                </div>
                <Select value={changesStatusFilter} onValueChange={(v) => setChangesStatusFilter(v as typeof changesStatusFilter)}>
                  <SelectTrigger className="h-9 bg-slate-950/40 border-slate-700/50 text-slate-300">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {changesLoading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
              <Loader2 className="h-6 w-6 animate-spin" /> Loading edit requests…
            </div>
          ) : changes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-slate-700/60">
              <GitPullRequest className="h-12 w-12 text-blue-400/40 mb-4" />
              <h3 className="font-bold text-xl text-slate-300">
                {changesStatusFilter === "pending" ? "No pending edit requests" : "No edit requests found"}
              </h3>
              <p className="text-slate-500 text-sm mt-2">
                {changesStatusFilter === "pending" ? "All edit requests have been reviewed." : "Try adjusting your search or filter."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {changes.map((change) => (
                <PendingChangeCard key={change.id} change={change} isLegalOrAdmin={isLegalOrAdmin}
                  onApprove={setChangeApproveTarget} onReject={setChangeRejectTarget} />
              ))}
              {changesCount > pageSize && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-800/40">
                  <span className="text-sm text-slate-400">
                    {changesPage * pageSize + 1}–{Math.min((changesPage + 1) * pageSize, changesCount)} of {changesCount}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={changesPage === 0} onClick={() => setChangesPage(p => p - 1)} className="h-9">Previous</Button>
                    <Button variant="outline" size="sm" disabled={(changesPage + 1) * pageSize >= changesCount} onClick={() => setChangesPage(p => p + 1)} className="h-9">Next</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Approve confirmation dialog */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-400" />
              Approve Movie
            </DialogTitle>
            <DialogDescription>
              Approving <strong>{approveTarget?.title}</strong> will make it visible in the catalog
              and included in all stats and exports.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={approving}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approving}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              Reject Movie
            </DialogTitle>
            <DialogDescription>
              Rejecting <strong>{rejectTarget?.title}</strong>. A reason is required so the
              submitter knows what to fix.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="reason">
              Reason <span className="text-red-400">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="e.g. Missing agreement dates, incorrect cast details…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={rejecting || !rejectReason.trim()}
              variant="destructive"
            >
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve change dialog */}
      <Dialog open={!!changeApproveTarget} onOpenChange={(o) => !o && setChangeApproveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-400" />
              Approve Edit Request
            </DialogTitle>
            <DialogDescription>
              Approving <strong>{changeApproveTarget?.change_summary}</strong> will apply this change immediately to the movie record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setChangeApproveTarget(null)} disabled={changeApproving}>
              Cancel
            </Button>
            <Button onClick={handleChangeApprove} disabled={changeApproving} className="bg-green-600 hover:bg-green-700 text-white">
              {changeApproving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Approve & Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject change dialog */}
      <Dialog open={!!changeRejectTarget} onOpenChange={(o) => { if (!o) { setChangeRejectTarget(null); setChangeRejectReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              Reject Edit Request
            </DialogTitle>
            <DialogDescription>
              Rejecting <strong>{changeRejectTarget?.change_summary}</strong>. The original data will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="change-reason">
              Reason <span className="text-red-400">*</span>
            </Label>
            <Textarea
              id="change-reason"
              placeholder="e.g. Incorrect dates, wrong platform selected…"
              value={changeRejectReason}
              onChange={(e) => setChangeRejectReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setChangeRejectTarget(null); setChangeRejectReason(""); }} disabled={changeRejecting}>
              Cancel
            </Button>
            <Button onClick={handleChangeReject} disabled={changeRejecting || !changeRejectReason.trim()} variant="destructive">
              {changeRejecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
