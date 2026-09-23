"use client";

import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { NatureSelector } from "@/components/forms/nature-selector";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * One nature entry == one `platform_rights` row. A "right" with several natures
 * is several rows sharing the same movie_id + platform_id + category, so both
 * the create and the edit page render a list of these.
 *
 * `_id` is the existing row's primary key, or undefined for an entry the user
 * just added — that distinction is what tells the edit page's save whether to
 * update or insert.
 */
export interface NatureEntry {
  _key: string;
  _id?: string;
  nature: string;
  startDate: string;
  endDate: string;
  territory: string;
}

let _keyCounter = 0;
export function newEntry(): NatureEntry {
  return { _key: `e-${++_keyCounter}`, nature: "", startDate: "", endDate: "", territory: "World" };
}

/** Build an entry from an existing platform_rights row. */
export function entryFromRow(row: {
  id: string;
  nature?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  territory?: string | null;
}): NatureEntry {
  return {
    _key: `r-${row.id}`,
    _id: row.id,
    nature: row.nature || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    territory: row.territory || "",
  };
}

// ── Shared sub-components ────────────────────────────────────────────────────

export const TERRITORY_PRESETS = ["World", "India", "Rest of World", "South Asia"];

export const inputCls = "h-9 bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-sm focus-visible:ring-red-500/40";
export const labelCls = "text-xs font-bold uppercase tracking-widest text-(--text-faint)";

export function TerritorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

export function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={labelCls}>{label}</p>
      {children}
      {hint && <p className="text-[10px] text-(--text-faint) leading-relaxed">{hint}</p>}
    </div>
  );
}

// ── Nature entry row ─────────────────────────────────────────────────────────

export function NatureEntryRow({
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
