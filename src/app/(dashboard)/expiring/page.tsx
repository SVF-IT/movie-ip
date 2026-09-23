"use client";

import { DisabledActionButton } from "@/components/disabled-action-button";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ColumnFilter,
  FilterableHead,
  SortableFilterableHead,
} from "@/components/ui/column-header-filter";
import { SortableHeader } from "@/components/ui/sortable-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/auth-context";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { getExpiringRights } from "@/lib/api/movies";
import { getExpiredRightsCount } from "@/lib/api/rights";
import { submitRightChange } from "@/lib/api/pending-changes";
import { isAdminRole, isEditorRole, type ExpiringRight } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { addDays as addDaysFns, format } from "date-fns";
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  Edit,
  Globe,
  Loader2,
  Satellite,
  Search,
  Shield,
  Trash2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stringCodec, stringListCodec, useUrlFilterState } from "@/hooks/use-url-filter-state";
import { groupForType, natureKey, natureLabel, NONE_KEY } from "@/lib/utils/rights-types";
import { useAppToast } from "@/hooks/use-app-toast";

export default function ExpiringRightsPage() {
  const [expiringRights, setExpiringRights] = useState<ExpiringRight[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const { profile } = useAuth();
  const [activeFilter, setActiveFilter] = useUrlFilterState<"7d" | "30d" | "60d" | "90d" | "1y" | "all" | "custom">(
    "period",
    "1y",
    {
      encode: (v) => (v === "1y" ? null : v),
      decode: (raw) =>
        raw === "7d" || raw === "30d" || raw === "60d" || raw === "90d" || raw === "all" || raw === "custom"
          ? raw
          : "1y",
    }
  );
  const [rightsTypeFilter, setRightsTypeFilter] = useUrlFilterState<"all" | "satellite" | "internet" | "other">(
    "type",
    "all",
    {
      encode: (v) => (v === "all" ? null : v),
      decode: (raw) => (raw === "satellite" || raw === "internet" || raw === "other" ? raw : "all"),
    }
  );
  const [customFromDate, setCustomFromDate] = useUrlFilterState<Date | undefined>(
    "from",
    undefined,
    {
      encode: (v) => (v ? format(v, "yyyy-MM-dd") : null),
      decode: (raw) => {
        const d = new Date(raw);
        return isNaN(d.getTime()) ? undefined : d;
      },
    },
    (v) => !v
  );
  const [customToDate, setCustomToDate] = useUrlFilterState<Date | undefined>(
    "to",
    undefined,
    {
      encode: (v) => (v ? format(v, "yyyy-MM-dd") : null),
      decode: (raw) => {
        const d = new Date(raw);
        return isNaN(d.getTime()) ? undefined : d;
      },
    },
    (v) => !v
  );
  // Both are URL-backed so they survive navigating away and back. An empty
  // array means "no narrowing", so the default never reaches the URL and the
  // reseed effects below can still widen them without writing a param.
  const [platformFilter, setPlatformFilter] = useUrlFilterState<string[]>(
    "plat", [], stringListCodec, (v) => v.length === 0
  );
  const [subTypeFilter, setSubTypeFilter] = useUrlFilterState<string[]>(
    "subtype", [], stringListCodec, (v) => v.length === 0
  );
  // The remaining header funnels follow the same "empty means no narrowing"
  // convention, so their options can shrink as other filters narrow the rows
  // without a stale selection reading as an active filter.
  const [movieFilter, setMovieFilter] = useUrlFilterState<string[]>(
    "movie", [], stringListCodec, (v) => v.length === 0
  );
  const [statusFilter, setStatusFilter] = useUrlFilterState<string[]>(
    "status", [], stringListCodec, (v) => v.length === 0
  );
  const [natureFilter, setNatureFilter] = useUrlFilterState<string[]>(
    "nature", [], stringListCodec, (v) => v.length === 0
  );
  // A selection restored from the URL must survive the first reseed, which runs
  // as soon as the async option lists arrive.
  // The effect below clears the column filters whenever the rights group
  // changes. On mount that would wipe whatever the URL restored, so the first
  // run is always skipped — regardless of which filters the URL carried.
  const groupChangeSeen = useRef(false);
  const [searchQuery, setSearchQuery] = useUrlFilterState("q", "", stringCodec);
  // Lapsed rights are never fetched into this page — it lists upcoming expiries
  // only — so the count comes from its own head-only query and the card links
  // to Rights Management, where those rights can actually be acted on.
  const [expiredCount, setExpiredCount] = useState(0);
  const [deletingRight, setDeletingRight] = useState<ExpiringRight | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canDelete = isAdminRole(profile?.role) || isEditorRole(profile?.role);

  const handleDeleteRequest = async () => {
    if (!deletingRight || !profile) return;
    setIsDeleting(true);
    try {
      await submitRightChange(
        deletingRight.movie_id,
        "right_delete",
        deletingRight,
        profile.full_name || profile.email,
        profile.id,
        deletingRight
      );
      toast.success("Deletion request submitted for approval");
      setDeletingRight(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit deletion request");
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchExpiringRights = useCallback(async () => {
    try {
      setLoading(true);

      const today = new Date();
      let fromDate = today.toISOString().split("T")[0];
      let toDate: string | undefined = "";

      if (activeFilter === "custom") {
        if (!customFromDate || !customToDate) {
          setLoading(false);
          return;
        }
        fromDate = customFromDate.toISOString().split("T")[0];
        toDate = customToDate.toISOString().split("T")[0];
      } else if (activeFilter === "all") {
        toDate = undefined;
      } else {
        const days = activeFilter === "7d" ? 7 : activeFilter === "30d" ? 30 : activeFilter === "60d" ? 60 : activeFilter === "90d" ? 90 : 365;
        toDate = addDaysFns(today, days).toISOString().split("T")[0];
      }

      // Platform choices are derived from these rows, so the platforms table
      // no longer needs a separate round trip.
      const data = await getExpiringRights(fromDate, toDate);
      setExpiringRights(data);

      // The lapsed count mirrors the selected window: "90 days" counts rights
      // that lapsed in the last 90 days, "All" counts every lapsed right.
      let since: string | undefined;
      if (activeFilter === "custom") {
        since = customFromDate ? customFromDate.toISOString().split("T")[0] : undefined;
      } else if (activeFilter !== "all") {
        const days = activeFilter === "7d" ? 7 : activeFilter === "30d" ? 30 : activeFilter === "60d" ? 60 : activeFilter === "90d" ? 90 : 365;
        since = addDaysFns(today, -days).toISOString().split("T")[0];
      }
      setExpiredCount(await getExpiredRightsCount(since));
    } catch (err) {
      console.error("Error fetching expiring rights:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load expiring rights");
    } finally {
      setLoading(false);
    }
  }, [activeFilter, customFromDate, customToDate]);

  useEffect(() => {
    fetchExpiringRights();
  }, [fetchExpiringRights]);


  useEffect(() => {
    if (!groupChangeSeen.current) {
      groupChangeSeen.current = true;
      return;
    }
    // "No narrowing" is the empty array, so reseeding clears rather than
    // listing every option — which would otherwise bloat the URL.
    setPlatformFilter([]);
    setSubTypeFilter([]);
    setMovieFilter([]);
    setNatureFilter([]);
    // Only the rights type matters here: the choices are derived from the rows
    // in view, and "no narrowing" is the empty array either way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightsTypeFilter]);

  // Level 1 — rights group (Satellite / Internet / Other). Still a toolbar
  // dropdown, and still the outermost narrowing: every header funnel below
  // derives its choices from the rows this leaves.
  const typeFiltered = useMemo(() => expiringRights.filter((right) => {
    if (rightsTypeFilter === "all") return true;
    return groupForType(right.rights_type_name).toLowerCase() === rightsTypeFilter;
  }), [expiringRights, rightsTypeFilter]);

  const statusOf = (r: ExpiringRight) =>
    r.days_until_expiry < 0 ? "Expired"
      : r.days_until_expiry <= 90 ? "Critical"
        : r.days_until_expiry <= 270 ? "Approaching"
          : "Active";

  /**
   * One predicate per header filter. Each is applied independently so a
   * column's option list can be built from the rows the *other* filters leave
   * visible — the Excel behaviour where a funnel never offers a choice that
   * would yield zero rows, yet still shows its own unpicked siblings.
   */
  const matchSearch = useCallback((r: ExpiringRight) => {
    if (!searchQuery) return true;
    const q = searchQuery.trim().toLowerCase();
    return (r.movie_title || "").toLowerCase().startsWith(q)
      || (r.platform_name || "").toLowerCase().includes(q);
  }, [searchQuery]);
  const matchMovie = useCallback((r: ExpiringRight) =>
    movieFilter.length === 0 || movieFilter.includes(r.movie_title || ""), [movieFilter]);
  const matchSubType = useCallback((r: ExpiringRight) =>
    subTypeFilter.length === 0 || subTypeFilter.includes(r.rights_type_name || NONE_KEY), [subTypeFilter]);
  const matchPlatform = useCallback((r: ExpiringRight) =>
    platformFilter.length === 0 || platformFilter.includes(r.platform_id || NONE_KEY), [platformFilter]);
  const matchNature = useCallback((r: ExpiringRight) =>
    natureFilter.length === 0
    || natureFilter.includes(r.nature && r.nature.trim() ? natureKey(r.nature) : NONE_KEY),
  [natureFilter]);
  const matchStatus = useCallback((r: ExpiringRight) =>
    statusFilter.length === 0 || statusFilter.includes(statusOf(r)), [statusFilter]);

  /** Rows visible to a given column's funnel: everything except its own filter. */
  const rowsExcept = useCallback((skip: "movie" | "subtype" | "platform" | "nature" | "status") =>
    typeFiltered.filter((r) =>
      matchSearch(r)
      && (skip === "movie" || matchMovie(r))
      && (skip === "subtype" || matchSubType(r))
      && (skip === "platform" || matchPlatform(r))
      && (skip === "nature" || matchNature(r))
      && (skip === "status" || matchStatus(r))
    ),
  [typeFiltered, matchSearch, matchMovie, matchSubType, matchPlatform, matchNature, matchStatus]);

  const movieOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rowsExcept("movie")) if (r.movie_title) set.add(r.movie_title);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rowsExcept]);

  // Level 2 — platform type ("Satellite TV", "SVOD", …) within that group.
  const subTypeOptions = useMemo(() => {
    const set = new Set<string>();
    let hasBlank = false;
    for (const r of rowsExcept("subtype")) {
      if (r.rights_type_name) set.add(r.rights_type_name);
      else hasBlank = true;
    }
    // A right with no platform join has no type; without an option for it those
    // rows could not be found and vanished under any other pick.
    const opts = Array.from(set).sort().map((value) => ({ value, label: value }));
    return hasBlank ? [...opts, { value: NONE_KEY, label: "— Not set —" }] : opts;
  }, [rowsExcept]);

  /**
   * Level 3 — platform, built from the rows still in view rather than the whole
   * platforms table. That table holds one row per platform *per type*, so a
   * brand carried on both satellite and internet appeared twice with nothing to
   * tell the entries apart; scoping by group and type leaves one real choice.
   */
  const platformChoices = useMemo(() => {
    const byId = new Map<string, string>();
    const typeById = new Map<string, string>();
    let hasBlank = false;
    for (const r of rowsExcept("platform")) {
      if (!r.platform_id) { hasBlank = true; continue; }
      byId.set(r.platform_id, r.platform_name || "—");
      if (r.rights_type_name) typeById.set(r.platform_id, r.rights_type_name);
    }
    // The platforms table holds one row per platform *per type*, so a brand
    // carried on both satellite and internet is two records with one name.
    // Every entry is qualified by its type, not just the repeated ones, so the
    // list reads consistently rather than only explaining itself on collisions.
    const opts = Array.from(byId.entries())
      .map(([value, name]) => {
        const type = typeById.get(value);
        return { value, label: type ? `${name} — ${type}` : name };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    // Rights with no platform are reachable too, listed last.
    return hasBlank ? [...opts, { value: NONE_KEY, label: "— Not set —" }] : opts;
  }, [rowsExcept]);

  const natureOptions = useMemo(() => {
    // Keyed by the folded value, so "Non-exclusive" and "Non-Exclusive" become
    // one option rather than two that each match half the rows.
    const byKey = new Map<string, string>();
    for (const r of rowsExcept("nature")) {
      // A missing nature is a real, filterable state — skipping it left those
      // rows unreachable and silently dropped by any other pick.
      if (!r.nature || !r.nature.trim()) byKey.set(NONE_KEY, "— Not set —");
      else byKey.set(natureKey(r.nature), natureLabel(r.nature));
    }
    return Array.from(byKey.entries())
      .map(([value, label]) => ({ value, label }))
      // "Not set" belongs at the end rather than sorted among real values.
      .sort((a, b) =>
        a.value === NONE_KEY ? 1
        : b.value === NONE_KEY ? -1
        : a.label.localeCompare(b.label));
  }, [rowsExcept]);

  const statusOptions = useMemo(() => {
    const order = ["Expired", "Critical", "Approaching", "Active"];
    const set = new Set<string>();
    for (const r of rowsExcept("status")) set.add(statusOf(r));
    return order.filter((s) => set.has(s));
  }, [rowsExcept]);


  // Note: the sub-type options now shrink whenever a *sibling* filter narrows
  // the rows, so the old effect that reset the selection when that list changed
  // would wipe the pick on every interaction. The rights-group effect above
  // already clears it when the group changes — the only time the choices
  // genuinely become invalid.

  // Every filter applied — the rows the table actually lists.
  const filteredRights = useMemo(() => typeFiltered.filter((r) =>
    matchSearch(r) && matchMovie(r) && matchSubType(r)
    && matchPlatform(r) && matchNature(r) && matchStatus(r)
  ), [typeFiltered, matchSearch, matchMovie, matchSubType, matchPlatform, matchNature, matchStatus]);

  // Sorted on the raw row fields: start_date/end_date are ISO strings, which
  // useSortableTable parses as dates, and days_until_expiry is a number — so
  // all three date-ish columns order chronologically rather than as text.
  const { sortedData: sortedFiltered, sortConfig, requestSort } = useSortableTable(filteredRights);

  const criticalRights = sortedFiltered.filter((r) => r.days_until_expiry <= 7);
  const urgentRights = sortedFiltered.filter((r) => r.days_until_expiry > 7 && r.days_until_expiry <= 30);

  const exportToExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = filteredRights.map((r) => ({
      "Movie Title": r.movie_title,
      Source: r.movie_source === "home_production" ? "Home Production" : "Acquired",
      Platform: r.platform_name || "N/A",
      "Rights Type": r.rights_type_name || "N/A",
      Category: r.category || "",
      Nature: r.nature || "",
      Territory: r.territory || "World",
      "Start Date": r.start_date || "",
      "End Date": r.end_date || "",
      "Days Until Expiry": r.days_until_expiry,
      Urgency: r.days_until_expiry <= 7 ? "Critical" : r.days_until_expiry <= 30 ? "Urgent" : "Upcoming",
      Remarks: r.remarks || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String((r as Record<string, unknown>)[key] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expiring Rights");
    XLSX.writeFile(wb, `expiring-rights-${activeFilter}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // Empty means "no narrowing", so any non-empty pick is an active filter.
  // The page opens on "1 year" / "All Rights" with no column filters, so
  // "Clear all" restores exactly that rather than a blank state.
  const hasActiveFilters =
    platformFilter.length > 0 || subTypeFilter.length > 0 || movieFilter.length > 0
    || statusFilter.length > 0 || natureFilter.length > 0 || Boolean(searchQuery)
    || activeFilter !== "1y" || rightsTypeFilter !== "all";

  const clearAllFilters = () => {
    setSearchQuery("");
    setMovieFilter([]);
    setSubTypeFilter([]);
    setPlatformFilter([]);
    setNatureFilter([]);
    setStatusFilter([]);
    setRightsTypeFilter("all");
    setActiveFilter("1y");
    setCustomFromDate(undefined);
    setCustomToDate(undefined);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  const rightsTypeConfig = [
    { value: "all", label: "All Rights", icon: Shield },
    { value: "satellite", label: "Satellite", icon: Satellite },
    { value: "internet", label: "Internet / SVOD", icon: Wifi },
    { value: "other", label: "Others", icon: Globe },
  ] as const;

  const critical90 = sortedFiltered.filter((r) => r.days_until_expiry >= 0 && r.days_until_expiry <= 90);
  const approaching9mo = sortedFiltered.filter((r) => r.days_until_expiry > 90 && r.days_until_expiry <= 270);

  return (
    <div className="space-y-4 min-w-0">
      {/* ── 3 Glass Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Already Expired",
            count: expiredCount,
            desc: "View in Rights Management",
            href: "/rights?status=expired",
            iconColor: "var(--st-expired)",
            icon: <AlertTriangle className="h-5 w-5" style={{ color: "var(--st-expired)" }} />,
          },
          {
            label: "Critical ≤90 days",
            count: critical90.length,
            desc: "Expiring within 3 months",
            iconColor: "var(--st-expired)",
            icon: <Zap className="h-5 w-5" style={{ color: "var(--st-expired)" }} />,
          },
          {
            label: "Approaching ≤9 months",
            count: approaching9mo.length,
            desc: "Expiring within 9 months",
            iconColor: "var(--st-expiring)",
            icon: <Clock className="h-5 w-5" style={{ color: "var(--st-expiring)" }} />,
          },
        ].map((s) => {
          const body = (
            <>
            <div
              className="shrink-0 flex items-center justify-center rounded-[10px]"
              style={{
                width: 38,
                height: 38,
                background: `color-mix(in oklch, ${s.iconColor} 14%, transparent)`,
                border: `1px solid color-mix(in oklch, ${s.iconColor} 28%, transparent)`,
              }}
            >
              {s.icon}
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums" style={{ fontFamily: "var(--font-serif)" }}>{s.count}</div>
              <div className="text-xs font-semibold text-(--text) mt-0.5">{s.label}</div>
              <div className="text-[11px] text-(--text-faint)">{s.desc}</div>
            </div>
            </>
          );
          // Only the lapsed-rights card navigates; the others summarise rows
          // already on this page, so there is nowhere to send the user.
          return s.href ? (
            <Link key={s.label} href={s.href} className="glass-card p-5 flex items-center gap-4 transition-colors hover:bg-(--hover)">
              {body}
            </Link>
          ) : (
            <div key={s.label} className="glass-card p-5 flex items-center gap-4">
              {body}
            </div>
          );
        })}
      </div>

      {/* ── Alert Banners ── */}
      {criticalRights.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-[12px] bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300">Critical: {criticalRights.length} rights expiring within 7 days</p>
            <p className="text-xs text-red-400/70 mt-0.5">Immediate action required to prevent rights lapse.</p>
          </div>
        </div>
      )}
      {urgentRights.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-[12px] bg-amber-500/10 border border-amber-500/30 backdrop-blur-sm">
          <Bell className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Urgent: {urgentRights.length} rights expiring within 30 days</p>
            <p className="text-xs text-amber-400/70 mt-0.5">Please review and take action soon.</p>
          </div>
        </div>
      )}

      {/* ── Compact toolbar: all filters + actions in one row, matching the
             Rights Management page so both listings read the same way ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--text-faint)" />
          <Input
            placeholder="Search movie or platform…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-sm"
          />
        </div>

        {/* Expiry window */}
        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}>
          <SelectTrigger className="h-9 w-36 bg-(--bg-raise)/40 border-(--svf-border) text-(--text)">
            <SelectValue placeholder="Expiry window" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="90d">90 days</SelectItem>
            <SelectItem value="1y">1 year</SelectItem>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>

        {/* Custom date pickers — inline, only for a custom range */}
        {activeFilter === "custom" && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 gap-1.5 text-xs", !customFromDate && "text-(--text-faint)")}>
                  <Calendar className="h-3.5 w-3.5" />
                  {customFromDate ? format(customFromDate, "dd MMM yyyy") : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={customFromDate} onSelect={setCustomFromDate} captionLayout="dropdown" startMonth={new Date(2000, 0)} endMonth={new Date(2050, 11)} />
              </PopoverContent>
            </Popover>
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>→</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 gap-1.5 text-xs", !customToDate && "text-(--text-faint)")}>
                  <Calendar className="h-3.5 w-3.5" />
                  {customToDate ? format(customToDate, "dd MMM yyyy") : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single" selected={customToDate} onSelect={setCustomToDate}
                  captionLayout="dropdown" startMonth={new Date(2000, 0)} endMonth={new Date(2050, 11)}
                  defaultMonth={customFromDate ? new Date(customFromDate.getFullYear(), customFromDate.getMonth() + 1, 1) : undefined}
                  disabled={(date) => !customFromDate ? false : date < customFromDate}
                />
              </PopoverContent>
            </Popover>
          </>
        )}

        {/* Level 1 — rights group */}
        <Select value={rightsTypeFilter} onValueChange={(v) => setRightsTypeFilter(v as typeof rightsTypeFilter)}>
          <SelectTrigger className="h-9 w-36 bg-(--bg-raise)/40 border-(--svf-border) text-(--text)">
            <SelectValue placeholder="Rights type" />
          </SelectTrigger>
          <SelectContent>
            {rightsTypeConfig.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Levels 2 and 3 (platform type, platform) now live as funnels in the
            Type and Platform column headers. */}

        {hasActiveFilters && (
          <Button
            variant="ghost" size="sm"
            className="h-9 gap-1 text-(--text-faint)"
            onClick={clearAllFilters}
          >
            <X className="h-3.5 w-3.5" />Clear all
          </Button>
        )}

        <div className="flex-1" />

        {/* Actions */}
        <Button
          onClick={exportToExcel}
          disabled={filteredRights.length === 0}
          variant="outline"
          className="h-9 gap-2 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20"
          size="sm"
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* ── Table ── */}
      <div className="rounded-[14px] border border-(--svf-border) overflow-hidden overflow-x-auto" style={{ background: "var(--panel)", backdropFilter: "blur(14px)" }}>
        {sortedFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <CheckCircle className="h-10 w-10" style={{ color: "var(--st-active)", opacity: 0.5 }} />
            <p className="font-medium" style={{ color: "var(--text)" }}>No expiring rights</p>
            <p className="text-sm" style={{ color: "var(--text-faint)" }}>All rights in this category are up to date</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-(--svf-border) bg-(--bg-deep) hover:bg-(--bg-deep)">
                <SortableFilterableHead column="movie_title" label="Movie" currentSort={sortConfig} onSort={requestSort} className="min-w-45">
                  <ColumnFilter options={movieOptions} value={movieFilter} onChange={setMovieFilter} searchable searchPlaceholder="Search movie…" />
                </SortableFilterableHead>
                <FilterableHead label="Platform">
                  <ColumnFilter options={platformChoices} value={platformFilter} onChange={setPlatformFilter} searchable searchPlaceholder="Search platform…" />
                </FilterableHead>
                <FilterableHead label="Type">
                  <ColumnFilter options={subTypeOptions} value={subTypeFilter} onChange={setSubTypeFilter} />
                </FilterableHead>
                <FilterableHead label="Nature">
                  <ColumnFilter options={natureOptions} value={natureFilter} onChange={setNatureFilter} />
                </FilterableHead>
                {/* start_date / end_date are ISO strings and days_until_expiry a
                    number, so these sort chronologically, not lexically. */}
                <SortableHeader column="start_date" label="Start Date" currentSort={sortConfig} onSort={requestSort} />
                <SortableHeader column="end_date" label="End Date" currentSort={sortConfig} onSort={requestSort} />
                <SortableHeader column="days_until_expiry" label="Days" currentSort={sortConfig} onSort={requestSort} />
                <FilterableHead label="Status">
                  <ColumnFilter options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
                </FilterableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFiltered.map((right) => {
                const urgencyColor =
                  right.days_until_expiry < 0 ? "var(--st-expired)"
                  : right.days_until_expiry <= 90 ? "var(--st-expired)"
                  : right.days_until_expiry <= 270 ? "var(--st-expiring)"
                  : "var(--st-active)";
                const statusLabel = statusOf(right);
                const isPerpetual = right.end_date && (right.end_date.startsWith("3099") || right.end_date.startsWith("9999"));
                return (
                  <TableRow
                    key={right.id}
                    className="border-(--svf-border) hover:bg-(--hover) transition-colors"
                    style={{ borderLeft: `3px solid ${urgencyColor}` }}
                  >
                    {/* Movie */}
                    <TableCell className="min-w-0">
                      <Link href={`/movies/${right.movie_id}`}
                        className="block font-semibold text-sm hover:underline"
                        style={{ color: "var(--text)" }}>
                        {right.movie_title}
                      </Link>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                        {right.movie_source === "home_production" ? "Home" : "Acquired"}
                      </div>
                    </TableCell>

                    {/* Platform */}
                    <TableCell className="text-sm" style={{ color: "var(--text-dim)" }}>
                      {right.platform_name || "—"}
                    </TableCell>

                    {/* Type */}
                    <TableCell className="text-sm whitespace-nowrap" style={{ color: "var(--text-dim)" }}>
                      <span className="text-xs">{right.rights_type_name || "—"}</span>
                    </TableCell>

                    {/* Nature */}
                    <TableCell>
                      {right.nature ? (
                        <Badge variant="outline" className={cn("text-xs whitespace-nowrap",
                          right.nature === "exclusive"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                            : "bg-(--bg-raise) text-(--text-faint) border-(--svf-border-strong)"
                        )}>
                          {natureLabel(right.nature)}
                        </Badge>
                      ) : <span className="text-xs" style={{ color: "var(--text-faint)" }}>—</span>}
                    </TableCell>

                    {/* Start date */}
                    <TableCell className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--st-active)", fontFamily: "var(--font-mono)" }}>
                      {right.start_date ? format(new Date(right.start_date), "dd MMM yy") : "—"}
                    </TableCell>

                    {/* End / Expiry date */}
                    <TableCell className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {isPerpetual
                        ? <span style={{ color: "var(--st-active)", fontWeight: 600 }}>Perpetual</span>
                        : right.end_date ? format(new Date(right.end_date), "dd MMM yy") : "—"}
                    </TableCell>

                    {/* Days */}
                    <TableCell className="tabular-nums font-bold text-sm whitespace-nowrap" style={{ color: urgencyColor, fontFamily: "var(--font-mono)" }}>
                      {isPerpetual ? "∞"
                        : right.days_until_expiry < 0
                          ? `${Math.abs(right.days_until_expiry)}d ago`
                          : `${right.days_until_expiry}d`}
                    </TableCell>

                    {/* Status pill */}
                    <TableCell>
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap align-middle"
                        style={{
                          color: urgencyColor,
                          background: `color-mix(in oklch, ${urgencyColor} 13%, transparent)`,
                          border: `1px solid color-mix(in oklch, ${urgencyColor} 28%, transparent)`,
                        }}
                      >
                        {statusLabel}
                      </span>
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <RoleGate
                          action="edit"
                          resource="right"
                          fallback={
                            <DisabledActionButton size="icon" variant="ghost" className="h-7 w-7" reason="You don't have permission to edit rights.">
                              <Edit className="h-3.5 w-3.5" />
                            </DisabledActionButton>
                          }
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-amber-400 hover:bg-amber-500/10" style={{ color: "var(--text-faint)" }} asChild>
                                <Link href={`/rights/${right.id}/edit`}><Edit className="h-3.5 w-3.5" /></Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                        </RoleGate>
                        {canDelete ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-red-400 hover:bg-red-500/10" style={{ color: "var(--text-faint)" }} onClick={() => setDeletingRight(right)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Request Deletion</TooltipContent>
                          </Tooltip>
                        ) : (
                          <DisabledActionButton size="icon" variant="ghost" className="h-7 w-7" reason="You don't have permission to request deletion of rights.">
                            <Trash2 className="h-3.5 w-3.5" />
                          </DisabledActionButton>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <ConfirmDialog
        open={!!deletingRight}
        onOpenChange={(open) => !open && setDeletingRight(null)}
        onConfirm={handleDeleteRequest}
        title="Request Deletion"
        description={`Are you sure you want to request deletion of this right for "${deletingRight?.movie_title}" on "${deletingRight?.platform_name}"? This will go through the approval process.`}
        confirmText="Request Delete"
        isLoading={isDeleting}
      />
    </div>
  );
}
