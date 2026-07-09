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
import { ArrowLeft, Calendar, FileText, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { createRight } from "@/lib/api/rights";
import { getMovies, getMovieById } from "@/lib/api/movies";
import { submitRightChange } from "@/lib/api/pending-changes";
import { getPlatforms } from "@/lib/api/dashboard";
import type { Platform, MovieWithDetails } from "@/lib/types/database";
import { NatureSelector } from "@/components/forms/nature-selector";

// ── Types ────────────────────────────────────────────────────────────────────

interface NatureEntry {
  _key: string;
  nature: string;
  startDate: string;
  endDate: string;
  territory: string;
}

let _keyCounter = 0;
function newEntry(): NatureEntry {
  return { _key: `e-${++_keyCounter}`, nature: "", startDate: "", endDate: "", territory: "World" };
}

// ── Shared sub-components ────────────────────────────────────────────────────

const TERRITORY_PRESETS = ["World", "India", "Rest of World", "South Asia"];

const inputCls = "h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-sm focus-visible:ring-red-500/40";
const labelCls = "text-xs font-bold uppercase tracking-widest text-(--text-faint)";

function TerritorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isCustom = value !== "" && !TERRITORY_PRESETS.includes(value);
  const selectVal = isCustom ? "__custom__" : value || "";
  return (
    <div className="space-y-1.5">
      <Select value={selectVal} onValueChange={v => { if (v !== "__custom__") onChange(v); else onChange(""); }}>
        <SelectTrigger className={inputCls}><SelectValue placeholder="Territory…" /></SelectTrigger>
        <SelectContent>
          {TERRITORY_PRESETS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          <SelectItem value="__custom__">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {(isCustom || selectVal === "__custom__") && (
        <Input value={value} onChange={e => onChange(e.target.value)}
          placeholder="Enter territory…" className={inputCls} />
      )}
    </div>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={labelCls}>{label}</p>
      {children}
      {hint && <p className="text-[10px] text-(--text-faint) leading-relaxed">{hint}</p>}
    </div>
  );
}

// ── Nature entry row ─────────────────────────────────────────────────────────

function NatureEntryRow({
  entry, onChange, onRemove, isOnly,
}: {
  entry: NatureEntry;
  onChange: (e: NatureEntry) => void;
  onRemove: () => void;
  isOnly: boolean;
}) {
  const set = (patch: Partial<NatureEntry>) => onChange({ ...entry, ...patch });

  return (
    <div className="rounded-[10px] border border-(--svf-border) bg-(--bg-raise) overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2 bg-(--bg-deep) border-b border-(--svf-border)">
        <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) flex-1">Nature Entry</span>
        <button type="button" onClick={onRemove} disabled={isOnly}
          className="p-1 rounded text-(--text-faint) hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Nature selector — full width */}
        <FormField label="Nature of Right *">
          <NatureSelector
            value={entry.nature}
            onValueChange={(v) => set({ nature: v })}
            extraOptions={["Shared Exclusive"]}
            excludeOptions={["Jointly Owned"]}
          />
        </FormField>

        {/* Dates + Territory — only when nature is filled */}
        {entry.nature && (
          <div className="grid grid-cols-3 gap-2">
            <FormField label="Start Date">
              <Input type="date" value={entry.startDate} onChange={e => set({ startDate: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="End Date">
              <Input type="date" value={entry.endDate} onChange={e => set({ endDate: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="Territory">
              <TerritorySelect value={entry.territory} onChange={v => set({ territory: v })} />
            </FormField>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NewRightPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { allowed, loading: permLoading } = useRequirePermission("create", "right", "/rights");
  const { profile } = useAuth();
  const preMovieId = searchParams.get("movieId") || "";
  const preMovieTitle = searchParams.get("movieTitle") || "";

  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const toast = useAppToast();

  // Movie
  const [movieId, setMovieId] = useState(preMovieId);
  const [movieTitle, setMovieTitle] = useState(preMovieTitle);
  const [movieSearch, setMovieSearch] = useState("");
  const [movieResults, setMovieResults] = useState<MovieWithDetails[]>([]);
  const [searchingMovies, setSearchingMovies] = useState(false);

  // Shared fields
  const [platformId, setPlatformId] = useState("");
  const [category, setCategory] = useState("");
  const [holdbacks, setHoldbacks] = useState("");
  const [remarks, setRemarks] = useState("");

  // Nature entries
  const [entries, setEntries] = useState<NatureEntry[]>([newEntry()]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPlatforms().then((p) => {
      setPlatforms([...p].sort((a, b) => a.name.localeCompare(b.name) || (a.platform_type || "").localeCompare(b.platform_type || "")));
    });
  }, []);

  const selectedPlatform = platforms.find(p => p.id === platformId);

  const handleMovieSearch = useCallback(async (query: string) => {
    setMovieSearch(query);
    if (query.length < 2) { setMovieResults([]); return; }
    setSearchingMovies(true);
    try { const { data } = await getMovies({ search: query, limit: 10 }); setMovieResults(data); }
    catch { setMovieResults([]); }
    finally { setSearchingMovies(false); }
  }, []);

  const updateEntry = (key: string, patch: NatureEntry) =>
    setEntries(prev => prev.map(e => e._key === key ? patch : e));
  const removeEntry = (key: string) =>
    setEntries(prev => prev.filter(e => e._key !== key));
  const addEntry = () => setEntries(prev => [...prev, newEntry()]);

  const handleSave = async () => {
    if (!movieId) { toast.error("Please select a movie"); return; }
    if (!platformId) { toast.error("Please select a platform"); return; }
    const validEntries = entries.filter(e => e.nature.trim());
    if (validEntries.length === 0) { toast.error("Add at least one nature entry"); return; }
    for (const e of validEntries) {
      if (e.startDate && e.endDate && e.startDate > e.endDate) {
        toast.error("Start date must be before end date"); return;
      }
    }

    const combinedRemarks = remarks || undefined;

    setSaving(true);
    try {
      const movie = await getMovieById(movieId);
      const isApproved = (movie as any)?.approval_status === "approved";

      if (isApproved) {
        const submitterName = profile?.full_name || profile?.email || "Editor";
        await Promise.all(validEntries.map(e =>
          submitRightChange(
            movieId, "right_create",
            {
              movie_id: movieId, platform_id: platformId,
              category: category || undefined,
              nature: e.nature,
              start_date: e.startDate || undefined, end_date: e.endDate || undefined,
              territory: e.territory || "World",
              holdbacks: holdbacks || undefined,
              remarks: combinedRemarks,
              platforms: selectedPlatform,
            } as any,
            submitterName, profile?.id
          )
        ));
        toast.success(`${validEntries.length} right(s) submitted for approval.`);
        return;
      }

      await Promise.all(validEntries.map(e =>
        createRight({
          movie_id: movieId, platform_id: platformId,
          category: category || undefined,
          nature: e.nature as any,
          start_date: e.startDate || undefined, end_date: e.endDate || undefined,
          territory: e.territory || "World",
          holdbacks: holdbacks || undefined,
          remarks: combinedRemarks,
        })
      ));
      toast.success(`${validEntries.length} right(s) created.`);
      router.push("/rights");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to create right"); }
    finally { setSaving(false); }
  };

  if (permLoading || !allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-red-400/60" />
        <p className="text-(--text-faint) text-sm">Checking permissions…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="relative overflow-hidden rounded-[12px] bg-(--panel-solid)/60 border border-(--svf-border) backdrop-blur-xl p-3">
        <div className="relative flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover) h-8 w-8 p-0 shrink-0">
            <Link href="/rights"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="p-2 rounded-[9px] bg-red-500/10 border border-red-500/20">
            <Plus className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-(--text)">Add New Right</h1>
            <p className="text-(--text-faint) text-sm mt-0.5">Assign a new platform license or exploitation right to a film.</p>
          </div>
        </div>
      </div>

      {/* Movie Selection */}
      <Card className="glass-card border-(--svf-border)">
        <CardHeader className="pb-3 pt-5 px-5 border-b border-(--svf-border)">
          <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-(--text)">
            <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
              <FileText className="h-3.5 w-3.5 text-red-400" />
            </div>
            Movie
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          {!preMovieId ? (
            movieId ? (
              <div className="flex items-center justify-between rounded-lg bg-(--bg-deep) border border-(--svf-border) px-4 py-3">
                <span className="font-semibold text-(--text)">{movieTitle}</span>
                <Button variant="ghost" size="sm" className="text-(--text-faint) hover:text-red-400 hover:bg-red-500/10 h-7 text-xs"
                  onClick={() => { setMovieId(""); setMovieTitle(""); }}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--text-faint)" />
                  <Input
                    placeholder="Search movies by title…"
                    value={movieSearch}
                    onChange={(e) => handleMovieSearch(e.target.value)}
                    className="pl-9 h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-sm focus-visible:ring-red-500/40"
                  />
                </div>
                {searchingMovies && (
                  <div className="flex items-center gap-2 text-xs text-(--text-faint) px-1">
                    <Loader2 className="h-3 w-3 animate-spin" />Searching…
                  </div>
                )}
                {movieResults.length > 0 && (
                  <div className="rounded-lg border border-(--svf-border) bg-(--panel-solid)/80 overflow-hidden max-h-44 overflow-y-auto">
                    {movieResults.map((m) => (
                      <button key={m.id}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-(--hover) transition-colors border-b border-(--svf-border)/40 last:border-0"
                        onClick={() => { setMovieId(m.id); setMovieTitle(m.title); setMovieSearch(""); setMovieResults([]); }}>
                        <span className="font-semibold text-(--text)">{m.title}</span>
                        {m.release_year && <span className="text-(--text-faint) ml-2 text-xs">({m.release_year})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="flex items-center gap-3 rounded-lg bg-(--bg-deep) border border-(--svf-border) px-4 py-3">
              <FileText className="h-4 w-4 text-(--text-faint) shrink-0" />
              <span className="font-semibold text-(--text)">{movieTitle}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shared Right Details */}
      <Card className="glass-card border-(--svf-border)">
        <CardHeader className="pb-3 pt-5 px-5 border-b border-(--svf-border)">
          <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-(--text)">
            <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
              <FileText className="h-3.5 w-3.5 text-red-400" />
            </div>
            Right Details
            <span className="ml-auto text-[10px] font-normal text-(--text-faint)">Shared across all nature entries below</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          {/* Platform / Type */}
          <FormField label="Platform / Type *">
            <Select value={platformId} onValueChange={(v) => { setPlatformId(v); setCategory(""); }}>
              <SelectTrigger className="h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) text-sm">
                <SelectValue placeholder="Select platform…">
                  {platformId && (() => {
                    const p = platforms.find(x => x.id === platformId);
                    return p ? <span>{p.name}{p.platform_type ? <span className="text-(--text-faint) ml-1.5 text-xs">({p.platform_type})</span> : null}</span> : null;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {platforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-medium">{p.name}</span>
                    {p.platform_type && <span className="text-(--text-faint) ml-2 text-xs">— {p.platform_type}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Category */}
          <FormField label="Category">
            <Input value={category} onChange={e => setCategory(e.target.value)}
              placeholder="e.g. Pay TV, SVOD…" className={inputCls} />
          </FormField>

          {/* Holdbacks */}
          <FormField label="Holdbacks" hint="Leave blank if none.">
            <Input value={holdbacks} onChange={e => setHoldbacks(e.target.value)}
              placeholder="e.g. FVOD, Theatrical…"
              className={inputCls} />
          </FormField>

          {/* Remarks */}
          <FormField label="Remarks">
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2}
              className="bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-sm resize-none focus-visible:ring-red-500/40" />
          </FormField>
        </CardContent>
      </Card>

      {/* Nature Entries */}
      <Card className="glass-card border-(--svf-border)">
        <CardHeader className="pb-3 pt-5 px-5 border-b border-(--svf-border)">
          <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-(--text)">
            <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
              <Calendar className="h-3.5 w-3.5 text-red-400" />
            </div>
            Nature Entries
            <Button type="button" variant="outline" size="sm" onClick={addEntry}
              className="ml-auto h-7 text-xs border-(--svf-border) text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
              <Plus className="h-3 w-3 mr-1" />Add entry
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-3">
          <p className="text-xs text-(--text-faint) -mt-1">
            Each entry creates one rights row. Select a nature to reveal dates and territory.
          </p>
          {entries.map(entry => (
            <NatureEntryRow
              key={entry._key}
              entry={entry}
              onChange={(updated) => updateEntry(entry._key, updated)}
              onRemove={() => removeEntry(entry._key)}
              isOnly={entries.length === 1}
            />
          ))}
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-3 pt-2 pb-6">
        <Link href="/rights">
          <Button variant="ghost" className="h-10 px-6 text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
            Cancel
          </Button>
        </Link>
        <Button onClick={handleSave} disabled={saving}
          className="h-10 px-8 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30 gap-2">
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
          ) : (
            <><Plus className="h-4 w-4" />Create {entries.filter(e => e.nature).length || ""} Right{entries.filter(e => e.nature).length !== 1 ? "s" : ""}</>
          )}
        </Button>
      </div>
    </div>
  );
}
