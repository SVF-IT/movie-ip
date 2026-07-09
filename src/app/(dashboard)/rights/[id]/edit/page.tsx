"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, GitPullRequest, Loader2 } from "lucide-react";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { getRightById, updateRight } from "@/lib/api/rights";
import { getPlatforms } from "@/lib/api/dashboard";
import { submitRightChange } from "@/lib/api/pending-changes";
import { NatureSelector } from "@/components/forms/nature-selector";
import type { Platform, PlatformRight } from "@/lib/types/database";

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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EditRightPage() {
  const router = useRouter();
  const params = useParams();
  const rightId = params.id as string;
  const { allowed, loading: permLoading } = useRequirePermission("edit", "right", "/rights");
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [originalRight, setOriginalRight] = useState<PlatformRight | null>(null);
  const [movieApprovalStatus, setMovieApprovalStatus] = useState<string | null>(null);

  const [platformId, setPlatformId] = useState("");
  const [category, setCategory] = useState("");   // → platform_rights.category
  const [nature, setNature] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [territory, setTerritory] = useState("");
  const [holdbacks, setHoldbacks] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [right, plats] = await Promise.all([getRightById(rightId), getPlatforms()]);
        setPlatforms([...plats].sort((a, b) => a.name.localeCompare(b.name) || (a.platform_type || "").localeCompare(b.platform_type || "")));
        if (!right) { toast.error("Right not found"); setLoading(false); return; }
        setOriginalRight(right);
        if (right.movie_id) {
          const { createClient } = await import("@/lib/supabase/client");
          const sb = createClient();
          const { data: mv } = await sb.from("movies").select("approval_status").eq("id", right.movie_id).single();
          setMovieApprovalStatus(mv?.approval_status ?? null);
        }
        setPlatformId(right.platform_id || "");
        setCategory(right.category || "");
        setNature(right.nature || "");
        setStartDate(right.start_date || "");
        setEndDate(right.end_date || "");
        setTerritory(right.territory || "");
        setHoldbacks(right.holdbacks || "");
        setRemarks(right.remarks || "");
      } catch { toast.error("Failed to load right"); }
      finally { setLoading(false); }
    }
    load();
  }, [rightId]);

  const selectedPlatform = platforms.find(p => p.id === platformId);

  const handleSave = async () => {
    if (startDate && endDate && startDate > endDate) { toast.error("Start date must be before end date"); return; }
    setSaving(true);

    const combinedRemarks = remarks || undefined;

    try {
      const updatedData: Partial<PlatformRight> = {
        platform_id: platformId || undefined,
        category: category || undefined,
        nature: (nature || undefined) as PlatformRight["nature"],
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        territory: territory || undefined,
        holdbacks: holdbacks || undefined,
        remarks: combinedRemarks,
      };

      if (movieApprovalStatus === "approved" && originalRight) {
        const submitterName = profile?.full_name || profile?.email || "Editor";
        await submitRightChange(
          originalRight.movie_id, "right_update",
          { ...updatedData, id: rightId, platforms: selectedPlatform } as any,
          submitterName, profile?.id, originalRight
        );
        toast.success("Right update submitted for approval. Changes will apply once reviewed.");
        return;
      }

      await updateRight(rightId, updatedData);
      router.push("/rights");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to update right"); }
    finally { setSaving(false); }
  };

  if (loading || permLoading || !allowed) {
    return <div className="flex items-center justify-center min-h-100"><Loader2 className="h-8 w-8 animate-spin text-red-400/60" /></div>;
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
            <Edit className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-(--text)">Edit Right</h1>
            <p className="text-(--text-faint) text-sm mt-0.5">Modify existing license terms or exploitation parameters.</p>
          </div>
        </div>
      </div>

      {movieApprovalStatus === "approved" && (
        <div className="flex items-start gap-2 rounded-[10px] bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-sm text-blue-300">
          <GitPullRequest className="h-4 w-4 shrink-0 mt-0.5" />
          This right belongs to an <strong className="mx-1">approved</strong> movie. Changes will be submitted for admin/legal review before being applied.
        </div>
      )}

      <Card className="glass-card border-(--svf-border)">
        <CardHeader className="pb-3 pt-5 px-5 border-b border-(--svf-border)">
          <CardTitle className="text-sm font-bold text-(--text)">Right Details</CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          {/* Platform */}
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

          {/* Nature */}
          <FormField label="Nature of Right">
            <NatureSelector
              value={nature}
              onValueChange={setNature}
              extraOptions={["Shared Exclusive"]}
              excludeOptions={["Jointly Owned"]}
            />
          </FormField>

          {/* Territory */}
          <FormField label="Territory">
            <TerritorySelect value={territory} onChange={setTerritory} />
          </FormField>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start Date">
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
            </FormField>
            <FormField label="End Date">
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
            </FormField>
          </div>

          {/* Holdbacks */}
          <FormField label="Holdbacks" hint="Leave blank if none.">
            <Input value={holdbacks} onChange={e => setHoldbacks(e.target.value)}
              placeholder="e.g. FVOD, Theatrical…" className={inputCls} />
          </FormField>

          {/* Remarks */}
          <FormField label="Remarks">
            <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2}
              className="bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-sm resize-none focus-visible:ring-red-500/40" />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3 pt-2 pb-6">
        <Link href="/rights">
          <Button variant="ghost" className="h-10 px-6 text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">Discard</Button>
        </Link>
        <Button onClick={handleSave} disabled={saving}
          className="h-10 px-8 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30 gap-2">
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" />{movieApprovalStatus === "approved" ? "Submitting…" : "Saving…"}</>
          ) : movieApprovalStatus === "approved" ? (
            <><GitPullRequest className="h-4 w-4" />Submit for Approval</>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </div>
  );
}
