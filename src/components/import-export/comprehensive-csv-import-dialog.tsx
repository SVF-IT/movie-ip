"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { importMoviesComprehensiveCSV } from "@/lib/api/import-export";
import type {
  ComprehensiveImportResult,
  ImportConflict,
} from "@/lib/types/database";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Film,
  Loader2,
  RefreshCw,
  Shield,
  SkipForward,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import Papa from "papaparse";
import { useRef, useState } from "react";

interface ComprehensiveCSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Step = "select" | "conflicts" | "importing" | "done";

// Exact expected headers per format (label, whether required, how it's matched)
const HOME_COLUMNS: { label: string; required: boolean; match: (h: string) => boolean }[] = [
  { label: "Title",                    required: true,  match: (h) => h === "title" },
  { label: "Production No",            required: false, match: (h) => h.includes("production no") },
  { label: "Cast",                     required: false, match: (h) => h.includes("cast") },
  { label: "Directors",                required: false, match: (h) => h.includes("director") },
  { label: "Language",                 required: false, match: (h) => h.includes("language") },
  { label: "Production House",         required: false, match: (h) => h.includes("production house") },
  { label: "Theatrical Release Date",  required: false, match: (h) => h.includes("theatrical release date") },
  { label: "Censor",                   required: false, match: (h) => h === "censor" },
  { label: "Nature of Right",          required: false, match: (h) => h.includes("nature of right") },
  { label: "Holdback / Holdbacks",     required: false, match: (h) => h.includes("holdback") },
  { label: "YT Trailer Link",          required: false, match: (h) => h.includes("yt trailer") || h.includes("youtube") },
  { label: "Remarks",                  required: false, match: (h) => h.includes("remarks") },
  { label: "Actionable",               required: false, match: (h) => h.includes("actionable") },
];

