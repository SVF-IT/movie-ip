"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
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
import {
  deleteTemplate,
  getSvodPlatformNames,
  getTemplates,
  runTemplate,
  type AttachedRight,
  type TemplateResultRow,
} from "@/lib/api/templates";
import { describeDefinition, type Template } from "@/lib/types/templates";
import { canManageTemplates } from "@/lib/types/database";
import { ColumnFilter, FilterableHead } from "@/components/ui/column-header-filter";
import { NONE_KEY } from "@/lib/utils/rights-types";

import { stringCodec, useUrlFilterState } from "@/hooks/use-url-filter-state";
import {
  ArrowLeft,
  Download,
  Layers,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Check,
  Sparkles,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Family → accent token, so a card reads as its right at a glance. */
const FAMILY_ACCENT: Record<string, string> = {
  satellite: "var(--st-expiring)",
  internet: "var(--st-active)",
  other: "var(--st-wtp)",
};

/** One-line reading of what is standing in a title's way, for the export. */
function describeAttached(attached: AttachedRight[]): string {
  if (!attached || attached.length === 0) return "None";
  return attached
    .map((a) => {
      const window = [a.startDate, a.endDate].filter(Boolean).join(" \u2192 ");
      return window ? `${a.label} (${window})` : a.label;
    })
    .join("; ");
}

/**
 * Source for the export, qualified when the title is also Bangladeshi —
 * "Acquired (Bangladesh)". Bangladeshi is a flag rather than a source of its
 * own, so it reads as a qualifier on the catalogue rather than replacing it.
 */
function exportSource(r: any): string {
  const base = r.source === "home_production" ? "Home" : "Acquired";
  return r.is_bangladeshi === true ? `${base} (Bangladesh)` : base;
}

/** Colour-coded so a scan finds what is sellable today. */
function OpenStatus({ days }: { days: number }) {
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-(--st-active)/30 bg-(--st-active)/12 px-2.5 py-0.5 text-xs font-medium text-(--st-active)">
        <Check className="h-3 w-3" />
        Currently open
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-(--st-expiring)/30 bg-(--st-expiring)/12 px-2.5 py-0.5 text-xs font-medium text-(--st-expiring)">
      <Timer className="h-3 w-3" />
      Opens in {days} {days === 1 ? "day" : "days"}
    </span>
  );
}

