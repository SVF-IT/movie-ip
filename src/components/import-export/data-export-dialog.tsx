"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2 } from "lucide-react";
import Papa from "papaparse";

export interface ExportFieldDef {
  key: string;
  label: string;
  defaultChecked?: boolean;
  /** If true, the field is included in export but hidden from the selection UI */
  hidden?: boolean;
  /** Custom getter to extract value from a row. If not provided, uses row[key] */
  getter?: (row: Record<string, unknown>) => string | number | boolean | null | undefined;
}

interface DataExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Record<string, unknown>[];
  fields: ExportFieldDef[];
  filename: string;
  /** Optional content rendered above the format selector (e.g. a source picker) */
  headerContent?: React.ReactNode;
  onPrepareData?: (selectedKeys: Set<string>, data: Record<string, unknown>[]) => Promise<{ data: Record<string, unknown>[], fields?: ExportFieldDef[] }>;
}

export function DataExportDialog({
  open,
  onOpenChange,
  data,
  fields,
  filename,
  headerContent,
  onPrepareData,
}: DataExportDialogProps) {
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<"csv" | "excel">("csv");
  const [exporting, setExporting] = useState(false);

  // Reset selected fields when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedFields(
        new Set(fields.filter((f) => f.defaultChecked !== false).map((f) => f.key))
      );
    }
  }, [open, fields]);

  const allSelected = selectedFields.size === fields.length;
  const noneSelected = selectedFields.size === 0;

  const toggleField = (key: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedFields(new Set());
    } else {
      setSelectedFields(new Set(fields.map((f) => f.key)));
    }
  };

  const handleExport = async () => {
    if (noneSelected) return;

    setExporting(true);
    try {
      let exportData = data;
      let activeFields = fields.filter((f) => selectedFields.has(f.key));

      if (onPrepareData) {
        const prepared = await onPrepareData(selectedFields, data);
        exportData = prepared.data;
        if (prepared.fields) {
          activeFields = prepared.fields;
        } else {
          // If no new fields returned, include selected + hidden fields
          activeFields = fields.filter(f => selectedFields.has(f.key) || f.hidden);
        }
      }

      // Build rows with selected fields only
      const rows = exportData.map((row) => {
        const out: Record<string, unknown> = {};
        for (const field of activeFields) {
          const val = field.getter ? field.getter(row) : row[field.key];
          out[field.label] = val ?? "";
        }
        return out;
      });

      if (format === "csv") {
        const csv = Papa.unparse(rows);
        downloadFile(csv, `${filename}_${datestamp()}.csv`, "text/csv;charset=utf-8;");
      } else {
        // Dynamic import xlsx only when needed
        const XLSX = await import("xlsx");
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Export");
        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        downloadFile(
          new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          `${filename}_${datestamp()}.xlsx`
        );
      }

      onOpenChange(false);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Data</DialogTitle>
          <DialogDescription>
            Choose fields to include and export format. {data.length} records will be exported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Optional header slot (e.g. source/format picker from parent) */}
          {headerContent}

          {/* Format selector */}
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as "csv" | "excel")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Field selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fields ({selectedFields.size}/{fields.length})</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                {allSelected ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="max-h-60 overflow-y-auto rounded-md border border-border/50 p-2 space-y-1">
              {fields.filter(f => !f.hidden).map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={selectedFields.has(field.key)}
                    onCheckedChange={() => toggleField(field.key)}
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting || noneSelected}>
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export {data.length} Records
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function datestamp() {
  return new Date().toISOString().split("T")[0];
}

function downloadFile(content: string | Blob, filename: string, mimeType?: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
