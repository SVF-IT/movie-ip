"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { createPlatform, getRightsTypeNames } from "@/lib/api/platforms";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAppToast } from "@/hooks/use-app-toast";

const inputCls = "bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-500 focus:border-slate-500 h-10";
const selectCls = "bg-slate-950/40 border-slate-700/50 text-slate-300 h-10";
const labelCls = "text-xs font-semibold text-slate-400 uppercase tracking-wider";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl shadow-xl">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/60">
        <div className="p-1.5 rounded-lg bg-red-500/15 border border-red-500/30">
          <Building2 className="h-3.5 w-3.5 text-red-400" />
        </div>
        <span className="text-sm font-semibold text-slate-200">{title}</span>
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

export default function NewPlatformPage() {
  const router = useRouter();
  const { allowed, loading: permLoading } = useRequirePermission("create", "platform", "/platforms");
  const [name, setName] = useState("");
  const [platformType, setPlatformType] = useState("");
  const [customType, setCustomType] = useState("");
  const [useCustomType, setUseCustomType] = useState(false);
  const [existingTypes, setExistingTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const toast = useAppToast();

  useEffect(() => {
    getRightsTypeNames().then(setExistingTypes).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Platform name is required"); return; }
    const finalType = useCustomType ? customType.trim() : platformType;
    setSaving(true);
    try {
      await createPlatform({ name: name.trim(), platform_type: finalType || undefined });
      router.push("/platforms");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create platform");
    } finally { setSaving(false); }
  };

  if (permLoading || !allowed) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Cinematic Header ── */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-red-600 via-amber-500 to-transparent" />
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-cyan-600/6 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center gap-4">
          <Link href="/platforms">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 gap-1.5 h-8">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
          </Link>
          <div className="h-4 w-px bg-slate-700/60" />
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
              <Building2 className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Add Platform
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Add a new distribution platform</p>
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
                className="h-10 px-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-700/50"
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
          <Button variant="outline" className="border-slate-700/50 text-slate-300 hover:bg-slate-800/60">
            Cancel
          </Button>
        </Link>
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30 min-w-[140px]"
        >
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : "Create Platform"}
        </Button>
      </div>
    </div>
  );
}
