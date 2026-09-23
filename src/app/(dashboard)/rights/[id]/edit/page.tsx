"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Edit, GitPullRequest, Loader2, Plus } from "lucide-react";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { getRightById, getSiblingRights, createRight, updateRight, deleteRight } from "@/lib/api/rights";
import { getPlatforms } from "@/lib/api/dashboard";
import { submitRightChange } from "@/lib/api/pending-changes";
import {
  FormField, NatureEntryRow, entryFromRow, newEntry, inputCls,
  type NatureEntry,
} from "@/components/forms/nature-entry-row";
import type { Platform, PlatformRight } from "@/lib/types/database";

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
  /** The sibling rows as loaded, keyed by id — the "before" state for updates/deletes. */
  const [originalRows, setOriginalRows] = useState<Record<string, PlatformRight>>({});
  const [movieApprovalStatus, setMovieApprovalStatus] = useState<string | null>(null);

  const [platformId, setPlatformId] = useState("");
  const [category, setCategory] = useState("");   // → platform_rights.category
  const [holdbacks, setHoldbacks] = useState("");
  const [remarks, setRemarks] = useState("");
  const [entries, setEntries] = useState<NatureEntry[]>([]);
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
        setHoldbacks(right.holdbacks || "");
        setRemarks(right.remarks || "");

        // Sibling rows: the other natures of this same right.
        let rows: PlatformRight[] = [];
        try {
          rows = await getSiblingRights({
            movie_id: right.movie_id,
            platform_id: right.platform_id ?? null,
            category: right.category ?? null,
          });
        } catch { rows = []; }
        if (!rows.some(r => r.id === rightId)) rows = [right, ...rows];

        setOriginalRows(Object.fromEntries(rows.map(r => [r.id, r])));
        setEntries(rows.length ? rows.map(entryFromRow) : [newEntry()]);
      } catch { toast.error("Failed to load right"); }
      finally { setLoading(false); }
    }
    load();
  }, [rightId]);

  const selectedPlatform = platforms.find(p => p.id === platformId);

  const updateEntry = (key: string, patch: NatureEntry) =>
    setEntries(prev => prev.map(e => e._key === key ? patch : e));
  const removeEntry = (key: string) =>
    setEntries(prev => prev.filter(e => e._key !== key));
  const addEntry = () => setEntries(prev => [...prev, newEntry()]);

  const handleSave = async () => {
    if (!originalRight) return;
    if (!platformId) { toast.error("Please select a platform"); return; }

    const validEntries = entries.filter(e => e.nature.trim());
    if (validEntries.length === 0) { toast.error("Add at least one nature entry"); return; }
    for (const e of validEntries) {
      if (e.startDate && e.endDate && e.startDate > e.endDate) {
        toast.error("Start date must be before end date"); return;
      }
    }

    const combinedRemarks = remarks || undefined;
    const shared = {
      platform_id: platformId || undefined,
      category: category || undefined,
      holdbacks: holdbacks || undefined,
      remarks: combinedRemarks,
    };
    const rowFor = (e: NatureEntry): Partial<PlatformRight> => ({
      ...shared,
      nature: (e.nature || undefined) as PlatformRight["nature"],
      start_date: e.startDate || undefined,
      end_date: e.endDate || undefined,
      territory: e.territory || undefined,
    });

    // Rows that were loaded but are no longer present (or had their nature
    // cleared) are deletions — computed here, applied only below, on save.
    const keptIds = new Set(validEntries.map(e => e._id).filter(Boolean) as string[]);
    const removedIds = Object.keys(originalRows).filter(id => !keptIds.has(id));

    setSaving(true);
    try {
      if (movieApprovalStatus === "approved") {
        const submitterName = profile?.full_name || profile?.email || "Editor";
        await Promise.all([
          ...validEntries.map(e =>
            e._id
              ? submitRightChange(
                  originalRight.movie_id, "right_update",
                  { ...rowFor(e), id: e._id, platforms: selectedPlatform } as any,
                  submitterName, profile?.id, originalRows[e._id]
                )
              : submitRightChange(
                  originalRight.movie_id, "right_create",
                  {
                    ...rowFor(e),
                    movie_id: originalRight.movie_id,
                    territory: e.territory || "World",
                    platforms: selectedPlatform,
                  } as any,
                  submitterName, profile?.id
                )
          ),
          ...removedIds.map(id =>
            submitRightChange(
              originalRight.movie_id, "right_delete",
              { ...originalRows[id], id, platforms: selectedPlatform } as any,
              submitterName, profile?.id, originalRows[id]
            )
          ),
        ]);
        toast.success("Right changes submitted for approval. Changes will apply once reviewed.");
        return;
      }

      await Promise.all([
        ...validEntries.map(e =>
          e._id
            ? updateRight(e._id, rowFor(e))
            : createRight({
                ...rowFor(e),
                movie_id: originalRight.movie_id,
                territory: e.territory || "World",
              })
        ),
        ...removedIds.map(id => deleteRight(id)),
      ]);
      toast.success("Right updated.");
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
          <BackButton fallbackHref="/rights" label={null} iconClassName="h-4 w-4" className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover) h-8 w-8 p-0 shrink-0" />
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
          <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-(--text)">
            Right Details
            <span className="ml-auto text-[10px] font-normal text-(--text-faint)">Shared across all nature entries below</span>
          </CardTitle>
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
            Each entry is one rights row. Removing an entry deletes that row when you save.
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
