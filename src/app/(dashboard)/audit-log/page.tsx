"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, Loader2, ChevronDown, ChevronRight, Search, X, FilePlus, FilePen, Trash2 } from "lucide-react";
import { useAppToast } from "@/hooks/use-app-toast";
import { format, formatDistanceToNow } from "date-fns";
import { getAuditLogs, getAuditLogStats } from "@/lib/api/audit";
import { EnhancedStatsCard } from "@/components/dashboard/enhanced-stats-card";
import type { AuditLogEntry } from "@/lib/types/database";

const selectCls = "bg-slate-950/40 border-slate-700/50 text-slate-300 h-9";
const inputCls  = "bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-500 focus:border-slate-500 h-9";

// ── Human-readable field labels ──────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  title: "Title", production_no: "Production No.", source: "Source",
  release_date: "Release Date", release_year: "Release Year",
  certification: "Certification", language: "Language",
  production_house_name: "Production House", color_or_bw: "Color / B&W",
  trailer_link: "Trailer Link", poster_url: "Poster",
  assignor_licensor: "Assignor / Licensor", licensee: "Licensee",
  agreement_date: "Agreement Date", agreement_start_date: "Agreement Start",
  agreement_end_date: "Agreement End",
  internet_rights_classification: "Internet Rights",
  prequel_sequel_rights: "Prequel / Sequel Rights", character_rights: "Character Rights",
  subtitling_rights: "Subtitling Rights", dubbing_rights: "Dubbing Rights",
  nature_of_rights: "Nature of Rights", territory: "Territory",
  remarks: "Remarks", actionables: "Actionables",
  wtp_library: "WTP / Library", revenue_share: "Revenue Share",
  joint_prod_buy_back_date: "Buy-Back Date", recensor_flag: "Censor Flag",
  approval_status: "Approval Status", created_by: "Created By",
  full_name: "Full Name", email: "Email", role: "Role",
  department: "Department", is_active: "Active", employee_id: "Employee ID",
  name: "Name", start_date: "Start Date", end_date: "End Date",
  platform_id: "Platform",
  license_type: "License Type", is_current: "Is Current",
  movie_id: "Movie ID", person_id: "Person ID",
  movie_title: "Movie", person_name: "Person", billing_order: "Billing Order",
};

// ── Table display names ──────────────────────────────────────
const TABLE_NAMES: Record<string, string> = {
  movies: "Movie", platform_rights: "Right",
  user_profiles: "User", people: "Person", platforms: "Platform",
  production_houses: "Production House", saved_reports: "Report",
  movie_people: "Cast / Crew",
};

// ── Skip internal / noisy fields in diff ────────────────────
const SKIP_FIELDS = new Set([
  "id", "created_at", "updated_at", "code",
  // Skip raw UUID fields when enriched name fields are present
  "movie_id", "person_id",
]);

