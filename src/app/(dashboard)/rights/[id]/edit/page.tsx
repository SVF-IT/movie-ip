"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, GitPullRequest, Loader2 } from "lucide-react";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { getRightById, updateRight } from "@/lib/api/rights";
import { getPlatforms, getRightsNatureTypes } from "@/lib/api/dashboard";
import { submitRightChange } from "@/lib/api/pending-changes";
import type { Platform, RightsNatureType, PlatformRight } from "@/lib/types/database";

export default function EditRightPage() {
  const router = useRouter();
  const params = useParams();
  const rightId = params.id as string;
  const { allowed, loading: permLoading } = useRequirePermission("edit", "right", "/rights");
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [natureTypes, setNatureTypes] = useState<RightsNatureType[]>([]);
  const [originalRight, setOriginalRight] = useState<PlatformRight | null>(null);
  const [movieApprovalStatus, setMovieApprovalStatus] = useState<string | null>(null);
  const [platformId, setPlatformId] = useState("");
  const [nature, setNature] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [territory, setTerritory] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [right, plats, natureTs] = await Promise.all([
          getRightById(rightId),
          getPlatforms(),
          getRightsNatureTypes(),
        ]);
        setPlatforms(plats);
        setNatureTypes(natureTs);
        if (!right) { toast.error("Right not found"); setLoading(false); return; }
        setOriginalRight(right);
        if (right.movie_id) {
          const { createClient } = await import("@/lib/supabase/client");
          const sb = createClient();
          const { data: mv } = await sb.from("movies").select("approval_status").eq("id", right.movie_id).single();
          setMovieApprovalStatus(mv?.approval_status ?? null);
        }
        setPlatformId(right.platform_id || "");
        setNature(right.nature || "");
        setStartDate(right.start_date || "");
        setEndDate(right.end_date || "");
        setTerritory(right.territory || "");
        setRemarks(right.remarks || "");
      } catch { toast.error("Failed to load right"); }
      finally { setLoading(false); }
    }
    load();
  }, [rightId]);

  const handleSave = async () => {
    if (startDate && endDate && startDate > endDate) { toast.error("Start date must be before end date"); return; }
    setSaving(true);
    try {
      const updatedData: Partial<PlatformRight> = {
        platform_id: platformId || undefined,
        nature: nature as "exclusive" | "non_exclusive" | undefined,
        start_date: startDate || undefined, end_date: endDate || undefined,
        territory: territory || undefined,
        remarks: remarks || undefined,
      };

      if (movieApprovalStatus === "approved" && originalRight) {
        const submitterName = profile?.full_name || profile?.email || "Editor";
        const selectedPlatform = platforms.find(p => p.id === platformId);
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

  if (loading || permLoading || !allowed) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4"><Link href="/rights"><Button variant="ghost" size="sm"><ArrowLeft className="mr-2 h-4 w-4" />Back to Rights</Button></Link></div>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Right Details</h1>
        <p className="text-muted-foreground">Modify existing license terms or exploitation parameters.</p>
      </div>
      {movieApprovalStatus === "approved" && (
        <div className="flex items-start gap-3 rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-sm text-blue-300">
          <GitPullRequest className="h-4 w-4 shrink-0 mt-0.5" />
          This right belongs to an <strong>approved</strong> movie. Changes will be submitted for admin/legal review before being applied.
        </div>
      )}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Platform</Label><Select value={platformId} onValueChange={setPlatformId}><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{platforms.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-bold">Nature of Right</Label>
              <Select value={nature} onValueChange={setNature}>
                <SelectTrigger className="h-11 focus-ring"><SelectValue placeholder="Choose Nature..." /></SelectTrigger>
                <SelectContent>
                  {natureTypes.map((nt) => (
                    <SelectItem key={nt.id} value={nt.name}>{nt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground ml-1">Exclusivity or specific ownership terms.</p>
            </div>
            <div className="space-y-2"><Label>Territory</Label><Input value={territory} onChange={(e) => setTerritory(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Remarks</Label><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} /></div>
        </CardContent>
      </Card>
      <div className="flex items-center justify-end gap-3 pt-6 border-t border-border/50">
        <Link href="/rights">
          <Button variant="ghost" className="px-6 h-11">Discard Changes</Button>
        </Link>
        <Button onClick={handleSave} disabled={saving} className="px-8 h-11 shadow-lg shadow-primary/20 gap-2">
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /><span>{movieApprovalStatus === "approved" ? "Submitting..." : "Saving..."}</span></>
          ) : movieApprovalStatus === "approved" ? (
            <><GitPullRequest className="h-4 w-4" /><span>Submit for Approval</span></>
          ) : (
            <span>Save & Update Right</span>
          )}
        </Button>
      </div>
    </div>
  );
}
