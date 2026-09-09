"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAppToast } from "@/hooks/use-app-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  stageBarcSheet,
  importStagedSheet,
  BARC_SHEET_ACCEPTED_TYPES,
  type BarcStagedSheet,
  type BarcUploadResult,
  type DuplicateMode,
} from "@/lib/api/barc";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  CopyCheck,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";

/** Badges shown before the list is collapsed behind a "+N more" button. */
const UNMAPPED_PREVIEW = 24;

/** Single-quote a value for a SQL literal. */
function quoteSql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

interface BarcUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BarcUploadDialog({ open, onOpenChange, onSuccess }: BarcUploadDialogProps) {
  const { profile } = useAuth();
  const toast = useAppToast();
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BarcUploadResult | null>(null);
  // Set once the sheet is parsed and its duplicates counted, but before
  // anything is written — this is what the skip/override choice acts on.
  const [staged, setStaged] = useState<BarcStagedSheet | null>(null);
  const [showAllUnmapped, setShowAllUnmapped] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);

  const reset = () => {
    setFile(null);
    setNotes("");
    setProgress(0);
    setResult(null);
    setStaged(null);
    setShowAllUnmapped(false);
    setCopiedSeed(false);
    setIsUploading(false);
  };

  /**
   * Puts a ready-to-edit seed script on the clipboard — one row per unmapped
   * description, with the title left blank to fill in. Far more useful than
   * copying 300 names out of the dialog by hand.
   */
  const copySeedTemplate = async (descriptions: string[]) => {
    const sql = [
      "-- Fill in each movie title, then run.",
      "SELECT barc_seed_description(t.title, t.descr)",
      "FROM (VALUES",
      descriptions
        .map((d) => `    ('', ${quoteSql(d)})`)
        .join(",\n"),
      ") AS t(title, descr);",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(sql);
      setCopiedSeed(true);
      setTimeout(() => setCopiedSeed(false), 2000);
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  };

  const handleClose = (next: boolean) => {
    if (isUploading) return;
    if (!next) reset();
    onOpenChange(next);
  };

  /** Step 1 — parse and count duplicates without writing anything. */
  const handleStage = async () => {
    if (!file) return;

    setIsUploading(true);
    try {
      const s = await stageBarcSheet(file);
      setStaged(s);
      // Nothing to decide: import straight away.
      if (s.existingCount === 0) await runImport(s, "skip");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the sheet.");
    } finally {
      setIsUploading(false);
    }
  };

  /** Step 2 — import, with the user's decision about existing rows. */
  const runImport = async (s: BarcStagedSheet, mode: DuplicateMode) => {
    if (!profile) return;

    setIsUploading(true);
    setProgress(0);
    try {
      const res = await importStagedSheet({
        staged: s,
        duplicateMode: mode,
        notes: notes.trim() || null,
        createdBy: profile.id,
        createdByName: profile.full_name || profile.email || "Unknown",
        onProgress: setProgress,
      });
      setResult(res);
      toast.success(
        `Imported ${res.rowCount.toLocaleString()} rows from ${s.file.name}.`
      );
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Upload BARC sheet
          </DialogTitle>
          <DialogDescription>
            Every row of the sheet is stored, so any grouping or filter can be
            recalculated later. Movies are resolved from the BARC description
            dictionary.
          </DialogDescription>
        </DialogHeader>

        {/* Scrolls on its own so a long result never pushes the footer
            off-screen; the dialog itself is capped to the viewport. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{result.sheet.file_name} imported</p>
                  <p className="text-muted-foreground">
                    {result.rowCount.toLocaleString()} rows ·{" "}
                    {result.matchedCount.toLocaleString()} mapped to movies
                    {result.sheet.period_start && (
                      <>
                        {" "}· {result.sheet.period_start} to {result.sheet.period_end}
                      </>
                    )}
                  </p>
                  {result.skippedNonFilm > 0 && (
                    <p className="text-muted-foreground">
                      {result.skippedNonFilm.toLocaleString()} rows ignored — only
                      Programme Theme “FILM BASED” is imported.
                    </p>
                  )}
                  {result.duplicatesSkipped > 0 && (
                    <p className="text-muted-foreground">
                      {result.duplicatesSkipped.toLocaleString()} rows already
                      existed and were left unchanged.
                    </p>
                  )}
                  {result.duplicatesOverridden > 0 && (
                    <p className="text-muted-foreground">
                      {result.duplicatesOverridden.toLocaleString()} existing rows
                      were replaced with the values from this sheet.
                    </p>
                  )}
                  {result.skipped > 0 && (
                    <p className="text-muted-foreground">
                      {result.skipped.toLocaleString()} rows skipped (missing date,
                      description or target).
                    </p>
                  )}
                </div>
              </div>

              {result.unmappedDescriptions.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    {result.unmappedDescriptions.length} description
                    {result.unmappedDescriptions.length === 1 ? "" : "s"} not mapped to a movie
                  </div>
                  <p className="text-xs text-muted-foreground">
                    These rows were imported but excluded from movie metrics. Seed
                    them with{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      SELECT barc_seed_description(&#39;Movie Title&#39;, &#39;DESCRIPTION&#39;);
                    </code>{" "}
                    and the existing rows will be back-filled automatically.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(showAllUnmapped
                      ? result.unmappedDescriptions
                      : result.unmappedDescriptions.slice(0, UNMAPPED_PREVIEW)
                    ).map((d) => (
                      <Badge key={d} variant="outline" className="font-mono text-xs">
                        {d}
                      </Badge>
                    ))}
                    {!showAllUnmapped &&
                      result.unmappedDescriptions.length > UNMAPPED_PREVIEW && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setShowAllUnmapped(true)}
                        >
                          +{result.unmappedDescriptions.length - UNMAPPED_PREVIEW} more
                        </Button>
                      )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copySeedTemplate(result.unmappedDescriptions)}
                  >
                    {copiedSeed ? (
                      <>
                        <Check className="mr-2 h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-3.5 w-3.5" />
                        Copy seed SQL for all {result.unmappedDescriptions.length}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {result.warnings.map((w) => (
                <p key={w} className="text-sm text-amber-500">{w}</p>
              ))}
            </div>
          ) : staged && staged.existingCount > 0 ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <CopyCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {staged.existingCount.toLocaleString()} of{" "}
                    {staged.parsed.rows.length.toLocaleString()} rows are already
                    imported
                  </p>
                  <p className="text-muted-foreground">
                    A row counts as already imported when every column matches —
                    region, week, channel, date, description, theme, genre, day,
                    start, end, length and target.
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <p className="font-medium">What should happen to those rows?</p>
                <p className="text-muted-foreground">
                  <strong>Skip</strong> keeps the stored values and imports only
                  the {(staged.parsed.rows.length - staged.existingCount).toLocaleString()}{" "}
                  new rows. <strong>Override</strong> replaces them with this
                  sheet&#39;s values and recalculates.
                </p>
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground">Importing…</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="barc-file">Sheet file</Label>
                <Input
                  id="barc-file"
                  type="file"
                  accept={BARC_SHEET_ACCEPTED_TYPES.join(",")}
                  disabled={isUploading}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && (
                  <p className="text-xs text-muted-foreground">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="barc-notes">Notes (optional)</Label>
                <Input
                  id="barc-notes"
                  placeholder="e.g. Week 23, Sangeet Bangla"
                  value={notes}
                  disabled={isUploading}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground">
                    Parsing and importing… this can take a moment for a large sheet.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={() => handleClose(false)}>Done</Button>
          ) : staged && staged.existingCount > 0 ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={isUploading}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => runImport(staged, "skip")}
                disabled={isUploading}
              >
                Skip existing
              </Button>
              <Button onClick={() => runImport(staged, "override")} disabled={isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing
                  </>
                ) : (
                  "Override existing"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={isUploading}>
                Cancel
              </Button>
              <Button onClick={handleStage} disabled={!file || isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reading sheet
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