export default function TemplatesPage() {
  const { profile } = useAuth();
  const toast = useAppToast();
  const canManage = canManageTemplates(profile?.role);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // The open template lives in the URL, so a result view is shareable and
  // survives a refresh — the same contract every other list page here honours.
  const [activeId, setActiveId] = useUrlFilterState<string>("t", "", stringCodec);

  const [running, setRunning] = useState(false);
  // Every matching row is held in memory and the table scrolls, so column
  // filters and sorting act on the whole result rather than one page of it.
  const [allRows, setAllRows] = useState<TemplateResultRow[]>([]);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  // Inline column filters, matching the rights dashboard. Each holds the
  // selected values; all-selected reads as no filter.
  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [attachedSel, setAttachedSel] = useState<string[]>([]);
  const [languageSel, setLanguageSel] = useState<string[]>([]);
  const [certSel, setCertSel] = useState<string[]>([]);
  const [sourceSel, setSourceSel] = useState<string[]>([]);
  const [licensorSel, setLicensorSel] = useState<string[]>([]);
  const [wtpSel, setWtpSel] = useState<string[]>([]);
  const [releaseSel, setReleaseSel] = useState<string[]>([]);
  const [cannotSel, setCannotSel] = useState<string[]>([]);
  // Every SVOD buyer, so the funnel can ask about one no current row names.
  const [svodPlatforms, setSvodPlatforms] = useState<string[]>([]);

  const active = useMemo(
    () => templates.find((t) => t.id === activeId) || null,
    [templates, activeId]
  );

  useEffect(() => {
    getSvodPlatformNames().then(setSvodPlatforms);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await getTemplates();
      if (!cancelled) {
        setTemplates(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const execute = useCallback(async (template: Template, term: string) => {
    setRunning(true);
    // limit: 0 keeps `data` empty; `all` carries every row, which is what the
    // scrolling table renders.
    const res = await runTemplate(template.definition, {
      search: term || undefined,
      limit: 0,
    });
    setAllRows(res.all);
    setRunning(false);
  }, []);

  // Re-runs whenever the chosen template, page or search term changes. The
  // template itself carries every rule, so nothing else needs to be passed.
  useEffect(() => {
    if (!active) {
      setAllRows([]);
      return;
    }
    execute(active, search);
  }, [active, search, execute]);

  const handleOpen = (t: Template) => {
    setActiveId(t.id);
    setSearch("");
    // A new template's rows have nothing to do with the last one's, so stale
    // column filters would silently hide most of it.
    setStatusSel([]);
    setAttachedSel([]);
    setLanguageSel([]);
    setCertSel([]);
    setSourceSel([]);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deleteTemplate(deleteTarget.id);
    if (error) {
      toast.error("Could not delete template", error);
    } else {
      toast.success(`Deleted "${deleteTarget.name}"`);
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      if (activeId === deleteTarget.id) setActiveId("");
    }
    setDeleteTarget(null);
  };

  // ── Column filter options and the filtered rows ──────────────────────────
  // Options come from the rows themselves, so a value that cannot appear is
  // never offered. Blanks are represented by NONE_KEY rather than dropped, so
  // ticking every box returns the same set as ticking none.
  const statusOf = (r: TemplateResultRow) =>
    r.opensInDays === 0 ? "open" : "later";
  const attachedOf = (r: TemplateResultRow) =>
    r.attached.length === 0 ? "none" : "attached";
  /**
   * A title's catalogues. Bangladeshi is a flag, not a source — an acquired
   * title can also be Bangladeshi — so this returns every label that applies
   * and the filter matches if ANY of them is selected.
   */
  const sourcesOf = (r: any): string[] => {
    const out = [r.source === "home_production" ? "Home" : "Acquired"];
    if (r.is_bangladeshi === true) out.push("Bangladesh");
    return out;
  };

  /** Licensor as the catalogue reads it: home productions are SVF's own. */
  const licensorOf = (r: any) =>
    r.source === "home_production" ? "SVF" : (r.assignor_licensor || "");

  /** Release year, falling back to the year of a full release date. */
  const releaseYearOf = (r: any): string => {
    if (r.release_year) return String(r.release_year).trim();
    if (!r.release_date) return "";
    const y = new Date(r.release_date).getFullYear();
    return Number.isFinite(y) ? String(y) : "";
  };

  const buildOptions = (values: (string | null | undefined)[]) => {
    const set = new Set<string>();
    let hasBlank = false;
    for (const v of values) {
      const t = (v || "").trim();
      if (t) set.add(t);
      else hasBlank = true;
    }
    const opts = Array.from(set)
      .sort()
      .map((v) => ({ value: v, label: v }));
    // "Not set" belongs at the end rather than sorted among real values.
    return hasBlank ? [...opts, { value: NONE_KEY, label: "— Not set —" }] : opts;
  };

  const statusOptions = useMemo(
    () => [
      { value: "open", label: "Currently open" },
      { value: "later", label: "Opening later" },
    ],
    []
  );
  const attachedOptions = useMemo(
    () => [
      { value: "none", label: "None" },
      { value: "attached", label: "Has rights attached" },
    ],
    []
  );
  const languageOptions = useMemo(
    () => buildOptions(allRows.map((r: any) => r.language)),
    [allRows]
  );
  const certOptions = useMemo(
    () => buildOptions(allRows.map((r: any) => r.certification)),
    [allRows]
  );
  /**
   * Buyer restrictions. The options are every SVOD platform plus whatever the
   * rows actually name — a holdback can bar a company SVF has no platform row
   * for (Disney resolves to Hotstar, but Amazon may not be in the table at
   * all) — plus "— Not set —" for titles with no restriction at all.
   */
  const cannotOptions = useMemo(() => {
    const set = new Set<string>(svodPlatforms);
    for (const r of allRows) for (const p of r.cannotSellTo || []) set.add(p);
    const opts = Array.from(set).sort().map((v) => ({ value: v, label: v }));
    const anyUnrestricted = allRows.some((r) => (r.cannotSellTo || []).length === 0);
    return anyUnrestricted
      ? [...opts, { value: NONE_KEY, label: "— Not set —" }]
      : opts;
  }, [allRows, svodPlatforms]);

  const sourceOptions = useMemo(() => {
    // Only offer Bangladesh when the result actually contains such a title,
    // so the funnel never lists a choice that yields nothing.
    const opts = [
      { value: "Home", label: "Home" },
      { value: "Acquired", label: "Acquired" },
    ];
    if (allRows.some((r: any) => r.is_bangladeshi === true)) {
      opts.push({ value: "Bangladesh", label: "Bangladesh" });
    }
    return opts;
  }, [allRows]);

  const licensorOptions = useMemo(
    () => buildOptions(allRows.map(licensorOf)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows]
  );
  const wtpOptions = useMemo(
    () => buildOptions(allRows.map((r: any) => r.wtp_library)),
    [allRows]
  );
  // Newest first: a recent title is the one a buyer is most likely asking about.
  const releaseOptions = useMemo(() => {
    const opts = buildOptions(allRows.map(releaseYearOf));
    const years = opts.filter((o) => o.value !== NONE_KEY).sort((a, b) => b.value.localeCompare(a.value));
    const notSet = opts.filter((o) => o.value === NONE_KEY);
    return [...years, ...notSet];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows]);

  // A selection narrows only when it is a strict subset; empty or all-selected
  // both mean "no filter", so a fresh view and a fully-ticked one agree.
  const passes = (sel: string[], options: { value: string }[], v: string) =>
    sel.length === 0 || sel.length >= options.length || sel.includes(v);

  const matchValue = (sel: string[], options: { value: string }[], raw: unknown) => {
    const v = typeof raw === "string" ? raw.trim() : "";
    return passes(sel, options, v || NONE_KEY);
  };

  const rows = useMemo(
    () =>
      allRows.filter(
        (r: any) =>
          passes(statusSel, statusOptions, statusOf(r)) &&
          passes(attachedSel, attachedOptions, attachedOf(r)) &&
          matchValue(languageSel, languageOptions, r.language) &&
          matchValue(certSel, certOptions, r.certification) &&
          // Any applicable catalogue matching is enough.
          (sourceSel.length === 0 ||
            sourceSel.length >= sourceOptions.length ||
            sourcesOf(r).some((v) => sourceSel.includes(v))) &&
          matchValue(licensorSel, licensorOptions, licensorOf(r)) &&
          matchValue(wtpSel, wtpOptions, r.wtp_library) &&
          matchValue(releaseSel, releaseOptions, releaseYearOf(r)) &&
          // A title matches when ANY platform it is barred from is selected;
          // NONE_KEY covers the titles barred from nobody.
          (cannotSel.length === 0 ||
            cannotSel.length >= cannotOptions.length ||
            ((r.cannotSellTo || []).length === 0
              ? cannotSel.includes(NONE_KEY)
              : (r.cannotSellTo || []).some((p: string) => cannotSel.includes(p))))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      allRows, statusSel, attachedSel, languageSel, certSel, sourceSel,
      licensorSel, wtpSel, releaseSel, cannotSel,
      statusOptions, attachedOptions, languageOptions, certOptions, sourceOptions,
      licensorOptions, wtpOptions, releaseOptions, cannotOptions,
    ]
  );

  // The buyer-restriction column only earns its width when something is
  // actually restricted — satellite templates never populate it.
  const hasRestrictions = allRows.some((r) => (r.cannotSellTo || []).length > 0);

  const total = rows.length;
  const openNow = rows.filter((r) => r.opensInDays === 0).length;
  const openingLater = total - openNow;

  const anyColumnFiltered =
    [
      [statusSel, statusOptions],
      [attachedSel, attachedOptions],
      [languageSel, languageOptions],
      [certSel, certOptions],
      [sourceSel, sourceOptions],
      [licensorSel, licensorOptions],
      [wtpSel, wtpOptions],
      [releaseSel, releaseOptions],
      [cannotSel, cannotOptions],
    ].some(([sel, opts]: any) => sel.length > 0 && sel.length < opts.length);

  const clearColumnFilters = () => {
    setStatusSel([]);
    setAttachedSel([]);
    setLanguageSel([]);
    setCertSel([]);
    setSourceSel([]);
    setLicensorSel([]);
    setWtpSel([]);
    setReleaseSel([]);
    setCannotSel([]);
  };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const header = [
      "Title",
      "Production No",
      "Language",
      "Certification",
      "Licensor",
      "WTP / Library",
      "Source",
      "Release Year",
      "Release Date",
      "Open Status",
      "Opens On",
      "Opens In (days)",
      "Currently Attached",
      "Cannot Sell To",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      header.join(","),
      ...rows.map((r: any) =>
        [
          r.title,
          r.production_no,
          r.language,
          r.certification,
          licensorOf(r),
          r.wtp_library,
          exportSource(r),
          releaseYearOf(r),
          r.release_date,
          r.opensInDays === 0 ? "Currently Open" : `Opens in ${r.opensInDays} days`,
          r.opensOn || "",
          r.opensInDays,
          describeAttached(r.attached),
          (r.cannotSellTo || []).join("; "),
        ]
          .map(escape)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(active?.name || "template").replace(/[^\w-]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  // ── Results view ───────────────────────────────────────────────────────────
  if (active) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <button
              onClick={() => setActiveId("")}
              className="flex items-center gap-1.5 text-sm text-(--text-faint) transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              All templates
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">{active.name}</h1>
            <p className="text-sm text-(--text-faint)">
              {describeDefinition(active.definition)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={allRows.length === 0}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
            {canManage && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/templates/builder?id=${active.id}`}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  Edit logic
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-faint)" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search within results…"
              className="pl-9"
            />
          </div>
          {running ? (
            <span className="flex items-center gap-2 text-sm text-(--text-faint)">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running…
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-(--text-faint)">
                <span className="font-medium text-foreground">{total}</span> title
                {total === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-(--st-active)/30 bg-(--st-active)/10 px-2.5 py-0.5 text-xs font-medium text-(--st-active)">
                {openNow} open now
              </span>
              {openingLater > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-(--st-expiring)/30 bg-(--st-expiring)/10 px-2.5 py-0.5 text-xs font-medium text-(--st-expiring)">
                  {openingLater} opening soon
                </span>
              )}
              {anyColumnFiltered && (
                <button
                  onClick={clearColumnFilters}
                  className="inline-flex items-center gap-1 text-xs text-(--text-faint) underline-offset-2 hover:text-foreground hover:underline"
                >
                  <X className="h-3 w-3" />
                  Clear column filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* One scroll container: the header sticks, the body scrolls, and every
            matching row is present rather than paged. */}
        <div className="overflow-auto rounded-xl border border-(--border)" style={{ maxHeight: "calc(100vh - 20rem)" }}>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-(--surface)">
              <TableRow>
                <TableHead>Title</TableHead>
                <FilterableHead label="Open status">
                  <ColumnFilter
                    options={statusOptions}
                    value={statusSel.length ? statusSel : statusOptions.map((o) => o.value)}
                    onChange={setStatusSel}
                  />
                </FilterableHead>
                <TableHead>Opens on</TableHead>
                <FilterableHead label="Currently attached">
                  <ColumnFilter
                    options={attachedOptions}
                    value={attachedSel.length ? attachedSel : attachedOptions.map((o) => o.value)}
                    onChange={setAttachedSel}
                  />
                </FilterableHead>
                {hasRestrictions && (
                  <FilterableHead label="Cannot sell to">
                    <ColumnFilter
                      searchable
                      options={cannotOptions}
                      value={cannotSel.length ? cannotSel : cannotOptions.map((o) => o.value)}
                      onChange={setCannotSel}
                    />
                  </FilterableHead>
                )}
                <FilterableHead label="Language">
                  <ColumnFilter
                    searchable
                    options={languageOptions}
                    value={languageSel.length ? languageSel : languageOptions.map((o) => o.value)}
                    onChange={setLanguageSel}
                  />
                </FilterableHead>
                <FilterableHead label="Cert">
                  <ColumnFilter
                    options={certOptions}
                    value={certSel.length ? certSel : certOptions.map((o) => o.value)}
                    onChange={setCertSel}
                  />
                </FilterableHead>
                <FilterableHead label="Licensor">
                  <ColumnFilter
                    searchable
                    options={licensorOptions}
                    value={licensorSel.length ? licensorSel : licensorOptions.map((o) => o.value)}
                    onChange={setLicensorSel}
                  />
                </FilterableHead>
                <FilterableHead label="WTP / Library">
                  <ColumnFilter
                    options={wtpOptions}
                    value={wtpSel.length ? wtpSel : wtpOptions.map((o) => o.value)}
                    onChange={setWtpSel}
                  />
                </FilterableHead>
                <FilterableHead label="Released">
                  <ColumnFilter
                    searchable
                    options={releaseOptions}
                    value={releaseSel.length ? releaseSel : releaseOptions.map((o) => o.value)}
                    onChange={setReleaseSel}
                  />
                </FilterableHead>
                <FilterableHead label="Source">
                  <ColumnFilter
                    options={sourceOptions}
                    value={sourceSel.length ? sourceSel : sourceOptions.map((o) => o.value)}
                    onChange={setSourceSel}
                  />
                </FilterableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {running && allRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={hasRestrictions ? 11 : 10} className="py-16 text-center text-(--text-faint)">
                    <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                    Applying the base rules…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={hasRestrictions ? 11 : 10} className="py-16 text-center">
                    <p className="font-medium">
                      {allRows.length === 0
                        ? "No titles match this template"
                        : "No titles match these column filters"}
                    </p>
                    <p className="mt-1 text-sm text-(--text-faint)">
                      {allRows.length === 0
                        ? "Every title was excluded by one of the rules."
                        : "Clear a column filter to see more."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/movies/${r.id}`}
                        className="font-medium hover:text-(--svf-accent)"
                      >
                        {r.title}
                      </Link>
                      {r.production_no && (
                        <span className="ml-2 text-xs text-(--text-faint)">
                          {r.production_no}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <OpenStatus days={r.opensInDays} />
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-(--text-faint)">
                      {r.opensOn || "—"}
                    </TableCell>

                    {/* Why it is not open yet, so marketing knows who to chase. */}
                    <TableCell className="max-w-[20rem]">
                      {r.attached.length === 0 ? (
                        <span className="text-(--text-faint)">None</span>
                      ) : (
                        <div className="space-y-1">
                          {r.attached.map((a: AttachedRight, i: number) => (
                            <div key={i} className="text-xs">
                              <span className="font-medium">{a.label}</span>
                              {(a.startDate || a.endDate) && (
                                <span className="ml-1.5 text-(--text-faint)">
                                  {a.startDate || "?"} → {a.endDate || "perpetual"}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>

                    {hasRestrictions && (
                      <TableCell className="max-w-[14rem]">
                        {(r.cannotSellTo || []).length === 0 ? (
                          <span className="text-(--text-faint)">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.cannotSellTo.map((p: string) => (
                              <Badge
                                key={p}
                                variant="outline"
                                className="border-(--st-expiring)/40 text-[10px] font-normal text-(--st-expiring)"
                              >
                                {p}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-(--text-faint)">{r.language || "—"}</TableCell>
                    <TableCell className="text-(--text-faint)">
                      {r.certification || "—"}
                    </TableCell>
                    <TableCell className="max-w-[14rem] text-(--text-faint)">
                      <span className="block whitespace-normal break-words">
                        {licensorOf(r) || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-(--text-faint)">
                      {r.wtp_library || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-(--text-faint)">
                      {releaseYearOf(r) || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {sourcesOf(r).map((label) => (
                          <Badge
                            key={label}
                            variant="outline"
                            className={`text-xs font-normal ${
                              label === "Bangladesh"
                                ? "border-(--st-wtp)/40 text-(--st-wtp)"
                                : ""
                            }`}
                          >
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // ── Gallery ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <Layers className="h-6 w-6 text-(--svf-accent)" />
            Templates
          </h1>
          <p className="max-w-2xl text-sm text-(--text-faint)">
            Saved logic for questions you ask often. Click one to run it — the rules
            were set once, so there are no filters to rebuild each time.
          </p>
        </div>
        {canManage && (
          <Button asChild size="lg">
            <Link href="/templates/builder">
              <Plus className="mr-1.5 h-4 w-4" />
              Create template
            </Link>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-xl border border-(--border) bg-(--hover)"
            />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-(--border) py-20 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-(--text-faint)" />
          <p className="font-medium">No templates yet</p>
          <p className="mx-auto mt-1 mb-5 max-w-md text-sm text-(--text-faint)">
            {canManage
              ? "Create one to save a question you ask often — Open Titles for Satellite is ready to build on."
              : "An admin has not created any templates yet."}
          </p>
          {canManage && (
            <Button asChild size="lg">
              <Link href="/templates/builder">
                <Plus className="mr-1.5 h-4 w-4" />
                Create your first template
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const accent = FAMILY_ACCENT[t.definition.rights.family] || "var(--svf-accent)";
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpen(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpen(t);
                  }
                }}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-(--border) bg-(--surface) p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: accent }}
                />

                <h3 className="font-semibold leading-snug">{t.name}</h3>

                {t.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-(--text-faint)">
                    {t.description}
                  </p>
                )}

                <p className="mt-3 text-xs text-(--text-faint)">
                  {describeDefinition(t.definition)}
                </p>

                <div className="mt-4 flex items-center justify-between">
                  <span
                    className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                    style={{ color: accent }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Run
                  </span>

                  {canManage && (
                    <div
                      className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                        <Link
                          href={`/templates/builder?id=${t.id}`}
                          aria-label={`Edit ${t.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-(--st-sold) hover:text-red-500"
                        aria-label={`Delete ${t.name}`}
                        onClick={() => setDeleteTarget(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete this template?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed for everyone. The titles themselves are not affected.`
            : ""
        }
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
