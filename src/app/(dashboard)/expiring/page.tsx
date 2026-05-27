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
  const [tabPages, setTabPages] = useState<Record<string, number>>({ all: 0, critical: 0, urgent: 0, upcoming: 0 });
  const setTabPage = (tab: string, p: number) => setTabPages((prev) => ({ ...prev, [tab]: p }));

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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-700/50 text-slate-400 border border-slate-600/30">
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

  return (
    <div className="space-y-6 min-w-0">
      {/* ── Cinematic Header ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-red-600 via-amber-500 to-transparent" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-red-600/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 left-1/3 w-48 h-48 bg-amber-500/6 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 shadow-lg shadow-red-500/10">
              <Clock className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Expiring Rights
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">Monitor and manage rights approaching expiration</p>
            </div>
          </div>
          <Button
            onClick={exportToExcel}
            disabled={filteredRights.length === 0}
            className="bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 shadow-lg gap-2"
            size="sm"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        {/* ── Stat Cards ── */}
        <div className="relative mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Critical (0–7d)", count: criticalRights.length, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            { label: "Urgent (8–30d)", count: urgentRights.length, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
            { label: "Upcoming (31d+)", count: upcomingRights.length, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
            { label: "Total in Period", count: filteredRights.length, color: "text-slate-300", bg: "bg-slate-800/60 border-slate-700/40" },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg border px-4 py-3 ${s.bg}`}>
              <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.count}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Alert Banners ── */}
      {criticalRights.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300">Critical: {criticalRights.length} rights expiring within 7 days</p>
            <p className="text-xs text-red-400/70 mt-0.5">Immediate action required to prevent rights lapse.</p>
          </div>
        </div>
      )}
      {urgentRights.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 backdrop-blur-sm">
          <Bell className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Urgent: {urgentRights.length} rights expiring within 30 days</p>
            <p className="text-xs text-amber-400/70 mt-0.5">Please review and take action soon.</p>
          </div>
        </div>
      )}

      {/* ── Date Range Pills ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl p-4 shadow-xl">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-2 flex-wrap">
            {(["7d", "30d", "60d", "90d", "1y", "all", "custom"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                  activeFilter === f
                    ? "bg-red-600/20 border-red-500/50 text-red-300 shadow-sm"
                    : "bg-slate-800/40 border-slate-700/40 text-slate-400 hover:text-slate-300 hover:border-slate-600/50"
                )}
              >
                {dateFilterLabels[f]}
              </button>
            ))}
          </div>

          {activeFilter === "custom" && (
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal h-9 bg-slate-950/40 border-slate-700/50 text-slate-200", !customFromDate && "text-slate-500")}>
                      <Calendar className="mr-2 h-4 w-4" />
                      {customFromDate ? format(customFromDate, "PP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="single" selected={customFromDate} onSelect={setCustomFromDate} captionLayout="dropdown" startMonth={new Date(2000, 0)} endMonth={new Date(2050, 11)} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal h-9 bg-slate-950/40 border-slate-700/50 text-slate-200", !customToDate && "text-slate-500")}>
                      <Calendar className="mr-2 h-4 w-4" />
                      {customToDate ? format(customToDate, "PP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single" selected={customToDate} onSelect={setCustomToDate}
                      captionLayout="dropdown" startMonth={new Date(2000, 0)} endMonth={new Date(2050, 11)}
                      defaultMonth={customFromDate ? new Date(customFromDate.getFullYear(), customFromDate.getMonth() + 1, 1) : undefined}
                      disabled={(date) => {
                        if (!customFromDate) return false;
                        return new Date(date.getFullYear(), date.getMonth(), date.getDate()) < new Date(customFromDate.getFullYear(), customFromDate.getMonth(), customFromDate.getDate());
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Rights Type + Secondary Filters ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl p-4 shadow-xl space-y-3">
        {/* Rights type pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pr-1">Rights Type:</span>
          {rightsTypeConfig.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setRightsTypeFilter(value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                rightsTypeFilter === value
                  ? "bg-red-600/20 border-red-500/50 text-red-300 shadow-sm"
                  : "bg-slate-800/40 border-slate-700/40 text-slate-400 hover:text-slate-300 hover:border-slate-600/50"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Search + platform + subtype + sort */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative min-w-[200px] flex-1 max-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search movie or platform…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-500 text-sm"
            />
          </div>

          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm w-50">
              <SelectValue placeholder="All Platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {platforms.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="font-medium">{p.name}</span>
                  {p.platform_type && <span className="text-slate-400 ml-2 text-xs">— {p.platform_type}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {rightsTypeFilter !== "all" && subTypeOptions.length > 0 && (
            <Select value={subTypeFilter} onValueChange={setSubTypeFilter}>
              <SelectTrigger className="h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm w-[180px]">
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

          <Select
            value={sortConfig ? `${sortConfig.column}:${sortConfig.direction}` : "days_until_expiry:asc"}
            onValueChange={(v) => {
              const [col, dir] = v.split(":");
              if (sortConfig?.column === col && sortConfig?.direction === dir) return;
              if (sortConfig?.column !== col) requestSort(col);
              if (sortConfig?.column === col && sortConfig?.direction !== dir) requestSort(col);
            }}
          >
            <SelectTrigger className="h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm w-[200px]">
              <SelectValue placeholder="Sort by…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="days_until_expiry:asc">Days Left (Soonest)</SelectItem>
              <SelectItem value="days_until_expiry:desc">Days Left (Latest)</SelectItem>
              <SelectItem value="movie_title:asc">Movie A–Z</SelectItem>
              <SelectItem value="movie_title:desc">Movie Z–A</SelectItem>
              <SelectItem value="platform_name:asc">Platform A–Z</SelectItem>
              <SelectItem value="end_date:asc">End Date (Earliest)</SelectItem>
              <SelectItem value="end_date:desc">End Date (Latest)</SelectItem>
            </SelectContent>
          </Select>

          {hasSecondaryFilters && (
            <Button
              variant="ghost" size="sm"
              className="h-9 gap-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              onClick={() => { setPlatformFilter("all"); setSubTypeFilter("all"); setSearchQuery(""); }}
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>



      {/* ── Tabbed Table ── */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="bg-slate-900/60 border border-slate-800/60 p-0 h-auto rounded-lg">
          {[
            { value: "all", label: "All", count: sortedFiltered.length, color: "" },
            { value: "critical", label: "Critical", count: criticalRights.length, color: "text-red-400" },
            { value: "urgent", label: "Urgent", count: urgentRights.length, color: "text-amber-400" },
            { value: "upcoming", label: "Upcoming", count: upcomingRights.length, color: "" },
          ].map(({ value, label, count, color }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-all border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:text-red-400 data-[state=active]:bg-transparent text-slate-400 hover:text-slate-300",
                color
              )}
            >
              {label} <span className="ml-1.5 text-xs opacity-70">({count})</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {(["all", "critical", "urgent", "upcoming"] as const).map((tab) => {
          const tabRights = tab === "all" ? sortedFiltered : tab === "critical" ? criticalRights : tab === "urgent" ? urgentRights : upcomingRights;
          const currentPage = tabPages[tab] ?? 0;
          const paginated = tabRights.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

          return (
            <TabsContent key={tab} value={tab}>
              <div className="relative overflow-hidden rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl shadow-xl">
                <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-200">Expiring Rights</span>
                  </div>
                  <span className="text-xs text-slate-500">{tabRights.length} rights</span>
                </div>

                {tabRights.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CheckCircle className="h-12 w-12 text-emerald-500/60 mb-4" />
                    <p className="text-base font-medium text-slate-300">No expiring rights</p>
                    <p className="text-sm text-slate-500 mt-1">All rights in this category are up to date</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-800/60 hover:bg-transparent">
                          <SortableHeader column="movie_title" label="Movie" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-500" />
                          <SortableHeader column="movie_source" label="Source" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-500" />
                          <SortableHeader column="platform_name" label="Platform" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-500" />
                          <SortableHeader column="rights_type_name" label="Type" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-500" />
                          <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nature</TableHead>
                          <SortableHeader column="start_date" label="Start Date" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-500" />
                          <SortableHeader column="end_date" label="Expiry" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-500" />
                          <SortableHeader column="days_until_expiry" label="Days" currentSort={sortConfig} onSort={requestSort} className="text-[10px] font-bold uppercase tracking-widest text-slate-500" />
                          <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Territory</TableHead>
                          <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginated.map((right) => (
                          <TableRow
                            key={right.id}
                            className={cn("border-slate-800/40 hover:bg-slate-800/30 transition-colors", getUrgencyRowClass(right.days_until_expiry))}
                          >
                            <TableCell className="min-w-40">
                              <Link href={`/movies/${right.movie_id}`} className="font-medium text-slate-200 hover:text-red-400 transition-colors truncate block max-w-50">
                                {right.movie_title}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap",
                                right.movie_source === "home_production"
                                  ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                                  : "bg-violet-500/15 text-violet-400 border-violet-500/30"
                              )}>
                                {right.movie_source === "home_production" ? "Home" : "Acquired"}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-slate-300 text-sm">
                              {right.platform_name || <span className="text-slate-500">—</span>}
                            </TableCell>
                            <TableCell>
                              {right.rights_type_name ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
                                  {right.rights_type_name.toLowerCase().includes("satellite") ? <Tv className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                                  {right.rights_type_name}
                                </span>
                              ) : <span className="text-slate-500">—</span>}
                            </TableCell>
                            <TableCell>
                              {right.nature ? (
                                <span className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap",
                                  right.nature === "exclusive"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                    : "bg-slate-700/40 text-slate-400 border-slate-600/30"
                                )}>
                                  {right.nature === "exclusive" ? "Exclusive" : right.nature === "non_exclusive" ? "Non-Exclusive" : right.nature}
                                </span>
                              ) : <span className="text-slate-500">—</span>}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-slate-400 text-sm">
                              {right.start_date ? format(new Date(right.start_date), "dd MMM yy") : <span className="text-slate-500">—</span>}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-slate-400 text-sm">
                              {right.end_date ? format(new Date(right.end_date), "dd MMM yy") : <span className="text-slate-500">—</span>}
                            </TableCell>
                            <TableCell>{getUrgencyBadge(right.days_until_expiry)}</TableCell>
                            <TableCell className="whitespace-nowrap text-slate-400 text-sm">{right.territory || "World"}</TableCell>
                            <TableCell className="text-right">
                              <RoleGate action="edit" resource="right">
                                <div className="flex justify-end gap-0.5">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" asChild aria-label="Edit right">
                                        <Link href={`/rights/${right.id}/edit`}><Edit className="h-3.5 w-3.5" /></Link>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit</TooltipContent>
                                  </Tooltip>
                                  {canDelete && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10" onClick={() => setDeletingRight(right)} aria-label="Delete right">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Request Deletion</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </RoleGate>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {tabRights.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800/60">
                    <p className="text-xs text-slate-500">
                      Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, tabRights.length)} of {tabRights.length}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline" size="sm"
                        className="h-8 bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-700/50"
                        onClick={() => setTabPage(tab, currentPage - 1)}
                        disabled={currentPage === 0}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="h-8 bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-700/50"
                        onClick={() => setTabPage(tab, currentPage + 1)}
                        disabled={(currentPage + 1) * PAGE_SIZE >= tabRights.length}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

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
