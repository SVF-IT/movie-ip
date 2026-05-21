"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, Loader2, CheckCircle } from "lucide-react";
import { exportData } from "@/lib/api/import-export";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAppToast } from "@/hooks/use-app-toast";

export default function ExportPage() {
  const { allowed, loading: permLoading } = useRequirePermission("export", "movie", "/settings");
  const [exportType, setExportType] = useState("movies");
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useAppToast();

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportData(exportType as "movies" | "rights" | "all");
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally { setExporting(false); }
  };

  if (permLoading || !allowed) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4"><Link href="/settings"><Button variant="ghost" size="sm"><ArrowLeft className="mr-2 h-4 w-4" />Back to Settings</Button></Link></div>
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><Download className="h-6 w-6" />Export Data</h1><p className="text-muted-foreground">Download data as CSV</p></div>
      {!done ? (
        <Card>
          <CardHeader><CardTitle>Export Settings</CardTitle><CardDescription>Select what data to export</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>What to export</Label>
              <Select value={exportType} onValueChange={setExportType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="movies">Movies</SelectItem>
                  <SelectItem value="rights">Platform Rights</SelectItem>
                  <SelectItem value="all">All Data</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle className="h-12 w-12 mx-auto text-emerald-600" />
            <p className="font-medium text-lg">Export Complete</p>
            <p className="text-sm text-muted-foreground">Your CSV file has been downloaded.</p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Link href="/settings"><Button variant="outline">{done ? "Back" : "Cancel"}</Button></Link>
        {!done && (
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Exporting...</>) : (<><Download className="mr-2 h-4 w-4" />Export CSV</>)}
          </Button>
        )}
      </div>
    </div>
  );
}
