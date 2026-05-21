"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Calendar, FileText, Globe, Loader2, Plus, Search } from "lucide-react";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { createRight } from "@/lib/api/rights";
import { getMovies, getMovieById } from "@/lib/api/movies";
import { submitRightChange } from "@/lib/api/pending-changes";
import { getPlatforms } from "@/lib/api/dashboard";
import type { Platform, MovieWithDetails } from "@/lib/types/database";
import { NatureSelector } from "@/components/forms/nature-selector";

function FormField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
        {label}{required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 leading-relaxed">{hint}</p>}
    </div>
  );
}

export default function NewRightPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { allowed, loading: permLoading } = useRequirePermission("create", "right", "/rights");
  const { profile } = useAuth();
  const preMovieId = searchParams.get("movieId") || "";
  const preMovieTitle = searchParams.get("movieTitle") || "";

  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const toast = useAppToast();
  const [movieId, setMovieId] = useState(preMovieId);
  const [movieTitle, setMovieTitle] = useState(preMovieTitle);
  const [movieSearch, setMovieSearch] = useState("");
  const [movieResults, setMovieResults] = useState<MovieWithDetails[]>([]);
  const [searchingMovies, setSearchingMovies] = useState(false);
  const [platformId, setPlatformId] = useState("");
  const [nature, setNature] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [territory, setTerritory] = useState("World");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPlatforms().then((p) => {
      setPlatforms([...p].sort((a, b) => a.name.localeCompare(b.name) || (a.platform_type || "").localeCompare(b.platform_type || "")));
    });
  }, []);

  const handleMovieSearch = useCallback(async (query: string) => {
    setMovieSearch(query);
    if (query.length < 2) { setMovieResults([]); return; }
    setSearchingMovies(true);
    try { const { data } = await getMovies({ search: query, limit: 10 }); setMovieResults(data); }
    catch { setMovieResults([]); }
    finally { setSearchingMovies(false); }
  }, []);

  const handleSave = async () => {
    if (!movieId) { toast.error("Please select a movie"); return; }
    if (!platformId) { toast.error("Please select a platform"); return; }
    if (startDate && endDate && startDate > endDate) { toast.error("Start date must be before end date"); return; }
    setSaving(true);
    try {
      const movie = await getMovieById(movieId);
      const isApproved = (movie as any)?.approval_status === "approved";
      const selectedPlatform = platforms.find(p => p.id === platformId);

      const rightData = {
        movie_id: movieId, platform_id: platformId,
        nature: nature as "exclusive" | "non_exclusive" | undefined,
        start_date: startDate || undefined, end_date: endDate || undefined,
        territory: territory || "World",
        remarks: remarks || undefined,
      };

      if (isApproved) {
        const submitterName = profile?.full_name || profile?.email || "Editor";
        await submitRightChange(
          movieId, "right_create",
          { ...rightData, platforms: selectedPlatform } as any,
          submitterName, profile?.id
        );
        toast.success("Right creation submitted for approval. It will be added once reviewed.");
        return;
      }

      await createRight(rightData);
      router.push("/rights");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to create right"); }
    finally { setSaving(false); }
  };

  if (permLoading || !allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-red-400/60" />
        <p className="text-slate-400 text-sm">Checking permissions…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-red-600 via-amber-500 to-transparent" />
        <div className="absolute top-4 right-4 w-48 h-48 bg-red-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 h-8 w-8 p-0 shrink-0">
            <Link href="/rights"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <Plus className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">Add New Right</h1>
            <p className="text-slate-400 text-sm mt-0.5">Assign a new platform license or exploitation right to a film.</p>
          </div>
        </div>
      </div>

      {/* Movie Selection */}
      <Card className="glass-card border-slate-800/60">
        <CardHeader className="pb-3 pt-5 px-5 border-b border-slate-800/50">
          <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
            <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
              <FileText className="h-3.5 w-3.5 text-red-400" />
            </div>
            Movie
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          {!preMovieId ? (
            movieId ? (
              <div className="flex items-center justify-between rounded-lg bg-slate-800/40 border border-slate-700/50 px-4 py-3">
                <span className="font-semibold text-slate-200">{movieTitle}</span>
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 h-7 text-xs"
                  onClick={() => { setMovieId(""); setMovieTitle(""); }}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search movies by title…"
                    value={movieSearch}
                    onChange={(e) => handleMovieSearch(e.target.value)}
                    className="pl-9 h-9 bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-400 text-sm focus-visible:ring-red-500/40"
                  />
                </div>
                {searchingMovies && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
                    <Loader2 className="h-3 w-3 animate-spin" />Searching…
                  </div>
                )}
                {movieResults.length > 0 && (
                  <div className="rounded-lg border border-slate-700/50 bg-slate-900/80 overflow-hidden max-h-44 overflow-y-auto">
                    {movieResults.map((m) => (
                      <button key={m.id}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-800/60 transition-colors border-b border-slate-800/40 last:border-0"
                        onClick={() => { setMovieId(m.id); setMovieTitle(m.title); setMovieSearch(""); setMovieResults([]); }}>
                        <span className="font-semibold text-slate-200">{m.title}</span>
                        {m.release_year && <span className="text-slate-400 ml-2 text-xs">({m.release_year})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="flex items-center gap-3 rounded-lg bg-slate-800/40 border border-slate-700/50 px-4 py-3">
              <FileText className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-200">{movieTitle}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rights Details */}
      <Card className="glass-card border-slate-800/60">
        <CardHeader className="pb-3 pt-5 px-5 border-b border-slate-800/50">
          <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
            <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
              <FileText className="h-3.5 w-3.5 text-red-400" />
            </div>
            Rights Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          <FormField label="Platform" required>
            <Select value={platformId} onValueChange={setPlatformId}>
              <SelectTrigger className="h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                <SelectValue placeholder="Select platform…">
                  {platformId && (() => {
                    const p = platforms.find(x => x.id === platformId);
                    return p ? <span>{p.name}{p.platform_type ? <span className="text-slate-500 ml-1.5 text-xs">({p.platform_type})</span> : null}</span> : null;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {platforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-medium">{p.name}</span>
                    {p.platform_type && <span className="text-slate-400 ml-2 text-xs">— {p.platform_type}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Nature of Right" hint="Exclusivity or specific ownership terms.">
            <NatureSelector
              value={nature}
              onValueChange={setNature}
              extraOptions={['Shared Exclusive']}
              excludeOptions={['Jointly Owned']}
            />
          </FormField>
        </CardContent>
      </Card>

      {/* Period & Territory */}
      <Card className="glass-card border-slate-800/60">
        <CardHeader className="pb-3 pt-5 px-5 border-b border-slate-800/50">
          <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
            <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
              <Calendar className="h-3.5 w-3.5 text-red-400" />
            </div>
            Period & Territory
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm focus-visible:ring-red-500/40" />
            </FormField>
            <FormField label="End Date">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm focus-visible:ring-red-500/40" />
            </FormField>
          </div>

          <FormField label="Territory">
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="e.g., World"
                className="pl-9 h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 placeholder:text-slate-400 text-sm focus-visible:ring-red-500/40" />
            </div>
          </FormField>

          <FormField label="Remarks">
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3}
              className="bg-slate-950/40 border-slate-700/50 text-slate-300 placeholder:text-slate-400 text-sm resize-none focus-visible:ring-red-500/40" />
          </FormField>
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-3 pt-2 pb-6">
        <Link href="/rights">
          <Button variant="ghost" className="h-10 px-6 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
            Cancel
          </Button>
        </Link>
        <Button onClick={handleSave} disabled={saving}
          className="h-10 px-8 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30 gap-2">
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
          ) : (
            <><Plus className="h-4 w-4" />Create Right Entry</>
          )}
        </Button>
      </div>
    </div>
  );
}
