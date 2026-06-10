"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload, Loader2, CheckCircle, FileText } from "lucide-react";
import { importMoviesCSV } from "@/lib/api/import-export";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAppToast } from "@/hooks/use-app-toast";

export default function ImportPage() {
  const { allowed, loading: permLoading } = useRequirePermission("import", "movie", "/settings");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"select" | "processing" | "done">("select");
  const [result, setResult] = useState<{ imported: number; errors: string[] }>({ imported: 0, errors: [] });
  const toast = useAppToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > 10 * 1024 * 1024) { toast.error("File must be under 10MB"); return; }
      setFile(f);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setStep("processing");
    try {
      const res = await importMoviesCSV(file);
      setResult({
        imported: res.success,
        errors: res.errors.map((e) => `Row ${e.row}: ${e.message}`),
      });
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
      setStep("select");
    }
  };

  if (permLoading || !allowed) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4"><Link href="/settings"><Button variant="ghost" size="sm"><ArrowLeft className="mr-2 h-4 w-4" />Back to Settings</Button></Link></div>
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><Upload className="h-6 w-6" />Import Data</h1><p className="text-muted-foreground">Import movies from a CSV file</p></div>
      {step === "select" && (
        <Card>
          <CardHeader><CardTitle>Select CSV File</CardTitle><CardDescription>Expected columns: title, source, language, release_year, certification, production_house, territory, remarks</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors" onClick={() => fileRef.current?.click()}>
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              {file ? (<p className="font-medium">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>) : (<><p className="font-medium">Click to select a file</p><p className="text-sm text-muted-foreground mt-1">CSV files up to 10MB</p></>)}
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
          </CardContent>
        </Card>
      )}

      {step === "processing" && (
        <Card><CardContent className="py-12 text-center space-y-4"><Loader2 className="h-12 w-12 animate-spin mx-auto" /><p className="font-medium">Importing data...</p></CardContent></Card>
      )}

      {step === "done" && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle className="h-12 w-12 mx-auto text-emerald-600" />
            <p className="font-medium text-lg">Import Complete</p>
            <p className="text-2xl font-bold text-emerald-600">{result.imported} records imported</p>
            {result.errors.length > 0 && (
              <div className="text-left max-w-md mx-auto mt-4 space-y-1">{result.errors.slice(0, 10).map((e, i) => (<p key={i} className="text-sm text-destructive">{e}</p>))}{result.errors.length > 10 && <p className="text-sm text-muted-foreground">...and {result.errors.length - 10} more errors</p>}</div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        {step === "select" && (<>
          <Link href="/settings"><Button variant="outline">Cancel</Button></Link>
          <Button onClick={handleImport} disabled={!file}><Upload className="mr-2 h-4 w-4" />Start Import</Button>
        </>)}
        {step === "done" && <Link href="/settings"><Button>Done</Button></Link>}
      </div>
    </div>
  );
}
