"use client";

import { LanguageSelector } from "@/components/forms/language-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppToast } from "@/hooks/use-app-toast";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { addMoviePerson, createMovie, getProductionHouses, removeMoviePerson, searchPeople } from "@/lib/api/movies";
import type {
  CertificationType,
  MoviePeople,
  MovieSource,
  MovieWithDetails,
  Person,
  ProductionHouse,
  RightNature,
} from "@/lib/types/database";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Film,
  Info,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const CERTIFICATIONS = ["U", "UA", "U/A", "UA 7+", "UA 13+", "UA 16+", "A", "S", "V/U", "V/UA", "UNCENSORED", "TBD"];

// Nature of rights only applies to home production
const HOME_NATURE_OPTIONS = [
  { value: "Exclusively Owned", label: "Exclusively Owned" },
  { value: "Jointly Owned",     label: "Jointly Owned" },
  { value: "Sold/Expired",      label: "Sold / Expired" },
];

const HOLDBACK_PRESETS = ["Audio Rights", "Theatrical Exploitation", "FVOD", "AVOD", "SVOD", "TVOD"];

// ── Shared style strings ─────────────────────────────────────────────────────
const inputCls = "h-9 bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-400 text-sm focus-visible:ring-red-500/40 focus-visible:border-red-500/60";
const textareaCls = "bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-400 text-sm resize-none focus-visible:ring-red-500/40 focus-visible:border-red-500/60";
const selectTriggerCls = "h-9 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm";

const STEPS = [
  { id: "basic",    label: "Basic Info",  icon: Film },
  { id: "acquired", label: "Acquisition", icon: Calendar },
  { id: "rights",   label: "Rights",      icon: ShieldCheck },
  { id: "notes",    label: "Notes",       icon: Info },
  { id: "people",   label: "Cast & Crew", icon: Users },
];

// ── Small components ─────────────────────────────────────────────────────────

