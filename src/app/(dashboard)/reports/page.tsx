"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, Trash2, BarChart3, AlertTriangle, CheckCircle, FilePlus2, Play } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TemplateCard } from "@/components/reports/template-card";
import { ReportChart } from "@/components/reports/report-chart";
import { ReportFilters } from "@/components/reports/report-filters";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  REPORT_TEMPLATES,
  getSavedReports,
  saveReport,
  deleteReport,
  getReportData,
  type SavedReport,
} from "@/lib/api/reports";

export default function ReportsPage() {
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [chartData, setChartData] = useState<Record<string, unknown>[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [reportName, setReportName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const chartSectionRef = useRef<HTMLDivElement>(null);

  const fetchSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const data = await getSavedReports();
      setSavedReports(data);
    } catch {
      setSavedReports([]);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  const loadChart = useCallback(async (templateId: string, reportFilters: Record<string, unknown>) => {
    setLoadingChart(true);
    try {
      const data = await getReportData(templateId, reportFilters);
      setChartData(data);
    } catch {
      setChartData([]);
    } finally {
      setLoadingChart(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      loadChart(selectedTemplate, filters);
    }
  }, [selectedTemplate, filters, loadChart]);

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    setFilters({});
    setReportName("");
  };

  const handleSaveReport = async () => {
    if (!selectedTemplate || !reportName.trim()) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await saveReport({
        name: reportName.trim(),
        templateId: selectedTemplate,
        filters,
      });
      await fetchSaved();
      setReportName("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save report. The saved_reports table may not exist in your database.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    try {
      await deleteReport(id);
      setSavedReports((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // Silently fail
    }
  };

  const handleOpenSaved = (report: SavedReport) => {
    setSelectedTemplate(report.template_id);
    setFilters(report.filters);
    setReportName(report.name);
    // Scroll to chart section after a brief delay to allow render
    setTimeout(() => {
      chartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const template = selectedTemplate
    ? REPORT_TEMPLATES.find((t) => t.id === selectedTemplate)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          Report Builder
        </h1>
        <p className="text-muted-foreground ml-12">
          Generate custom intellectual property insights and save them for future reference.
        </p>
      </div>

      {saveError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {saveSuccess && (
        <Alert className="border-emerald-500 bg-emerald-50 text-emerald-900">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>Report saved successfully!</AlertDescription>
        </Alert>
      )}

      {/* Saved Reports */}
      {!loadingSaved && savedReports.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Save className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-bold">Your Saved Reports</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedReports.map((report) => {
              const tmpl = REPORT_TEMPLATES.find((t) => t.id === report.template_id);
              return (
                <Card
                  key={report.id}
                  className="group relative cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all gentle-transition bg-background/50 backdrop-blur-sm border-border/50"
                  onClick={() => handleOpenSaved(report)}
                >
                  <CardContent className="py-4 px-5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                        {report.name}
                      </p>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
                        {tmpl?.name || "Custom Report"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(report.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="size-8 flex items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Play className="h-4 w-4 fill-current" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Template Selector */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <FilePlus2 className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-bold">
            {selectedTemplate ? "Select Different Template" : "Start with a Template"}
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REPORT_TEMPLATES.map((tmpl) => (
            <TemplateCard
              key={tmpl.id}
              template={tmpl}
              selected={selectedTemplate === tmpl.id}
              onClick={() => handleSelectTemplate(tmpl.id)}
            />
          ))}
        </div>
      </div>

      {/* Chart Preview */}
      {selectedTemplate && template && (
        <Card ref={chartSectionRef} className="border-border/50 shadow-lg soft-shadow overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/40 py-5 px-6">
            <CardTitle className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xl font-bold tracking-tight">{template.name}</span>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Input
                    className="h-10 text-sm bg-background border-border/50 focus-ring pl-3"
                    placeholder="Enter Report Name to Save..."
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full sm:w-auto h-10 px-6 gap-2 shadow-sm"
                  onClick={handleSaveReport}
                  disabled={saving || !reportName.trim()}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Save Report</span>
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReportFilters
              templateId={selectedTemplate}
              filters={filters}
              onChange={setFilters}
            />
            {loadingChart ? (
              <div className="flex items-center justify-center h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ReportChart templateId={selectedTemplate} data={chartData} />
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          setIsDeleting(true);
          await handleDeleteReport(deleteId);
          setIsDeleting(false);
          setDeleteId(null);
        }}
        title="Delete Saved Report?"
        description="This action cannot be undone. This report will be permanently removed from your saved list."
        confirmText="Yes, Delete Report"
        isLoading={isDeleting}
      />
    </div>
  );
}
