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
  Download,
  FileText,
  Film,
  Loader2,
  RefreshCw,
  Shield,
  SkipForward,
  Upload,
  Users,
} from "lucide-react";
import Papa from "papaparse";
import { useRef, useState } from "react";

interface ComprehensiveCSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Step = "select" | "conflicts" | "importing" | "done";

function detectFormatFromHeaders(
  headers: string[]
): "home" | "acquired" | "unknown" {
  const lower = headers.map((h) => h.toLowerCase().trim());
  if (lower.includes("title")) return "home";
  if (lower.includes("movie name")) return "acquired";
  if (lower.some((h) => h.includes("production no"))) return "home";
  if (lower.some((h) => h.includes("assignor") || h.includes("licensor")))
    return "acquired";
  return "unknown";
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
  const [detectedFormat, setDetectedFormat] = useState<
    "home" | "acquired" | "unknown" | null
  >(null);
  const [step, setStep] = useState<Step>("select");
  const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
  const [resolutions, setResolutions] = useState<
    Record<string, "skip" | "update">
  >({});
  const [result, setResult] = useState<ComprehensiveImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB");
      return;
    }
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setError("Only CSV files are accepted");
      return;
    }

    setFile(selected);
    setResult(null);
    setError(null);
    setStep("select");

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;

      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuote = !inQuote;
          } else if (ch === "," && !inQuote) {
            result.push(cur); cur = "";
          } else {
            cur += ch;
          }
        }
        result.push(cur);
        return result;
      };

      const textLines = text.replace(/^﻿/, "").split(/\r?\n/);

      // Find the header row containing 'movie name', 'title', or 'production no'
      let headerLineIndex = 0;
      for (let i = 0; i < Math.min(textLines.length, 8); i++) {
        const cells = parseCSVLine(textLines[i]).map((c) => c.toLowerCase().trim());
        if (cells.some((c) => c === "movie name" || c === "title" || c.includes("production no"))) {
          headerLineIndex = i;
          break;
        }
      }

      // Check if the next line is a sub-header row (first cell empty, 3+ non-empty cells, not example values)
      const examplePatterns = ["yes/no", "dd/mm/yyyy", "yyyy", "text", "color/b/w"];
      let subHeaderLineIndex: number | null = null;
      const nextLineIdx = headerLineIndex + 1;
      if (nextLineIdx < textLines.length && textLines[nextLineIdx] !== "") {
        const nextCells = parseCSVLine(textLines[nextLineIdx]);
        const firstEmpty = !nextCells[0] || nextCells[0].trim() === "";
        const nonEmpty = nextCells.filter((c) => c.trim() !== "");
        const isExample = nonEmpty.filter((c) =>
          examplePatterns.some((p) => c.toLowerCase().trim().startsWith(p))
        ).length >= 3;
        if (firstEmpty && nonEmpty.length >= 3 && !isExample) {
          subHeaderLineIndex = nextLineIdx;
        }
      }

      let syntheticHeaders: string[] | null = null;
      if (subHeaderLineIndex !== null) {
        const primaryCells = parseCSVLine(textLines[headerLineIndex]);
        const subCells = parseCSVLine(textLines[subHeaderLineIndex]);
        const maxLen = Math.max(primaryCells.length, subCells.length);
        const seen = new Map<string, number>();
        syntheticHeaders = Array.from({ length: maxLen }, (_, i) => {
          const sub = (subCells[i] || "").trim();
          const primary = (primaryCells[i] || "").trim();
          let name = sub || primary || `_col${i}`;
          const count = seen.get(name) || 0;
          seen.set(name, count + 1);
          if (count > 0) name = `${name}_${count + 1}`;
          return name;
        });
      }

      const dataStartLineIndex = subHeaderLineIndex !== null ? subHeaderLineIndex + 1 : headerLineIndex + 1;

      let fields: string[];
      let previewRows: Record<string, string>[];

      if (syntheticHeaders) {
        fields = syntheticHeaders;
        const csvDataOnly = textLines.slice(dataStartLineIndex).join("\n");
        const parsed = Papa.parse<string[]>(csvDataOnly, { header: false, skipEmptyLines: true, preview: 3 });
        previewRows = (parsed.data as string[][]).map((cols) => {
          const obj: Record<string, string> = {};
          syntheticHeaders!.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
          return obj;
        });
      } else {
        const csvFromHeader = textLines.slice(headerLineIndex).join("\n");
        const parsed = Papa.parse(csvFromHeader, { header: true, skipEmptyLines: true, preview: 3 });
        fields = (parsed.meta.fields || []) as string[];
        previewRows = parsed.data as Record<string, string>[];
      }

      setColumns(fields);
      setPreview(previewRows);

      const format = detectFormatFromHeaders(fields);
      setDetectedFormat(format);

      if (format === "unknown") {
        setError(
          "Unrecognized CSV format. The CSV must have either a 'Title' column (home production) or a 'Movie Name' column (acquired)."
        );
      }
    };
    reader.readAsText(selected);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      const fakeEvent = {
        target: { files: [dropped] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  };

  const handleImport = async (resolvedResolutions?: Record<string, "skip" | "update">) => {
    if (!file) return;

    setStep("importing");
    setError(null);

    try {
      const importResult = await importMoviesComprehensiveCSV(
        file,
        resolvedResolutions
      );

      if ("needsResolution" in importResult && importResult.needsResolution) {
        // Server detected conflicts — show resolution UI
        const newResolutions: Record<string, "skip" | "update"> = {};
        for (const c of importResult.conflicts) {
          newResolutions[c.title] = "skip"; // default to skip
        }
        setConflicts(importResult.conflicts);
        setResolutions(newResolutions);
        setStep("conflicts");
        return;
      }

      setResult(importResult as ComprehensiveImportResult);
      setStep("done");
      if ((importResult as ComprehensiveImportResult).success > 0) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("select");
    }
  };

  const handleResolveAll = (resolution: "skip" | "update") => {
    const updated: Record<string, "skip" | "update"> = {};
    for (const c of conflicts) {
      updated[c.title] = resolution;
    }
    setResolutions(updated);
  };

  const handleConfirmResolutions = () => {
    handleImport(resolutions);
  };

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
  };

  const previewColumns =
    detectedFormat === "home"
      ? ["Title", "Cast", "Director", "Language", "Production House", "Censor"]
      : detectedFormat === "acquired"
        ? [
          "Movie Name",
          "Cast Details",
          "Director",
          "Release Year",
          "Nature of Rights",
          "Territory",
        ]
        : columns.slice(0, 6);

  const visiblePreviewColumns = previewColumns.filter((c) =>
    columns.includes(c)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetDialog();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-3xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comprehensive CSV Import</DialogTitle>
          <DialogDescription>
            Upload a CSV file in home production or acquired format to bulk
            import movies with cast and directors. Duplicate entries can be
            skipped or updated.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* File Selection */}
        {step === "select" && !file && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">
                Click or drag & drop a CSV file
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Accepts home production or acquired format.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Download className="h-3.5 w-3.5" />
              <span>Need a template?</span>
              <a
                href="/demo/home_sample.csv"
                download
                className="text-primary underline hover:text-primary/80"
              >
                Home sample
              </a>
              <span className="text-muted-foreground/50">·</span>
              <a
                href="/demo/acquired_sample.csv"
                download
                className="text-primary underline hover:text-primary/80"
              >
                Acquired sample
              </a>
            </div>
          </div>
        )}

        {/* File Preview */}
        {step === "select" && file && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {detectedFormat && detectedFormat !== "unknown" && (
                <Badge
                  variant={
                    detectedFormat === "home" ? "default" : "secondary"
                  }
                  className="text-xs"
                >
                  {detectedFormat === "home"
                    ? "Home Production"
                    : "Acquired"}
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={resetDialog}>
                Change
              </Button>
            </div>

            {columns.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">
                  Detected {columns.length} Columns
                </p>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {columns.slice(0, 30).map((col, i) => (
                    <span
                      key={`${col}-${i}`}
                      className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded"
                    >
                      {col}
                    </span>
                  ))}
                  {columns.length > 30 && (
                    <span className="px-2 py-0.5 text-muted-foreground text-xs">
                      +{columns.length - 30} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {preview.length > 0 && visiblePreviewColumns.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">
                  Preview (first {preview.length} rows)
                </p>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {visiblePreviewColumns.map((col) => (
                          <TableHead
                            key={col}
                            className="text-xs whitespace-nowrap"
                          >
                            {col}
                          </TableHead>
                        ))}
                        {columns.length > visiblePreviewColumns.length && (
                          <TableHead className="text-xs">...</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((row, i) => (
                        <TableRow key={i}>
                          {visiblePreviewColumns.map((col) => (
                            <TableCell
                              key={col}
                              className="text-xs max-w-[150px] truncate"
                            >
                              {row[col] || "-"}
                            </TableCell>
                          ))}
                          {columns.length > visiblePreviewColumns.length && (
                            <TableCell className="text-xs">...</TableCell>
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
                This will import movie records, cast & director links, and all
                primary rights fields. Platform rights (Satellite TV, SVOD,
                AVOD, etc.) are processed separately. If any movies already
                exist, you will be asked to skip or update each one.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Conflict Resolution */}
        {step === "conflicts" && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{conflicts.length} movie{conflicts.length > 1 ? "s" : ""}</strong> already exist in the database.
                Choose to <strong>Skip</strong> (keep existing) or <strong>Update</strong> (overwrite fields) for each.
              </AlertDescription>
            </Alert>

            {/* Bulk actions */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Apply to all:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleResolveAll("skip")}
              >
                <SkipForward className="h-3 w-3" />
                Skip All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleResolveAll("update")}
              >
                <RefreshCw className="h-3 w-3" />
                Update All
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
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {conflict.row}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {conflict.title}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() =>
                              setResolutions((r) => ({
                                ...r,
                                [conflict.title]: "skip",
                              }))
                            }
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${resolutions[conflict.title] === "skip"
                                ? "bg-slate-700 text-slate-100"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                          >
                            Skip
                          </button>
                          <button
                            onClick={() =>
                              setResolutions((r) => ({
                                ...r,
                                [conflict.title]: "update",
                              }))
                            }
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${resolutions[conflict.title] === "update"
                                ? "bg-amber-600 text-white"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
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

            <p className="text-xs text-muted-foreground">
              <strong>Update</strong> overwrites movie fields with CSV data but does not re-create cast or platform rights entries.
            </p>
          </div>
        )}

        {/* Importing */}
        {step === "importing" && (
          <div className="space-y-2 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing CSV rows… This may take a moment for large files.
            </div>
            <Progress value={50} className="animate-pulse" />
          </div>
        )}

        {/* Results */}
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
              <Badge variant="secondary" className="ml-auto text-xs">
                Acquired
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard
                icon={<Film className="h-4 w-4" />}
                label="Movies Created"
                value={result.stats.moviesCreated}
              />
              <StatCard
                icon={<RefreshCw className="h-4 w-4" />}
                label="Movies Updated"
                value={result.updated}
              />
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label="Cast Linked"
                value={result.stats.castLinked}
              />
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label="Directors Linked"
                value={result.stats.directorsLinked}
              />
              <StatCard
                icon={<Shield className="h-4 w-4" />}
                label="Platform Rights"
                value={result.stats.platformRightsCreated}
              />
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
                          <TableCell className="text-xs font-mono">
                            {err.row}
                          </TableCell>
                          <TableCell className="text-xs">
                            {err.message}
                          </TableCell>
                        </TableRow>
                      ))}
                      {result.errors.length > 30 && (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            className="text-xs text-muted-foreground text-center"
                          >
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
          <Button
            variant="outline"
            onClick={() => {
              resetDialog();
              onOpenChange(false);
            }}
          >
            {step === "done" ? "Close" : "Cancel"}
          </Button>

          {step === "select" && file && detectedFormat !== "unknown" && (
            <Button onClick={() => handleImport()}>
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

function StatCard({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${muted ? "bg-muted/50 text-muted-foreground" : "bg-background"}`}
    >
      <div
        className={`p-1.5 rounded-md ${muted ? "bg-muted" : "bg-primary/10"}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
          {label}
        </p>
      </div>
    </div>
  );
}
