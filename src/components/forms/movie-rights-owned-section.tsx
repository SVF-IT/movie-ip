"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MovieRight, MovieRightType } from "@/lib/types/database";
import { Plus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type DraftMovieRight = Omit<MovieRight, "id" | "created_at" | "updated_at" | "created_by" | "updated_by" | "movie"> & {
  _key: string;
  id?: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const RIGHT_TYPES: MovieRightType[] = ["Satellite", "Internet", "Negative", "Airborne", "Ship", "Other"];

const CLASSIFICATION_PRESETS: Record<string, string[]> = {
  Satellite: ["Pay TV", "Free TV", "Pay Per View", "DTH", "Cable TV"],
  Internet:  ["AVOD", "FVOD", "SVOD", "NVOD", "TVOD", "IPTV"],
};

const NATURE_PRESETS = ["Exclusive", "Non-Exclusive", "Shared Exclusive"];
const TERRITORY_PRESETS = ["World", "India", "Rest of World", "South Asia"];

let _keyCounter = 0;
export function newDraftRight(movie_id: string, right_type: MovieRightType | string = "Satellite"): DraftMovieRight {
  return {
    _key: `new-${++_keyCounter}`,
    movie_id,
    right_type,
    nature: "Exclusive",
    classification: "",
    territory: "World",
    start_date: "",
    end_date: "",
    syndication: "",
    holdbacks: "",
  };
}

// ── Styles ───────────────────────────────────────────────────────────────────

const inputCls =
  "h-[34px] bg-(--bg-raise) border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-[13px] focus-visible:border-(--svf-accent-line) focus-visible:ring-0";
const selectCls =
  "h-[34px] bg-(--bg-raise) border-(--svf-border) text-(--text) text-[13px]";
const labelCls = "text-[10px] font-bold uppercase tracking-widest text-(--text-faint)";

// ── Classification chips with custom ─────────────────────────────────────────

function ClassificationChips({
  rightType, value, onChange,
}: {
  rightType: string; value: string; onChange: (v: string) => void;
}) {
  const presets = CLASSIFICATION_PRESETS[rightType] ?? [];
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = value.split(",").map(s => s.trim()).filter(Boolean);
  const commit = (next: string[]) => onChange(next.join(", "));
  const toggle = (opt: string) =>
    commit(active.includes(opt) ? active.filter(a => a !== opt) : [...active, opt]);
  const addCustom = () => {
    const v = customInput.trim();
    if (!v || active.includes(v)) { setCustomInput(""); setShowCustom(false); return; }
    commit([...active, v]); setCustomInput(""); setShowCustom(false);
  };

  if (presets.length === 0 && !showCustom && active.length === 0) {
    return (
      <button type="button" onClick={() => { setShowCustom(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="px-2 py-0.5 rounded-full text-[11px] font-semibold border border-dashed border-(--svf-border) text-(--text-faint) hover:text-(--text) transition-all">
        + Add classification
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(opt => {
          const sel = active.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              className={["px-2 py-0.5 rounded-full border text-[11px] font-semibold transition-all duration-100 select-none",
                sel ? "bg-red-500/12 border-red-500/60 text-red-400"
                    : "bg-(--bg-raise) border-(--svf-border) text-(--text-faint) hover:text-(--text)",
              ].join(" ")}>
              {opt}
            </button>
          );
        })}
        {!showCustom && (
          <button type="button" onClick={() => { setShowCustom(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold border border-dashed border-(--svf-border) text-(--text-faint) hover:text-(--text) transition-all">
            + Custom
          </button>
        )}
      </div>

      {showCustom && (
        <div className="flex gap-2 items-center">
          <Input ref={inputRef} value={customInput} onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } if (e.key === "Escape") { setShowCustom(false); setCustomInput(""); } }}
            placeholder="Type classification…"
            className="h-7 flex-1 bg-(--bg-raise) border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-xs" />
          <button type="button" onClick={addCustom}
            className="h-7 px-2.5 rounded-[9px] bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25">Add</button>
          <button type="button" onClick={() => { setShowCustom(false); setCustomInput(""); }}
            className="h-7 w-7 flex items-center justify-center rounded-[9px] text-(--text-faint) hover:text-(--text)">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {active.filter(item => !presets.includes(item)).map(item => (
            <span key={item} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-[11px] font-semibold text-red-400">
              {item}
              <button type="button" onClick={() => commit(active.filter(s => s !== item))}
                className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-red-500/20">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Nature select ─────────────────────────────────────────────────────────────

function NatureSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isCustom = value !== "" && !NATURE_PRESETS.includes(value);
  const selectVal = isCustom ? "__custom__" : value;
  return (
    <div className="space-y-1.5">
      <Select value={selectVal} onValueChange={v => { if (v !== "__custom__") onChange(v); }}>
        <SelectTrigger className={selectCls}><SelectValue placeholder="Select nature…" /></SelectTrigger>
        <SelectContent>
          {NATURE_PRESETS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          <SelectItem value="__custom__">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {(isCustom || selectVal === "__custom__") && (
        <Input value={isCustom ? value : ""} onChange={e => onChange(e.target.value)}
          placeholder="Describe nature of rights…" className={inputCls}
          autoFocus={selectVal === "__custom__" && !isCustom} />
      )}
    </div>
  );
}

// ── Territory input ───────────────────────────────────────────────────────────

function TerritoryInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isCustom = value !== "" && !TERRITORY_PRESETS.includes(value);
  const selectVal = isCustom ? "__custom__" : value || "";
  return (
    <div className="space-y-1.5">
      <Select value={selectVal} onValueChange={v => { if (v !== "__custom__") onChange(v); else onChange(""); }}>
        <SelectTrigger className={selectCls}><SelectValue placeholder="Territory…" /></SelectTrigger>
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

// ── Nature entry row (inside a right-type group) ──────────────────────────────

function NatureEntryRow({
  entry, onUpdate, onRemove, canRemove,
}: {
  entry: DraftMovieRight;
  onUpdate: (patch: Partial<DraftMovieRight>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-xl border border-(--svf-border) bg-(--bg-deep) overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-(--svf-border)">
        <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) flex-1">Nature Entry</span>
        <button type="button" onClick={onRemove} disabled={!canRemove}
          className="p-1 rounded text-(--text-faint) hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Nature */}
        <div>
          <p className={`${labelCls} mb-1.5`}>Nature of Rights *</p>
          <NatureSelect value={entry.nature} onChange={v => onUpdate({ nature: v })} />
        </div>

        {/* Territory + Dates — only when nature is set */}
        {entry.nature && (
          <>
            <div>
              <p className={`${labelCls} mb-1.5`}>Territory</p>
              <TerritoryInput value={entry.territory ?? ""} onChange={v => onUpdate({ territory: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={`${labelCls} mb-1`}>Start Date</p>
                <Input type="date" value={entry.start_date ?? ""}
                  onChange={e => onUpdate({ start_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <p className={`${labelCls} mb-1`}>End Date</p>
                <Input type="date" value={entry.end_date ?? ""}
                  onChange={e => onUpdate({ end_date: e.target.value })} className={inputCls}
                  placeholder="Leave blank = Perpetual" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Right-type group card ─────────────────────────────────────────────────────

function RightTypeGroup({
  rightType, groupEntries, allEntries, onChange, onRemoveGroup,
}: {
  rightType: string;
  groupEntries: DraftMovieRight[];
  allEntries: DraftMovieRight[];
  onChange: (entries: DraftMovieRight[]) => void;
  onRemoveGroup: () => void;
}) {
  const first = groupEntries[0];

  const updateShared = (patch: Partial<DraftMovieRight>) => {
    onChange(allEntries.map(e =>
      groupEntries.some(g => g._key === e._key) ? { ...e, ...patch } : e
    ));
  };

  const updateEntry = (key: string, patch: Partial<DraftMovieRight>) => {
    onChange(allEntries.map(e => e._key === key ? { ...e, ...patch } : e));
  };

  const removeEntry = (key: string) => {
    onChange(allEntries.filter(e => e._key !== key));
  };

  const addNatureEntry = () => {
    const clone: DraftMovieRight = {
      ...first,
      _key: `new-${++_keyCounter}`,
      id: undefined,
      nature: "",
      start_date: "",
      end_date: "",
      territory: "World",
    };
    const lastGroupIdx = allEntries.findLastIndex(e => groupEntries.some(g => g._key === e._key));
    const next = [...allEntries];
    next.splice(lastGroupIdx + 1, 0, clone);
    onChange(next);
  };

  const changeRightType = (newType: string) => {
    onChange(allEntries.map(e =>
      groupEntries.some(g => g._key === e._key)
        ? { ...e, right_type: newType as MovieRightType, classification: "" }
        : e
    ));
  };

  return (
    <div className="rounded-[10px] border border-(--svf-border) bg-(--bg-raise) overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-(--svf-border) bg-(--bg-deep)">
        <Select value={rightType} onValueChange={changeRightType}>
          <SelectTrigger className="h-7 w-36 bg-(--bg-raise) border-(--svf-border) text-(--text) text-[12px] font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RIGHT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="flex-1" />
        <button type="button" onClick={addNatureEntry}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-(--text-faint) hover:text-(--text) hover:bg-(--hover) border border-(--svf-border) transition-all">
          <Plus className="h-3 w-3" />Add nature
        </button>
        <button type="button" onClick={onRemoveGroup}
          className="p-1 rounded text-(--text-faint) hover:text-red-400 hover:bg-red-500/10 transition-all">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Shared fields */}
      <div className="px-3 pt-3 pb-2 space-y-3 border-b border-(--svf-border)">
        {/* Classification */}
        <div>
          <p className={`${labelCls} mb-1.5`}>Classification</p>
          <ClassificationChips
            rightType={rightType}
            value={first.classification ?? ""}
            onChange={v => updateShared({ classification: v })}
          />
        </div>

        {/* Syndication + Holdbacks */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className={`${labelCls} mb-1`}>Syndication</p>
            <Input value={first.syndication ?? ""} onChange={e => updateShared({ syndication: e.target.value })}
              placeholder="Yes / No / details" className={inputCls} />
          </div>
          <div>
            <p className={`${labelCls} mb-1`}>Holdbacks</p>
            <Input value={first.holdbacks ?? ""} onChange={e => updateShared({ holdbacks: e.target.value })}
              placeholder="e.g. FVOD, Theatrical" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Nature entries */}
      <div className="p-3 space-y-2">
        {groupEntries.map(entry => (
          <NatureEntryRow
            key={entry._key}
            entry={entry}
            onUpdate={patch => updateEntry(entry._key, patch)}
            onRemove={() => removeEntry(entry._key)}
            canRemove={groupEntries.length > 1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

interface Props {
  movieId: string;
  entries: DraftMovieRight[];
  onChange: (entries: DraftMovieRight[]) => void;
}

export function MovieRightsOwnedSection({ movieId, entries, onChange }: Props) {
  // Derive ordered unique right_types preserving first-seen order
  const groupTypes = Array.from(new Set(entries.map(e => e.right_type)));

  const addRight = () => {
    const usedTypes = new Set(entries.map(e => e.right_type));
    const nextType = RIGHT_TYPES.find(t => !usedTypes.has(t)) ?? "Satellite";
    onChange([...entries, newDraftRight(movieId, nextType)]);
  };

  const removeGroup = (rightType: string) => {
    onChange(entries.filter(e => e.right_type !== rightType));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-(--text-faint)">
          Each group is one right type. Use <span className="font-semibold text-(--text)">Add nature</span> within
          a group to add entries with different natures or territories — they share the same
          classification, syndication and holdbacks.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={addRight}
          className="shrink-0 h-8 text-xs border-(--svf-border) text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
          <Plus className="h-3.5 w-3.5 mr-1" />Add right
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-(--svf-border) py-8 flex flex-col items-center gap-2 text-(--text-faint)">
          <p className="text-sm">No rights added yet.</p>
          <Button type="button" variant="outline" size="sm" onClick={addRight}
            className="mt-1 h-8 text-xs border-(--svf-border) text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
            <Plus className="h-3.5 w-3.5 mr-1" />Add first right
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {groupTypes.map(rightType => {
          const groupEntries = entries.filter(e => e.right_type === rightType);
          return (
            <RightTypeGroup
              key={rightType}
              rightType={rightType}
              groupEntries={groupEntries}
              allEntries={entries}
              onChange={onChange}
              onRemoveGroup={() => removeGroup(rightType)}
            />
          );
        })}
      </div>
    </div>
  );
}
