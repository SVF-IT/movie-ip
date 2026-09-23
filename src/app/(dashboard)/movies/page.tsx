"use client";

import { ActiveFilterChips, type ActiveFilterChip } from "@/components/dashboard/active-filter-chips";
import { DisabledActionButton } from "@/components/disabled-action-button";
import { ComprehensiveCSVImportDialog } from "@/components/import-export/comprehensive-csv-import-dialog";
import type { ExportFieldDef } from "@/components/import-export/data-export-dialog";
import { BulkCertificatesUploadDialog } from "@/components/movies/bulk-certificates-upload-dialog";
import { BulkPostersUploadDialog } from "@/components/movies/bulk-posters-upload-dialog";
import { FetchPostersDialog } from "@/components/movies/fetch-posters-dialog";
import { SpecialEventsBanner } from "@/components/movies/special-events-banner";
import { RoleGate } from "@/components/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnFilter, FilterableHead } from "@/components/ui/column-header-filter";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
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
import { useUrlMultiSelectFilterState } from "@/hooks/use-url-multi-select-filter-state";
import { stringCodec, stringListCodec, useUrlFilterState } from "@/hooks/use-url-filter-state";
import { getDistinctCertifications, getPlatforms } from "@/lib/api/dashboard";
import { getBulkMoviePlatformRights, getGroupedMovies, getLanguages } from "@/lib/api/movies";
import { isAdminRole, isEditorRole, type GroupedMovie, type MovieLanguageVersion, type Platform, type PlatformRight } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import {
  Activity,
  Calendar,
  ChevronDown, ChevronsUpDown, ChevronUp,
  Download, Edit, ExternalLink, Film,
  Image as ImageIcon,
  Languages,
  LayoutGrid, List, Loader2, Plus, ShieldCheck,
  Upload
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/**
 * A jointly-produced title whose exploitation rights sit with the partner house
 * rather than SVF is not ours to sell, so it counts as gone from the catalogue.
 */
function heldByOtherHouse(version?: MovieLanguageVersion): boolean {
  if (!version || version.jointly_owned !== true) return false;
  const holder = (version.jointly_exploitation_rights || "").trim();
  if (!holder) return false;
  return !/^svf\b/i.test(holder);
}

/**
 * A home production is gone when the sold flag is set, when a legacy imported row
 * says "Sold" in its exploitation-rights text, or when a joint partner holds the
 * rights. Mirrors isSoldOrExpired in lib/api/dashboard.ts; keep the two in step.
 */
function isSoldHome(version?: MovieLanguageVersion): boolean {
  if (!version) return false;
  if (version.home_sold === true) return true;
  if (/sold/i.test(version.jointly_exploitation_rights || "")) return true;
  return heldByOtherHouse(version);
}

export default function MoviesPage() {
  const { profile } = useAuth();
  // "Fetch Missing" posters is an editor-only tool — not admin, not legal.
  const isEditor = isEditorRole(profile?.role);
  const canBulkUploadCertificates = isAdminRole(profile?.role) || isEditorRole(profile?.role);

  const [movies, setMovies] = useState<GroupedMovie[]>([]);
  const [allFilteredMovies, setAllFilteredMovies] = useState<GroupedMovie[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useUrlFilterState("q", "", stringCodec);
  // Typing shouldn't refetch on every keystroke; the query settles first.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const SOURCE_OPTIONS = [
    { value: "home_production", label: "Home Production" },
    { value: "acquired", label: "Acquired" },
    { value: "jointly_owned", label: "Joint Production" },
    { value: "bangladeshi", label: "Bangladesh" },
    { value: "expired", label: "Expired" },
  ];
  // Home + Acquired is the whole live catalogue: every joint production and
  // Bangladeshi title is already one or the other, so those two ticks are the
  // default. "Expired" is a separate bucket that is only ever included when
  // explicitly ticked — it is never implied by "everything selected".
  const DEFAULT_SOURCES = ["home_production", "acquired"];
  const [sourceSel, setSourceSel] = useUrlMultiSelectFilterState<string>("src", DEFAULT_SOURCES);
  // Several downstream behaviours (column visibility, agreement-expiry) only make
  // sense for exactly one source, so they key off the lone selection.
  const soleSource = sourceSel.length === 1 ? sourceSel[0] : null;
  const VERSION_OPTIONS = [
    { value: "multi", label: "Multi-Version" },
    { value: "single", label: "Single Version" },
  ];
  const [versionSel, setVersionSel] = useUrlMultiSelectFilterState<string>("ver", VERSION_OPTIONS.map(o => o.value));
  // Both ticked (or none) is the same as no narrowing.
  const versionFilter = versionSel.length === 1 ? versionSel[0] : "all";
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();

  const [languages, setLanguages] = useState<string[]>([]);
  // Title's funnel lists the titles currently loaded rather than a fixed set, so
  // "all selected" can't mean "no filter" — the list shrinks whenever another
  // filter narrows the data. An empty selection means no title filter.
  const [titleSel, setTitleSel] = useUrlFilterState<string[]>("title", [], stringListCodec, (v) => v.length === 0);
  const [certificationFilter, setCertificationFilter] = useUrlMultiSelectFilterState<string>("cert", []);
  const [certificationOptions, setCertificationOptions] = useState<string[]>([]);
  const [languageFilter, setLanguageFilter] = useUrlMultiSelectFilterState<string>("lang", []);
  const WTP_OPTIONS = ["WTP", "WTP/BD", "Library"];
  const [wtpFilter, setWtpFilter] = useUrlMultiSelectFilterState<string>("wtp", WTP_OPTIONS);
  // Sorting is driven entirely by the Release column header now: unsorted falls
  // back to A–Z by title, and clicking the column cycles newest/oldest release.
  const [releaseSort, setReleaseSort] = useUrlFilterState<'none' | 'desc' | 'asc'>(
    'sort', 'none',
    { encode: (v) => (v === 'none' ? null : v), decode: (raw) => (raw === 'asc' ? 'asc' : raw === 'desc' ? 'desc' : 'none') },
  );
  const sortBy: 'title_asc' | 'release_date_asc' | 'release_date_desc' =
    releaseSort === 'none' ? 'title_asc' : releaseSort === 'desc' ? 'release_date_desc' : 'release_date_asc';
  // Unlike the other filters, an empty selection here means "any year" rather
  // than "nothing matches" — the year list is a fixed window, not the set of
  // values present in the data, so all-checked and none-checked both mean no
  // narrowing.
  const [expiryYearSel, setExpiryYearSel] = useUrlFilterState<string[]>("expiry", [], stringListCodec, (v) => v.length === 0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportMovieFormat, setExportMovieFormat] = useState<"home" | "acquired">("acquired");
  const [exportWithPlatformRights, setExportWithPlatformRights] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [showBulkPostersDialog, setShowBulkPostersDialog] = useState(false);
  const [showFetchPostersDialog, setShowFetchPostersDialog] = useState(false);
  const [showBulkCertificatesDialog, setShowBulkCertificatesDialog] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [anniversaryEnabled, setAnniversaryEnabled] = useState(false);

  const currentYear = new Date().getFullYear();
  const expiryYearOptions = Array.from({ length: 12 }, (_, i) => String(currentYear - 1 + i));

  useEffect(() => {
    getLanguages().then((langs) => {
      setLanguages(langs);
      const bengali = langs.find((l) => l.toLowerCase() === 'bengali');
      if (bengali) setLanguageFilter([bengali]);
    }).catch(() => { });
    getDistinctCertifications().then((certs) => {
      const standardCerts = ['U', 'UA', 'UA 7+', 'UA 13+', 'UA 16+', 'A'];
      // 'S' (restricted to specialised audiences) is never offered as a filter.
      const dbCerts = certs.filter(c => c !== 'U/A' && c !== 'S');
      const merged = Array.from(new Set([...standardCerts, ...dbCerts]));
      setCertificationOptions(merged);
    }).catch(() => {
      setCertificationOptions(['U', 'UA', 'UA 7+', 'UA 13+', 'UA 16+', 'A']);
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

      // Each picked source is its own query, merged and deduped by production_no.
      // "Expired" is really two (expired acquired + sold home production) and is
      // only ever fetched when ticked — it is never part of an unfiltered view.
      // "Joint Production" and "Bangladesh" are narrowings of the live catalogue
      // rather than separate buckets, so they never pull in expired titles.
      const commonParams = {
        search: debouncedSearch || undefined,
        // An empty selection means "no language narrowing", not "match no
        // language" — unticking Select all should widen the list, not empty it.
        language: (versionFilter === "multi") ? undefined : (languageFilter.length > 0 && languageFilter.length < languages.length ? languageFilter : undefined),
        certification: certificationFilter.length < certificationOptions.length ? certificationFilter : undefined,
        sortBy,
        approvalStatus: "approved" as const,
      };

      type SourceQuery = { source?: "home_production" | "acquired" | "expired" | "sold" | "bangladeshi"; natureOfRights?: string };
      const queriesFor = (v: string): SourceQuery[] => {
        if (v === "expired") return [{ source: "expired" }, { source: "sold" }];
        if (v === "jointly_owned") return [{ natureOfRights: "Jointly Owned" }];
        return [{ source: v as SourceQuery["source"] }];
      };

      // An empty selection falls back to the live catalogue rather than to
      // "everything", so clearing the filter can never surface expired titles.
      const picked = sourceSel.length === 0 ? DEFAULT_SOURCES : sourceSel;
      const queries: SourceQuery[] = picked.flatMap(queriesFor);

      const results = await Promise.all(
        queries.map(q => getGroupedMovies({ ...commonParams, ...q }))
      );

      // "Joint Production" and "Bangladesh" are narrowings of the catalogue with
      // no agreement-date condition of their own, so they return expired and sold
      // titles too. Unless Expired was ticked, strip those back out.
      const wantExpired = picked.includes("expired");
      const today = new Date();
      const isDeadTitle = (m: GroupedMovie) => {
        const v = m.primary_version || m.versions[0];
        if (m.source === "home_production") return isSoldHome(v);
        return !!v?.agreement_end_date && new Date(v.agreement_end_date) < today;
      };

      const seen = new Set<string>();
      const allGroupedData: GroupedMovie[] = results
        .flatMap(r => r.data || [])
        .filter(m => {
          if (seen.has(m.production_no)) return false;
          seen.add(m.production_no);
          return wantExpired || !isDeadTitle(m);
        });

      let filteredData = allGroupedData;

      if (versionFilter === "multi") {
        filteredData = filteredData.filter(m => m.total_versions > 1);
      } else if (versionFilter === "single") {
        filteredData = filteredData.filter(m => m.total_versions === 1);
      }

      if (expiryYearSel.length > 0 && soleSource === "acquired") {
        const years = new Set(expiryYearSel.map(y => parseInt(y)));
        filteredData = filteredData.filter(m => {
          const endDate = m.primary_version?.agreement_end_date;
          if (!endDate) return false;
          return years.has(new Date(endDate).getFullYear());
        });
      }

      if (wtpFilter.length < WTP_OPTIONS.length) {
        filteredData = filteredData.filter(m => wtpFilter.includes(m.primary_version?.wtp_library || ""));
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
  }, [debouncedSearch, sourceSel, soleSource, versionFilter, languageFilter, languages.length, certificationFilter, certificationOptions.length, wtpFilter, sortBy, expiryYearSel]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => { fetchMovies(); }, [fetchMovies]);

  // A title picked in the column funnel must not outlive the options it came
  // from, but clearing it whenever rows change would also wipe a selection just
  // restored from the URL by a back navigation. Prune to what still exists.
  useEffect(() => {
    if (titleSel.length === 0 || movies.length === 0) return;
    const available = new Set(movies.map((m) => m.title));
    const kept = titleSel.filter((t) => available.has(t));
    if (kept.length !== titleSel.length) setTitleSel(kept);
  }, [movies, titleSel, setTitleSel]);

  const handleSourceChange = (next: string[]) => {
    setSourceSel(next);
    // Agreement expiry only applies to acquired titles; any other selection
    // would leave a filter active that can never match.
    if (!(next.length === 1 && next[0] === "acquired")) {
      setExpiryYearSel([]);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const titleOptions = useMemo(
    () => Array.from(new Set(movies.map(m => m.title).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [movies]
  );
  const titleFilter = titleSel.length === 0 ? titleOptions : titleSel;
  const setTitleFilter = (next: string[]) =>
    setTitleSel(next.length >= titleOptions.length ? [] : next);
  const visibleMovies = useMemo(
    () => (titleSel.length === 0 ? movies : movies.filter(m => titleSel.includes(m.title))),
    [movies, titleSel]
  );

  const toggleSelectAll = () => {
    if (selectedIds.size === visibleMovies.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(visibleMovies.map(m => m.production_no)));
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
          ["Agreement", "agreement_date", "agreement_end_date"],
          ["Film Details", "color_or_bw", "color_or_bw"],
          ["Clip Rights", "clip_rights", "clip_rights_duration"],
          ["Derivative Rights", "prequel_sequel_rights", "dubbing_rights"],
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

  // Every active narrowing gets a chip, so the filters in the column headers are
  // visible without opening each funnel.
  const bengali = languages.find(l => l.toLowerCase() === "bengali");
  const defaultLanguages = bengali ? [bengali] : [];
  const clearAllFilters = () => {
    setSearchQuery(""); setSourceSel(DEFAULT_SOURCES); setVersionSel(VERSION_OPTIONS.map(o => o.value));
    setLanguageFilter(defaultLanguages);
    setCertificationFilter(certificationOptions);
    setWtpFilter(WTP_OPTIONS);
    setTitleSel([]); setReleaseSort('none');
    setExpiryYearSel([]);
  };

  const activeChips: ActiveFilterChip[] = [];
  if (searchQuery) activeChips.push({
    key: 'search', label: 'Search', value: searchQuery, onClear: () => setSearchQuery(""),
  });
  if (titleSel.length > 0) activeChips.push({
    key: 'title', label: 'Title',
    value: titleSel.length === 1 ? titleSel[0] : `${titleSel.length} selected`,
    onClear: () => setTitleSel([]),
  });
  const isDefaultSources =
    sourceSel.length === DEFAULT_SOURCES.length && DEFAULT_SOURCES.every(v => sourceSel.includes(v));
  if (!isDefaultSources) activeChips.push({
    key: 'source', label: 'Source',
    value: sourceSel.length === 0
      ? 'None'
      : sourceSel.map(v => SOURCE_OPTIONS.find(o => o.value === v)?.label ?? v).join(', '),
    onClear: () => handleSourceChange(DEFAULT_SOURCES),
  });
  if (releaseSort !== 'none') activeChips.push({
    key: 'release-sort', label: 'Sorted by',
    value: releaseSort === 'desc' ? 'Newest release' : 'Oldest release',
    onClear: () => setReleaseSort('none'),
  });
  if (certificationFilter.length > 0 && certificationFilter.length < certificationOptions.length) activeChips.push({
    key: 'cert', label: 'Certification',
    value: certificationFilter.length === 1 ? certificationFilter[0] : `${certificationFilter.length} selected`,
    onClear: () => setCertificationFilter(certificationOptions),
  });
  if (languageFilter.length > 0 && languageFilter.length < languages.length) activeChips.push({
    key: 'language', label: 'Language',
    value: languageFilter.length === 1 ? languageFilter[0] : `${languageFilter.length} selected`,
    onClear: () => setLanguageFilter(defaultLanguages),
  });
  if (wtpFilter.length > 0 && wtpFilter.length < WTP_OPTIONS.length) activeChips.push({
    key: 'wtp', label: 'WTP library',
    value: wtpFilter.join(', '),
    onClear: () => setWtpFilter(WTP_OPTIONS),
  });
  if (versionSel.length > 0 && versionSel.length < VERSION_OPTIONS.length) activeChips.push({
    key: 'versions', label: 'Versions',
    value: versionSel.map(v => VERSION_OPTIONS.find(o => o.value === v)?.label ?? v).join(', '),
    onClear: () => setVersionSel(VERSION_OPTIONS.map(o => o.value)),
  });
  if (expiryYearSel.length > 0) activeChips.push({
    key: 'expiry', label: 'Agreement expiry',
    value: expiryYearSel.length === 1 ? expiryYearSel[0] : `${expiryYearSel.length} years`,
    onClear: () => setExpiryYearSel([]),
  });

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

  const showAgreementExpiry = soleSource === "acquired";
  const isJointlyOwnedFilter = soleSource === "jointly_owned";
  const showJointProdCols = isJointlyOwnedFilter;
  const showBuyBackCol = isJointlyOwnedFilter;
  // Agreement End only means something for titles that carry an acquisition
  // agreement, so it is opt-in: Acquired, Bangladesh or Expired on their own.
  // Any other pick (or a mixed selection) would show a column that is mostly "—".
  const showAgreementEndCol =
    soleSource === "acquired" || soleSource === "bangladeshi" || soleSource === "expired";
  const showLicensorCol = soleSource === "acquired";

  // Duotone hue per movie for poster
  const movieHue = (movie: GroupedMovie, idx: number) => {
    const langHues: Record<string, number> = { bengali: 260, hindi: 14, tamil: 160, telugu: 200, malayalam: 130, kannada: 290, marathi: 50 };
    const langKey = (movie.primary_version?.language || "").toLowerCase();
    return langHues[langKey] ?? (idx * 37 + 14) % 360;
  };

  return (
    <div className="space-y-4">

      <SpecialEventsBanner preferenceEnabled={anniversaryEnabled} />

      {/* Count + actions + view toggle — all in one row */}
      <div className="flex flex-wrap items-center gap-2">
        <RoleGate
          action="import"
          resource="movie"
          fallback={
            <>
              <DisabledActionButton variant="outline" className="gap-2 h-9 px-4" reason="You don't have permission to import movies.">
                <Upload className="h-4 w-4" /><span>Upload CSV</span>
              </DisabledActionButton>
              <DisabledActionButton variant="outline" className="gap-2 h-9 px-4" reason="You don't have permission to bulk-upload posters.">
                <ImageIcon className="h-4 w-4" /><span>Bulk Posters</span>
              </DisabledActionButton>
            </>
          }
        >
          <Button variant="outline" size="sm" className="gap-2 h-9 px-4 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover)" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4" /><span>Upload CSV</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-2 h-9 px-4 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover)" onClick={() => setShowBulkPostersDialog(true)}>
            <ImageIcon className="h-4 w-4" /><span>Bulk Posters</span>
          </Button>
        </RoleGate>
        {/* Poster backfill is restricted to the editor role (enforced again server-side). */}
        {isEditor && (
          <Button variant="outline" size="sm" className="gap-2 h-9 px-4 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover)" onClick={() => setShowFetchPostersDialog(true)}>
            <ImageIcon className="h-4 w-4" /><span>Fetch Missing</span>
          </Button>
        )}
        {canBulkUploadCertificates ? (
          <Button variant="outline" size="sm" className="gap-2 h-9 px-4 bg-(--bg-raise) border-(--svf-border-strong) text-(--text) hover:bg-(--hover)" onClick={() => setShowBulkCertificatesDialog(true)}>
            <ShieldCheck className="h-4 w-4" /><span>Bulk Certificates</span>
          </Button>
        ) : (
          <DisabledActionButton variant="outline" className="gap-2 h-9 px-4" reason="Only editors and admins can bulk-upload certificates.">
            <ShieldCheck className="h-4 w-4" /><span>Bulk Certificates</span>
          </DisabledActionButton>
        )}
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
        <RoleGate
          action="create"
          resource="movie"
          fallback={
            <DisabledActionButton className="gap-2 h-9 px-4" reason="You don't have permission to add movies.">
              <Plus className="h-4 w-4" /><span>New Movie</span>
            </DisabledActionButton>
          }
        >
          <Button asChild size="sm" className="h-9 gap-2 px-4 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30">
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

      {/* Filters — title, source, language, certification and WTP live in the column headers */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="px-4 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Versions</label>
              <MultiSelectFilter
                label="All Versions"
                options={VERSION_OPTIONS}
                value={versionSel}
                onChange={setVersionSel}
                triggerWidth="w-full"
                icon={<Languages className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} />}
              />
            </div>
          </div>

          <ActiveFilterChips chips={activeChips} onClearAll={clearAllFilters} divider />

          {showAgreementExpiry && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-2" style={{ borderTop: "1px solid var(--svf-border)" }}>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: "var(--text-faint)" }}>Agreement Expiry</label>
                <MultiSelectFilter
                  label="Any Year"
                  options={expiryYearOptions}
                  value={expiryYearSel.length === 0 ? expiryYearOptions : expiryYearSel}
                  onChange={(next) => setExpiryYearSel(next.length >= expiryYearOptions.length ? [] : next)}
                  triggerWidth="w-full"
                  icon={<Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-faint)" }} />}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Grid view ── */}
      {view === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 22 }}>
          {loading ? (
            <div className="col-span-full flex justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--svf-accent)" }} />
            </div>
          ) : visibleMovies.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 gap-3">
              <Film className="h-8 w-8" style={{ color: "var(--text-faint)" }} />
              <p style={{ color: "var(--text-faint)" }}>No movies found</p>
            </div>
          ) : visibleMovies.map((movie, idx) => {
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
                  {pv?.poster_url && (
                    <img
                      src={pv.poster_url}
                      alt={movie.title}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  {movie.production_no && !movie.production_no.startsWith("single_") && (
                    <span className="absolute top-2 left-2" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.07em", color: "rgba(255,255,255,0.55)" }}>
                      {movie.production_no}
                    </span>
                  )}
                  {pv?.wtp_library && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "oklch(0.70 0.16 305 / 0.3)", color: "oklch(0.85 0.10 305)", backdropFilter: "blur(4px)" }}>{pv?.wtp_library}</span>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 pt-8" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)" }}>
                    <p title={movie.title} className="leading-tight text-white line-clamp-2" style={{ fontFamily: "var(--font-serif)", fontSize: 16, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
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
                    <span title={movie.title} className="font-semibold truncate" style={{ fontSize: 13.5, color: "var(--text)" }}>{movie.title}</span>
                    {movie.certification && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 5, border: "1px solid var(--svf-border)", color: "var(--text-faint)", flexShrink: 0 }}>{movie.certification}</span>
                    )}
                  </div>
                  <p title={pv?.director_names?.split(/[,&]/)[0]?.trim() || undefined} className="truncate" style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>
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
            ) : visibleMovies.length === 0 ? (
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
                          checked={visibleMovies.length > 0 && selectedIds.size === visibleMovies.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <FilterableHead label="Title" className="pl-2 text-(--text-faint)">
                        <ColumnFilter
                          options={titleOptions}
                          value={titleFilter}
                          onChange={setTitleFilter}
                          searchable
                          searchValue={searchQuery}
                          onSearchChange={setSearchQuery}
                          searchPlaceholder="Search title or prod no…"
                        />
                      </FilterableHead>
                      <FilterableHead label="Source" className="text-(--text-faint)">
                        <ColumnFilter
                          options={SOURCE_OPTIONS}
                          value={sourceSel}
                          onChange={handleSourceChange}
                        />
                      </FilterableHead>
                      <TableHead className="hidden sm:table-cell text-(--text-faint)">
                        <button
                          type="button"
                          onClick={() => setReleaseSort(releaseSort === 'none' ? 'desc' : releaseSort === 'desc' ? 'asc' : 'none')}
                          className="flex items-center gap-1 cursor-pointer hover:underline whitespace-nowrap"
                          title={releaseSort === 'desc' ? 'Newest first' : releaseSort === 'asc' ? 'Oldest first' : 'Sort by release date'}
                        >
                          <span>Release</span>
                          {releaseSort === 'desc' ? <ChevronDown className="h-3.5 w-3.5" />
                            : releaseSort === 'asc' ? <ChevronUp className="h-3.5 w-3.5" />
                              : <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />}
                        </button>
                      </TableHead>
                      <FilterableHead label="Cert" className="hidden md:table-cell w-px px-1 text-(--text-faint)">
                        <ColumnFilter
                          options={certificationOptions}
                          value={certificationFilter}
                          onChange={setCertificationFilter}
                        />
                      </FilterableHead>
                      <FilterableHead label="Language" className="hidden lg:table-cell text-(--text-faint)">
                        <ColumnFilter
                          options={languages}
                          value={languageFilter}
                          onChange={setLanguageFilter}
                          searchable
                        />
                      </FilterableHead>
                      {showJointProdCols && (
                        <>
                          <TableHead className="hidden lg:table-cell text-(--text-faint)">Rev Share</TableHead>
                          <TableHead className="hidden lg:table-cell text-(--text-faint)">Prod House</TableHead>
                        </>
                      )}
                      <TableHead className="hidden lg:table-cell min-w-32 text-(--text-faint)">Rights</TableHead>
                      {showLicensorCol && <TableHead className="hidden lg:table-cell text-(--text-faint)">Licensor</TableHead>}
                      {showAgreementEndCol && <TableHead className="hidden xl:table-cell text-(--text-faint)">Agreement End</TableHead>}
                      {showBuyBackCol && <TableHead className="hidden xl:table-cell text-(--text-faint)">Buy Back</TableHead>}
                      <FilterableHead label="WTP" className="hidden xl:table-cell text-(--text-faint)">
                        <ColumnFilter options={WTP_OPTIONS} value={wtpFilter} onChange={setWtpFilter} />
                      </FilterableHead>
                      <TableHead className="text-right pr-6 text-(--text-faint)">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleMovies.map((movie, idx) => {
                      const pv = movie.primary_version || movie.versions[0];
                      const movieId = pv?.id;
                      // Read sold/expired off the row itself. Inferring it from the
                      // active source tab marked every home production as sold as
                      // soon as "Expired" was among the ticked sources.
                      const isSold = movie.source === "home_production" && isSoldHome(pv);
                      const isAcquired = movie.source === "acquired" && !isSold;
                      // Bangladeshi titles are stored as home/acquired, but the origin is
                      // what matters when reading the list, so it wins the source badge.
                      const isBangladeshi = (pv as any)?.is_bangladeshi === true;
                      const isExpiredAgreement = !!pv?.agreement_end_date && new Date(pv.agreement_end_date) < new Date();
                      const isExpired = isExpiredAgreement || isSold;
                      const hue = movieHue(movie, idx);
                      const hue2 = (hue + 40) % 360;

                      return (
                        <TableRow key={movie.production_no} style={{ borderColor: "var(--svf-border)" }} className={cn("transition-colors group", selectedIds.has(movie.production_no) && "bg-red-500/5")}>
                          <TableCell className="pl-4 w-10">
                            <Checkbox
                              checked={selectedIds.has(movie.production_no)}
                              onCheckedChange={() => toggleSelect(movie.production_no)}
                              aria-label={`Select ${movie.title}`}
                            />
                          </TableCell>
                          <TableCell className="pl-2 max-w-xs">
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Mini poster */}
                              <div style={{
                                width: 28, height: 40, borderRadius: 5, flexShrink: 0,
                                background: `linear-gradient(150deg, oklch(0.42 0.13 ${hue}) 0%, oklch(0.26 0.10 ${hue}) 42%, oklch(0.17 0.06 ${hue2}) 100%)`,
                                border: "1px solid var(--svf-border)", position: "relative", overflow: "hidden",
                              }}>
                                {pv?.poster_url && (
                                  <img
                                    src={pv.poster_url}
                                    alt={movie.title}
                                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                  />
                                )}
                                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "45%", background: "linear-gradient(to top, rgba(0,0,0,0.65), transparent)" }} />
                              </div>
                              <div className="min-w-0">
                                <Link href={`/movies/${movieId}`} title={movie.title} className="font-semibold text-sm hover:text-red-400 transition-colors break-words block" style={{ color: "var(--text)" }}>
                                  {movie.title}
                                  {movie.release_year && <span style={{ color: "var(--text-faint)", fontWeight: 400, marginLeft: 5 }}>({movie.release_year})</span>}
                                </Link>
                                {movie.production_no && !movie.production_no.startsWith("single_") && (
                                  <span className="text-[10px] font-mono mt-0.5 block" style={{ color: "var(--text-faint)" }}>{movie.production_no}</span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className={cn("text-[10px] w-fit font-semibold px-2 py-0.5",
                                isBangladeshi ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                  : movie.source === "acquired" ? "bg-violet-500/10 text-violet-400 border-violet-500/25"
                                    : (movie.primary_version as any)?.jointly_owned ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                                      : "bg-indigo-500/10 text-indigo-400 border-indigo-500/25"
                              )}>
                                {isBangladeshi ? "Bangladesh"
                                  : movie.source === "acquired" ? "Acquired"
                                    : (movie.primary_version as any)?.jointly_owned ? "Jointly Owned" : "Home"}
                              </Badge>
                              {isExpired && <Badge variant="destructive" className="text-[10px] w-fit font-semibold px-2 py-0.5">Expired</Badge>}
                            </div>
                          </TableCell>

                          <TableCell className="hidden sm:table-cell tabular-nums whitespace-nowrap" style={{ color: "var(--text-faint)" }}>
                            {pv?.release_date ? new Date(pv.release_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (movie.release_year || "—")}
                          </TableCell>

                          <TableCell className="hidden md:table-cell w-px px-2 whitespace-nowrap">
                            {movie.certification ? (
                              <Badge variant="secondary" className="text-[10px] font-bold">{movie.certification}</Badge>
                            ) : <span className="text-xs" style={{ color: "var(--text-faint)" }}>—</span>}
                          </TableCell>

                          <TableCell className="hidden lg:table-cell">
                            {movie.total_versions > 1 ? (
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
                            ) : (
                              <span className="text-xs" style={{ color: "var(--text)" }}>
                                {(movie.primary_version || movie.versions[0])?.language || "—"}
                              </span>
                            )}
                          </TableCell>

                          {showJointProdCols && (
                            <>
                              <TableCell className="hidden lg:table-cell" style={{ color: "var(--text-faint)" }}>{pv?.revenue_share || "—"}</TableCell>
                              <TableCell className="hidden lg:table-cell" style={{ color: "var(--text-faint)" }}>{movie.production_house_name || "—"}</TableCell>
                            </>
                          )}

                          <TableCell className="hidden lg:table-cell">
                            <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                              <Activity className="h-3 w-3 shrink-0" style={{ color: "var(--text-faint)" }} />
                              <span className="font-semibold" style={{ color: "var(--st-active)" }}>{movie.total_rights - movie.expired_rights}</span>
                              {movie.expired_rights > 0 && <span style={{ color: "var(--st-expired)", opacity: 0.7 }}>/ {movie.expired_rights} exp</span>}
                            </div>
                          </TableCell>

                          {showLicensorCol && (
                            <TableCell className="hidden lg:table-cell max-w-[180px]" style={{ color: "var(--text-faint)" }}>
                              <span className="block whitespace-normal break-words">{pv?.assignor_licensor || "—"}</span>
                            </TableCell>
                          )}

                          {showAgreementEndCol && (
                            <TableCell className="hidden xl:table-cell">
                              {isAcquired ? getAgreementEndBadge(pv?.agreement_end_date) : <span className="text-xs" style={{ color: "var(--text-faint)" }}>—</span>}
                            </TableCell>
                          )}

                          {showBuyBackCol && (
                            <TableCell className="hidden xl:table-cell tabular-nums" style={{ color: "var(--text-faint)" }}>
                              {formatDate(pv?.joint_prod_buy_back_date)}
                            </TableCell>
                          )}

                          <TableCell className="hidden xl:table-cell">
                            {pv?.wtp_library ? (
                              <Badge variant="outline" className="text-[10px] font-semibold" style={{ color: "var(--st-wtp)", background: "color-mix(in oklch, var(--st-wtp) 12%, transparent)", borderColor: "color-mix(in oklch, var(--st-wtp) 28%, transparent)" }}>
                                {pv.wtp_library}
                              </Badge>
                            ) : <span className="text-xs" style={{ color: "var(--text-faint)" }}>—</span>}
                          </TableCell>

                          <TableCell className="text-right pr-6">
                            <div className="flex items-center justify-end gap-1">
                              <RoleGate
                                action="edit"
                                resource="movie"
                                fallback={
                                  <DisabledActionButton size="sm" variant="ghost" className="h-7 w-7 p-0" reason="You don't have permission to edit movies.">
                                    <Edit className="h-3.5 w-3.5" />
                                  </DisabledActionButton>
                                }
                              >
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
      {isEditor && <FetchPostersDialog open={showFetchPostersDialog} onOpenChange={setShowFetchPostersDialog} onSuccess={() => fetchMovies()} />}
      {canBulkUploadCertificates && (
        <BulkCertificatesUploadDialog open={showBulkCertificatesDialog} onOpenChange={setShowBulkCertificatesDialog} onSuccess={() => fetchMovies()} />
      )}
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
  { key: "jointly_owned", label: "Jointly Owned" },
  { key: "holdbacks", label: "Holdbacks" },
  { key: "remarks", label: "Remarks" },
  { key: "actionables", label: "Actionable" },
  { key: "jointly_exploitation_rights", label: "Joint Exploitation Rights" },
  { key: "revenue_share", label: "Revenue Share" },
  { key: "joint_prod_buy_back_date", label: "Joint Buy Back Date" },
];

// Acquired metadata columns — movie-level fields only; rights come from movie_rights table via rightsMap
const ACQUIRED_META_FIELDS: ExportFieldDef[] = [
  { key: "title", label: "Movie Name" },
  { key: "assignor_licensor", label: "Assignor/ Licensor" },
  { key: "licensee", label: "Licensee" },
  { key: "agreement_date", label: "Date of Agreement" },
  { key: "agreement_start_date", label: "Agreement Start Date" },
  { key: "agreement_end_date", label: "Agreement End Date" },
  { key: "cast_names", label: "Cast Details" },
  { key: "director_names", label: "Director" },
  { key: "release_year", label: "Release Year" },
  { key: "certification", label: "Certification" },
  { key: "color_or_bw", label: "Color/B/W" },
  { key: "clip_rights", label: "Clip Rights" },
  { key: "clip_rights_duration", label: "Clip Rights Duration" },
  { key: "prequel_sequel_rights", label: "Prequel/ Sequel Rights" },
  { key: "character_rights", label: "Character Rights" },
  { key: "subtitling_rights", label: "Sub-Titling Rights" },
  { key: "dubbing_rights", label: "Dubbing Rights" },
];
