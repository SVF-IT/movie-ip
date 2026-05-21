import type { ImportResult, ComprehensiveImportResult, ImportConflictResponse } from "@/lib/types/database";

export async function importMoviesCSV(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/import", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Import failed");
  }

  return response.json();
}

export async function importMoviesComprehensiveCSV(
  file: File,
  resolutions?: Record<string, "skip" | "update">
): Promise<ComprehensiveImportResult | ImportConflictResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (resolutions) {
    formData.append("resolutions", JSON.stringify(resolutions));
  }

  const response = await fetch("/api/import-comprehensive", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Comprehensive import failed");
  }

  return response.json();
}

export async function exportData(
  entity: "movies" | "rights" | "all",
  movieFormat: "home" | "acquired" | "all" = "all",
  columns: string[] = [],
): Promise<void> {
  const params = new URLSearchParams({ entity });
  if (entity === "movies") params.set("movieFormat", movieFormat);
  if (columns.length) params.set("columns", columns.join(","));

  const response = await fetch(`/api/export?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Export failed");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const formatSuffix = entity === "movies" && movieFormat !== "all" ? `_${movieFormat}` : "";
  a.download = `${entity}${formatSuffix}_export_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