function FormField({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
        {label}{required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 leading-relaxed">{hint}</p>}
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode
}) {
  return (
    <Card className="glass-card border-slate-800/60">
      <CardHeader className="pb-3 pt-5 px-5 border-b border-slate-800/50">
        <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
          <div className="p-1.5 rounded-md bg-red-500/10 border border-red-500/20">
            <Icon className="h-3.5 w-3.5 text-red-400" />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

// Toggle pill (Yes/No or Color/B&W etc.)
function TogglePill({ value, onChange, options = ["Yes", "No"] }: {
  value: string; onChange: (v: string) => void; options?: string[]
}) {
  return (
    <div className="inline-flex bg-slate-950/50 border border-slate-700/50 rounded-full p-0.5 gap-0.5">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button key={opt} type="button" onClick={() => onChange(active ? "" : opt)}
            className={[
              "px-3 py-1 rounded-full text-[12.5px] font-semibold transition-all duration-150 whitespace-nowrap select-none",
              active && opt === "Yes" ? "bg-emerald-500/20 text-emerald-400" :
              active && opt === "No"  ? "bg-red-500/20 text-red-400" :
              active                  ? "bg-slate-700/60 text-slate-300" :
                                        "text-slate-500 hover:text-slate-300",
            ].filter(Boolean).join(" ")}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// Rights accordion card (acquired) — collapses when No
function RightsCard({ title, value, onChange, children }: {
  title: string; value: string; onChange: (v: string) => void; children?: React.ReactNode
}) {
  const isAcq = value === "Yes";
  return (
    <div className={["rounded-lg border overflow-hidden transition-colors duration-200",
      isAcq ? "border-emerald-500/40" : "border-slate-800/50"].join(" ")}>
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-950/40 gap-2">
        <span className={["text-[11px] font-bold uppercase tracking-widest transition-colors duration-200",
          isAcq ? "text-emerald-400" : "text-slate-400"].join(" ")}>{title}</span>
        <TogglePill value={value} onChange={onChange} />
      </div>
      {isAcq && <div className="p-3 border-t border-slate-800/50 bg-slate-900/30">{children}</div>}
    </div>
  );
}

const LANG_LIST = ["Bengali","Hindi","English","Tamil","Telugu","Malayalam","Kannada","Marathi","Gujarati","Punjabi","Odia","Assamese"];

function LangMultiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];
  const commit = (next: string[]) => onChange(next.join(", "));
  const toggle = (lang: string) => commit(selected.includes(lang) ? selected.filter(s => s !== lang) : [...selected, lang]);
  const addCustom = () => {
    const v = customInput.trim();
    if (!v || selected.includes(v)) { setCustomInput(""); setShowCustom(false); return; }
    commit([...selected, v]); setCustomInput(""); setShowCustom(false);
  };
  const dbVal = selected.length ? `Yes(${selected.join(", ")})` : "";
  return (
    <div className="space-y-2 pt-2 pb-1">
      <div className="flex flex-wrap gap-1.5">
        {LANG_LIST.map(lang => {
          const sel = selected.includes(lang);
          return (
            <button key={lang} type="button" onClick={() => toggle(lang)}
              className={["px-2 py-0.5 rounded-full text-xs font-semibold border transition-all select-none",
                sel ? "bg-red-500/15 border-red-500/50 text-red-300" : "bg-slate-950/40 border-slate-700/40 text-slate-500 hover:text-slate-300",
              ].join(" ")}>{lang}</button>
          );
        })}
        {!showCustom && (
          <button type="button" onClick={() => { setShowCustom(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="px-2 py-0.5 rounded-full text-xs font-semibold border border-dashed border-slate-600/50 text-slate-500 hover:text-slate-300 transition-all">
            + Custom
          </button>
        )}
      </div>
      {showCustom && (
        <div className="flex gap-2 items-center">
          <Input ref={inputRef} value={customInput} onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } if (e.key === "Escape") { setShowCustom(false); setCustomInput(""); } }}
            placeholder="Type language…"
            className="h-7 flex-1 bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-500 text-xs focus-visible:ring-red-500/40" />
          <button type="button" onClick={addCustom} className="h-7 px-2.5 rounded-md bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-600/30">Add</button>
          <button type="button" onClick={() => { setShowCustom(false); setCustomInput(""); }} className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(lang => (
            <span key={lang} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-xs font-semibold text-red-300">
              {lang}
              <button type="button" onClick={() => commit(selected.filter(s => s !== lang))} className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-500/20">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {dbVal && (
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-950/60 border border-slate-800/60">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">DB:</span>
          <span className="text-[11px] text-slate-400 font-mono break-all">{dbVal}</span>
        </div>
      )}
    </div>
  );
}

// Inline Yes/No row (derivative rights)
function InlineRightsRow({ label, value, onChange, langValue, onLangChange }: {
  label: string; value: string; onChange: (v: string) => void;
  langValue?: string; onLangChange?: (v: string) => void;
}) {
  return (
    <div className="py-2.5 border-b border-slate-800/50 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        <TogglePill value={value} onChange={onChange} />
      </div>
      {onLangChange && value === "Yes" && (
        <LangMultiPicker value={langValue ?? ""} onChange={onLangChange} />
      )}
    </div>
  );
}

// Nature-of-rights select inside an accordion
function NatureRightsSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`${selectTriggerCls} h-8 text-xs`}><SelectValue placeholder="Select…" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="Exclusive">Exclusive</SelectItem>
        <SelectItem value="Non-exclusive">Non-exclusive</SelectItem>
        <SelectItem value="Shared Exclusive">Shared Exclusive</SelectItem>
        <SelectItem value="N/A">N/A</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── Holdback multi-select with custom option + DB preview ───────────────────
function HoldbackPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Strip "on " prefix for display, keep for storage
  const raw = value.replace(/^on\s*/i, "");
  const selected = raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];

  const commit = (next: string[]) => onChange(next.length ? `on ${next.join(", ")}` : "");

  const toggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
    commit(next);
  };

  const addCustom = () => {
    const val = customInput.trim();
    if (!val || selected.includes(val)) { setCustomInput(""); setShowCustom(false); return; }
    commit([...selected, val]);
    setCustomInput("");
    setShowCustom(false);
  };

  const removeItem = (item: string) => commit(selected.filter(s => s !== item));

  return (
    <div className="space-y-2.5">
      {/* Preset chips */}
      <div className="flex flex-wrap gap-1.5">
        {HOLDBACK_PRESETS.map(opt => {
          const sel = selected.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              className={["px-2.5 py-1 rounded-full text-xs font-semibold border transition-all duration-100 select-none",
                sel ? "bg-slate-600/25 border-slate-500/50 text-slate-200"
                    : "bg-slate-950/40 border-slate-700/40 text-slate-500 hover:text-slate-300",
              ].join(" ")}>
              {opt}
            </button>
          );
        })}
        {/* + Custom button */}
        {!showCustom && (
          <button type="button" onClick={() => { setShowCustom(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="px-2.5 py-1 rounded-full text-xs font-semibold border border-dashed border-slate-600/50 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all">
            + Custom
          </button>
        )}
      </div>

      {/* Custom input row */}
      {showCustom && (
        <div className="flex gap-2 items-center">
          <Input ref={inputRef} value={customInput} onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } if (e.key === "Escape") { setShowCustom(false); setCustomInput(""); } }}
            placeholder="Type custom value…"
            className="h-7 flex-1 bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-500 text-xs focus-visible:ring-red-500/40" />
          <button type="button" onClick={addCustom}
            className="h-7 px-2.5 rounded-md bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-600/30 transition-all">
            Add
          </button>
          <button type="button" onClick={() => { setShowCustom(false); setCustomInput(""); }}
            className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(item => (
            <span key={item}
              className="flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-xs font-semibold text-red-300">
              {item}
              <button type="button" onClick={() => removeItem(item)}
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-500/20 transition-all">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* DB preview */}
      {value && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-950/60 border border-slate-800/60">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">DB value:</span>
          <span className="text-[11px] text-slate-400 font-mono break-all">{value}</span>
        </div>
      )}
    </div>
  );
}

// ── Generic multi-select chips with custom option ────────────────────────────
function MultiChipsWithCustom({
  options, value, onChange, placeholder,
}: { options: string[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];

  const commit = (next: string[]) => onChange(next.join(", "));

  const toggle = (opt: string) => {
    commit(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  };

  const addCustom = () => {
    const val = customInput.trim();
    if (!val || selected.includes(val)) { setCustomInput(""); setShowCustom(false); return; }
    commit([...selected, val]);
    setCustomInput(""); setShowCustom(false);
  };

  const removeItem = (item: string) => commit(selected.filter(s => s !== item));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const sel = selected.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              className={["px-2.5 py-1 rounded-full text-xs font-semibold border transition-all duration-100 select-none",
                sel ? "bg-slate-600/25 border-slate-500/50 text-slate-200"
                    : "bg-slate-950/40 border-slate-700/40 text-slate-500 hover:text-slate-300",
              ].join(" ")}>
              {opt}
            </button>
          );
        })}
        {!showCustom && (
          <button type="button" onClick={() => { setShowCustom(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="px-2.5 py-1 rounded-full text-xs font-semibold border border-dashed border-slate-600/50 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all">
            + Custom
          </button>
        )}
      </div>
      {showCustom && (
        <div className="flex gap-2 items-center">
          <Input ref={inputRef} value={customInput} onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } if (e.key === "Escape") { setShowCustom(false); setCustomInput(""); } }}
            placeholder={placeholder || "Type value…"}
            className="h-7 flex-1 bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-500 text-xs focus-visible:ring-red-500/40" />
          <button type="button" onClick={addCustom}
            className="h-7 px-2.5 rounded-md bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-600/30 transition-all">
            Add
          </button>
          <button type="button" onClick={() => { setShowCustom(false); setCustomInput(""); }}
            className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(item => (
            <span key={item}
              className="flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-slate-700/30 border border-slate-600/40 text-xs font-semibold text-slate-300">
              {item}
              <button type="button" onClick={() => removeItem(item)}
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-slate-600/40 transition-all">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {value && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-950/60 border border-slate-800/60">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">Stored as:</span>
          <span className="text-[11px] text-slate-400 font-mono break-all">{value}</span>
        </div>
      )}
    </div>
  );
}

// Simple read-only chips (no custom)
// hh:mm:ss input — digits only, colons auto-inserted after hh and mm
function DurationInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const format = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(format(e.target.value));
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow backspace to strip last char naturally — re-format after
    if (e.key === ":" || e.key === "Tab") return;
  };
  return (
    <div className="relative">
      <Input
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="hh:mm:ss"
        maxLength={8}
        className={className}
      />
      {value && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-slate-500 pointer-events-none">
          hh:mm:ss
        </span>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function NewMoviePage() {
  const { allowed, loading: permLoading } = useRequirePermission("create", "movie", "/movies");
  const router = useRouter();

  const [productionHouses, setProductionHouses] = useState<ProductionHouse[]>([]);
  const [title, setTitle] = useState("");
  const [productionNo, setProductionNo] = useState("");
  const [source, setSource] = useState<MovieSource>("home_production");
  const [releaseDate, setReleaseDate] = useState("");
  const [releaseYear, setReleaseYear] = useState("");
  const [certification, setCertification] = useState("");
  const [language, setLanguage] = useState("");
  const [selectedHouseIds, setSelectedHouseIds] = useState<string[]>([""]);
  const [wtpLibrary, setWtpLibrary] = useState<string>("WTP");
  const [revenueShare, setRevenueShare] = useState("");
  const [jointProdBuyBackDate, setJointProdBuyBackDate] = useState("");
  const [jointlyExploitationRights, setJointlyExploitationRights] = useState("");
  const [colorOrBw, setColorOrBw] = useState("Color");
  const [trailerLink, setTrailerLink] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [assignorLicensor, setAssignorLicensor] = useState("");
  const [licensee, setLicensee] = useState("");
  const [agreementDate, setAgreementDate] = useState("");
  const [agreementStartDate, setAgreementStartDate] = useState("");
  const [agreementEndDate, setAgreementEndDate] = useState("");
  const [internetRightsClassification, setInternetRightsClassification] = useState("");
  const [prequelSequelRights, setPrequelSequelRights] = useState("Yes");
  const [characterRights, setCharacterRights] = useState("Yes");
  const [subtitlingRights, setSubtitlingRights] = useState("Yes");
  const [subtitlingLang, setSubtitlingLang] = useState("");
  const [dubbingRights, setDubbingRights] = useState("Yes");
  const [dubbingLang, setDubbingLang] = useState("");
  // For home production only; null/empty for acquired
  const [natureOfRights, setNatureOfRights] = useState("Exclusively Owned");
  const [territory, setTerritory] = useState("World");
  const [territoryCustom, setTerritoryCustom] = useState("");
  const [showTerritoryCustom, setShowTerritoryCustom] = useState(false);
  // Primary rights
  const [satelliteRights, setSatelliteRights] = useState("");
  const [internetRights, setInternetRights] = useState("");
  const [negativeRights, setNegativeRights] = useState("");
  const [otherRights, setOtherRights] = useState("");
  const [satelliteRightsClassification, setSatelliteRightsClassification] = useState("");
  const [clipRights, setClipRights] = useState("");
  const [clipRightsDuration, setClipRightsDuration] = useState("");
  const [holdbacks, setHoldbacks] = useState("");
  const [natureOfSatelliteRights, setNatureOfSatelliteRights] = useState("");
  const [natureOfInternetRights, setNatureOfInternetRights] = useState("");
  const [natureOfNegativeRights, setNatureOfNegativeRights] = useState("");
  const [natureOfOtherRights, setNatureOfOtherRights] = useState("");
  const [satelliteRightsStartDate, setSatelliteRightsStartDate] = useState("");
  const [satelliteRightsEndDate, setSatelliteRightsEndDate] = useState("");
  const [internetRightsStartDate, setInternetRightsStartDate] = useState("");
  const [internetRightsEndDate, setInternetRightsEndDate] = useState("");
  const [negativeRightsStartDate, setNegativeRightsStartDate] = useState("");
  const [negativeRightsEndDate, setNegativeRightsEndDate] = useState("");
  const [otherRightsStartDate, setOtherRightsStartDate] = useState("");
  const [otherRightsEndDate, setOtherRightsEndDate] = useState("");
  const [syndicationInternetRights, setSyndicationInternetRights] = useState("");
  const [remarks, setRemarks] = useState("");
  const [actionables, setActionables] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useAppToast();

  // Cast & crew
  const [createdMovieId, setCreatedMovieId] = useState<string | null>(null);
  const [cast, setCast] = useState<MoviePeople[]>([]);
  const [directors, setDirectors] = useState<MoviePeople[]>([]);
  const [addingRole, setAddingRole] = useState<"cast" | "director" | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  const [personResults, setPersonResults] = useState<Person[]>([]);
  const [searchingPeople, setSearchingPeople] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  useEffect(() => {
    getProductionHouses().then(houses => {
      setProductionHouses(houses);
      const svf = houses.find(h => h.name.toLowerCase() === "svf");
      if (svf) setSelectedHouseIds([svf.id]);
    });
  }, []);

  const handlePersonSearch = useCallback(async (query: string) => {
    setPersonSearch(query);
    if (query.length < 2) { setPersonResults([]); return; }
    setSearchingPeople(true);
    try { const results = await searchPeople(query); setPersonResults(results); }
    catch { setPersonResults([]); }
    finally { setSearchingPeople(false); }
  }, []);

  const handleAddCast = async (person: Person) => {
    if (!createdMovieId) return;
    try {
      const entry = await addMoviePerson(createdMovieId, person.id, "Actor", cast.length + 1);
      setCast(prev => [...prev, entry]);
      setPersonSearch(""); setPersonResults([]); setAddingRole(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to add cast member"); }
  };

  const handleRemoveCast = async (entry: MoviePeople) => {
    try { await removeMoviePerson(entry.id, entry.person_id); setCast(prev => prev.filter(c => c.id !== entry.id)); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to remove cast member"); }
  };

  const handleAddDirector = async (person: Person) => {
    if (!createdMovieId) return;
    try {
      const entry = await addMoviePerson(createdMovieId, person.id, "Director");
      setDirectors(prev => [...prev, entry]);
      setPersonSearch(""); setPersonResults([]); setAddingRole(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to add director"); }
  };

  const handleRemoveDirector = async (entry: MoviePeople) => {
    try { await removeMoviePerson(entry.id, entry.person_id); setDirectors(prev => prev.filter(d => d.id !== entry.id)); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to remove director"); }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (title.trim().length > 500) { toast.error("Title must be 500 characters or less"); return; }
    if (releaseYear) {
      const year = parseInt(releaseYear);
      if (isNaN(year) || year < 1800 || year > 2100) { toast.error("Release year must be between 1800 and 2100"); return; }
    }
    if (trailerLink && !/^https?:\/\/.+/.test(trailerLink)) { toast.error("Trailer link must be a valid URL"); return; }

    setSaving(true);
    try {
      const selectedHouses = selectedHouseIds
        .map(id => productionHouses.find(h => h.id === id))
        .filter((h): h is ProductionHouse => !!h);
      const finalProductionHouseName = selectedHouses.length > 0
        ? selectedHouses.map(h => h.name).join(", ")
        : undefined;

      const isJointly = natureOfRights.toLowerCase().includes("jointly");
      // For acquired, nature_of_rights is null
      const finalNatureOfRights = source === "acquired" ? undefined : (natureOfRights as RightNature) || undefined;
      const finalTerritory = showTerritoryCustom ? territoryCustom : territory;

      const movieData: Partial<MovieWithDetails> = {
        title: title.trim(),
        production_no: productionNo || undefined,
        source,
        release_date: releaseDate || undefined,
        release_year: releaseYear || undefined,
        certification: (certification as CertificationType) || undefined,
        language: language.replace(/\s*[Dd]ubbed\s*/g, "").trim() || undefined,
        production_house_name: finalProductionHouseName,
        color_or_bw: colorOrBw || undefined,
        trailer_link: trailerLink || undefined,
        poster_url: posterUrl || undefined,
        assignor_licensor: assignorLicensor || undefined,
        licensee: licensee || undefined,
        agreement_date: agreementDate || undefined,
        agreement_start_date: agreementStartDate || undefined,
        agreement_end_date: agreementEndDate || undefined,
        internet_rights_classification: internetRightsClassification || undefined,
        prequel_sequel_rights: prequelSequelRights || undefined,
        character_rights: characterRights || undefined,
        subtitling_rights: (subtitlingRights === "Yes" && subtitlingLang ? `Yes(${subtitlingLang})` : subtitlingRights) || undefined,
        dubbing_rights: (dubbingRights === "Yes" && dubbingLang ? `Yes(${dubbingLang})` : dubbingRights) || undefined,
        nature_of_rights: finalNatureOfRights,
        territory: finalTerritory || undefined,
        remarks: remarks || undefined,
        actionables: actionables || undefined,
        wtp_library: wtpLibrary || undefined,
        revenue_share: isJointly ? revenueShare : undefined,
        joint_prod_buy_back_date: isJointly ? jointProdBuyBackDate : undefined,
        jointly_exploitation_rights: isJointly ? jointlyExploitationRights : undefined,
        satellite_rights: satelliteRights || undefined,
        internet_rights: internetRights || undefined,
        negative_rights: negativeRights || undefined,
        other_rights: otherRights || undefined,
        satellite_rights_classification: satelliteRightsClassification || undefined,
        clip_rights: clipRights || undefined,
        clip_rights_duration: clipRightsDuration || undefined,
        holdbacks: holdbacks || undefined,
        nature_of_satellite_rights: natureOfSatelliteRights || undefined,
        nature_of_internet_rights: natureOfInternetRights || undefined,
        nature_of_negative_rights: natureOfNegativeRights || undefined,
        nature_of_other_rights: natureOfOtherRights || undefined,
        satellite_rights_start_date: satelliteRightsStartDate || undefined,
        satellite_rights_end_date: satelliteRightsEndDate || undefined,
        internet_rights_start_date: internetRightsStartDate || undefined,
        internet_rights_end_date: internetRightsEndDate || undefined,
        negative_rights_start_date: negativeRightsStartDate || undefined,
        negative_rights_end_date: negativeRightsEndDate || undefined,
        other_rights_start_date: otherRightsStartDate || undefined,
        other_rights_end_date: otherRightsEndDate || undefined,
        syndication_internet_rights: syndicationInternetRights || undefined,
      };
      const createdMovie = await createMovie(movieData);
      setCreatedMovieId(createdMovie.id);
      setActiveTab("people");
      toast.success("Movie saved", "Now add cast & crew below.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create movie");
    } finally {
      setSaving(false);
    }
  };

  if (permLoading || !allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-red-400/60" />
        <p className="text-slate-400 text-sm">Checking permissions…</p>
      </div>
    );
  }

  const isJointly = natureOfRights.toLowerCase().includes("jointly");
  const isHomeProd = source === "home_production";
  const svfId = productionHouses.find(h => h.name.toLowerCase() === "svf")?.id ?? null;
  const currentStepIndex = STEPS.findIndex(s => s.id === activeTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-red-600 via-amber-500 to-transparent" />
        <div className="absolute top-4 right-4 w-48 h-48 bg-red-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 h-8 w-8 p-0 shrink-0">
            <Link href="/movies"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <Plus className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">Add New Movie</h1>
            <p className="text-slate-400 text-sm mt-0.5">Add a new film to the catalog. Cast &amp; Crew can be added after saving.</p>
          </div>
        </div>
      </div>

      {/* Step Nav */}
      <div className="flex items-stretch bg-slate-900/60 border border-slate-800/60 rounded-xl p-1 gap-1 overflow-x-auto">
        {STEPS.map((step, i) => {
          const isActive = activeTab === step.id;
          const isDone = i < currentStepIndex;
          // Acquisition tab disabled for home; Rights tab disabled for home (always "yes"); People tab disabled before save
          const isDisabled =
            step.id === "acquired" ? isHomeProd :
            step.id === "rights"   ? isHomeProd :
            step.id === "people"   ? !createdMovieId : false;
          return (
            <button key={step.id} type="button" disabled={isDisabled}
              onClick={() => !isDisabled && setActiveTab(step.id)}
              className={["flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-semibold whitespace-nowrap transition-all duration-150 shrink-0 border",
                isActive   ? "bg-slate-800 text-slate-100 border-slate-700/60" :
                isDisabled ? "opacity-30 cursor-not-allowed text-slate-500 border-transparent" :
                             "text-slate-500 hover:text-slate-200 hover:bg-slate-800/40 border-transparent",
              ].join(" ")}>
              <span className={["w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all duration-200",
                isActive ? "bg-gradient-to-br from-red-500 to-red-700 text-white" :
                isDone   ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400" :
                           "bg-slate-800 border border-slate-700/60 text-slate-500",
              ].join(" ")}>
                {isDone ? <CheckCircle className="h-3 w-3" /> : i + 1}
              </span>
              {step.label}
              {step.id === "rights" && isHomeProd && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-bold uppercase tracking-wide ml-0.5">
                  All Yes
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══ BASIC INFO ══ */}
      {activeTab === "basic" && (
        <SectionCard icon={Film} title="Core Details">
          <div className="space-y-5">

            {/* ── Source selector — compact horizontal row at top ── */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Source</span>
              <div className="flex gap-2">
                {[
                  { value: "home_production", label: "Home Production" },
                  { value: "acquired",        label: "Acquired" },
                ].map(opt => {
                  const sel = source === opt.value;
                  return (
                    <button key={opt.value} type="button"
                      onClick={() => {
                        setSource(opt.value as MovieSource);
                        if (opt.value === "home_production") {
                          setWtpLibrary("WTP");
                          setTerritory("World");
                          setNatureOfRights("Exclusively Owned");
                        } else {
                          setWtpLibrary("");
                          setNatureOfRights(""); // null for acquired
                        }
                      }}
                      className={["px-3 py-1 rounded-full border text-xs font-semibold transition-all duration-150 select-none",
                        sel ? "border-red-500/70 bg-red-500/12 text-red-400 shadow-[0_0_0_1px] shadow-red-500/20"
                            : "border-slate-700/50 bg-slate-950/40 text-slate-500 hover:text-slate-200 hover:border-slate-600",
                      ].join(" ")}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Title ── */}
            <FormField label="Title" required>
              <Input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Film title" className={`${inputCls} h-11 text-base font-semibold`} />
            </FormField>

            {/* ── 2-col grid for the rest ── */}
            <div className="grid gap-4 md:grid-cols-2">

              <FormField label="Production No.">
                <Input value={productionNo} onChange={e => setProductionNo(e.target.value)}
                  placeholder="e.g., SVF-2024-001" className={inputCls} />
              </FormField>

              {/* WTP only shown for home production */}
              {isHomeProd && (
                <FormField label="WTP / Library">
                  <Select value={wtpLibrary} onValueChange={setWtpLibrary}>
                    <SelectTrigger className={selectTriggerCls}><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WTP">WTP</SelectItem>
                      <SelectItem value="WTP/BD">WTP/BD</SelectItem>
                      <SelectItem value="Library">Library</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              )}

              <FormField label="Release Date">
                <Input type="date" value={releaseDate}
                  onChange={e => { setReleaseDate(e.target.value); if (e.target.value) setReleaseYear(new Date(e.target.value).getFullYear().toString()); }}
                  className={inputCls} />
              </FormField>

              <FormField label="Release Year">
                <Input type="number" value={releaseYear} onChange={e => setReleaseYear(e.target.value)}
                  placeholder="e.g., 2024" className={inputCls} />
              </FormField>

              <FormField label="Language">
                <LanguageSelector value={language} onValueChange={setLanguage} />
              </FormField>

              {/* Color / B&W */}
              <FormField label="Color / B&W">
                <div className="inline-flex bg-slate-950/50 border border-slate-700/50 rounded-full p-0.5 gap-0.5">
                  {["Color", "B&W"].map(opt => (
                    <button key={opt} type="button" onClick={() => setColorOrBw(opt)}
                      className={["px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-150",
                        colorOrBw === opt ? "bg-emerald-500/20 text-emerald-400" : "text-slate-500 hover:text-slate-300",
                      ].join(" ")}>
                      {opt}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField label="Trailer Link">
                <Input value={trailerLink} onChange={e => setTrailerLink(e.target.value)}
                  placeholder="YouTube URL" className={inputCls} />
              </FormField>

              {/* Territory — always in basic info; default World for home */}
              <FormField label="Territory">
                <Select value={showTerritoryCustom ? "Custom" : territory}
                  onValueChange={v => { setShowTerritoryCustom(v === "Custom"); if (v !== "Custom") setTerritory(v); }}>
                  <SelectTrigger className={selectTriggerCls}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="World">World</SelectItem>
                    <SelectItem value="India">India</SelectItem>
                    <SelectItem value="South Asia">South Asia</SelectItem>
                    <SelectItem value="Custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {showTerritoryCustom && (
                  <Input value={territoryCustom} onChange={e => setTerritoryCustom(e.target.value)}
                    placeholder="Enter territory…" className={`${inputCls} mt-2`} />
                )}
              </FormField>

              {/* Nature of Rights — ONLY for home production */}
              {isHomeProd && (
                <div className="md:col-span-2">
                  <FormField label="Nature of Rights">
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {HOME_NATURE_OPTIONS.map(opt => {
                        const sel = natureOfRights === opt.value;
                        return (
                          <button key={opt.value} type="button"
                            onClick={() => {
                              const newVal = sel ? "Exclusively Owned" : opt.value; // can't deselect entirely for home
                              setNatureOfRights(newVal);
                              const isJoint = newVal.toLowerCase().includes("jointly");
                              if (isJoint && svfId) {
                                setSelectedHouseIds(ids => {
                                  const rest = ids.filter(id => id !== svfId && id !== "");
                                  return [svfId, ...rest];
                                });
                              } else if (!isJoint) {
                                setSelectedHouseIds(ids => [ids[0] === svfId ? (svfId ?? "") : (ids[0] || "")]);
                              }
                            }}
                            className={["px-4 py-1.5 rounded-full border text-[12.5px] font-semibold transition-all duration-120 select-none",
                              sel ? "bg-red-500/12 border-red-500/60 text-red-400"
                                  : "bg-slate-950/40 border-slate-700/40 text-slate-500 hover:text-slate-300",
                            ].join(" ")}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </FormField>
                </div>
              )}

              {/* Production House(s) — only for home production */}
              {isHomeProd && selectedHouseIds.map((houseId, index) => {
                const isSvfLocked = isJointly && index === 0 && svfId !== null && houseId === svfId;
                return (
                  <div key={index} className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        Production House {isJointly ? index + 1 : ""}
                      </label>
                      {isJointly && !isSvfLocked && index > 0 && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => setSelectedHouseIds(ids => ids.filter((_, i) => i !== index))}>
                          Remove
                        </Button>
                      )}
                    </div>
                    {isSvfLocked ? (
                      <div className={`${selectTriggerCls} flex items-center px-3 rounded-md border opacity-70 cursor-not-allowed`}>
                        <span className="text-slate-300 text-sm">SVF</span>
                        <span className="ml-auto text-[10px] text-slate-500 uppercase tracking-widest">Default</span>
                      </div>
                    ) : (
                      <Select value={houseId} onValueChange={val => setSelectedHouseIds(ids => { const n = [...ids]; n[index] = val; return n; })}>
                        <SelectTrigger className={selectTriggerCls}><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {productionHouses
                            .filter(h => (!selectedHouseIds.includes(h.id) || h.id === houseId) && !(isJointly && h.id === svfId))
                            .map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}

              {isHomeProd && isJointly && (
                <div className="md:col-span-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setSelectedHouseIds(ids => [...ids, ""])}
                    className="w-full border-dashed border-slate-700/50 bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 hover:border-slate-600">
                    + Add Production House
                  </Button>
                </div>
              )}

              {isHomeProd && isJointly && (
                <>
                  <FormField label="Revenue Share">
                    <Input placeholder="e.g., 50-50" value={revenueShare} onChange={e => setRevenueShare(e.target.value)} className={inputCls} />
                  </FormField>
                  <FormField label="Buy-Back Opening Date">
                    <Input type="date" value={jointProdBuyBackDate} onChange={e => setJointProdBuyBackDate(e.target.value)} className={inputCls} />
                  </FormField>
                  <div className="md:col-span-2">
                    <FormField label="Exploitation Rights Held By" hint="Which production house currently holds the rights to exploit this title">
                      <Select value={jointlyExploitationRights} onValueChange={setJointlyExploitationRights}>
                        <SelectTrigger className={selectTriggerCls}><SelectValue placeholder="Select house…" /></SelectTrigger>
                        <SelectContent>
                          {selectedHouseIds
                            .map(id => productionHouses.find(h => h.id === id))
                            .filter((h): h is ProductionHouse => !!h)
                            .map(h => <SelectItem key={h.id} value={h.name}>{h.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormField>
                  </div>
                </>
              )}

              {/* Certification — chips */}
              <div className="md:col-span-2">
                <FormField label="Certification">
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    {CERTIFICATIONS.map(c => {
                      const sel = certification === c;
                      return (
                        <button key={c} type="button" onClick={() => setCertification(sel ? "" : c)}
                          className={["px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-100 select-none",
                            sel ? "bg-red-500/12 border-red-500/60 text-red-400"
                                : "bg-slate-950/40 border-slate-700/40 text-slate-500 hover:text-slate-300",
                          ].join(" ")}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </FormField>
              </div>

              {/* Poster */}
              <div className="md:col-span-2">
                <FormField label="Poster">
                  <FileUpload bucket="images" folder="movies" variant="image"
                    accept=".jpg,.jpeg,.png,.webp" maxSizeMB={0.5}
                    currentUrl={posterUrl} onUpload={setPosterUrl}
                    onRemove={() => setPosterUrl("")} label="Upload movie poster" />
                </FormField>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ══ ACQUISITION ══ (only for acquired) */}
      {activeTab === "acquired" && (
        <SectionCard icon={Calendar} title="Acquisition Details">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Assignor / Licensor">
              <Input value={assignorLicensor} onChange={e => setAssignorLicensor(e.target.value)} className={inputCls} placeholder="Company or person name" />
            </FormField>
            <FormField label="Licensee">
              <Input value={licensee} onChange={e => setLicensee(e.target.value)} className={inputCls} placeholder="Licensee name" />
            </FormField>
            <FormField label="Agreement Date">
              <Input type="date" value={agreementDate} onChange={e => setAgreementDate(e.target.value)} className={inputCls} />
            </FormField>
            <div /> {/* spacer */}
            <FormField label="Agreement Start">
              <Input type="date" value={agreementStartDate} onChange={e => setAgreementStartDate(e.target.value)} className={inputCls} />
            </FormField>
            <FormField label="Agreement End">
              <Input type="date" value={agreementEndDate} onChange={e => setAgreementEndDate(e.target.value)} className={inputCls} />
            </FormField>
          </div>
        </SectionCard>
      )}

      {/* ══ RIGHTS ══ (acquired only — disabled for home, shown as info banner if somehow landed here) */}
      {activeTab === "rights" && !isHomeProd && (
        <div className="space-y-4">
          <SectionCard icon={ShieldCheck} title="Primary Rights">
            <p className="text-xs text-slate-500 mb-4">Toggle <strong className="text-slate-300">Yes</strong> to expand details for each rights type.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {/* Satellite */}
              <RightsCard title="Satellite Rights" value={satelliteRights} onChange={setSatelliteRights}>
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Classification</p>
                    <MultiChipsWithCustom options={["Pay TV", "Free TV", "Pay Per View", "DTH"]}
                      value={satelliteRightsClassification} onChange={setSatelliteRightsClassification} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Nature</p>
                    <NatureRightsSelect value={natureOfSatelliteRights} onChange={setNatureOfSatelliteRights} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Start</p>
                      <Input type="date" value={satelliteRightsStartDate} onChange={e => setSatelliteRightsStartDate(e.target.value)} className={`${inputCls} h-8 text-xs`} /></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">End</p>
                      <Input type="date" value={satelliteRightsEndDate} onChange={e => setSatelliteRightsEndDate(e.target.value)} className={`${inputCls} h-8 text-xs`} /></div>
                  </div>
                </div>
              </RightsCard>

              {/* Internet */}
              <RightsCard title="Internet Rights" value={internetRights} onChange={setInternetRights}>
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Classification</p>
                    <MultiChipsWithCustom options={["AVOD", "FVOD", "SVOD", "NVOD", "TVOD", "IPTV"]}
                      value={internetRightsClassification} onChange={setInternetRightsClassification} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Nature</p>
                    <NatureRightsSelect value={natureOfInternetRights} onChange={setNatureOfInternetRights} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Start</p>
                      <Input type="date" value={internetRightsStartDate} onChange={e => setInternetRightsStartDate(e.target.value)} className={`${inputCls} h-8 text-xs`} /></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">End</p>
                      <Input type="date" value={internetRightsEndDate} onChange={e => setInternetRightsEndDate(e.target.value)} className={`${inputCls} h-8 text-xs`} /></div>
                  </div>
                </div>
              </RightsCard>

              {/* Negative */}
              <RightsCard title="Negative Rights" value={negativeRights} onChange={setNegativeRights}>
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Nature</p>
                    <NatureRightsSelect value={natureOfNegativeRights} onChange={setNatureOfNegativeRights} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Start</p>
                      <Input type="date" value={negativeRightsStartDate} onChange={e => setNegativeRightsStartDate(e.target.value)} className={`${inputCls} h-8 text-xs`} /></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">End</p>
                      <Input type="date" value={negativeRightsEndDate} onChange={e => setNegativeRightsEndDate(e.target.value)} className={`${inputCls} h-8 text-xs`} /></div>
                  </div>
                </div>
              </RightsCard>

              {/* Other */}
              <RightsCard title="Other Rights" value={otherRights} onChange={setOtherRights}>
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Nature</p>
                    <NatureRightsSelect value={natureOfOtherRights} onChange={setNatureOfOtherRights} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Start</p>
                      <Input type="date" value={otherRightsStartDate} onChange={e => setOtherRightsStartDate(e.target.value)} className={`${inputCls} h-8 text-xs`} /></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">End</p>
                      <Input type="date" value={otherRightsEndDate} onChange={e => setOtherRightsEndDate(e.target.value)} className={`${inputCls} h-8 text-xs`} /></div>
                  </div>
                </div>
              </RightsCard>
            </div>

            {/* Syndication */}
            <div className="mt-4 pt-4 border-t border-slate-800/50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-200">Syndication – Internet Rights</p>
                  <p className="text-xs text-slate-500 mt-0.5">Sub-licensing for internet syndication</p>
                </div>
                <TogglePill value={syndicationInternetRights} onChange={setSyndicationInternetRights} />
              </div>
            </div>
          </SectionCard>

          {/* Clip Rights */}
          <SectionCard icon={Video} title="Clip Rights">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Clip Rights Acquired">
                <TogglePill value={clipRights} onChange={setClipRights} />
              </FormField>
              <FormField label="Clip Duration">
                <DurationInput value={clipRightsDuration} onChange={setClipRightsDuration} className={inputCls} />
              </FormField>
            </div>
          </SectionCard>

          {/* Derivative Rights */}
          <SectionCard icon={ShieldCheck} title="Derivative Rights">
            <div>
              <InlineRightsRow label="Prequel / Sequel Rights" value={prequelSequelRights} onChange={setPrequelSequelRights} />
              <InlineRightsRow label="Character Rights" value={characterRights} onChange={setCharacterRights} />
              <InlineRightsRow label="Sub-Titling Rights" value={subtitlingRights} onChange={setSubtitlingRights}
                langValue={subtitlingLang} onLangChange={setSubtitlingLang} />
              <InlineRightsRow label="Dubbing Rights" value={dubbingRights} onChange={setDubbingRights}
                langValue={dubbingLang} onLangChange={setDubbingLang} />
            </div>
          </SectionCard>
        </div>
      )}

      {/* ══ NOTES ══ */}
      {activeTab === "notes" && (
        <SectionCard icon={Info} title="Holdbacks & Notes">
          <div className="space-y-5">
            <FormField label="Holdbacks apply to">
              <HoldbackPicker value={holdbacks} onChange={setHoldbacks} />
            </FormField>
            <FormField label="Remarks">
              <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} className={textareaCls} placeholder="Any additional notes or context…" />
            </FormField>
            <FormField label="Actionables">
              <Textarea value={actionables} onChange={e => setActionables(e.target.value)} rows={3} className={textareaCls} placeholder="Follow-up actions needed…" />
            </FormField>
          </div>
        </SectionCard>
      )}

      {/* ══ CAST & CREW ══ */}
      {activeTab === "people" && (
        <SectionCard icon={Users} title="Cast & Crew">
          {!createdMovieId ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                <Users className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-slate-300 font-medium">Save the movie first</p>
              <p className="text-slate-500 text-sm max-w-xs">Create the movie using the button below, then you can link cast and crew here.</p>
              <Button variant="outline" size="sm" className="mt-2 border-slate-700/50 text-slate-300 hover:text-slate-100 hover:bg-slate-800/60"
                onClick={() => setActiveTab("basic")}>Go to Basic Info</Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 rounded-lg bg-emerald-950/30 border border-emerald-700/40 px-4 py-3 text-sm text-emerald-300">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Movie created! Now search and link cast &amp; crew.
              </div>
              <p className="text-xs text-slate-400">
                Search existing people and link them as actors or directors. To add a new person first go to the{" "}
                <Link href="/people" className="underline underline-offset-2 text-slate-300 hover:text-white">People directory</Link>.
              </p>

              {/* Cast */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200">Cast (Actors)</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs border-slate-700/50 text-slate-300 hover:text-slate-100 hover:bg-slate-800/60"
                    onClick={() => { setAddingRole(addingRole === "cast" ? null : "cast"); setPersonSearch(""); setPersonResults([]); }}>
                    <Plus className="h-3 w-3 mr-1" />{addingRole === "cast" ? "Cancel" : "Add Actor"}
                  </Button>
                </div>
                {addingRole === "cast" && (
                  <div className="space-y-2 p-3 border border-slate-700/50 rounded-lg bg-slate-950/30">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                      <Input placeholder="Search people by name…" value={personSearch} onChange={e => handlePersonSearch(e.target.value)} className={`${inputCls} pl-8`} autoFocus />
                    </div>
                    {searchingPeople && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />Searching…</div>}
                    {personResults.length > 0 && (
                      <div className="border border-slate-700/50 rounded-md max-h-40 overflow-y-auto bg-slate-900">
                        {personResults.map(p => (
                          <button key={p.id} className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800 flex items-center justify-between" onClick={() => handleAddCast(p)}>
                            <span>{p.name}</span>
                            {p.role && <span className="text-xs text-slate-500 capitalize">{p.role}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {personSearch.length >= 2 && !searchingPeople && personResults.length === 0 && (
                      <p className="text-xs text-slate-500 px-1">No results. <Link href="/people" className="underline underline-offset-2 text-slate-400">Create the person</Link> first.</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {cast.map(m => (
                    <span key={m.id} className="flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-slate-800 border border-slate-700/60 text-sm text-slate-200">
                      {m.person?.name || "Unknown"}
                      <button onClick={() => handleRemoveCast(m)} className="w-5 h-5 flex items-center justify-center rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/15 transition-all"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  {cast.length === 0 && <span className="text-xs text-slate-500">No cast linked yet</span>}
                </div>
              </div>

              {/* Directors */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200">Directors</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs border-slate-700/50 text-slate-300 hover:text-slate-100 hover:bg-slate-800/60"
                    onClick={() => { setAddingRole(addingRole === "director" ? null : "director"); setPersonSearch(""); setPersonResults([]); }}>
                    <Plus className="h-3 w-3 mr-1" />{addingRole === "director" ? "Cancel" : "Add Director"}
                  </Button>
                </div>
                {addingRole === "director" && (
                  <div className="space-y-2 p-3 border border-slate-700/50 rounded-lg bg-slate-950/30">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                      <Input placeholder="Search people by name…" value={personSearch} onChange={e => handlePersonSearch(e.target.value)} className={`${inputCls} pl-8`} autoFocus />
                    </div>
                    {searchingPeople && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />Searching…</div>}
                    {personResults.length > 0 && (
                      <div className="border border-slate-700/50 rounded-md max-h-40 overflow-y-auto bg-slate-900">
                        {personResults.map(p => (
                          <button key={p.id} className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800 flex items-center justify-between" onClick={() => handleAddDirector(p)}>
                            <span>{p.name}</span>
                            {p.role && <span className="text-xs text-slate-500 capitalize">{p.role}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {personSearch.length >= 2 && !searchingPeople && personResults.length === 0 && (
                      <p className="text-xs text-slate-500 px-1">No results. <Link href="/people" className="underline underline-offset-2 text-slate-400">Create the person</Link> first.</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {directors.map(d => (
                    <span key={d.id} className="flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-slate-800 border border-slate-700/60 text-sm text-slate-200">
                      {d.person?.name || "Unknown"}
                      <button onClick={() => handleRemoveDirector(d)} className="w-5 h-5 flex items-center justify-center rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/15 transition-all"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  {directors.length === 0 && <span className="text-xs text-slate-500">No directors linked yet</span>}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/50">
                <Button onClick={() => router.push("/movies")}
                  className="h-9 px-6 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30">
                  Done — Go to Movies
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pb-6">
        <span className="text-xs text-slate-500">
          {createdMovieId ? "Movie saved — add cast & crew or finish." : title ? `Ready to create "${title}"` : "Fill in the required fields to create the movie."}
        </span>
        <div className="flex items-center gap-3">
          <Link href="/movies">
            <Button variant="ghost" className="h-10 px-6 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
              {createdMovieId ? "Back to Movies" : "Cancel"}
            </Button>
          </Link>
          {!createdMovieId && (
            <Button onClick={handleSave} disabled={saving}
              className="h-10 px-8 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30 gap-2">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Creating…</> : <><Plus className="h-4 w-4" />Create Movie</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
