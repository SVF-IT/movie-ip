"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ReportChart } from "@/components/reports/report-chart";
import { ReportFilters } from "@/components/reports/report-filters";
import {
  REPORT_TEMPLATES,
  getReportData,
} from "@/lib/api/reports";
import { createClient } from "@/lib/supabase/client";

export default function ViewReportPage() {
  const params = useParams();
  const reportId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [reportName, setReportName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [chartData, setChartData] = useState<Record<string, unknown>[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("saved_reports")
          .select("*")
          .eq("id", reportId)
          .single();

        if (data) {
          setReportName(data.name);
          setTemplateId(data.template_id);
          setFilters((data.filters as Record<string, unknown>) || {});
        }
      } catch {
        // Report not found
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [reportId]);

  const loadChart = useCallback(async () => {
    if (!templateId) return;
    setLoadingChart(true);
    try {
      const data = await getReportData(templateId, filters);
      setChartData(data);
    } catch {
      setChartData([]);
    } finally {
      setLoadingChart(false);
    }
  }, [templateId, filters]);

  useEffect(() => {
    if (templateId) loadChart();
  }, [templateId, loadChart]);

  const template = REPORT_TEMPLATES.find((t) => t.id === templateId);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/reports">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{reportName || "Report"}</h1>
        <p className="text-muted-foreground">{template?.description || ""}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{template?.name || templateId}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReportFilters
            templateId={templateId}
            filters={filters}
            onChange={setFilters}
          />
          {loadingChart ? (
            <div className="flex items-center justify-center h-[400px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ReportChart templateId={templateId} data={chartData} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
