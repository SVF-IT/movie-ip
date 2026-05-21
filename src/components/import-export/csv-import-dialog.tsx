"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { importMoviesCSV } from "@/lib/api/import-export";
import type { ImportResult } from "@/lib/types/database";
import Papa from "papaparse";

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CSVImportDialog({ open, onOpenChange, onSuccess }: CSVImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
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

    // Parse preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { data, meta } = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        preview: 5,
      });
      setColumns(meta.fields || []);
      setPreview(data as Record<string, string>[]);
    };
    reader.readAsText(selected);
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setError(null);

    try {
      const importResult = await importMoviesCSV(file);
      setResult(importResult);
      if (importResult.success > 0) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const resetDialog = () => {
    setFile(null);
    setPreview([]);
    setColumns([]);
    setResult(null);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Movies from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to add movies to the catalog. Expected columns: title, source, language, release_year, certification, production_house, territory, remarks.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!file && !result && (
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Click to select a CSV file</p>
            <p className="text-xs text-muted-foreground mt-1">Maximum file size: 10MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {file && !result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={resetDialog}>
                Change
              </Button>
            </div>

            {columns.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Detected Columns ({columns.length})</p>
                <div className="flex flex-wrap gap-1">
                  {columns.map((col) => (
                    <span key={col} className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded">
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {preview.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Preview (first {preview.length} rows)</p>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.slice(0, 6).map((col) => (
                          <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                        ))}
                        {columns.length > 6 && <TableHead className="text-xs">...</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((row, i) => (
                        <TableRow key={i}>
                          {columns.slice(0, 6).map((col) => (
                            <TableCell key={col} className="text-xs max-w-[150px] truncate">
                              {row[col] || "-"}
                            </TableCell>
                          ))}
                          {columns.length > 6 && <TableCell className="text-xs">...</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {importing && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Importing...</p>
                <Progress value={50} />
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <div>
                <p className="font-medium">Import Complete</p>
                <p className="text-sm text-muted-foreground">
                  {result.success} of {result.total} rows imported successfully
                </p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-destructive mb-2">
                  {result.errors.length} errors
                </p>
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Row</TableHead>
                        <TableHead className="text-xs">Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.slice(0, 20).map((err, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{err.row}</TableCell>
                          <TableCell className="text-xs">{err.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetDialog(); onOpenChange(false); }}>
            {result ? "Close" : "Cancel"}
          </Button>
          {file && !result && (
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                "Start Import"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