// ── Format a single value for display ───────────────────────
function formatVal(key: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  // Looks like a UUID — shorten it
  if (typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(val))
    return val.slice(0, 8) + "…";
  // Date fields
  if (typeof val === "string" && (key.includes("date") || key.includes("_at")) && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    try { return format(new Date(val), "dd MMM yyyy"); } catch { /* fall through */ }
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

// ── Build a human summary for a log entry ───────────────────
function buildSummary(log: AuditLogEntry): string {
  const table = TABLE_NAMES[log.table_name] || log.table_name;
  const vals = (log.new_values || log.old_values || {}) as Record<string, unknown>;

  // Cast/crew linkage
  if (log.table_name === "movie_people") {
    const person = vals.person_name as string | undefined;
    const movie  = vals.movie_title  as string | undefined;
    const role   = vals.role         as string | undefined;
    const who = person ? `"${person}"` : "Person";
    const where = movie ? ` in "${movie}"` : "";
    const as_ = role ? ` as ${role}` : "";
    if (log.action === "INSERT") return `Linked ${who}${as_}${where}`;
    if (log.action === "DELETE") return `Removed ${who}${as_}${where}`;
    return `Updated cast/crew${where}`;
  }

  const name = (vals.title || vals.name || vals.full_name) as string | null;
  if (log.action === "INSERT") return name ? `Created ${table}: "${name}"` : `Created ${table}`;
  if (log.action === "DELETE") return name ? `Deleted ${table}: "${name}"` : `Deleted ${table}`;

  // UPDATE — list changed fields
  if (log.action === "UPDATE" && log.old_values && log.new_values) {
    const changed = Object.keys(log.new_values).filter(
      k => !SKIP_FIELDS.has(k) && JSON.stringify(log.old_values![k]) !== JSON.stringify(log.new_values![k])
    );
    if (changed.length === 0) return `Updated ${table}`;
    const labels = changed.slice(0, 3).map(k => FIELD_LABELS[k] || k).join(", ");
    return `Updated ${table}${name ? ` "${name}"` : ""} — ${labels}${changed.length > 3 ? ` +${changed.length - 3} more` : ""}`;
  }
  return `${log.action} on ${table}`;
}

// ── Diff panel for UPDATE ─────────────────────────────────────
function DiffPanel({ log }: { log: AuditLogEntry }) {
  if (log.action === "UPDATE" && log.old_values && log.new_values) {
    const changed = Object.keys({ ...log.old_values, ...log.new_values }).filter(
      k => !SKIP_FIELDS.has(k) && JSON.stringify(log.old_values![k]) !== JSON.stringify(log.new_values![k])
    );
    if (changed.length === 0) return <p className="text-xs text-slate-500 italic">No field changes detected.</p>;
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Changed Fields</p>
        {changed.map(k => (
          <div key={k} className="grid grid-cols-[140px_1fr_1fr] gap-2 items-start text-xs">
            <span className="text-slate-400 font-medium truncate">{FIELD_LABELS[k] || k}</span>
            <span className="text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5 break-all">
              {formatVal(k, log.old_values![k])}
            </span>
            <span className="text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5 break-all">
              {formatVal(k, log.new_values![k])}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (log.action === "INSERT" && log.new_values) {
    const fields = Object.entries(log.new_values).filter(([k]) => !SKIP_FIELDS.has(k) && log.new_values![k] !== null && log.new_values![k] !== "");
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Created With</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {fields.map(([k, v]) => (
            <div key={k} className="flex items-start gap-2 text-xs">
              <span className="text-slate-500 shrink-0 min-w-27.5">{FIELD_LABELS[k] || k}</span>
              <span className="text-slate-300 break-all">{formatVal(k, v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (log.action === "DELETE" && log.old_values) {
    const fields = Object.entries(log.old_values).filter(([k]) => !SKIP_FIELDS.has(k) && log.old_values![k] !== null && log.old_values![k] !== "");
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Deleted Record</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {fields.map(([k, v]) => (
            <div key={k} className="flex items-start gap-2 text-xs">
              <span className="text-slate-500 shrink-0 min-w-27.5">{FIELD_LABELS[k] || k}</span>
              <span className="text-red-300/80 line-through break-all">{formatVal(k, v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

const actionCfg: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  INSERT: { label: "Create", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", icon: FilePlus },
  UPDATE: { label: "Update", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30",       icon: FilePen  },
  DELETE: { label: "Delete", cls: "bg-red-500/20 text-red-300 border-red-500/30",           icon: Trash2   },
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ totalEvents: 0, eventsToday: 0, eventsThisWeek: 0 });
  const [tableFilter, setTableFilter]   = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const pageSize = 50;
  const toast = useAppToast();

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const { data, count } = await getAuditLogs({
        tableName:  tableFilter  !== "all" ? tableFilter  : undefined,
        action:     actionFilter !== "all" ? actionFilter : undefined,
        dateFrom:   dateFrom || undefined,
        dateTo:     dateTo   || undefined,
        limit:  pageSize,
        offset: page * pageSize,
      });
      setLogs(data); setTotalCount(count);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally { setLoading(false); }
  }, [tableFilter, actionFilter, dateFrom, dateTo, page]);

  useEffect(() => { fetchLogs(); getAuditLogStats().then(setStats).catch(() => {}); }, [fetchLogs]);

  const clearFilters = () => {
    setTableFilter("all"); setActionFilter("all");
    setDateFrom(""); setDateTo(""); setPage(0);
  };
  const hasFilters = tableFilter !== "all" || actionFilter !== "all" || dateFrom || dateTo;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6 min-w-0">
      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-linear-to-r from-slate-500 via-slate-400 to-transparent" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-slate-600/6 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="p-3 rounded-xl bg-slate-700/40 border border-slate-600/40 shadow-lg">
            <History className="h-6 w-6 text-slate-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-linear-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Audit Log
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">Full history of every data change across the system</p>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-3">
          <EnhancedStatsCard title="Total Events"  value={stats.totalEvents}    description="All recorded changes"   icon={History} accentColor="#3b82f6" />
          <EnhancedStatsCard title="Today"         value={stats.eventsToday}    description="Changes today"          icon={History} accentColor="#10b981" />
          <EnhancedStatsCard title="This Week"     value={stats.eventsThisWeek} description="Changes in last 7 days" icon={History} accentColor="#f59e0b" />
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <Search className="h-4 w-4 text-slate-500 shrink-0" />
          <Select value={tableFilter} onValueChange={(v) => { setTableFilter(v); setPage(0); }}>
            <SelectTrigger className={`${selectCls} w-44`}><SelectValue placeholder="All Tables" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tables</SelectItem>
              {Object.entries(TABLE_NAMES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
            <SelectTrigger className={`${selectCls} w-36`}><SelectValue placeholder="All Actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="INSERT">Create</SelectItem>
              <SelectItem value="UPDATE">Update</SelectItem>
              <SelectItem value="DELETE">Delete</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className={`${inputCls} w-38`} />
          <span className="text-slate-600 text-xs">to</span>
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className={`${inputCls} w-38`} />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}
              className="h-9 px-3 text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 gap-1">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <span className="ml-auto text-xs text-slate-500 shrink-0">
            {loading ? "Loading…" : `${totalCount.toLocaleString()} event${totalCount !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* ── Log entries ── */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl shadow-xl overflow-hidden">
        {/* Column header */}
        <div className="hidden md:grid grid-cols-[160px_180px_90px_100px_1fr_32px] gap-3 px-5 py-2.5 border-b border-slate-800/60 bg-slate-900/60">
          {["Time", "User", "Action", "Section", "What changed", ""].map((h) => (
            <span key={h} className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{h}</span>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            No audit log entries match your filters.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {logs.map((log) => {
              const cfg = actionCfg[log.action] ?? actionCfg.UPDATE;
              const ActionIcon = cfg.icon;
              const summary = buildSummary(log);
              const hasDetails = !!(log.old_values || log.new_values);
              const isOpen = expandedRow === log.id;
              const changedCount = log.action === "UPDATE" && log.old_values && log.new_values
                ? Object.keys(log.new_values).filter(
                    k => !SKIP_FIELDS.has(k) && JSON.stringify(log.old_values![k]) !== JSON.stringify(log.new_values![k])
                  ).length
                : 0;

              return (
                <div key={log.id} className="group">
                  {/* ── Row ── */}
                  <div
                    className={`grid md:grid-cols-[160px_180px_90px_100px_1fr_32px] gap-3 items-center px-5 py-3 transition-colors ${hasDetails ? "cursor-pointer hover:bg-slate-800/30" : ""} ${isOpen ? "bg-slate-800/30" : ""}`}
                    onClick={() => hasDetails && setExpandedRow(isOpen ? null : log.id)}
                  >
                    {/* Time */}
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 tabular-nums whitespace-nowrap">
                        {log.created_at ? format(new Date(log.created_at), "dd MMM yy, HH:mm") : "—"}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {log.created_at ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true }) : ""}
                      </p>
                    </div>

                    {/* User */}
                    <div className="hidden md:block min-w-0">
                      <p className="text-sm text-slate-200 truncate">{log.user_full_name || "System"}</p>
                      {log.user_email && <p className="text-[10px] text-slate-500 truncate">{log.user_email}</p>}
                    </div>

                    {/* Action badge */}
                    <div className="hidden md:flex items-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls}`}>
                        <ActionIcon className="h-2.5 w-2.5" />
                        {cfg.label}
                      </span>
                    </div>

                    {/* Section (table) */}
                    <div className="hidden md:block">
                      <span className="text-xs text-slate-400">{TABLE_NAMES[log.table_name] || log.table_name}</span>
                    </div>

                    {/* Summary */}
                    <div className="min-w-0 flex items-center gap-2">
                      {/* Mobile: show action badge inline */}
                      <span className={`md:hidden inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${cfg.cls}`}>
                        <ActionIcon className="h-2 w-2" />{cfg.label}
                      </span>
                      <p className="text-sm text-slate-300 truncate">{summary}</p>
                      {changedCount > 0 && (
                        <span className="shrink-0 text-[10px] text-slate-500 bg-slate-800/60 border border-slate-700/40 rounded px-1.5 py-0.5">
                          {changedCount} field{changedCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {/* Expand toggle */}
                    <div className="hidden md:flex items-center justify-center">
                      {hasDetails && (
                        <ChevronRight className={`h-3.5 w-3.5 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      )}
                    </div>
                  </div>

                  {/* ── Expanded diff ── */}
                  {isOpen && hasDetails && (
                    <div className="px-5 pb-5 pt-1 bg-slate-900/60 border-t border-slate-800/40 animate-in fade-in slide-in-from-top-1 duration-150">
                      <DiffPanel log={log} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800/60 bg-slate-900/40">
            <p className="text-xs text-slate-500">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount.toLocaleString()}
            </p>
            <div className="flex gap-2 items-center">
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="h-7 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-30">
                Previous
              </Button>
              <span className="text-xs text-slate-500">{page + 1} / {totalPages}</span>
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * pageSize >= totalCount}
                className="h-7 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-30">
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