// Acquired format has a 3-row header:
//   Row 1: section labels (ignored)
//   Row 2: group labels — "Movie Name", "Primary Rights", "Secondary Rights", "Details of Film" …
//   Row 3: sub-column names — "Assignor/ Licensor", "Satellite Rights", "Internet Rights" …
// The importer merges rows 2+3: sub-row value wins when non-empty, else primary-row value.
// So actual merged column names are the sub-row values for most columns.
const ACQUIRED_COLUMNS: { label: string; required: boolean; match: (h: string) => boolean }[] = [
  // ── Identity ────────────────────────────────────────────────────────────────
  { label: "Movie Name",                      required: true,  match: (h) => h === "movie name" || h === "movie title" || h === "title" },
  { label: "Assignor / Licensor",             required: false, match: (h) => h.includes("assignor") || h.includes("licensor") },
  { label: "Licensee",                        required: false, match: (h) => h.includes("licensee") },
  { label: "Date of Agreement",               required: false, match: (h) => h.includes("date of agreement") || h.includes("agreement date") },
  // ── Primary Rights (sub-row cells) ─────────────────────────────────────────
  { label: "Satellite Rights",                required: false, match: (h) => h === "satellite rights" },
  { label: "Internet Rights",                 required: false, match: (h) => h === "internet rights" },
  { label: "Negative Rights",                 required: false, match: (h) => h === "negative rights" },
  { label: "Other Rights",                    required: false, match: (h) => h === "other rights" || h === "others" },
  // ── Secondary Rights (sub-row) ──────────────────────────────────────────────
  { label: "Satellite Rights Classification", required: false, match: (h) => h.includes("satellite") && h.includes("classif") },
  { label: "Internet Classification",         required: false, match: (h) => h.includes("internet") && h.includes("classif") },
  // ── Holdbacks / Clip ────────────────────────────────────────────────────────
  { label: "Holdbacks",                       required: false, match: (h) => h.includes("holdback") },
  { label: "Clip Rights",                     required: false, match: (h) => h.includes("clip") && !h.includes("duration") },
  { label: "Duration",                        required: false, match: (h) => h === "duration" || (h.includes("clip") && h.includes("duration")) },
  // ── Derivative Rights (primary-row label becomes column name) ───────────────
  { label: "Prequel/ Sequel Rights",          required: false, match: (h) => h.includes("prequel") || h.includes("sequel") },
  { label: "Character Rights",               required: false, match: (h) => h.includes("character") },
  { label: "Sub-Titling Rights",              required: false, match: (h) => h.includes("sub-titl") || h.includes("subtitl") },
  { label: "Dubbing Rights",                 required: false, match: (h) => h.includes("dubbing") },
  // ── Nature of Rights ────────────────────────────────────────────────────────
  { label: "Nature of Satellite Rights",      required: false, match: (h) => h.includes("nature of satellite") || (h.includes("nature") && h.includes("satellite")) },
  { label: "Nature of Internet Rights",       required: false, match: (h) => h.includes("nature of internet") || (h.includes("nature") && h.includes("internet")) },
  { label: "Nature of Negative Rights",       required: false, match: (h) => h.includes("nature of negative") || (h.includes("nature") && h.includes("negative")) },
  { label: "Nature of Other Rights",          required: false, match: (h) => h.includes("nature of other") || (h.includes("nature") && h.includes("other")) },
  // ── Details of Film (sub-row maps to these) ─────────────────────────────────
  { label: "Territory",                       required: false, match: (h) => h === "territory" },
  { label: "Cast Details",                    required: false, match: (h) => h.includes("cast") },
  { label: "Director",                        required: false, match: (h) => h.includes("director") },
  { label: "Release Year",                    required: false, match: (h) => h.includes("release year") || h.includes("release date") },
  { label: "Certification",                   required: false, match: (h) => h.includes("certif") || h === "censor" },
  { label: "Color/B/W",                       required: false, match: (h) => h.includes("color") || h.includes("colour") },
  // ── Date ranges ─────────────────────────────────────────────────────────────
  { label: "Agreement Start Date",            required: false, match: (h) => h.includes("agreement start") },
  { label: "Agreement End Date",              required: false, match: (h) => h.includes("agreement end") },
  { label: "Satellite Rights Start Date",     required: false, match: (h) => h.includes("satellite") && h.includes("start") },
  { label: "Satellite Rights End Date",       required: false, match: (h) => h.includes("satellite") && h.includes("end") },
  { label: "Internet Rights Start Date",      required: false, match: (h) => h.includes("internet") && h.includes("start") },
  { label: "Internet Rights End Date",        required: false, match: (h) => h.includes("internet") && h.includes("end") },
  { label: "Negative Rights Start Date",      required: false, match: (h) => h.includes("negative") && h.includes("start") },
  { label: "Negative Rights End Date",        required: false, match: (h) => h.includes("negative") && h.includes("end") },
  { label: "Other Rights Start Date",         required: false, match: (h) => h.includes("other") && h.includes("start") },
  { label: "Other Rights End Date",           required: false, match: (h) => h.includes("other") && h.includes("end") },
  // ── Syndication ─────────────────────────────────────────────────────────────
  { label: "Syndication- Internet Rights",    required: false, match: (h) => h.includes("syndication") },
];

// Minimum fraction of template columns that must be present to allow import.
// Prevents importing a completely wrong file that just happens to have "Title" in it.
const FORMAT_MATCH_THRESHOLD = 0.35;

function detectFormatFromHeaders(headers: string[]): "home" | "acquired" | "unknown" {
  const lower = headers.map((h) => h.toLowerCase().trim());
  if (lower.includes("title")) return "home";
  if (lower.includes("movie name")) return "acquired";
  if (lower.some((h) => h.includes("production no"))) return "home";
  if (lower.some((h) => h.includes("assignor") || h.includes("licensor"))) return "acquired";
  return "unknown";
}

function checkColumns(headers: string[], format: "home" | "acquired") {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const spec = format === "home" ? HOME_COLUMNS : ACQUIRED_COLUMNS;
  return spec.map((col) => ({ ...col, found: lower.some(col.match) }));
}

interface FormatValidation {
  valid: boolean;
  reasons: string[];
}

