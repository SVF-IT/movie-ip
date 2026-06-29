"use client";

import { ComprehensiveCSVImportDialog } from "@/components/import-export/comprehensive-csv-import-dialog";
import type { ExportFieldDef } from "@/components/import-export/data-export-dialog";
import { BulkPostersUploadDialog } from "@/components/movies/bulk-posters-upload-dialog";
import { RoleGate } from "@/components/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { SpecialEventsBanner } from "@/components/movies/special-events-banner";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { getDistinctCertifications, getPlatforms, getRightsNatureTypes } from "@/lib/api/dashboard";
import { getBulkMoviePlatformRights, getGroupedMovies, getLanguages } from "@/lib/api/movies";
import type { ApprovalStatus, GroupedMovie, MovieLanguageVersion, Platform, PlatformRight, RightsNatureType } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import {
  Activity,
  Calendar,
  ChevronDown, ChevronLeft, ChevronRight,
  Download, Edit, ExternalLink, Film,
  Image as ImageIcon,
  Languages,
  LayoutGrid, List, Loader2, Plus, Search, Settings2, ShieldCheck,
  Upload, X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";

export default function MoviesPage() {
  const { profile } = useAuth();
  const canSeeAllStatuses = profile?.role === "admin" || profile?.role === "legal";
  const canFilterByApproval = canSeeAllStatuses || profile?.role === "editor";

  const [movies, setMovies] = useState<GroupedMovie[]>([]);
  const [allFilteredMovies, setAllFilteredMovies] = useState<GroupedMovie[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatus | "all">(
    canSeeAllStatuses ? "approved" : "all"
  );
  const [versionFilter, setVersionFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();

  const [languages, setLanguages] = useState<string[]>([]);
  const [certificationFilter, setCertificationFilter] = useState<string[]>([]);
  const [certificationOptions, setCertificationOptions] = useState<string[]>([]);
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [territoryFilter, setTerritoryFilter] = useState<string>("");
  const [natureFilter, setNatureFilter] = useState<string>("all");
  const [natureTypes, setNatureTypes] = useState<RightsNatureType[]>([]);
  const [sortBy, setSortBy] = useState<'title_asc' | 'title_desc' | 'created_at_desc' | 'release_date_asc' | 'release_date_desc'>('title_asc');
  const [agreementExpiryYear, setAgreementExpiryYear] = useState<string>("all");
  const [agreementEndFrom, setAgreementEndFrom] = useState<string>("");
  const [agreementEndTo, setAgreementEndTo] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportMovieFormat, setExportMovieFormat] = useState<"home" | "acquired">("acquired");
  const [exportWithPlatformRights, setExportWithPlatformRights] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [showBulkPostersDialog, setShowBulkPostersDialog] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [anniversaryEnabled, setAnniversaryEnabled] = useState(false);

  const currentYear = new Date().getFullYear();
  const expiryYearOptions = Array.from({ length: 12 }, (_, i) => String(currentYear - 1 + i));

  useEffect(() => {
    getLanguages().then((langs) => {
      setLanguages(langs);
      const bengali = langs.find((l) => l.toLowerCase() === 'bengali');
      if (bengali) setLanguageFilter(bengali);
    }).catch(() => { });
    getRightsNatureTypes().then(setNatureTypes).catch(() => { });
    getDistinctCertifications().then((certs) => {
      const standardCerts = ['U', 'UA', 'UA 7+', 'UA 13+', 'UA 16+', 'A', 'S'];
      const dbCerts = certs.filter(c => c !== 'U/A');
      const merged = Array.from(new Set([...standardCerts, ...dbCerts]));
      setCertificationOptions(merged);
    }).catch(() => {
      setCertificationOptions(['U', 'UA', 'UA 7+', 'UA 13+', 'UA 16+', 'A', 'S']);
    });
    // Check anniversary notification preference
    fetch('/api/notifications/preferences')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.preferences) return;
        const pref = data.preferences.find((p: any) => p.notification_type === 'anniversary_notification');
        // Show banner if: globally enabled AND user hasn't disabled it (or no preference set = default on)
        setAnniversaryEnabled(!pref || (pref.globally_enabled && pref.user_enabled));
      })
      .catch(() => { });
  }, []);

  const fetchMovies = useCallback(async () => {
    try {
      setLoading(true);

      const source = (sourceFilter === "all" || sourceFilter === "jointly_owned") ? undefined : (sourceFilter as "home_production" | "acquired" | "expired" | "bangladeshi");

      const { data: allGroupedData } = await getGroupedMovies({
        source,
        search: searchQuery || undefined,
        language: (versionFilter === "multi") ? undefined : (languageFilter !== "all" ? languageFilter : undefined),
        certification: certificationFilter.length > 0 ? certificationFilter : undefined,
        yearFrom: yearFrom ? new Date(yearFrom).getFullYear() : undefined,
        yearTo: yearTo ? new Date(yearTo).getFullYear() : undefined,
        territory: territoryFilter || undefined,
        natureOfRights: sourceFilter === "jointly_owned" ? "Jointly Owned" : (natureFilter !== "all" ? natureFilter : undefined),
        sortBy,
        approvalStatus: canFilterByApproval ? approvalFilter : "approved",
      });

      let filteredData = allGroupedData;

      if (versionFilter === "multi") {
        filteredData = filteredData.filter(m => m.total_versions > 1);
      } else if (versionFilter === "single") {
        filteredData = filteredData.filter(m => m.total_versions === 1);
      }

      if (agreementExpiryYear !== "all" && sourceFilter === "acquired") {
        const yearNum = parseInt(agreementExpiryYear);
        filteredData = filteredData.filter(m => {
          const endDate = m.primary_version?.agreement_end_date;
          if (!endDate) return false;
          return new Date(endDate).getFullYear() === yearNum;
        });
      }

      if (agreementEndFrom || agreementEndTo) {
        const from = agreementEndFrom ? new Date(agreementEndFrom) : null;
        const to = agreementEndTo ? new Date(agreementEndTo) : null;
        filteredData = filteredData.filter(m => {
          const endDate = m.primary_version?.agreement_end_date;
          // Movies with no end date (home_production, bangladeshi) are not expired — keep them
          if (!endDate) return sourceFilter !== "acquired" && sourceFilter !== "expired";
          const d = new Date(endDate);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      }

      setAllFilteredMovies(filteredData);
      setMovies(filteredData);
      setTotalCount(filteredData.length);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Error fetching movies:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load movies");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sourceFilter, versionFilter, languageFilter, certificationFilter, yearFrom, yearTo, territoryFilter, natureFilter, sortBy, agreementExpiryYear, agreementEndFrom, agreementEndTo, approvalFilter, canFilterByApproval]);

  useEffect(() => { fetchMovies(); }, [fetchMovies]);

  const handleSourceChange = (value: string) => {
    setSourceFilter(value);
    if (value === "home_production" || value === "expired" || value === "jointly_owned" || value === "bangladeshi") {
      setAgreementExpiryYear("all");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === movies.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(movies.map(m => m.production_no)));
  };

  const exportMovies = selectedIds.size > 0
    ? allFilteredMovies.filter(m => selectedIds.has(m.production_no))
    : allFilteredMovies;

  const handleExportXlsx = async () => {
    setExportingXlsx(true);
    try {
      type RightWithPlatform = PlatformRight & { category?: string | null; is_current?: boolean; platforms?: { name?: string; platform_type?: string } };

      // Collect versions matching the selected format
      const versions: MovieLanguageVersion[] = [];
      for (const group of exportMovies) {
        const vs: MovieLanguageVersion[] = group.versions?.length
          ? group.versions
          : group.primary_version ? [group.primary_version] : [];
        for (const v of vs) {
          if (exportMovieFormat === "home" && v.source !== "home_production") continue;
          if (exportMovieFormat === "acquired" && v.source !== "acquired") continue;
          versions.push(v);
        }
      }

      const fmtDate = (d: string | null | undefined) => {
        if (!d) return null;
        if (d === "3099-12-31") return "Perpetual";
        return d;
      };

      // ── Flat export (no platform rights) ─────────────────────────────────────
      if (!exportWithPlatformRights) {
        const fields = exportMovieFormat === "home" ? HOME_EXPORT_FIELDS : ACQUIRED_META_FIELDS;
        const rows = versions.map(v => {
          const row: Record<string, unknown> = {};
          for (const f of fields) {
            const val = f.getter ? f.getter(v as unknown as Record<string, unknown>) : (v as unknown as Record<string, unknown>)[f.key];
            const strVal = val != null && val !== "" ? String(val) : null;
            row[f.label] = strVal ? fmtDate(strVal) : null;
          }
          return row;
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, exportMovieFormat === "home" ? "Home" : "Acquired");
        XLSX.writeFile(wb, `movies_${exportMovieFormat}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        setShowExportDialog(false);
        return;
      }

      // ── With platform rights: 3-row header (home) or 4-row header (acquired) ─
      const allPlatforms = await getPlatforms();
      const movieIds = versions.map(v => v.id);
      const rightsMap = await getBulkMoviePlatformRights(movieIds);
      const allRights = Object.values(rightsMap).flat() as RightWithPlatform[];

      const SAT_TYPES = ["Satellite TV", "DTH VOD", "Terrestrial TV"];
      const INTERNET_TYPES = ["SVOD", "TVOD", "AVOD", "FVOD"];

      interface SlotGroup { type: string; isHistory: boolean; label: string; banner: string | null }

      const presentKeys = new Set(allRights.map(r => `${r.platforms?.platform_type ?? "Other"}|${r.is_current === false ? "hist" : "curr"}`));
      const slotGroups: SlotGroup[] = [];
      const addGroup = (type: string, banner: string | null) => {
        if (presentKeys.has(`${type}|curr`)) slotGroups.push({ type, isHistory: false, label: type, banner });
        if (presentKeys.has(`${type}|hist`)) slotGroups.push({ type, isHistory: true, label: `${type} History`, banner });
      };
      SAT_TYPES.forEach(t => addGroup(t, "SATELLITE RIGHTS"));
      INTERNET_TYPES.forEach(t => addGroup(t, "INTERNET RIGHTS"));
      const knownTypes = new Set([...SAT_TYPES, ...INTERNET_TYPES]);
      const otherTypeSet = new Set(allRights.map(r => r.platforms?.platform_type ?? "Other").filter(t => !knownTypes.has(t)));
      otherTypeSet.forEach(t => addGroup(t, null));

      const platformsByGroup = new Map<string, Platform[]>();
      for (const sg of slotGroups) {
        const pSet = new Map<string, Platform>();
        for (const r of allRights) {
          const matchType = (r.platforms?.platform_type ?? "Other") === sg.type;
          const matchHist = sg.isHistory ? r.is_current === false : r.is_current !== false;
          if (matchType && matchHist) {
            const p = allPlatforms.find(pl => pl.id === r.platform_id);
            if (p) pSet.set(p.id, p);
          }
        }
        platformsByGroup.set(sg.label, [...pSet.values()].sort((a, b) => a.name.localeCompare(b.name)));
      }

      const isHome = exportMovieFormat === "home";
      const metaFields = isHome ? HOME_EXPORT_FIELDS : ACQUIRED_META_FIELDS;
      const metaCount = metaFields.length;
      const merges: XLSX.Range[] = [];

      // ── Row layout ────────────────────────────────────────────────────────────
      // Home (3 rows):  bannerRow | typeRow  | fieldRow | data...
      // Acquired (4 rows): groupRow | bannerRow | typeRow | fieldRow | data...
      //
      // bannerRow = SATELLITE RIGHTS / INTERNET RIGHTS (+ for acquired: meta group labels)
      // typeRow   = Satellite TV / DTH VOD / SVOD etc. (+ for acquired: metadata col names)
      // fieldRow  = Platform - <Name>, Category, Start Date, End Date, Territory, Nature Of Rights
      //             (+ for acquired: blank for meta cols since typeRow already names them)
      //             (+ for home: metadata col names, since no separate typeRow for meta)

      // For home: bannerRow + typeRow are purely for platform rights section (meta cols = null)
      //           fieldRow has metadata col names + platform slot sub-headers
      // For acquired: groupRow handles meta group labels + banner
      //               typeRow has meta col names + platform type labels
      //               fieldRow has blank meta + platform slot sub-headers

      const bannerRow: (string | null)[] = Array(metaCount).fill(null);
      const typeRow: (string | null)[] = isHome ? Array(metaCount).fill(null) : metaFields.map(f => f.label);
      const fieldRow: (string | null)[] = isHome ? metaFields.map(f => f.label) : Array(metaCount).fill(null);

      // For acquired only: groupRow with meta group labels
      let groupRow: (string | null)[] | null = null;
      if (!isHome) {
        groupRow = Array(metaCount).fill(null);
        const metaGroupSpans: [string, string, string][] = [
          ["Primary Rights", "satellite_rights", "other_rights"],
          ["Secondary Rights", "satellite_rights_classification", "internet_rights_classification"],
          ["Holdbacks & Clip Rights", "holdbacks", "clip_rights_duration"],
          ["Derivative Rights", "prequel_sequel_rights", "character_rights"],
          ["Ancillary Rights", "subtitling_rights", "dubbing_rights"],
          ["Nature of Rights", "nature_of_satellite_rights", "nature_of_other_rights"],
          ["Details of Film", "territory", "color_or_bw"],
        ];
        // groupRow row index = 0 for acquired
        for (const [label, firstKey, lastKey] of metaGroupSpans) {
          const s = metaFields.findIndex(f => f.key === firstKey);
          const e = metaFields.findIndex(f => f.key === lastKey);
          if (s >= 0) groupRow[s] = label;
          if (s >= 0 && e > s) merges.push({ s: { r: 0, c: s }, e: { r: 0, c: e } });
          void lastKey;
        }
      }

      // Row indices for merges
      const bannerRowIdx = isHome ? 0 : 1;
      const typeRowIdx = isHome ? 1 : 2;

      // Platform rights columns — push onto bannerRow, typeRow, fieldRow
      let colCursor = metaCount;
      const bannerSections = new Map<string, { start: number; end: number }>();

      for (const sg of slotGroups) {
        const plist = platformsByGroup.get(sg.label) ?? [];
        if (plist.length === 0) continue;
        const sgStart = colCursor;
        const typeGroupCols = plist.length * 6;

        // type label merges across all slots of this group
        if (typeGroupCols > 1) merges.push({ s: { r: typeRowIdx, c: sgStart }, e: { r: typeRowIdx, c: sgStart + typeGroupCols - 1 } });

        // track banner section extents
        if (sg.banner) {
          if (!bannerSections.has(sg.banner)) bannerSections.set(sg.banner, { start: sgStart, end: sgStart });
          else bannerSections.get(sg.banner)!.end = sgStart + typeGroupCols - 1;
        }

        if (!isHome) groupRow!.push(...Array(typeGroupCols).fill(null));

        for (let pi = 0; pi < plist.length; pi++) {
          const platform = plist[pi];
          bannerRow.push(null, null, null, null, null, null);
          typeRow.push(pi === 0 ? sg.label : null, null, null, null, null, null);
          fieldRow.push(`Platform - ${platform.name}`, "Category", "Start Date", "End Date", "Territory", "Nature Of Rights");
          colCursor += 6;
        }
      }

      // Write banner labels into bannerRow at section starts and add their merges
      for (const [banner, { start, end }] of bannerSections.entries()) {
        bannerRow[start] = banner;
        if (end > start) merges.push({ s: { r: bannerRowIdx, c: start }, e: { r: bannerRowIdx, c: end } });
      }

      // Data rows
      const dataRows: (string | null)[][] = versions.map(v => {
        const metaRow: (string | null)[] = metaFields.map(f => {
          const val = f.getter ? f.getter(v as unknown as Record<string, unknown>) : (v as unknown as Record<string, unknown>)[f.key];
          return fmtDate(val != null && val !== "" ? String(val) : null);
        });
        const movieRights = (rightsMap[v.id] ?? []) as RightWithPlatform[];
        const rightsCols: (string | null)[] = [];
        for (const sg of slotGroups) {
          for (const platform of platformsByGroup.get(sg.label) ?? []) {
            const right = movieRights.find(r => {
              const matchType = (r.platforms?.platform_type ?? "Other") === sg.type;
              const matchHist = sg.isHistory ? r.is_current === false : r.is_current !== false;
              return r.platform_id === platform.id && matchType && matchHist;
            });
            if (right) {
              rightsCols.push(platform.name, right.category ?? null, fmtDate(right.start_date), fmtDate(right.end_date), right.territory ?? null, right.nature ?? null);
            } else {
              rightsCols.push(null, null, null, null, null, null);
            }
          }
        }
        return [...metaRow, ...rightsCols];
      });

      const aoa = isHome
        ? [bannerRow, typeRow, fieldRow, ...dataRows]
        : [groupRow!, bannerRow, typeRow, fieldRow, ...dataRows];

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      if (!ws["!merges"]) ws["!merges"] = [];
      ws["!merges"].push(...merges);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, isHome ? "Home" : "Acquired");
      XLSX.writeFile(wb, `movies_${exportMovieFormat}_with_rights_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setShowExportDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportingXlsx(false);
    }
  };

  const hasFilters = searchQuery || sourceFilter !== "all" || versionFilter !== "all" || natureFilter !== "all"
    || languageFilter !== "all" || certificationFilter.length > 0 || yearFrom || yearTo || territoryFilter
    || agreementExpiryYear !== "all" || agreementEndFrom || agreementEndTo;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    if (dateStr.startsWith("3099") || dateStr.startsWith("9999")) return "Perpetual";
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getAgreementEndBadge = (dateStr?: string) => {
    if (!dateStr) return <span className="text-slate-400 text-xs">—</span>;
    const d = new Date(dateStr);
    const today = new Date();
    const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
    if (days < 0) return (
      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs font-mono">
        {formatDate(dateStr)} <span className="ml-1 opacity-60">(exp)</span>
      </Badge>
    );
    if (days <= 90) return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs font-mono">
        {formatDate(dateStr)} <span className="ml-1 opacity-60">({days}d)</span>
      </Badge>
    );
    return (
      <Badge variant="outline" className="bg-(--bg-deep) text-(--text-faint) border-(--svf-border) text-xs font-mono">
        {formatDate(dateStr)}
      </Badge>
    );
  };

  const showAgreementExpiry = sourceFilter === "acquired";
  const showJointProdCols = sourceFilter === "jointly_owned";
  const showBuyBackCol = sourceFilter === "jointly_owned" || natureFilter === "Jointly Owned";
  const showAgreementEndCol = sourceFilter !== "home_production" && sourceFilter !== "jointly_owned";
  const showMultiVersionCol = versionFilter === "multi";
  const showLicensorCol = sourceFilter === "acquired";

  // Duotone hue per movie for poster
  const movieHue = (movie: GroupedMovie, idx: number) => {
    const langHues: Record<string, number> = { bengali: 260, hindi: 14, tamil: 160, telugu: 200, malayalam: 130, kannada: 290, marathi: 50 };
    const langKey = (movie.primary_version?.language || "").toLowerCase();
    return langHues[langKey] ?? (idx * 37 + 14) % 360;
  };

  return (
    <div className="space-y-4">

      <SpecialEventsBanner preferenceEnabled={anniversaryEnabled} />

      {/* Filters — all original filters restored */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="px-4 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <div className="col-span-2 sm:col-span-1 xl:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Movie Keywords</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-faint)" }} />
                <Input placeholder="Title, Director, Cast…" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Source</label>
              <Select value={sourceFilter} onValueChange={handleSourceChange}>
                <SelectTrigger className="h-9 w-full">
                  <div className="flex items-center gap-2"><Film className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} /><SelectValue placeholder="All Sources" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="home_production">Home Production</SelectItem>
                  <SelectItem value="acquired">Acquired</SelectItem>
                  <SelectItem value="jointly_owned">Joint Production</SelectItem>
                  <SelectItem value="bangladeshi">Bangladeshi</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Language</label>
              <Select value={languageFilter} onValueChange={(v) => { setLanguageFilter(v); }}>
                <SelectTrigger className="h-9 w-full">
                  <div className="flex items-center gap-2"><Languages className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} /><SelectValue placeholder="Language" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Languages</SelectItem>
                  {languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Certification</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 w-full justify-between text-sm font-normal">
                    <div className="flex items-center gap-2 truncate">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} />
                      <span className="truncate">
                        {certificationFilter.length === 0
                          ? "All Certs"
                          : (certificationFilter.length > 0 && !certificationFilter.includes("A") && certificationOptions.filter(c => c !== "A").every(c => certificationFilter.includes(c)))
                            ? "Except A"
                            : certificationFilter.length === 1
                              ? certificationFilter[0]
                              : `${certificationFilter.length} selected`}
                      </span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-0" align="start" style={{ background: "var(--panel-solid)", border: "1px solid var(--svf-border-strong)", borderRadius: 11 }}>
                  <div className="p-2 space-y-0.5" style={{ borderBottom: "1px solid var(--svf-border)" }}>
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm" style={{ color: "var(--text-dim)" }}>
                      <Checkbox checked={certificationFilter.length === 0} onCheckedChange={() => { setCertificationFilter([]); }} />
                      <span className="font-medium">All</span>
                    </label>
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm" style={{ color: "var(--text-dim)" }}>
                      <Checkbox
                        checked={certificationFilter.length > 0 && !certificationFilter.includes("A") && certificationOptions.filter(c => c !== "A").every(c => certificationFilter.includes(c))}
                        onCheckedChange={() => { setCertificationFilter(certificationOptions.filter(c => c !== "A")); }}
                      />
                      <span className="font-medium">Except A</span>
                    </label>
                  </div>
                  <div className="max-h-56 overflow-y-auto p-2 space-y-0.5">
                    {certificationOptions.map((cert) => (
                      <label key={cert} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm" style={{ color: "var(--text-dim)" }}>
                        <Checkbox checked={certificationFilter.includes(cert)}
                          onCheckedChange={(checked) => {
                            setCertificationFilter(prev => checked ? [...prev, cert] : prev.filter(c => c !== cert));
                          }} />
                        <span className="font-medium">{cert}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Versions</label>
              <Select value={versionFilter} onValueChange={(v) => { setVersionFilter(v); }}>
                <SelectTrigger className="h-9 w-full">
                  <div className="flex items-center gap-2"><Languages className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} /><SelectValue placeholder="All Versions" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Movies</SelectItem>
                  <SelectItem value="multi">Multi-Version</SelectItem>
                  <SelectItem value="single">Single Version</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Nature</label>
              <Select value={natureFilter} onValueChange={(v) => { setNatureFilter(v); }}>
                <SelectTrigger className="h-9 w-full">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} /><SelectValue placeholder="Any Nature" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Nature</SelectItem>
                  {natureTypes.map((n) => <SelectItem key={n.id} value={n.name}>{n.name}</SelectItem>)}
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Territory</label>
              <Select value={territoryFilter} onValueChange={(v) => { setTerritoryFilter(v === "all" ? "" : v); }}>
                <SelectTrigger className="h-9 w-full">
                  <div className="flex items-center gap-2"><LayoutGrid className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} /><SelectValue placeholder="All Territories" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Territories</SelectItem>
                  <SelectItem value="World Wide">World Wide</SelectItem>
                  <SelectItem value="India">India</SelectItem>
                  <SelectItem value="Others">Others</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Release From</label>
              <Input type="date" value={yearFrom} onChange={(e) => { setYearFrom(e.target.value); }} className="h-9 w-full" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Release To</label>
              <Input type="date" value={yearTo} onChange={(e) => { setYearTo(e.target.value); }} className="h-9 w-full" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Agreement End From</label>
              <Input type="date" value={agreementEndFrom} onChange={(e) => { setAgreementEndFrom(e.target.value); }} className="h-9 w-full" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Agreement End To</label>
              <Input type="date" value={agreementEndTo} onChange={(e) => { setAgreementEndTo(e.target.value); }} className="h-9 w-full" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Sort By</label>
              <Select value={sortBy} onValueChange={(v: any) => { setSortBy(v); }}>
                <SelectTrigger className="h-9 w-full">
                  <div className="flex items-center gap-2"><Settings2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} /><SelectValue /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title_asc">A–Z (Title)</SelectItem>
                  <SelectItem value="title_desc">Z–A (Title)</SelectItem>
                  <SelectItem value="release_date_desc">Newest Release</SelectItem>
                  <SelectItem value="release_date_asc">Oldest Release</SelectItem>
                  <SelectItem value="created_at_desc">Newly Created</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {canFilterByApproval && (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>
                  {canSeeAllStatuses ? "Approval" : "Show"}
                </label>
                <Select value={approvalFilter} onValueChange={(v) => { setApprovalFilter(v as ApprovalStatus | "all"); }}>
                  <SelectTrigger className="h-9 w-full">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} />
                      <SelectValue placeholder="All" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Movies</SelectItem>
                    <SelectItem value="approved">Approved only</SelectItem>
                    <SelectItem value="pending">Pending Review</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {hasFilters && (
              <div className="flex items-end">
                <Button variant="outline" size="sm" className="h-9 gap-1.5 w-full bg-red-500/5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50" onClick={() => {
                  setSearchQuery(""); setSourceFilter("all"); setVersionFilter("all"); setNatureFilter("all");
                  setLanguageFilter(languages.find(l => l.toLowerCase() === "bengali") ?? "all");
                  setCertificationFilter([]); setYearFrom(""); setYearTo(""); setTerritoryFilter("");
                  setAgreementExpiryYear("all"); setAgreementEndFrom(""); setAgreementEndTo("");
                  setApprovalFilter(canSeeAllStatuses ? "approved" : "all");
                }}>
                  <X className="h-3.5 w-3.5" />Clear Filters
                </Button>
              </div>
            )}
          </div>

          {showAgreementExpiry && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-2" style={{ borderTop: "1px solid var(--svf-border)" }}>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Agreement Expiry</label>
                <Select value={agreementExpiryYear} onValueChange={(v) => { setAgreementExpiryYear(v); }}>
                  <SelectTrigger className="h-9 w-full">
                    <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} /><SelectValue placeholder="Any Year" /></div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Year</SelectItem>
                    {expiryYearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Count + actions + view toggle — all in one row */}
      <div className="flex flex-wrap items-center gap-2">
        <RoleGate action="import" resource="movie">
          <Button variant="outline" size="sm" className="gap-2 h-9 px-4 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover)" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4" /><span>Upload CSV</span>
          </Button>
        </RoleGate>
        {!loading && (
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            <strong style={{ color: "var(--text)" }}>{totalCount}</strong> films
          </p>
        )}
        <div className="flex-1" />
        <RoleGate action="export" resource="movie">
          {selectedIds.size > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-red-500">
              {selectedIds.size} selected
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-2 h-9 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover) shadow-sm shadow-red-500/20" onClick={() => setShowExportDialog(true)}>
            <Download className="h-4 w-4" /><span>Export</span>
          </Button>
        </RoleGate>
        {/* <Button variant="outline" size="sm" className="gap-2 h-9 px-4" onClick={() => setShowBulkPostersDialog(true)}>
          <ImageIcon className="h-4 w-4" /><span>Bulk Posters</span>
        </Button> */}
        <RoleGate action="create" resource="movie">
          <Button asChild size="sm" className="gap-2 h-9 px-4">
            <Link href="/movies/new"><Plus className="h-4 w-4" /><span>New Movie</span></Link>
          </Button>
        </RoleGate>
        {/* Grid / List toggle */}
        <div style={{
          display: "inline-flex", gap: 3, padding: 4, borderRadius: 11,
          background: "var(--bg-deep)", border: "1px solid var(--svf-border)",
        }}>
          {([{ v: "grid" as const, icon: LayoutGrid }, { v: "list" as const, icon: List }]).map(({ v, icon: Icon }) => (
            <button key={v} onClick={() => setView(v)} style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 30, borderRadius: 8, cursor: "pointer",
              border: view === v ? "1px solid var(--svf-border-strong)" : "1px solid transparent",
              background: view === v ? "var(--bg-raise)" : "transparent",
              color: view === v ? "var(--text)" : "var(--text-faint)",
              transition: "all .15s ease",
            }}>
              <Icon style={{ width: 15, height: 15 }} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Grid view ── */}
      {view === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 22 }}>
          {loading ? (
            <div className="col-span-full flex justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--svf-accent)" }} />
            </div>
          ) : movies.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 gap-3">
              <Film className="h-8 w-8" style={{ color: "var(--text-faint)" }} />
              <p style={{ color: "var(--text-faint)" }}>No movies found</p>
            </div>
          ) : movies.map((movie, idx) => {
            const pv = movie.primary_version || movie.versions[0];
            const movieId = pv?.id;
            const hue = movieHue(movie, idx);
            const hue2 = (hue + 40) % 360;
            return (
              <Link key={movie.production_no ?? idx} href={`/movies/${movieId}`} className="group block">
                <div className="relative rounded-[10px] overflow-hidden" style={{
                  aspectRatio: "2/3",
                  background: `linear-gradient(150deg, oklch(0.42 0.13 ${hue}) 0%, oklch(0.26 0.10 ${hue}) 42%, oklch(0.17 0.06 ${hue2}) 100%)`,
                  border: "1px solid var(--svf-border)",
                  transition: "transform .28s cubic-bezier(.16,1,.3,1)",
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = "none"}
                >
                  <img
                    src={`https://fileapi.mni.agency/api/FileFolderManager/PreviewFile?path=%2Fmnt%2Fmni%2FMoviePoster%2F${encodeURIComponent(movie.title)}.jpg&userId=1&platform=WebMicrosoft%20Windows%20NT%2010.0.20348.0`}
                    alt={movie.title}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                  {movie.production_no && (
                    <span className="absolute top-2 left-2" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.07em", color: "rgba(255,255,255,0.55)" }}>
                      {movie.production_no}
                    </span>
                  )}
                  {pv?.wtp_library && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "oklch(0.70 0.16 305 / 0.3)", color: "oklch(0.85 0.10 305)", backdropFilter: "blur(4px)" }}>WTP</span>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 pt-8" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)" }}>
                    <p className="leading-tight text-white line-clamp-2" style={{ fontFamily: "var(--font-serif)", fontSize: 16, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
                      {movie.title}
                    </p>
                    <p style={{ fontSize: 10, marginTop: 4, color: "rgba(255,255,255,0.6)", fontFamily: "var(--font-mono)" }}>
                      {movie.release_year || (pv?.release_date ? new Date(pv.release_date).getFullYear() : "")}
                      {pv?.language ? ` · ${pv.language}` : ""}
                    </p>
                  </div>
                </div>
                <div style={{ padding: "10px 2px 4px" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate" style={{ fontSize: 13.5, color: "var(--text)" }}>{movie.title}</span>
                    {movie.certification && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 5, border: "1px solid var(--svf-border)", color: "var(--text-faint)", flexShrink: 0 }}>{movie.certification}</span>
                    )}
                  </div>
                  <p className="truncate" style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>
                    {pv?.director_names?.split(/[,&]/)[0]?.trim() || ""}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Table / list view (default) ── */}
      {view === "list" && (
        <div className="glass-card overflow-hidden">
          <div>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--svf-accent)" }} />
                <p className="text-sm" style={{ color: "var(--text-faint)" }}>Loading catalog…</p>
              </div>
            ) : movies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="p-4 rounded-full" style={{ background: "var(--hover)", border: "1px solid var(--svf-border)" }}>
                  <Film className="h-8 w-8" style={{ color: "var(--text-faint)" }} />
                </div>
                <p className="font-medium" style={{ color: "var(--text)" }}>No movies found</p>
                <p className="text-sm" style={{ color: "var(--text-faint)" }}>Try adjusting your filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader style={{ background: "var(--bg-deep)" }}>
                    <TableRow style={{ borderColor: "var(--svf-border)" }} className="hover:bg-transparent">
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          checked={movies.length > 0 && selectedIds.size === movies.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead className="pl-2 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Title</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Source</TableHead>
                      <TableHead className="hidden sm:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Release</TableHead>
                      <TableHead className="hidden md:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Cert</TableHead>
                      {showMultiVersionCol && <TableHead className="hidden lg:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Languages</TableHead>}
                      {showJointProdCols && (
                        <>
                          <TableHead className="hidden lg:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Rev Share</TableHead>
                          <TableHead className="hidden lg:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Prod House</TableHead>
                        </>
                      )}
                      <TableHead className="hidden lg:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Rights</TableHead>
                      {showLicensorCol && <TableHead className="hidden lg:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Licensor</TableHead>}
                      {showAgreementEndCol && <TableHead className="hidden xl:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Agreement End</TableHead>}
                      {showBuyBackCol && <TableHead className="hidden xl:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Buy Back</TableHead>}
                      <TableHead className="hidden xl:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">WTP</TableHead>
                      <TableHead className="text-right pr-6 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movies.map((movie, idx) => {
                      const pv = movie.primary_version || movie.versions[0];
                      const movieId = pv?.id;
                      const isSold = movie.nature_of_rights?.toLowerCase().includes("sold");
                      const isAcquired = movie.source === "acquired" && !isSold;
                      const isExpiredAgreement = pv?.agreement_end_date && new Date(pv.agreement_end_date) < new Date();
                      const isExpired = isExpiredAgreement || isSold;
                      const hue = movieHue(movie, idx);
                      const hue2 = (hue + 40) % 360;

                      return (
                        <TableRow key={movie.production_no} style={{ borderColor: "var(--svf-border)" }} className={cn("transition-colors group", selectedIds.has(movie.production_no) && "bg-red-500/5")}>
                          <TableCell className="pl-4 py-3 w-10">
                            <Checkbox
                              checked={selectedIds.has(movie.production_no)}
                              onCheckedChange={() => toggleSelect(movie.production_no)}
                              aria-label={`Select ${movie.title}`}
                            />
                          </TableCell>
                          <TableCell className="pl-2 max-w-xs py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Mini poster */}
                              <div style={{
                                width: 28, height: 40, borderRadius: 5, flexShrink: 0,
                                background: `linear-gradient(150deg, oklch(0.42 0.13 ${hue}) 0%, oklch(0.26 0.10 ${hue}) 42%, oklch(0.17 0.06 ${hue2}) 100%)`,
                                border: "1px solid var(--svf-border)", position: "relative", overflow: "hidden",
                              }}>
                                <img
                                  src={`https://fileapi.mni.agency/api/FileFolderManager/PreviewFile?path=%2Fmnt%2Fmni%2FMoviePoster%2F${encodeURIComponent(movie.title)}.jpg&userId=1&platform=WebMicrosoft%20Windows%20NT%2010.0.20348.0`}
                                  alt={movie.title}
                                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                />
                                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "45%", background: "linear-gradient(to top, rgba(0,0,0,0.65), transparent)" }} />
                              </div>
                              <div className="min-w-0">
                                <Link href={`/movies/${movieId}`} className="font-semibold text-sm hover:text-red-400 transition-colors line-clamp-1 block" style={{ color: "var(--text)" }}>
                                  {movie.title}
                                  {movie.release_year && <span style={{ color: "var(--text-faint)", fontWeight: 400, marginLeft: 5 }}>({movie.release_year})</span>}
                                </Link>
                                {movie.production_no && movie.source !== "acquired" && (
                                  <span className="text-[10px] font-mono mt-0.5 block" style={{ color: "var(--text-faint)" }}>{movie.production_no}</span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-3">
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className={cn("text-[10px] w-fit font-semibold px-2 py-0.5",
                                movie.source === "acquired" ? "bg-violet-500/10 text-violet-400 border-violet-500/25"
                                  : (movie.nature_of_rights === "Jointly Owned") ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                                    : "bg-indigo-500/10 text-indigo-400 border-indigo-500/25"
                              )}>
                                {movie.source === "acquired" ? "Acquired" : (movie.nature_of_rights === "Jointly Owned") ? "Jointly Owned" : "Home"}
                              </Badge>
                              {isExpired && <Badge variant="destructive" className="text-[10px] w-fit font-semibold px-2 py-0.5">Expired</Badge>}
                              {canFilterByApproval && (movie as any).approval_status === "pending" && <Badge variant="warning" className="text-[10px] w-fit font-semibold px-2 py-0.5">Pending</Badge>}
                              {canFilterByApproval && (movie as any).approval_status === "rejected" && <Badge variant="destructive" className="text-[10px] w-fit font-semibold px-2 py-0.5">Rejected</Badge>}
                            </div>
                          </TableCell>

                          <TableCell className="hidden sm:table-cell text-xs tabular-nums py-3" style={{ color: "var(--text-faint)" }}>
                            {pv?.release_date ? new Date(pv.release_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (movie.release_year || "—")}
                          </TableCell>

                          <TableCell className="hidden md:table-cell py-3">
                            {movie.certification ? (
                              <Badge variant="secondary" className="text-[10px] font-bold">{movie.certification}</Badge>
                            ) : <span className="text-xs" style={{ color: "var(--text-faint)" }}>—</span>}
                          </TableCell>

                          {showMultiVersionCol && (
                            <TableCell className="hidden lg:table-cell py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs" style={{ color: "var(--text-faint)" }}>{movie.total_versions}</span>
                                <div className="flex -space-x-1">
                                  {movie.versions.slice(0, 3).map((v) => (
                                    <div key={v.id} className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: "color-mix(in oklch, var(--svf-accent) 12%, transparent)", border: "1px solid var(--svf-border)", color: "var(--svf-accent-bright)" }} title={v.language}>
                                      {v.language?.substring(0, 2).toUpperCase()}
                                    </div>
                                  ))}
                                  {movie.total_versions > 3 && (
                                    <div className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: "var(--hover)", border: "1px solid var(--svf-border)", color: "var(--text-faint)" }}>
                                      +{movie.total_versions - 3}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          )}

                          {showJointProdCols && (
                            <>
                              <TableCell className="hidden lg:table-cell text-xs py-3" style={{ color: "var(--text-faint)" }}>{pv?.revenue_share || "—"}</TableCell>
                              <TableCell className="hidden lg:table-cell text-xs py-3" style={{ color: "var(--text-faint)" }}>{movie.production_house_name || "—"}</TableCell>
                            </>
                          )}

                          <TableCell className="hidden lg:table-cell py-3">
                            <div className="flex items-center gap-1.5 text-xs">
                              <Activity className="h-3 w-3" style={{ color: "var(--text-faint)" }} />
                              <span className="font-semibold" style={{ color: "var(--st-active)" }}>{movie.total_rights - movie.expired_rights}</span>
                              {movie.expired_rights > 0 && <span style={{ color: "var(--st-expired)", opacity: 0.7 }}>/ {movie.expired_rights} exp</span>}
                            </div>
                          </TableCell>

                          {showLicensorCol && (
                            <TableCell className="hidden lg:table-cell text-xs py-3 max-w-[140px]" style={{ color: "var(--text-faint)" }}>
                              <span className="line-clamp-1">{pv?.assignor_licensor || "—"}</span>
                            </TableCell>
                          )}

                          {showAgreementEndCol && (
                            <TableCell className="hidden xl:table-cell py-3">
                              {isAcquired ? getAgreementEndBadge(pv?.agreement_end_date) : <span className="text-xs" style={{ color: "var(--text-faint)" }}>—</span>}
                            </TableCell>
                          )}

                          {showBuyBackCol && (
                            <TableCell className="hidden xl:table-cell text-xs tabular-nums py-3" style={{ color: "var(--text-faint)" }}>
                              {formatDate(pv?.joint_prod_buy_back_date)}
                            </TableCell>
                          )}

                          <TableCell className="hidden xl:table-cell py-3">
                            {pv?.wtp_library ? (
                              <Badge variant="outline" className="text-[10px] font-semibold" style={{ color: "var(--st-wtp)", background: "color-mix(in oklch, var(--st-wtp) 12%, transparent)", borderColor: "color-mix(in oklch, var(--st-wtp) 28%, transparent)" }}>
                                {pv.wtp_library}
                              </Badge>
                            ) : <span className="text-xs" style={{ color: "var(--text-faint)" }}>—</span>}
                          </TableCell>

                          <TableCell className="text-right pr-6 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <RoleGate action="edit" resource="movie">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-amber-400 hover:bg-amber-500/10" style={{ color: "var(--text-faint)" }} asChild>
                                  <Link href={`/movies/${movieId}/edit`}><Edit className="h-3.5 w-3.5" /></Link>
                                </Button>
                              </RoleGate>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-red-400 hover:bg-red-500/10" style={{ color: "var(--text-faint)" }} asChild>
                                <Link href={`/movies/${movieId}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

          </div>
        </div>
      )}


      <BulkPostersUploadDialog open={showBulkPostersDialog} onOpenChange={setShowBulkPostersDialog} onSuccess={() => fetchMovies()} />
      <ComprehensiveCSVImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} onSuccess={() => fetchMovies()} />

      {/* Export dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowExportDialog(false)} />
          <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl bg-(--panel-solid) border border-(--svf-border-strong) shadow-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-(--text)">Export Movies</h2>
              <p className="text-xs text-(--text-faint) mt-0.5">
                {selectedIds.size > 0
                  ? <><span className="text-red-500 font-semibold">{selectedIds.size} selected</span> — only selected movies will be exported.</>
                  : <>All <span className="font-semibold text-(--text)">{totalCount}</span> filtered movies will be exported. Each language version as a separate row.</>
                }
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) mb-1.5 block">Movie Format</label>
                <Select value={exportMovieFormat} onValueChange={(v) => setExportMovieFormat(v as "home" | "acquired")}>
                  <SelectTrigger className="h-9 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home">Home Production</SelectItem>
                    <SelectItem value="acquired">Acquired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <Checkbox
                  checked={exportWithPlatformRights}
                  onCheckedChange={(v) => setExportWithPlatformRights(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-(--text) transition-colors">Include Platform Rights</p>
                  <p className="text-xs text-(--text-faint) mt-0.5">Exports with SATELLITE RIGHTS / INTERNET RIGHTS sections in the same header format used for import. Dates like 3099-12-31 are written as "Perpetual".</p>
                </div>
              </label>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1 h-9 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover)" onClick={() => setShowExportDialog(false)}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1 h-9 bg-red-600 hover:bg-red-500 text-white gap-2" onClick={handleExportXlsx} disabled={exportingXlsx}>
                {exportingXlsx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {exportingXlsx ? "Exporting…" : "Export XLSX"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export field definitions — column names match the import template exactly ─

// Home production flat export — matches home_sample.csv column order
const HOME_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "production_no", label: "Production No" },
  { key: "title", label: "Title" },
  { key: "cast_names", label: "Cast" },
  { key: "director_names", label: "Director" },
  { key: "language", label: "Language" },
  { key: "production_house_name", label: "Production House" },
  { key: "release_date", label: "Theatrical Release Date" },
  { key: "trailer_link", label: "YT Trailer Link" },
  { key: "certification", label: "Censor" },
  { key: "nature_of_rights", label: "Nature of Right" },
  { key: "holdbacks", label: "Holdbacks" },
  { key: "remarks", label: "Remarks" },
  { key: "actionables", label: "Actionable" },
  { key: "jointly_exploitation_rights", label: "Joint Exploitation Rights" },
  { key: "revenue_share", label: "Revenue Share" },
  { key: "joint_prod_buy_back_date", label: "Joint Buy Back Date" },
];

// Acquired metadata columns — matches the exact column order of the import template
// (rows 1-2 of the CSV: the flat/secondary header section before the platform rights 3-row header)
const ACQUIRED_META_FIELDS: ExportFieldDef[] = [
  { key: "title", label: "Movie Name" },
  { key: "assignor_licensor", label: "Assignor/ Licensor" },
  { key: "licensee", label: "Licensee" },
  { key: "agreement_date", label: "Date of Agreement" },
  { key: "satellite_rights", label: "Satellite Rights" },
  { key: "internet_rights", label: "Internet Rights" },
  { key: "negative_rights", label: "Negative Rights" },
  { key: "other_rights", label: "Other Rights" },
  { key: "satellite_rights_classification", label: "Satellite Rights Classification" },
  { key: "internet_rights_classification", label: "Internet Classification" },
  { key: "holdbacks", label: "Holdbacks" },
  { key: "clip_rights", label: "Clip Rights" },
  { key: "clip_rights_duration", label: "Duration" },
  { key: "prequel_sequel_rights", label: "Prequel/ Sequel Rights" },
  { key: "character_rights", label: "Character Rights" },
  { key: "subtitling_rights", label: "Sub-Titling Rights" },
  { key: "dubbing_rights", label: "Dubbing Rights" },
  { key: "nature_of_satellite_rights", label: "Nature of Satellite Rights" },
  { key: "nature_of_internet_rights", label: "Nature of Internet Rights" },
  { key: "nature_of_negative_rights", label: "Nature of Negative Rights" },
  { key: "nature_of_other_rights", label: "Nature of Other Rights" },
  { key: "territory", label: "Territory" },
  { key: "cast_names", label: "Cast Details" },
  { key: "director_names", label: "Director" },
  { key: "release_year", label: "Release Year" },
  { key: "certification", label: "Certification" },
  { key: "color_or_bw", label: "Color/B/W" },
  { key: "agreement_start_date", label: "Agreement Start Date" },
  { key: "agreement_end_date", label: "Agreement End Date" },
  { key: "satellite_rights_start_date", label: "Satellite Rights\nStart Date" },
  { key: "satellite_rights_end_date", label: "Satellite Rights\nEnd Date" },
  { key: "internet_rights_start_date", label: "Internet Rights\nStart Date" },
  { key: "internet_rights_end_date", label: "Internet Rights\nEnd Date" },
  { key: "negative_rights_start_date", label: "Negative Rights\nStart Date" },
  { key: "negative_rights_end_date", label: "Negative Rights\nEnd Date" },
  { key: "other_rights_start_date", label: "Other Rights\nStart Date" },
  { key: "other_rights_end_date", label: "Other Rights\nEnd Date" },
  { key: "syndication_internet_rights", label: "Syndication-\nInternet Rights" },
];
