"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Factory, Loader2 } from "lucide-react";
import { updateProductionHouse } from "@/lib/api/production-houses";
import { createClient } from "@/lib/supabase/client";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAppToast } from "@/hooks/use-app-toast";

const inputCls = "bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) focus:border-(--svf-border-strong) h-10";
const labelCls = "text-xs font-semibold text-(--text-faint) uppercase tracking-wider";

export default function EditProductionHousePage() {
  const router = useRouter();
  const params = useParams();
  const houseId = params.id as string;
  const { allowed, loading: permLoading } = useRequirePermission("edit", "production_house", "/production-houses");

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useAppToast();

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase.from("production_houses").select("*").eq("id", houseId).single();
        if (data) {
          setName(data.name || "");
        } else {
          toast.error("Production house not found");
        }
      } catch { toast.error("Failed to load production house"); }
      finally { setLoading(false); }
    }
    load();
  }, [houseId]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Production house name is required"); return; }
    setSaving(true);
    try {
      await updateProductionHouse(houseId, { name: name.trim() });
      router.push("/production-houses");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update production house");
    } finally { setSaving(false); }
  };

  if (loading || permLoading || !allowed) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Cinematic Header ── */}
      <div className="relative overflow-hidden rounded-[12px] bg-(--panel-solid)/60 border border-(--svf-border) backdrop-blur-xl p-3">

        <div className="relative flex items-center gap-4">
          <Link href="/production-houses">
            <Button variant="ghost" size="sm" className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover) gap-1.5 h-8">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
          </Link>
          <div className="h-4 w-px bg-(--svf-border)" />
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[12px] bg-amber-500/15 border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <Factory className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-(--text)">
                Edit Production House
              </h1>
              <p className="text-xs text-(--text-faint) mt-0.5">Update details for <span className="text-(--text)">{name}</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Form ── */}
      <div className="relative overflow-hidden rounded-[12px] bg-(--panel-solid)/40 border border-(--svf-border) backdrop-blur-xl shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-(--svf-border)">
          <div className="p-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30">
            <Factory className="h-3.5 w-3.5 text-orange-400" />
          </div>
          <span className="text-sm font-semibold text-(--text)">Production House Details</span>
        </div>
        <div className="p-5">
          <div className="space-y-2">
            <Label className={labelCls}>Production House Name <span className="text-red-400">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., SVF Entertainment, Yash Raj Films"
              className={inputCls}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3">
        <Link href="/production-houses">
          <Button variant="outline" className="border-(--svf-border) text-(--text) hover:bg-(--hover)">
            Cancel
          </Button>
        </Link>
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="bg-orange-600 hover:bg-orange-500 text-white border-0 shadow-lg shadow-orange-900/30 min-w-[180px]"
        >
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</> : "Update Production House"}
        </Button>
      </div>
    </div>
  );
}
