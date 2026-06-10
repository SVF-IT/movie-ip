"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Building2, Loader2, X } from "lucide-react";
import { updatePlatform, getPlatformTypes } from "@/lib/api/platforms";
import { createClient } from "@/lib/supabase/client";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAppToast } from "@/hooks/use-app-toast";

const inputCls = "bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) focus:border-(--svf-border-strong) h-10";
const selectCls = "bg-(--bg-raise)/40 border-(--svf-border) text-(--text) h-10";
const labelCls = "text-xs font-semibold text-(--text-faint) uppercase tracking-wider";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[12px] bg-(--panel-solid)/40 border border-(--svf-border) backdrop-blur-xl shadow-xl">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-(--svf-border)">
        <div className="p-1.5 rounded-lg bg-red-500/15 border border-red-500/30">
          <Building2 className="h-3.5 w-3.5 text-red-400" />
        </div>
        <span className="text-sm font-semibold text-(--text)">{title}</span>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className={labelCls}>{label}{required && <span className="text-red-400 ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

export default function EditPlatformPage() {
  const router = useRouter();
  const params = useParams();
  const platformId = params.id as string;
  const { allowed, loading: permLoading } = useRequirePermission("edit", "platform", "/platforms");

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [platformType, setPlatformType] = useState("");
  const [customType, setCustomType] = useState("");
  const [useCustomType, setUseCustomType] = useState(false);
  const [existingTypes, setExistingTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const toast = useAppToast();

  useEffect(() => {
    async function load() {
      try {
        const [types] = await Promise.all([getPlatformTypes()]);
        setExistingTypes(types);
        const supabase = createClient();
        const { data } = await supabase.from("platforms").select("*").eq("id", platformId).single();
        if (data) {
          setName(data.name || "");
          setPlatformType(data.platform_type || "");
        } else {
          toast.error("Platform not found");
        }
      } catch { toast.error("Failed to load platform"); }
      finally { setLoading(false); }
    }
    load();
  }, [platformId]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Platform name is required"); return; }
    const finalType = useCustomType ? customType.trim() : platformType;
    setSaving(true);
    try {
      await updatePlatform(platformId, { name: name.trim(), platform_type: finalType || undefined });
      router.push("/platforms");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update platform");
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
          <Link href="/platforms">
            <Button variant="ghost" size="sm" className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover) gap-1.5 h-8">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
          </Link>
          <div className="h-4 w-px bg-(--svf-border)" />
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[12px] bg-amber-500/15 border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <Building2 className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-(--text)">
                Edit Platform
              </h1>
              <p className="text-xs text-(--text-faint) mt-0.5">Update details for <span className="text-(--text)">{name}</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Form ── */}
      <SectionCard title="Platform Details">
        <FormField label="Platform Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Netflix, Hotstar"
            className={inputCls}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </FormField>

        <FormField label="Platform Type">
          {!useCustomType ? (
            <Select
              value={platformType}
              onValueChange={(v) => {
                if (v === "__custom__") { setUseCustomType(true); setPlatformType(""); }
                else { setPlatformType(v); }
              }}
            >
              <SelectTrigger className={selectCls}>
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                {existingTypes.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
                <SelectItem value="__custom__">Custom…</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="flex gap-2">
              <Input
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="Enter custom type…"
                className={`${inputCls} flex-1`}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3 text-(--text-faint) hover:text-(--text) hover:bg-(--hover) border border-(--svf-border)"
                onClick={() => { setUseCustomType(false); setCustomType(""); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </FormField>
      </SectionCard>

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3">
        <Link href="/platforms">
          <Button variant="outline" className="border-(--svf-border) text-(--text) hover:bg-(--hover)">
            Cancel
          </Button>
        </Link>
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30 min-w-[140px]"
        >
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</> : "Update Platform"}
        </Button>
      </div>
    </div>
  );
}
