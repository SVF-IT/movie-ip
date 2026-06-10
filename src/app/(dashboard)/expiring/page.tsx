"use client";

import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableHeader } from "@/components/ui/sortable-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/auth-context";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { getExpiringRights } from "@/lib/api/movies";
import { getPlatforms } from "@/lib/api/dashboard";
import { submitRightChange } from "@/lib/api/pending-changes";
import type { ExpiringRight, Platform } from "@/lib/types/database";
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
  Tv,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppToast } from "@/hooks/use-app-toast";

export default function ExpiringRightsPage() {
  const [expiringRights, setExpiringRights] = useState<ExpiringRight[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const { profile } = useAuth();
  const [activeFilter, setActiveFilter] = useState<"7d" | "30d" | "60d" | "90d" | "1y" | "all" | "custom">("1y");
  const [rightsTypeFilter, setRightsTypeFilter] = useState<"all" | "satellite" | "internet" | "other">("all");
  const [customFromDate, setCustomFromDate] = useState<Date>();
  const [customToDate, setCustomToDate] = useState<Date>();
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [subTypeFilter, setSubTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [deletingRight, setDeletingRight] = useState<ExpiringRight | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tabPages, setTabPages] = useState<Record<string, number>>({ all: 0, critical: 0, urgent: 0, upcoming: 0 });
  const setTabPage = (tab: string, p: number) => setTabPages((prev) => ({ ...prev, [tab]: p }));

  const canDelete = profile?.role === "admin" || profile?.role === "editor";

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

      const [data, plats] = await Promise.all([getExpiringRights(fromDate, toDate), getPlatforms()]);
      setExpiringRights(data);
      setPlatforms(plats);
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
    setPlatformFilter("all");
    setSubTypeFilter("all");
    setTabPages({ all: 0, critical: 0, urgent: 0, upcoming: 0 });
  }, [rightsTypeFilter]);

  useEffect(() => {
    setTabPages({ all: 0, critical: 0, urgent: 0, upcoming: 0 });
  }, [activeFilter, platformFilter, subTypeFilter, searchQuery]);

  const typeFiltered = useMemo(() => expiringRights.filter((right) => {
    if (rightsTypeFilter === "all") return true;
    const pt = (right.rights_type_name || "").toLowerCase();
    const isSat = pt.includes("satellite") || pt.includes("dth") || pt.includes("terrestrial");
    const isInternet = pt.includes("svod") || pt.includes("tvod") || pt.includes("avod") || pt.includes("fvod");
    if (rightsTypeFilter === "satellite") return isSat;
    if (rightsTypeFilter === "internet") return isInternet;
    if (rightsTypeFilter === "other") return !isSat && !isInternet;
    return true;
  }), [expiringRights, rightsTypeFilter]);

  const subTypeOptions = useMemo(() => {
    if (rightsTypeFilter === "all") return [];
    const names = new Set<string>();
    typeFiltered.forEach((r) => { if (r.rights_type_name) names.add(r.rights_type_name); });
    return Array.from(names).sort();
  }, [typeFiltered, rightsTypeFilter]);

  const filteredRights = useMemo(() => typeFiltered.filter((right) => {
    if (platformFilter !== "all" && right.platform_id !== platformFilter) return false;
    if (subTypeFilter !== "all" && right.rights_type_name !== subTypeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inTitle = (right.movie_title || "").toLowerCase().includes(q);
      const inPlatform = (right.platform_name || "").toLowerCase().includes(q);
      if (!inTitle && !inPlatform) return false;
    }
    return true;
  }), [typeFiltered, platformFilter, subTypeFilter, searchQuery]);

  const { sortedData: sortedFiltered, sortConfig, requestSort } = useSortableTable(filteredRights);

  const criticalRights = sortedFiltered.filter((r) => r.days_until_expiry <= 7);
  const urgentRights = sortedFiltered.filter((r) => r.days_until_expiry > 7 && r.days_until_expiry <= 30);
  const upcomingRights = sortedFiltered.filter((r) => r.days_until_expiry > 30);

  const PAGE_SIZE = 50;

  const getUrgencyRowClass = (days: number) => {
    if (days <= 7) return "border-l-2 border-l-red-500/70 bg-red-500/5";
    if (days <= 30) return "border-l-2 border-l-amber-500/70 bg-amber-500/5";
    return "";
  };

  const getUrgencyBadge = (days: number) => {
    if (days <= 7) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse">
        <Zap className="h-3 w-3" />{days}d
      </span>
    );
    if (days <= 30) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <Clock className="h-3 w-3" />{days}d
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-700/50 text-(--text-faint) border border-slate-600/30">
        {days}d
      </span>
    );
  };

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

  const hasSecondaryFilters = platformFilter !== "all" || subTypeFilter !== "all" || searchQuery;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  const dateFilterLabels: Record<string, string> = {
    "7d": "Next 7 Days",
    "30d": "Next 30 Days",
    "60d": "Next 60 Days",
    "90d": "Next 90 Days",
    "1y": "Next 1 Year",
    "all": "All Time",
    "custom": "Custom Range",
  };

  const rightsTypeConfig = [
    { value: "all", label: "All Rights", icon: Shield },
    { value: "satellite", label: "Satellite", icon: Satellite },
    { value: "internet", label: "Internet / SVOD", icon: Wifi },
    { value: "other", label: "Others", icon: Globe },
  ] as const;

  const alreadyExpired = expiringRights.filter((r) => r.days_until_expiry < 0);
  const critical90 = sortedFiltered.filter((r) => r.days_until_expiry >= 0 && r.days_until_expiry <= 90);
  const approaching9mo = sortedFiltered.filter((r) => r.days_until_expiry > 90 && r.days_until_expiry <= 270);

  return (
    <div className="space-y-4 min-w-0">
      {/* ── 3 Glass Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Already Expired",
            count: alreadyExpired.length,
            desc: "Rights past their end date",
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
        ].map((s) => (
          <div key={s.label} className="glass-card p-5 flex items-center gap-4">
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
          </div>
        ))}
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

      {/* ── Date Range Segmented Pills + inline custom pickers ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 glass-card p-1 rounded-[10px]">
          {(["90d", "1y", "all", "custom"] as const).map((f) => {
            const segLabels: Record<string, string> = { "90d": "90 days", "1y": "1 year", "all": "All", "custom": "Custom" };
            return (
              <button key={f} onClick={() => setActiveFilter(f)}
                className={cn("px-3.5 py-1.5 rounded-[8px] text-xs font-semibold transition-all",
                  activeFilter === f ? "bg-(--svf-accent-soft) text-(--svf-accent-bright) shadow-sm" : "text-(--text-faint) hover:text-(--text)"
                )}>
                {segLabels[f]}
              </button>
            );
          })}
        </div>

        {/* Custom date pickers — inline on same row */}
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
      </div>

      {/* ── Rights Type Filter Row + Export ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 glass-card p-1 rounded-[10px]">
          {rightsTypeConfig.filter(({ value }) => value !== "other").map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setRightsTypeFilter(value)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] text-xs font-semibold transition-all",
                rightsTypeFilter === value
                  ? "bg-(--svf-accent-soft) text-(--svf-accent-bright) shadow-sm"
                  : "text-(--text-faint) hover:text-(--text)"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-50 flex-1 max-w-70">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--text-faint)" />
          <Input
            placeholder="Search movie or platform…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-sm"
          />
        </div>

        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) text-sm w-50">
            <SelectValue placeholder="All Platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="font-medium">{p.name}</span>
                {p.platform_type && <span className="text-(--text-faint) ml-2 text-xs">— {p.platform_type}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {rightsTypeFilter !== "all" && subTypeOptions.length > 0 && (
          <Select value={subTypeFilter} onValueChange={setSubTypeFilter}>
            <SelectTrigger className="h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) text-sm w-45">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {subTypeOptions.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasSecondaryFilters && (
          <Button
            variant="ghost" size="sm"
            className="h-9 gap-1.5 text-(--text-faint) hover:text-(--text) hover:bg-slate-800/50"
            onClick={() => { setPlatformFilter("all"); setSubTypeFilter("all"); setSearchQuery(""); }}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}

        {/* Export button pushed to right */}
        <Button
          onClick={exportToExcel}
          disabled={filteredRights.length === 0}
          className="ml-auto bg-slate-800/80 hover:bg-slate-700/80 text-(--text) border border-(--svf-border)/60 shadow-sm gap-2"
          size="sm"
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* ── Table ── */}
      <div style={{ border: "1px solid var(--svf-border)", borderRadius: 14, overflow: "hidden", background: "var(--panel)", backdropFilter: "blur(14px)" }}>
        {sortedFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <CheckCircle className="h-10 w-10" style={{ color: "var(--st-active)", opacity: 0.5 }} />
            <p className="font-medium" style={{ color: "var(--text)" }}>No expiring rights</p>
            <p className="text-sm" style={{ color: "var(--text-faint)" }}>All rights in this category are up to date</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px,2fr) 1.2fr 1fr 0.9fr 0.9fr 0.8fr 0.8fr 80px",
              padding: "0 20px", height: 44, alignItems: "center",
              background: "var(--bg-deep)", borderBottom: "1px solid var(--svf-border)",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-faint)",
            }}>
              <div>Movie</div>
              <div>Platform</div>
              <div>Type</div>
              <div>Start Date</div>
              <div>End Date</div>
              <div>Days</div>
              <div>Status</div>
              <div />
            </div>

            {sortedFiltered.slice(0, (tabPages["all"] + 1) * PAGE_SIZE).map((right) => {
              const urgencyColor =
                right.days_until_expiry < 0 ? "var(--st-expired)"
                : right.days_until_expiry <= 90 ? "var(--st-expired)"
                : right.days_until_expiry <= 270 ? "var(--st-expiring)"
                : "var(--st-active)";
              const statusLabel =
                right.days_until_expiry < 0 ? "Expired"
                : right.days_until_expiry <= 90 ? "Critical"
                : right.days_until_expiry <= 270 ? "Approaching"
                : "Active";
              const isPerpetual = right.end_date && (right.end_date.startsWith("3099") || right.end_date.startsWith("9999"));
              return (
                <div
                  key={right.id}
                  className="group"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(180px,2fr) 1.2fr 1fr 0.9fr 0.9fr 0.8fr 0.8fr 80px",
                    padding: "0 20px", minHeight: 52, alignItems: "center",
                    borderBottom: "1px solid var(--svf-border)",
                    borderLeft: `3px solid ${urgencyColor}`,
                    transition: "background .15s",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--hover)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  {/* Movie */}
                  <div style={{ minWidth: 0, paddingRight: 12 }}>
                    <Link href={`/movies/${right.movie_id}`}
                      className="block font-semibold text-sm truncate hover:underline"
                      style={{ color: "var(--text)" }}>
                      {right.movie_title}
                    </Link>
                    <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                      {right.movie_source === "home_production" ? "Home" : "Acquired"}
                    </div>
                  </div>

                  {/* Platform */}
                  <div className="text-sm truncate" style={{ color: "var(--text-dim)" }}>
                    {right.platform_name || "—"}
                  </div>

                  {/* Type */}
                  <div className="text-sm" style={{ color: "var(--text-dim)" }}>
                    {right.rights_type_name ? (
                      <span className="inline-flex items-center gap-1">
                        {right.rights_type_name.toLowerCase().includes("satellite")
                          ? <Tv className="h-3 w-3 shrink-0" style={{ color: "var(--st-wtp)" }} />
                          : <Wifi className="h-3 w-3 shrink-0" style={{ color: "var(--st-open)" }} />}
                        <span className="truncate text-xs">{right.rights_type_name}</span>
                      </span>
                    ) : "—"}
                  </div>

                  {/* Start date */}
                  <div className="text-xs tabular-nums" style={{ color: "var(--st-active)", fontFamily: "var(--font-mono)" }}>
                    {right.start_date ? format(new Date(right.start_date), "dd MMM yy") : "—"}
                  </div>

                  {/* End / Expiry date */}
                  <div className="text-xs tabular-nums" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {isPerpetual
                      ? <span style={{ color: "var(--st-active)", fontWeight: 600 }}>Perpetual</span>
                      : right.end_date ? format(new Date(right.end_date), "dd MMM yy") : "—"}
                  </div>

                  {/* Days */}
                  <div className="tabular-nums font-bold text-sm" style={{ color: urgencyColor, fontFamily: "var(--font-mono)" }}>
                    {isPerpetual ? "∞"
                      : right.days_until_expiry < 0
                        ? `${Math.abs(right.days_until_expiry)}d ago`
                        : `${right.days_until_expiry}d`}
                  </div>

                  {/* Status pill */}
                  <div style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "2px 9px", borderRadius: 999,
                    fontSize: 11, fontWeight: 600,
                    color: urgencyColor,
                    background: `color-mix(in oklch, ${urgencyColor} 13%, transparent)`,
                    border: `1px solid color-mix(in oklch, ${urgencyColor} 28%, transparent)`,
                    whiteSpace: "nowrap",
                  }}>
                    {statusLabel}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <RoleGate action="edit" resource="right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-amber-400 hover:bg-amber-500/10" style={{ color: "var(--text-faint)" }} asChild>
                            <Link href={`/rights/${right.id}/edit`}><Edit className="h-3.5 w-3.5" /></Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                    </RoleGate>
                    {canDelete && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-red-400 hover:bg-red-500/10" style={{ color: "var(--text-faint)" }} onClick={() => setDeletingRight(right)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Request Deletion</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              );
            })}

            {sortedFiltered.length > (tabPages["all"] + 1) * PAGE_SIZE && (
              <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--svf-border)" }}>
                <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                  Showing {Math.min((tabPages["all"] + 1) * PAGE_SIZE, sortedFiltered.length)} of {sortedFiltered.length} rights
                </p>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setTabPage("all", (tabPages["all"] ?? 0) + 1)}>
                  Load more
                </Button>
              </div>
            )}
          </>
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
