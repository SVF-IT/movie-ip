"use client";

import { BarcUploadDialog } from "@/components/barc/barc-upload-dialog";
import { DisabledActionButton } from "@/components/disabled-action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnFilter, FilterableHead } from "@/components/ui/column-header-filter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useAppToast } from "@/hooks/use-app-toast";
import { usePermission } from "@/hooks/use-permission";
import { stringListCodec, useUrlFilterState } from "@/hooks/use-url-filter-state";
import {
  deleteBarcSheet,
  getBarcFilterOptions,
  getBarcMovieRows,
  getBarcSheetDownloadUrl,
  getBarcSheets,
  type BarcFilters,
  type BarcMovieRow,
  type BarcSheet,
} from "@/lib/api/barc";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CalendarRange,
  Download,
  FileSpreadsheet,
  Loader2,
  MapPin,
  Trash2,
  Tv,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ALL = "__all__";
/** Option key for a blank value, so rows without one stay filterable. */
const NONE_KEY = "__none__";
/**
 * Every telecast is reported once per target audience, and NIMS counts each
 * target separately, so "all targets" multiplies the figures. The page opens on
 * this one; if a sheet does not carry it, the first available target is used.
 */
const DEFAULT_TARGET = "2+ All";

/** The filters this page offers; anything else in an old link is ignored. */
const FILTER_KEYS = ["region", "year", "week", "target", "channel"];

type ColumnKey = "movie" | "description" | "source" | "certification" | "language";

/** The value a row contributes to a header funnel. */
function columnValues(r: BarcMovieRow, col: ColumnKey): string[] {
  switch (col) {
    case "movie":
      return [r.title];
    case "description":
      return r.descriptions.length ? r.descriptions : [NONE_KEY];
    case "source":
      return [r.source || NONE_KEY];
    case "certification":
      return [r.certification || NONE_KEY];
    case "language":
      return [r.language || NONE_KEY];
  }
}

function sourceLabel(source: string): string {
  return source === "home_production" ? "Home" : "Acquired";
}

/** The small uppercase caption above each filter, as on the Movies page. */
function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest"
      style={{ color: "var(--text-faint)" }}
    >
      {children}
    </label>
  );
}

/**
 * Seconds → Excel's time serial: the fraction of a day, which is how Excel
 * shows a time cell in Number format (22:29 → 0.0156134259259259).
 */
function toDayFraction(sec: number): number {
  // Excel keeps 15 significant digits; matching it keeps the two identical.
  return Number((sec / 86400).toPrecision(15));
}