function validateFormat(
  headers: string[],
  format: "home" | "acquired" | "unknown"
): FormatValidation {
  const reasons: string[] = [];

  if (format === "unknown") {
    reasons.push(
      "Could not detect format — file must have a \"Title\" column (Home Production) or \"Movie Name\" column (Acquired)."
    );
    return { valid: false, reasons };
  }

  const checked = checkColumns(headers, format);
  const total = checked.length;
  const found = checked.filter((c) => c.found).length;
  const matchRatio = found / total;

  // Required columns missing
  const missingRequired = checked.filter((c) => c.required && !c.found);
  if (missingRequired.length > 0) {
    reasons.push(
      `Missing required column${missingRequired.length > 1 ? "s" : ""}: ${missingRequired.map((c) => `"${c.label}"`).join(", ")}. ` +
      `Import cannot proceed without ${missingRequired.length > 1 ? "these" : "this"}.`
    );
  }

  // Too few template columns matched — likely wrong file or format
  if (matchRatio < FORMAT_MATCH_THRESHOLD) {
    const expectedFormat = format === "home" ? "Home Production" : "Acquired";
    const missing = checked.filter((c) => !c.found).map((c) => c.label);
    const showMissing = missing.slice(0, 6);
    reasons.push(
      `Only ${found} of ${total} expected ${expectedFormat} template columns were found (${Math.round(matchRatio * 100)}% match, minimum ${Math.round(FORMAT_MATCH_THRESHOLD * 100)}% required). ` +
      `This file does not appear to match the ${expectedFormat} template. ` +
      `Unrecognised columns: ${showMissing.map((l) => `"${l}"`).join(", ")}${missing.length > 6 ? ` and ${missing.length - 6} more` : ""}.`
    );
  }

  return { valid: reasons.length === 0, reasons };
}

