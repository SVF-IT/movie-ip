"use client";

import { BarcUploadDialog } from "@/components/barc/barc-upload-dialog";
import { DisabledActionButton } from "@/components/disabled-action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  Search,
  Trash2,
  Tv,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stringCodec, useUrlFilterState } from "@/hooks/use-url-filter-state";

const ALL = "__all__";

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

/** Seconds → h:mm:ss / m:ss, matching how ATS reads in the source sheet. */
function formatDuration(sec: number | null): string {
  if (sec === null) return "—";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
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
  const [search, setSearch] = useUrlFilterState("q", "", stringCodec);

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
    { year: initialYear },
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
      return keys.length === 1 && keys[0][0] === "year" && keys[0][1] === initialYear;
    }
  );

  // loadOptions runs once on mount; it reads the live filters through a ref so
  // it does not need them as a dependency.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const loadOptions = useCallback(async () => {
    try {
      const opts = await getBarcFilterOptions();
      setOptions(opts);
      // Fall back to the latest year with data if the current year has none.
      setFilters(
        filtersRef.current.year &&
          opts.years.length > 0 &&
          !opts.years.includes(filtersRef.current.year as number)
          ? { ...filtersRef.current, year: opts.years[0] }
          : filtersRef.current
      );
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    // Matches anywhere in the title or any of its BARC descriptions — the
    // description is often the only name a telecast is recognisable by.
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.descriptions.some((d) => d.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const defaultYear = options.years[0] ?? new Date().getFullYear();
  // The year defaults to the latest with data, so it alone is not "a filter".
  const hasFilters =
    !!search ||
    Object.entries(filters).some(
      ([k, v]) =>
        v !== null && v !== undefined && v !== "" && !(k === "year" && v === defaultYear)
    );

  const resetFilters = () => {
    setFilters({ year: defaultYear });
    setSearch("");
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
      {/* ── Filters ── */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="px-4 py-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <div className="col-span-2 sm:col-span-1 xl:col-span-2">
              <FilterLabel>Movie keywords</FilterLabel>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                  style={{ color: "var(--text-faint)" }}
                />
                <Input
                  placeholder="Search by movie or description…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-9"
                />
              </div>
            </div>

            {filterSelect("Year", "year", options.years, CalendarDays)}
            {filterSelect("Target", "target", options.targets, Users)}
            {filterSelect("Channel", "channel", options.channels, Tv)}
            {filterSelect("Region", "region", options.regions, MapPin)}
            {filterSelect("Week", "week", options.weeks, CalendarRange)}

            <div>
              <FilterLabel>Telecast from</FilterLabel>
              <Input
                type="date"
                className="h-9 w-full"
                value={filters.dateFrom ?? ""}
                onChange={(e) =>
                  setFilters({ ...filters, dateFrom: e.target.value || null })
                }
              />
            </div>

            <div>
              <FilterLabel>Telecast to</FilterLabel>
              <Input
                type="date"
                className="h-9 w-full"
                value={filters.dateTo ?? ""}
                onChange={(e) =>
                  setFilters({ ...filters, dateTo: e.target.value || null })
                }
              />
            </div>

            {hasFilters && (
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full gap-1.5 border-red-500/30 bg-red-500/5 text-red-400 hover:border-red-500/50 hover:bg-red-500/10"
                  onClick={resetFilters}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear Filters
                </Button>
              </div>
            )}

            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full gap-2 border-(--svf-border-strong) bg-(--bg-raise) text-(--text) hover:bg-(--hover)"
                onClick={() => setSheetsOpen(true)}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Sheets
                {sheets.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5">
                    {sheets.length}
                  </Badge>
                )}
              </Button>
            </div>

            <div className="flex items-end">
              {canManage ? (
                <Button
                  size="sm"
                  className="h-9 w-full gap-2 border-0 bg-red-600 text-white shadow-lg shadow-red-900/30 hover:bg-red-500"
                  onClick={() => setUploadOpen(true)}
                >
                  <Upload className="h-4 w-4" />
                  Upload Sheet
                </Button>
              ) : (
                <DisabledActionButton
                  className="h-9 w-full gap-2 border-0 bg-red-600 shadow-lg shadow-red-900/30"
                  reason="Only editors and admins can upload BARC sheets."
                >
                  <Upload className="h-4 w-4" />
                  Upload Sheet
                </DisabledActionButton>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
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
                <TableHead>Movie</TableHead>
                <TableHead>BARC description</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Certification</TableHead>
                <TableHead>Language</TableHead>
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
                          {r.source === "home_production" ? "Home" : "Acquired"}
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
                      {formatDuration(r.weighted_ats_sec)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        NIMS counts telecast rows — a movie shown three times in a day
        counts three times. Rating averages each week&#39;s average rat%;
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
