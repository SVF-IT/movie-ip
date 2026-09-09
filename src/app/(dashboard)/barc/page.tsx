"use client";

import { BarcUploadDialog } from "@/components/barc/barc-upload-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ALL = "__all__";

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

  const [tab, setTab] = useState("metrics");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BarcMovieRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<BarcSheet[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [options, setOptions] = useState({
    years: [] as number[],
    targets: [] as string[],
    channels: [] as string[],
    regions: [] as string[],
    weeks: [] as number[],
  });

  // NIMS and the weekly averages are yearly figures, so the page opens on a
  // single year rather than every year at once.
  const [filters, setFilters] = useState<BarcFilters>({ year: new Date().getFullYear() });

  const loadOptions = useCallback(async () => {
    try {
      const opts = await getBarcFilterOptions();
      setOptions(opts);
      // Fall back to the latest year with data if the current year has none.
      setFilters((prev) =>
        prev.year && opts.years.length > 0 && !opts.years.includes(prev.year)
          ? { ...prev, year: opts.years[0] }
          : prev
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
    return q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== null && v !== undefined && v !== ""
  ).length;

  const setFilter = (key: keyof BarcFilters, value: string) =>
    setFilters((prev) => ({
      ...prev,
      [key]:
        value === ALL
          ? null
          : key === "year" || key === "week"
            ? Number(value)
            : value,
    }));

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
    values: (string | number)[]
  ) => (
    <Select
      value={filters[key] === null || filters[key] === undefined ? ALL : String(filters[key])}
      onValueChange={(v) => setFilter(key, v)}
    >
      <SelectTrigger className="w-[150px]">
        <SelectValue placeholder={label} />
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
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BarChart3 className="h-6 w-6" />
            BARC
          </h1>
          <p className="text-sm text-muted-foreground">
            Telecast ratings imported from BARC sheets, grouped by movie.
          </p>
        </div>

        {canManage ? (
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload sheet
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button disabled>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload sheet
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              You do not have permission to upload BARC sheets.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="metrics">Movies</TabsTrigger>
          <TabsTrigger value="sheets">
            Sheets
            {sheets.length > 0 && (
              <Badge variant="secondary" className="ml-2">{sheets.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search movies…"
                className="w-[220px] pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {filterSelect("Year", "year", options.years)}
            {filterSelect("Target", "target", options.targets)}
            {filterSelect("Channel", "channel", options.channels)}
            {filterSelect("Region", "region", options.regions)}
            {filterSelect("Week", "week", options.weeks)}

            <Input
              type="date"
              className="w-[160px]"
              value={filters.dateFrom ?? ""}
              onChange={(e) =>
                setFilters((p) => ({ ...p, dateFrom: e.target.value || null }))
              }
            />
            <Input
              type="date"
              className="w-[160px]"
              value={filters.dateTo ?? ""}
              onChange={(e) =>
                setFilters((p) => ({ ...p, dateTo: e.target.value || null }))
              }
            />

            {(activeFilterCount > 0 || search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters({ year: options.years[0] ?? new Date().getFullYear() });
                  setSearch("");
                }}
              >
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
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

          <p className="text-xs text-muted-foreground">
            NIMS counts telecast rows — a movie shown three times in a day
            counts three times. Rating averages each week&#39;s average rat%;
            GRP averages each week&#39;s summed GRP, where a telecast&#39;s GRP
            is (length × rat%) / 1800. With a single week selected both are
            that week&#39;s own average and sum. Average time is reach-weighted
            and ignores telecasts reported as “n.a”.
          </p>
        </TabsContent>

        <TabsContent value="sheets">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
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
        </TabsContent>
      </Tabs>

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