function formatMetric(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

export default function BarcPage() {
  const toast = useAppToast();
  // useAppToast returns a new object each render, so it is deliberately left
  // out of the dependency arrays below and read through a ref instead: a
  // failing query would otherwise re-create the loader, re-fire its effect,
  // and retry forever.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const { allowed: canManage } = usePermission("create", "barc");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BarcMovieRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<BarcSheet[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [options, setOptions] = useState({
    years: [] as number[],
    targets: [] as string[],
    channels: [] as string[],
    regions: [] as string[],
    weeks: [] as number[],
  });

  // NIMS and the weekly averages are yearly figures, so the page opens on a
  // single year rather than every year at once.
  const initialYear = new Date().getFullYear();
  // Every BARC filter lives in one object, so it is mirrored as one compact
  // `a:b` parameter rather than eight separate keys.
  const [filters, setFilters] = useUrlFilterState<BarcFilters>(
    "f",
    { year: initialYear, target: DEFAULT_TARGET },
    {
      encode: (v) => {
        const parts = Object.entries(v)
          .filter(([, val]) => val !== null && val !== undefined && val !== "")
          .map(([k, val]) => `${k}:${encodeURIComponent(String(val))}`);
        return parts.length ? parts.join("~") : null;
      },
      decode: (raw) => {
        const out: Record<string, unknown> = {};
        raw.split("~").forEach((part) => {
          const i = part.indexOf(":");
          if (i < 0) return;
          const k = part.slice(0, i);
          if (!FILTER_KEYS.includes(k)) return;
          const val = decodeURIComponent(part.slice(i + 1));
          out[k] = k === "year" || k === "week" ? Number(val) : val;
        });
        return out as BarcFilters;
      },
    },
    (v) => {
      const keys = Object.entries(v).filter(
        ([, val]) => val !== null && val !== undefined && val !== ""
      );
      return (
        keys.length === 2 &&
        v.year === initialYear &&
        v.target === DEFAULT_TARGET
      );
    }
  );

  // Header funnels. Empty means "no narrowing", so the default never reaches
  // the URL and the option lists can shrink without a stale pick showing.
  const [movieFilter, setMovieFilter] = useUrlFilterState<string[]>(
    "movie", [], stringListCodec, (v) => v.length === 0
  );
  const [descFilter, setDescFilter] = useUrlFilterState<string[]>(
    "desc", [], stringListCodec, (v) => v.length === 0
  );
  const [sourceFilter, setSourceFilter] = useUrlFilterState<string[]>(
    "src", [], stringListCodec, (v) => v.length === 0
  );
  const [certFilter, setCertFilter] = useUrlFilterState<string[]>(
    "cert", [], stringListCodec, (v) => v.length === 0
  );
  const [langFilter, setLangFilter] = useUrlFilterState<string[]>(
    "lang", [], stringListCodec, (v) => v.length === 0
  );
  const columnFilters: Record<ColumnKey, string[]> = {
    movie: movieFilter,
    description: descFilter,
    source: sourceFilter,
    certification: certFilter,
    language: langFilter,
  };

  // loadOptions runs once on mount; it reads the live filters through a ref so
  // it does not need them as a dependency.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const loadOptions = useCallback(async () => {
    try {
      const opts = await getBarcFilterOptions();
      setOptions(opts);
      // Fall back to the latest year with data if the current year has none,
      // and to the first target if the default target is not in the data.
      const current = filtersRef.current;
      const next = { ...current };
      if (current.year && opts.years.length > 0 && !opts.years.includes(current.year)) {
        next.year = opts.years[0];
      }
      if (current.target && opts.targets.length > 0 && !opts.targets.includes(current.target)) {
        next.target = opts.targets.includes(DEFAULT_TARGET) ? DEFAULT_TARGET : opts.targets[0];
      }
      setFilters(next);
    } catch (e) {
      toastRef.current.error(e instanceof Error ? e.message : "Could not load filters.");
    }
  }, []);

  const loadSheets = useCallback(async () => {
    try {
      setSheets(await getBarcSheets());
    } catch (e) {
      toastRef.current.error(e instanceof Error ? e.message : "Could not load sheets.");
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getBarcMovieRows(filters));
      setLoadError(null);
    } catch (e) {
      // Shown in the table rather than as a toast: a failing query would
      // otherwise raise one on every filter change.
      setRows([]);
      setLoadError(e instanceof Error ? e.message : "Could not load BARC data.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadOptions();
    loadSheets();
  }, [loadOptions, loadSheets]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  /** Rows passing every header funnel except `skip` — what that funnel offers. */
  const rowsExcept = useCallback(
    (skip: ColumnKey | null) =>
      rows.filter((r) =>
        (Object.keys(columnFilters) as ColumnKey[]).every((col) => {
          const picked = columnFilters[col];
          return (
            col === skip ||
            picked.length === 0 ||
            columnValues(r, col).some((v) => picked.includes(v))
          );
        })
      ),
    // columnFilters is rebuilt each render; its five arrays are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, movieFilter, descFilter, sourceFilter, certFilter, langFilter]
  );

  const filtered = useMemo(() => rowsExcept(null), [rowsExcept]);

  /** Interdependent options: only values that still yield rows. */
  const columnOptions = useCallback(
    (col: ColumnKey, label: (v: string) => string = (v) => v) => {
      const values = new Set<string>();
      for (const r of rowsExcept(col)) columnValues(r, col).forEach((v) => values.add(v));
      return [...values]
        .sort((a, b) =>
          a === NONE_KEY ? 1 : b === NONE_KEY ? -1 : label(a).localeCompare(label(b))
        )
        .map((value) => ({
          value,
          label: value === NONE_KEY ? "— Not set —" : label(value),
        }));
    },
    [rowsExcept]
  );

  const defaultYear = options.years[0] ?? new Date().getFullYear();
  const defaultTarget =
    options.targets.length === 0 || options.targets.includes(DEFAULT_TARGET)
      ? DEFAULT_TARGET
      : options.targets[0];
  // Year and target open on a default, so those alone are not "a filter".
  const hasFilters =
    Object.values(columnFilters).some((v) => v.length > 0) ||
    Object.entries(filters).some(
      ([k, v]) =>
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !(k === "year" && v === defaultYear) &&
        !(k === "target" && v === defaultTarget)
    ) ||
    !filters.target;

  const resetFilters = () => {
    setFilters({ year: defaultYear, target: defaultTarget });
    setMovieFilter([]);
    setDescFilter([]);
    setSourceFilter([]);
    setCertFilter([]);
    setLangFilter([]);
  };

  const setFilter = (key: keyof BarcFilters, value: string) =>
    setFilters({
      ...filters,
      [key]:
        value === ALL
          ? null
          : key === "year" || key === "week"
            ? Number(value)
            : value,
    });

  const exportToExcel = async () => {
    const XLSX = await import("xlsx");
    const data = filtered.map((r) => ({
      Movie: r.title,
      "Production House": r.production_house_name || "",
      "BARC Description": r.descriptions.join(", "),
      Channels: r.channels.join(", "),
      Source: r.source ? sourceLabel(r.source) : "",
      Certification: r.certification || "",
      Language: r.language || "",
      "Release Date": r.release_date || "",
      NIMS: r.nims,
      Rating: r.rating === null ? "" : Number(r.rating.toFixed(3)),
      GRP: r.grp === null ? "" : Number(r.grp.toFixed(3)),
      "Avg. Time": r.weighted_ats_sec === null ? "" : toDayFraction(r.weighted_ats_sec),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...data.map((r) => String((r as Record<string, unknown>)[key] ?? "").length)) + 2,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BARC");
    // The file name carries the active filters so exports stay distinguishable.
    const tag = FILTER_KEYS.map((k) => filters[k as keyof BarcFilters])
      .filter((v) => v !== null && v !== undefined && v !== "")
      .join("-")
      .replace(/[^A-Za-z0-9+-]+/g, "_");
    XLSX.writeFile(wb, `barc${tag ? `-${tag}` : ""}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownload = async (sheet: BarcSheet) => {
    try {
      window.open(await getBarcSheetDownloadUrl(sheet.file_path), "_blank");
    } catch (e) {
      toastRef.current.error(e instanceof Error ? e.message : "Could not open the file.");
    }
  };

  const handleDelete = async (sheet: BarcSheet) => {
    if (
      !window.confirm(
        `Delete "${sheet.file_name}"? Its ${sheet.row_count.toLocaleString()} telecast rows and the stored file will be removed. Description mappings are kept.`
      )
    ) {
      return;
    }

    setDeletingId(sheet.id);
    try {
      await deleteBarcSheet(sheet.id, sheet.file_path);
      toastRef.current.success(`Deleted ${sheet.file_name}.`);
      await Promise.all([loadSheets(), loadRows(), loadOptions()]);
    } catch (e) {
      toastRef.current.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const filterSelect = (
    label: string,
    key: keyof BarcFilters,
    values: (string | number)[],
    Icon: LucideIcon
  ) => (
    <div key={key}>
      <FilterLabel>{label}</FilterLabel>
      <Select
        value={
          filters[key] === null || filters[key] === undefined
            ? ALL
            : String(filters[key])
        }
        onValueChange={(v) => setFilter(key, v)}
      >
        <SelectTrigger className="h-9 w-full">
          <div className="flex items-center gap-2">
            <Icon
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: "var(--text-faint)" }}
            />
            <SelectValue placeholder={`All ${label.toLowerCase()}`} />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
          {values.map((v) => (
            <SelectItem key={String(v)} value={String(v)}>
              {String(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Sheets & export ── */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="flex flex-wrap items-center gap-2 px-4 py-3">
          {canManage ? (
            <Button
              size="sm"
              className="h-9 gap-2 border-0 bg-red-600 text-white shadow-lg shadow-red-900/30 hover:bg-red-500"
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Upload Sheet
            </Button>
          ) : (
            <DisabledActionButton
              className="h-9 gap-2 border-0 bg-red-600 shadow-lg shadow-red-900/30"
              reason="Only editors and admins can upload BARC sheets."
            >
              <Upload className="h-4 w-4" />
              Upload Sheet
            </DisabledActionButton>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-(--svf-border-strong) bg-(--bg-raise) text-(--text) hover:bg-(--hover)"
            onClick={() => setSheetsOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4" />
            View Sheets
            {sheets.length > 0 && (
              <Badge variant="secondary" className="ml-0.5">
                {sheets.length}
              </Badge>
            )}
          </Button>

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-(--svf-border-strong) bg-(--bg-raise) text-(--text) hover:bg-(--hover)"
            onClick={exportToExcel}
            disabled={loading || filtered.length === 0}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </CardContent>
      </Card>

      {/* ── Filters ── */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="px-4 py-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {filterSelect("Region", "region", options.regions, MapPin)}
            {filterSelect("Year", "year", options.years, CalendarDays)}
            {filterSelect("Week", "week", options.weeks, CalendarRange)}
            {filterSelect("Target", "target", options.targets, Users)}
            {filterSelect("Channel", "channel", options.channels, Tv)}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 border-red-500/30 bg-red-500/5 text-red-400 hover:border-red-500/50 hover:bg-red-500/10"
            onClick={resetFilters}
          >
            <X className="h-3.5 w-3.5" />
            Clear Filters
          </Button>
        )}
        {!loading && (
          <p className="text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>
            <strong style={{ color: "var(--text)" }}>{filtered.length}</strong>{" "}
            movie{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader style={{ background: "var(--bg-deep)" }}>
              <TableRow className="border-(--svf-border) hover:bg-transparent">
                <FilterableHead label="Movie">
                  <ColumnFilter
                    options={columnOptions("movie")}
                    value={movieFilter}
                    onChange={setMovieFilter}
                    searchable
                    searchPlaceholder="Search movie…"
                  />
                </FilterableHead>
                <FilterableHead label="BARC description">
                  <ColumnFilter
                    options={columnOptions("description")}
                    value={descFilter}
                    onChange={setDescFilter}
                    searchable
                    searchPlaceholder="Search description…"
                  />
                </FilterableHead>
                <FilterableHead label="Source">
                  <ColumnFilter
                    options={columnOptions("source", sourceLabel)}
                    value={sourceFilter}
                    onChange={setSourceFilter}
                  />
                </FilterableHead>
                <FilterableHead label="Cert.">
                  <ColumnFilter
                    options={columnOptions("certification")}
                    value={certFilter}
                    onChange={setCertFilter}
                  />
                </FilterableHead>
                <FilterableHead label="Language">
                  <ColumnFilter
                    options={columnOptions("language")}
                    value={langFilter}
                    onChange={setLangFilter}
                  />
                </FilterableHead>
                <TableHead>Release date</TableHead>
                <TableHead className="text-right">NIMS</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="text-right">GRP</TableHead>
                <TableHead className="text-right">Avg. time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-destructive">{loadError}</p>
                      <p className="text-xs text-muted-foreground">
                        If this mentions a missing column, re-run
                        sql/31_barc.sql — it upgrades an older BARC schema in
                        place.
                      </p>
                      <Button variant="outline" size="sm" onClick={loadRows}>
                        Retry
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center text-sm text-muted-foreground">
                    {sheets.length === 0
                      ? "No BARC sheets uploaded yet."
                      : "No telecasts match these filters, or no descriptions are mapped to movies yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.movie_id}>
                    <TableCell className="font-medium">
                      {r.title}
                      {r.production_house_name && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {r.production_house_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.descriptions.map((d) => (
                          <Badge key={d} variant="secondary" className="font-mono text-xs">
                            {d}
                          </Badge>
                        ))}
                      </div>
                      {r.channels.length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {r.channels.join(", ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.source ? (
                        <Badge variant="outline">
                          {sourceLabel(r.source)}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{r.certification || "—"}</TableCell>
                    <TableCell>{r.language || "—"}</TableCell>
                    <TableCell>{r.release_date || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.nims.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMetric(r.rating, 3)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMetric(r.grp, 3)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.weighted_ats_sec === null ? "—" : toDayFraction(r.weighted_ats_sec).toFixed(7)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        NIMS counts distinct airings — unique Week + Date + Week Day + Start
        Time + End Time + Target — so a movie shown three times in a day counts
        three times, but one airing reported for several regions counts once. Rating averages each week&#39;s average rat%;
        GRP averages each week&#39;s summed GRP, where a telecast&#39;s GRP
        is (length × rat%) / 1800. With a single week selected both are
        that week&#39;s own average and sum. Average time is reach-weighted
        and ignores telecasts reported as “n.a”.
      </p>

      {/* Uploaded sheets — a dialog rather than a tab, so the page stays
          focused on the metrics table. */}
      <Dialog open={sheetsOpen} onOpenChange={setSheetsOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Uploaded sheets
            </DialogTitle>
            <DialogDescription>
              Every imported BARC sheet. Deleting one removes its telecast rows
              and the stored file; description mappings are kept.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto py-4">
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader style={{ background: "var(--bg-deep)" }}>
                    <TableRow className="border-(--svf-border) hover:bg-transparent">
                      <TableHead>File</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead className="text-right">Mapped</TableHead>
                      <TableHead>Uploaded by</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                          No sheets uploaded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sheets.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                              {s.file_name}
                            </span>
                            {s.notes && (
                              <span className="text-xs text-muted-foreground">{s.notes}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.period_start ? `${s.period_start} → ${s.period_end}` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.row_count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.matched_count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm">{s.created_by_name || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {new Date(s.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDownload(s)}
                                title="Download"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              {canManage && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(s)}
                                  disabled={deletingId === s.id}
                                  title="Delete sheet and its rows"
                                >
                                  {deletingId === s.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BarcUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={() => {
          loadSheets();
          loadRows();
          loadOptions();
        }}
      />
    </div>
  );
}
