"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportData } from "@/lib/api/import-export";
import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HOME_COLUMNS: { key: string; label: string }[] = [
  { key: "production_no", label: "Production No" },
  { key: "title", label: "Title" },
  { key: "cast_names", label: "Cast" },
  { key: "director_names", label: "Director" },
  { key: "language", label: "Language" },
  { key: "production_house_name", label: "Production House" },
  { key: "release_date", label: "Theatrical Release Date" },
  { key: "release_year", label: "Release Year" },
  { key: "trailer_link", label: "YT Trailer Link" },
  { key: "certification", label: "Censor" },
  { key: "nature_of_rights", label: "Nature of Right" },
  { key: "holdbacks", label: "Holdbacks" },
  { key: "remarks", label: "Remarks" },
  { key: "actionables", label: "Actionable" },
  { key: "jointly_exploitation_rights", label: "Joint Exploitation Rights" },
  { key: "revenue_share", label: "Revenue Share" },
  { key: "joint_prod_buy_back_date", label: "Joint Buy Back Date" },
  { key: "recensor_flag", label: "Recensor Flag" },
  { key: "approval_status", label: "Approval Status" },
];

const ACQUIRED_COLUMNS: { key: string; label: string }[] = [
  { key: "title", label: "Movie Name" },
  { key: "cast_names", label: "Cast Details" },
  { key: "director_names", label: "Director" },
  { key: "production_no", label: "Production No" },
  { key: "language", label: "Language" },
  { key: "production_house_name", label: "Production House" },
  { key: "release_date", label: "Release Date" },
  { key: "release_year", label: "Release Year" },
  { key: "certification", label: "Certification" },
  { key: "territory", label: "Territory" },
  { key: "assignor_licensor", label: "Assignor / Licensor" },
  { key: "licensee", label: "Licensee" },
  { key: "agreement_date", label: "Agreement Date" },
  { key: "agreement_start_date", label: "Agreement Start Date" },
  { key: "agreement_end_date", label: "Agreement End Date" },
  { key: "satellite_rights", label: "Satellite Rights" },
  { key: "satellite_rights_start_date", label: "Satellite Rights Start Date" },
  { key: "satellite_rights_end_date", label: "Satellite Rights End Date" },
  { key: "satellite_rights_classification", label: "Satellite Rights Classification" },
  { key: "nature_of_satellite_rights", label: "Nature of Satellite Rights" },
  { key: "internet_rights", label: "Internet Rights" },
  { key: "internet_rights_start_date", label: "Internet Rights Start Date" },
  { key: "internet_rights_end_date", label: "Internet Rights End Date" },
  { key: "internet_rights_classification", label: "Internet Rights Classification" },
  { key: "nature_of_internet_rights", label: "Nature of Internet Rights" },
  { key: "syndication_internet_rights", label: "Syndication Internet Rights" },
  { key: "negative_rights", label: "Negative Rights" },
  { key: "negative_rights_start_date", label: "Negative Rights Start Date" },
  { key: "negative_rights_end_date", label: "Negative Rights End Date" },
  { key: "nature_of_negative_rights", label: "Nature of Negative Rights" },
  { key: "other_rights", label: "Other Rights" },
  { key: "other_rights_start_date", label: "Other Rights Start Date" },
  { key: "other_rights_end_date", label: "Other Rights End Date" },
  { key: "nature_of_other_rights", label: "Nature of Other Rights" },
  { key: "clip_rights", label: "Clip Rights" },
  { key: "clip_rights_duration", label: "Clip Rights Duration" },
  { key: "holdbacks", label: "Holdbacks" },
  { key: "prequel_sequel_rights", label: "Prequel / Sequel Rights" },
  { key: "character_rights", label: "Character Rights" },
  { key: "subtitling_rights", label: "Subtitling Rights" },
  { key: "dubbing_rights", label: "Dubbing Rights" },
  { key: "nature_of_rights", label: "Nature of Rights" },
  { key: "remarks", label: "Remarks" },
  { key: "actionables", label: "Actionable" },
  { key: "approval_status", label: "Approval Status" },
];

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [entity, setEntity] = useState<"movies" | "rights" | "all">("movies");
  const [movieFormat, setMovieFormat] = useState<"home" | "acquired">("home");
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columnDefs = movieFormat === "home" ? HOME_COLUMNS : ACQUIRED_COLUMNS;

  // Reset columns to all-selected whenever format changes
  useEffect(() => {
    setSelectedColumns(new Set(columnDefs.map((c) => c.key)));
  }, [movieFormat]);

  const allSelected = selectedColumns.size === columnDefs.length;

  const toggleColumn = (key: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedColumns(new Set());
    } else {
      setSelectedColumns(new Set(columnDefs.map((c) => c.key)));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const cols = entity === "movies" ? Array.from(selectedColumns) : [];
      await exportData(entity, entity === "movies" ? movieFormat : "all", cols);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Data</DialogTitle>
          <DialogDescription>Download your data as a CSV file</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-5 py-2">
          {/* Entity picker */}
          <div className="space-y-2">
            <Label>What to export</Label>
            <Select
              value={entity}
              onValueChange={(v) => setEntity(v as "movies" | "rights" | "all")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="movies">Movies</SelectItem>
                <SelectItem value="rights">Platform Rights</SelectItem>
                <SelectItem value="all">All Data</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Format picker — only for movies */}
          {entity === "movies" && (
            <>
              <div className="space-y-2">
                <Label>Movie format</Label>
                <Select
                  value={movieFormat}
                  onValueChange={(v) => setMovieFormat(v as "home" | "acquired")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home">Home Production</SelectItem>
                    <SelectItem value="acquired">Acquired</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Each movie version (dubbed, multi-language) is exported as a separate row.
                </p>
              </div>

              {/* Column picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Columns to include</Label>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-primary hover:underline"
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="rounded-md border p-3 max-h-52 overflow-y-auto grid grid-cols-2 gap-x-4 gap-y-2">
                  {columnDefs.map((col) => (
                    <div key={col.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`col-${col.key}`}
                        checked={selectedColumns.has(col.key)}
                        onCheckedChange={() => toggleColumn(col.key)}
                      />
                      <label
                        htmlFor={`col-${col.key}`}
                        className="text-xs cursor-pointer leading-tight"
                      >
                        {col.label}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedColumns.size} of {columnDefs.length} columns selected
                </p>
              </div>
            </>
          )}

          {entity !== "movies" && (
            <p className="text-sm text-muted-foreground">Format: CSV (comma-separated values)</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || (entity === "movies" && selectedColumns.size === 0)}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