export function ComprehensiveCSVImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: ComprehensiveCSVImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [detectedFormat, setDetectedFormat] = useState<"home" | "acquired" | "unknown" | null>(null);
  const [step, setStep] = useState<Step>("select");
  const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, "skip" | "update">>({});
  const [result, setResult] = useState<ComprehensiveImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [showFormatRef, setShowFormatRef] = useState<"home" | "acquired" | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > 10 * 1024 * 1024) { setError("File must be under 10MB"); return; }
    if (!selected.name.toLowerCase().endsWith(".csv")) { setError("Only CSV files are accepted"); return; }

    setFile(selected);
    setResult(null);
    setError(null);
    setStep("select");

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;

      // Use PapaParse to split all rows — handles quoted newlines correctly.
      // We parse up to 12 rows to find the header + optional sub-header rows.
      const allRowsParsed = Papa.parse<string[]>(
        text.replace(/^﻿/, ""),
        { header: false, skipEmptyLines: false, preview: 12 }
      );
      const allRows: string[][] = allRowsParsed.data as string[][];

      // Find the primary header row (contains "movie name", "title", or "production no")
      let headerRowIndex = -1;
      for (let i = 0; i < allRows.length; i++) {
        const lower = allRows[i].map((c) => c.toLowerCase().trim());
        if (lower.some((c) => c === "movie name" || c === "title" || c.includes("production no"))) {
          headerRowIndex = i;
          break;
        }
      }

      const examplePatterns = ["yes/no", "dd/mm/yyyy", "yyyy", "text", "color/b/w"];
      let subHeaderRowIndex: number | null = null;

      if (headerRowIndex >= 0) {
        const nextIdx = headerRowIndex + 1;
        if (nextIdx < allRows.length) {
          const nextCells = allRows[nextIdx];
          const firstEmpty = !nextCells[0] || nextCells[0].trim() === "";
          const nonEmpty = nextCells.filter((c) => c.trim() !== "");
          const isExample = nonEmpty.filter((c) =>
            examplePatterns.some((p) => c.toLowerCase().trim().startsWith(p))
          ).length >= 3;
          if (firstEmpty && nonEmpty.length >= 3 && !isExample) {
            subHeaderRowIndex = nextIdx;
          }
        }
      }

      let syntheticHeaders: string[] | null = null;
      if (headerRowIndex >= 0 && subHeaderRowIndex !== null) {
        const primaryCells = allRows[headerRowIndex];
        const subCells = allRows[subHeaderRowIndex];
        const maxLen = Math.max(primaryCells.length, subCells.length);
        const seen = new Map<string, number>();
        syntheticHeaders = Array.from({ length: maxLen }, (_, i) => {
          // Collapse embedded newlines inside a cell value (e.g. "Syndication- Internet Rights\n(Y/N)")
          const sub = (subCells[i] || "").replace(/\s*\n\s*/g, " ").trim();
          const primary = (primaryCells[i] || "").replace(/\s*\n\s*/g, " ").trim();
          let name = sub || primary || `_col${i}`;
          const count = seen.get(name) || 0;
          seen.set(name, count + 1);
          if (count > 0) name = `${name}_${count + 1}`;
          return name;
        });
      }

      // Full parse (no row limit, no skipEmptyLines so row indices match allRows indices)
      const fullParsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { header: false, skipEmptyLines: false });
      const fullRows = fullParsed.data as string[][];

      let fields: string[];
      let previewRows: Record<string, string>[];

      if (syntheticHeaders) {
        fields = syntheticHeaders;
        // Data rows start after the sub-header row; skip rows that are all-empty
        const dataRows = fullRows.slice(subHeaderRowIndex! + 1).filter((r) => r.some((c) => c.trim() !== ""));
        previewRows = dataRows.slice(0, 3).map((cols) => {
          const obj: Record<string, string> = {};
          syntheticHeaders!.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
          return obj;
        });
      } else if (headerRowIndex >= 0) {
        fields = allRows[headerRowIndex].map((h) => h.replace(/\s*\n\s*/g, " ").trim());
        const dataRows = fullRows.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim() !== ""));
        previewRows = dataRows.slice(0, 3).map((cols) => {
          const obj: Record<string, string> = {};
          fields.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
          return obj;
        });
      } else {
        // Fallback — plain PapaParse with header
        const parsed = Papa.parse(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, preview: 3 });
        fields = (parsed.meta.fields || []) as string[];
        previewRows = parsed.data as Record<string, string>[];
      }

      setColumns(fields);
      setPreview(previewRows);

      const format = detectFormatFromHeaders(fields);
      setDetectedFormat(format);

      if (format === "unknown") {
        setError("Unrecognized CSV format. The CSV must have either a 'Title' column (home production) or a 'Movie Name' column (acquired).");
      }
    };
    reader.readAsText(selected);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      const fakeEvent = { target: { files: [dropped] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  };

  const handleImport = async (resolvedResolutions?: Record<string, "skip" | "update">) => {
    if (!file) return;
    setStep("importing");
    setError(null);
    try {
      const importResult = await importMoviesComprehensiveCSV(file, resolvedResolutions);
      if ("needsResolution" in importResult && importResult.needsResolution) {
        const newResolutions: Record<string, "skip" | "update"> = {};
        for (const c of importResult.conflicts) newResolutions[c.title] = "skip";
        setConflicts(importResult.conflicts);
        setResolutions(newResolutions);
        setStep("conflicts");
        return;
      }
      setResult(importResult as ComprehensiveImportResult);
      setStep("done");
      if ((importResult as ComprehensiveImportResult).success > 0) onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("select");
    }
  };

  const handleResolveAll = (resolution: "skip" | "update") => {
    const updated: Record<string, "skip" | "update"> = {};
    for (const c of conflicts) updated[c.title] = resolution;
    setResolutions(updated);
  };

  const handleConfirmResolutions = () => handleImport(resolutions);

  const resetDialog = () => {
    setFile(null);
    setPreview([]);
    setColumns([]);
    setDetectedFormat(null);
    setStep("select");
    setConflicts([]);
    setResolutions({});
    setResult(null);
    setError(null);
    setTemplateOpen(false);
    setShowFormatRef(null);
  };

  const columnCheck = detectedFormat && detectedFormat !== "unknown"
    ? checkColumns(columns, detectedFormat)
    : null;

  const missingRequired = columnCheck?.filter((c) => c.required && !c.found) ?? [];
  const missingOptional = columnCheck?.filter((c) => !c.required && !c.found) ?? [];

  const formatValidation = detectedFormat
    ? validateFormat(columns, detectedFormat)
    : null;
  const canImport = !!file && !!formatValidation?.valid;

  const previewColumns =
    detectedFormat === "home"
      ? ["Title", "Cast ", "Directors", "Language", "Production House", "Censor"]
      : detectedFormat === "acquired"
        ? ["Movie Name", "Cast Details", "Director", "Release Year", "Nature of Rights", "Territory"]
        : columns.slice(0, 6);

  const visiblePreviewColumns = previewColumns.filter((c) =>
    columns.some((col) => col.toLowerCase().trim() === c.toLowerCase().trim())
  ).map((c) => columns.find((col) => col.toLowerCase().trim() === c.toLowerCase().trim())!);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-3xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comprehensive CSV Import</DialogTitle>
          <DialogDescription>
            Upload a CSV file in home production or acquired format to bulk import movies with cast and directors.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Format reference (always visible before upload) ── */}
        {step === "select" && !file && (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Click or drag & drop a CSV file</p>
              <p className="text-xs text-muted-foreground mt-1">Max 10 MB · CSV only</p>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
            </div>

            {/* Template downloads */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Download className="h-3.5 w-3.5" />
              <span>Need a template?</span>
              <a href="/demo/home_sample.csv" download className="text-primary underline hover:text-primary/80">Home sample</a>
              <span className="text-muted-foreground/50">·</span>
              <a href="/demo/acquired_sample.csv" download className="text-primary underline hover:text-primary/80">Acquired sample</a>
            </div>

            {/* Required headers reference */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium bg-muted/50 hover:bg-muted transition-colors"
                onClick={() => setTemplateOpen((v) => !v)}
              >
                <span>Required CSV column headers</span>
                {templateOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              {templateOpen && (
                <div className="p-4 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    The importer auto-detects format from your headers. Column names are matched flexibly (case-insensitive, partial match) but must contain the keywords shown below.
                  </p>

                  {/* Toggle */}
                  <div className="flex gap-2">
                    {(["home", "acquired"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setShowFormatRef(showFormatRef === fmt ? null : fmt)}
                        className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${showFormatRef === fmt ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
                      >
                        {fmt === "home" ? "Home Production" : "Acquired"}
                      </button>
                    ))}
                  </div>

                  {showFormatRef === "home" && (
                    <FormatReferenceTable
                      title="Home Production"
                      detectionNote="Detected when file has a 'Title' column."
                      columns={HOME_COLUMNS}
                    />
                  )}
                  {showFormatRef === "acquired" && (
                    <FormatReferenceTable
                      title="Acquired"
                      detectionNote="Detected when file has a 'Movie Name' column."
                      columns={ACQUIRED_COLUMNS}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── File selected — preview + column validation ── */}
        {step === "select" && file && (
          <div className="space-y-4">
            {/* File info bar */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · {columns.length} columns detected</p>
              </div>
              {detectedFormat && detectedFormat !== "unknown" && (
                <Badge variant={detectedFormat === "home" ? "default" : "secondary"} className="text-xs">
                  {detectedFormat === "home" ? "Home Production" : "Acquired"}
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={resetDialog}>Change</Button>
            </div>

            {/* Format validation errors — blocks import */}
            {formatValidation && !formatValidation.valid && (
              <div className="border border-destructive/40 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 border-b border-destructive/20">
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-xs font-semibold text-destructive">
                    Import blocked — CSV does not match the{" "}
                    {detectedFormat === "home" ? "Home Production" : detectedFormat === "acquired" ? "Acquired" : ""} template
                  </p>
                </div>
                <ul className="px-4 py-3 space-y-2">
                  {formatValidation.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-destructive">
                      <span className="mt-0.5 shrink-0">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
                <div className="px-4 py-2.5 bg-muted/40 border-t text-xs text-muted-foreground">
                  Fix the column headers in your file to match the template, then re-upload. Download a sample template above.
                </div>
              </div>
            )}

            {/* Column validation */}
            {columnCheck && (
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Column check</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-500">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {columnCheck.filter((c) => c.found).length} matched
                    </span>
                    {missingRequired.length > 0 && (
                      <span className="flex items-center gap-1 text-destructive">
                        <XCircle className="h-3.5 w-3.5" />
                        {missingRequired.length} required missing
                      </span>
                    )}
                    {missingOptional.length > 0 && (
                      <span className="flex items-center gap-1 text-amber-500">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {missingOptional.length} optional missing
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 flex flex-wrap gap-1.5">
                  {columnCheck.map((col) => (
                    <span
                      key={col.label}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        col.found
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          : col.required
                            ? "bg-destructive/10 text-destructive border border-destructive/20"
                            : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                      }`}
                    >
                      {col.found
                        ? <CheckCircle2 className="h-3 w-3" />
                        : col.required
                          ? <XCircle className="h-3 w-3" />
                          : <AlertTriangle className="h-3 w-3" />}
                      {col.label}
                      {!col.found && col.required && " (required)"}
                    </span>
                  ))}
                </div>

                {missingRequired.length > 0 && (
                  <div className="px-4 py-2.5 bg-destructive/5 border-t text-xs text-destructive">
                    Missing required column{missingRequired.length > 1 ? "s" : ""}: <strong>{missingRequired.map((c) => c.label).join(", ")}</strong>. Import will fail without {missingRequired.length > 1 ? "these" : "this"}.
                  </div>
                )}
                {missingRequired.length === 0 && missingOptional.length > 0 && (
                  <div className="px-4 py-2.5 bg-amber-500/5 border-t text-xs text-amber-700 dark:text-amber-400">
                    Missing optional column{missingOptional.length > 1 ? "s" : ""}: <strong>{missingOptional.map((c) => c.label).join(", ")}</strong>. Those fields will be left blank.
                  </div>
                )}
                {missingRequired.length === 0 && missingOptional.length === 0 && (
                  <div className="px-4 py-2.5 bg-emerald-500/5 border-t text-xs text-emerald-700 dark:text-emerald-400">
                    All expected columns matched. Ready to import.
                  </div>
                )}
              </div>
            )}

            {/* Data preview table */}
            {preview.length > 0 && visiblePreviewColumns.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Data preview — first {preview.length} rows
                </p>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {visiblePreviewColumns.map((col) => (
                          <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                        ))}
                        {columns.length > visiblePreviewColumns.length && (
                          <TableHead className="text-xs text-muted-foreground">+{columns.length - visiblePreviewColumns.length} more cols</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((row, i) => (
                        <TableRow key={i}>
                          {visiblePreviewColumns.map((col) => (
                            <TableCell key={col} className="text-xs max-w-37.5 truncate">{row[col] || "-"}</TableCell>
                          ))}
                          {columns.length > visiblePreviewColumns.length && (
                            <TableCell className="text-xs text-muted-foreground">…</TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Alert>
              <Film className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Imports movie records, cast & director links, and rights fields. If movies already exist you will be asked to skip or update each one. Updating re-links cast and directors from the CSV.
              </AlertDescription>
            </Alert>

            <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-500">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>No rollback on partial failure.</strong> Each row is written individually — if a row errors mid-import, previously written rows are <em>not</em> undone. Run the reset script and re-import from scratch if you need a clean state.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* ── Conflict Resolution ── */}
        {step === "conflicts" && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{conflicts.length} movie{conflicts.length > 1 ? "s" : ""}</strong> already exist in the database.
                Choose to <strong>Skip</strong> (keep existing) or <strong>Update</strong> (overwrite fields + re-link cast) for each.
              </AlertDescription>
            </Alert>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Apply to all:</span>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleResolveAll("skip")}>
                <SkipForward className="h-3 w-3" /> Skip All
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleResolveAll("update")}>
                <RefreshCw className="h-3 w-3" /> Update All
              </Button>
            </div>

            <div className="border rounded-md max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Row</TableHead>
                    <TableHead className="text-xs">Movie Name</TableHead>
                    <TableHead className="text-xs text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conflicts.map((conflict) => (
                    <TableRow key={conflict.existingId}>
                      <TableCell className="text-xs font-mono text-muted-foreground">{conflict.row}</TableCell>
                      <TableCell className="text-xs font-medium">{conflict.title}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setResolutions((r) => ({ ...r, [conflict.title]: "skip" }))}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${resolutions[conflict.title] === "skip" ? "bg-slate-700 text-slate-100" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                          >
                            Skip
                          </button>
                          <button
                            onClick={() => setResolutions((r) => ({ ...r, [conflict.title]: "update" }))}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${resolutions[conflict.title] === "update" ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                          >
                            Update
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                <strong>Update</strong> overwrites movie fields with CSV data and re-links cast & directors from the CSV.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Rows are written one by one — errors on individual rows do not roll back already-written rows.
              </p>
            </div>
          </div>
        )}

        {/* ── Importing ── */}
        {step === "importing" && (
          <div className="space-y-2 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing CSV rows… This may take a moment for large files.
            </div>
            <Progress value={50} className="animate-pulse" />
          </div>
        )}

        {/* ── Results ── */}
        {step === "done" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
              <div>
                <p className="font-medium">Import Complete</p>
                <p className="text-sm text-muted-foreground">
                  {result.success} created
                  {result.updated > 0 ? `, ${result.updated} updated` : ""}
                  {result.skipped > 0 ? `, ${result.skipped} skipped` : ""}
                  {result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}
                  {" "}out of {result.total} rows
                </p>
              </div>
              {detectedFormat && detectedFormat !== "unknown" && (
                <Badge variant={detectedFormat === "home" ? "default" : "secondary"} className="ml-auto text-xs">
                  {detectedFormat === "home" ? "Home Production" : "Acquired"}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard icon={<Film className="h-4 w-4" />} label="Movies Created" value={result.stats.moviesCreated} />
              <StatCard icon={<RefreshCw className="h-4 w-4" />} label="Movies Updated" value={result.updated} />
              <StatCard icon={<Users className="h-4 w-4" />} label="Cast Linked" value={result.stats.castLinked} />
              <StatCard icon={<Users className="h-4 w-4" />} label="Directors Linked" value={result.stats.directorsLinked} />
              <StatCard icon={<Shield className="h-4 w-4" />} label="Platform Rights" value={result.stats.platformRightsCreated} />
            </div>

            {result.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-destructive mb-2">
                  {result.errors.length} error{result.errors.length > 1 ? "s" : ""}
                </p>
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-16">Row</TableHead>
                        <TableHead className="text-xs">Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.slice(0, 30).map((err, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono">{err.row}</TableCell>
                          <TableCell className="text-xs">{err.message}</TableCell>
                        </TableRow>
                      ))}
                      {result.errors.length > 30 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-xs text-muted-foreground text-center">
                            … and {result.errors.length - 30} more errors
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetDialog(); onOpenChange(false); }}>
            {step === "done" ? "Close" : "Cancel"}
          </Button>

          {step === "select" && file && (
            <Button
              onClick={() => handleImport()}
              disabled={!canImport}
              title={!canImport ? (formatValidation?.reasons[0] ?? "Fix CSV format issues first") : undefined}
            >
              <Upload className="mr-2 h-4 w-4" />
              Start Import
            </Button>
          )}

          {step === "conflicts" && (
            <Button onClick={handleConfirmResolutions}>
              <Upload className="mr-2 h-4 w-4" />
              Continue Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormatReferenceTable({
  title,
  detectionNote,
  columns,
}: {
  title: string;
  detectionNote: string;
  columns: { label: string; required: boolean }[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold">{title}</p>
        <span className="text-xs text-muted-foreground">— {detectionNote}</span>
      </div>
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Column header (in your CSV)</TableHead>
              <TableHead className="text-xs w-24">Required?</TableHead>
              <TableHead className="text-xs">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((col) => (
              <TableRow key={col.label}>
                <TableCell className="text-xs font-mono">{col.label}</TableCell>
                <TableCell className="text-xs">
                  {col.required
                    ? <span className="text-destructive font-medium">Required</span>
                    : <span className="text-muted-foreground">Optional</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {col.required
                    ? "Import will fail without this column"
                    : "Field will be blank if column is absent"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Column names are matched case-insensitively and allow extra spaces or suffixes (e.g. <span className="font-mono">Cast </span> or <span className="font-mono">Directors</span> both match).
      </p>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-background">
      <div className="p-1.5 rounded-md bg-primary/10">{icon}</div>
      <div>
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}
