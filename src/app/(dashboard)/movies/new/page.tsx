"use client";

import { LanguageSelector } from "@/components/forms/language-selector";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createMovieRights } from "@/lib/api/movie-rights";
import { MovieRightsOwnedSection, newDraftRight, type DraftMovieRight } from "@/components/forms/movie-rights-owned-section";
import type {
  CertificationType,
  MoviePeople,
  MovieSource,
  MovieWithDetails,
  Person,
  ProductionHouse,
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



// ── Shared style strings ─────────────────────────────────────────────────────
const inputCls = "h-[38px] bg-(--bg-raise) border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-[13.5px] focus-visible:border-(--svf-accent-line) focus-visible:ring-0";
const textareaCls = "bg-(--bg-raise) border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-[13.5px] resize-none focus-visible:border-(--svf-accent-line) focus-visible:ring-0";
const selectTriggerCls = "h-[38px] bg-(--bg-raise) border-(--svf-border) text-(--text) text-[13.5px]";

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
      <label className="text-[11px] font-bold uppercase tracking-widest text-(--text-faint) flex items-center gap-1">
        {label}{required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-(--text-faint) leading-relaxed">{hint}</p>}
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode
}) {
  return (
    <Card className="glass-card">
      <CardHeader className="pb-3 pt-5 px-5 border-b border-(--svf-border)">
        <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-(--text)">
          <div className="p-1.5 rounded-[9px] bg-red-500/10 border border-red-500/20">
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
    <div className="inline-flex bg-(--bg-raise) border border-(--svf-border) rounded-full p-0.5 gap-0.5">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button key={opt} type="button" onClick={() => onChange(active ? "" : opt)}
            className={[
              "px-3 py-1 rounded-full text-[12.5px] font-semibold transition-all duration-150 whitespace-nowrap select-none",
              active && opt === "Yes" ? "bg-emerald-500/20 text-emerald-400" :
              active && opt === "No"  ? "bg-red-500/20 text-red-400" :
              active                  ? "bg-(--hover) text-(--text)" :
                                        "text-(--text-faint) hover:text-(--text)",
            ].filter(Boolean).join(" ")}>
            {opt}
          </button>
        );
      })}
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
                sel ? "bg-red-500/15 border-red-500/50 text-red-300" : "bg-(--bg-raise) border-(--svf-border) text-(--text-faint) hover:text-(--text)",
              ].join(" ")}>{lang}</button>
          );
        })}
        {!showCustom && (
          <button type="button" onClick={() => { setShowCustom(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="px-2 py-0.5 rounded-full text-xs font-semibold border border-dashed border-(--svf-border-strong) text-(--text-faint) hover:text-(--text) transition-all">
            + Custom
          </button>
        )}
      </div>
      {showCustom && (
        <div className="flex gap-2 items-center">
          <Input ref={inputRef} value={customInput} onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } if (e.key === "Escape") { setShowCustom(false); setCustomInput(""); } }}
            placeholder="Type language…"
            className="h-7 flex-1 bg-(--bg-raise) border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-xs focus-visible:ring-red-500/40" />
          <button type="button" onClick={addCustom} className="h-7 px-2.5 rounded-[9px] bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-600/30">Add</button>
          <button type="button" onClick={() => { setShowCustom(false); setCustomInput(""); }} className="h-7 w-7 flex items-center justify-center rounded-[9px] text-(--text-faint) hover:text-(--text)">
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
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-[9px] bg-(--bg-raise) border border-(--svf-border)">
          <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) shrink-0">DB:</span>
          <span className="text-[11px] text-(--text-faint) font-mono break-all">{dbVal}</span>
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
    <div className="py-2.5 border-b border-(--svf-border) last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-(--text)">{label}</span>
        <TogglePill value={value} onChange={onChange} />
      </div>
      {onLangChange && (value === "Yes" || value === "No") && (
        <LangMultiPicker value={langValue ?? ""} onChange={onLangChange} />
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
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-(--text-faint) pointer-events-none">
          hh:mm:ss
        </span>
      )}
    </div>
  );
}

function ClipDurationField({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const isTimestamp = /^\d{0,2}:?\d{0,2}:?\d{0,2}$/.test(value) && !(/[a-zA-Z]/.test(value));
  const [customMode, setCustomMode] = useState(value !== "" && !isTimestamp);
  const [customText, setCustomText] = useState(!isTimestamp ? value : "");
  const activePill = customMode ? "Custom" : "Duration";
  const handlePill = (v: string) => {
    if (v === "Custom") { setCustomMode(true); onChange(customText); }
    else { setCustomMode(false); onChange(""); }
  };
  const handleTextChange = (text: string) => {
    setCustomText(text);
    onChange(text);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <TogglePill value={activePill} onChange={handlePill} options={["Duration", "Custom"]} />
      </div>
      {customMode ? (
        <input
          autoFocus
          type="text"
          value={customText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="e.g. 30 seconds, 2 mins…"
          className={`h-9 rounded-xl border border-(--svf-border) bg-(--bg-raise) px-3 text-xs text-(--text) placeholder:text-(--text-faint) focus:outline-none focus:border-(--svf-border-strong) w-full ${className ?? ""}`}
        />
      ) : (
        <DurationInput value={isTimestamp ? value : ""} onChange={onChange} className={className} />
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
  const [isBangladeshi, setIsBangladeshi] = useState(false);
  const [trailerLink, setTrailerLink] = useState("");
  const [assignorLicensor, setAssignorLicensor] = useState("");
  const [licensee, setLicensee] = useState("");
  const [agreementDate, setAgreementDate] = useState("");
  const [agreementStartDate, setAgreementStartDate] = useState("");
  const [agreementEndDate, setAgreementEndDate] = useState("");
  const [prequelSequelRights, setPrequelSequelRights] = useState("Yes");
  const [characterRights, setCharacterRights] = useState("Yes");
  const [subtitlingRights, setSubtitlingRights] = useState("Yes");
  const [subtitlingLang, setSubtitlingLang] = useState("");
  const [dubbingRights, setDubbingRights] = useState("Yes");
  const [dubbingLang, setDubbingLang] = useState("");
  // Home production: jointly owned toggle (replaces nature_of_rights)
  const [jointlyOwned, setJointlyOwned] = useState(false);
  // Home production: sold flag — moves movie into the Expired bucket
  const [homeSold, setHomeSold] = useState(false);
  // Clip rights (standalone — no nature/territory breakdown)
  const [clipRights, setClipRights] = useState("");
  const [clipRightsDuration, setClipRightsDuration] = useState("");
  // Rights we own — dynamic list (acquired only)
  const [rightsOwned, setRightsOwned] = useState<DraftMovieRight[]>([]);
  const [remarks, setRemarks] = useState("");
  const [actionables, setActionables] = useState("");
  const [syndicationHoldback, setSyndicationHoldback] = useState("");
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

    setSaving(true);
    try {
      const selectedHouses = selectedHouseIds
        .map(id => productionHouses.find(h => h.id === id))
        .filter((h): h is ProductionHouse => !!h);
      const finalProductionHouseName = selectedHouses.length > 0
        ? selectedHouses.map(h => h.name).join(", ")
        : undefined;

      const isHomeProdSave = source === "home_production";

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
        is_bangladeshi: isBangladeshi || undefined,
        trailer_link: trailerLink || undefined,
        assignor_licensor: assignorLicensor || undefined,
        licensee: licensee || undefined,
        agreement_date: agreementDate || undefined,
        agreement_start_date: agreementStartDate || undefined,
        agreement_end_date: agreementEndDate || undefined,
        // Home production: auto-set derivative rights; acquired: use form values
        prequel_sequel_rights: isHomeProdSave ? "Yes" : prequelSequelRights || undefined,
        character_rights: isHomeProdSave ? "Yes" : characterRights || undefined,
        subtitling_rights: isHomeProdSave ? "Yes" : (subtitlingLang ? `${subtitlingRights}(${subtitlingLang})` : subtitlingRights) || undefined,
        dubbing_rights: isHomeProdSave ? "Yes" : (dubbingLang ? `${dubbingRights}(${dubbingLang})` : dubbingRights) || undefined,
        clip_rights: isHomeProdSave ? "Yes" : clipRights || undefined,
        clip_rights_duration: isHomeProdSave ? undefined : clipRightsDuration || undefined,
        remarks: remarks || undefined,
        actionables: actionables || undefined,
        syndication_holdback: syndicationHoldback || undefined,
        wtp_library: wtpLibrary || undefined,
        // Home production joint ownership
        jointly_owned: isHomeProdSave ? jointlyOwned : undefined,
        revenue_share: isHomeProdSave && jointlyOwned ? (revenueShare || undefined) : undefined,
        joint_prod_buy_back_date: isHomeProdSave && jointlyOwned ? (jointProdBuyBackDate || undefined) : undefined,
        jointly_exploitation_rights: isHomeProdSave && jointlyOwned ? (jointlyExploitationRights || undefined) : undefined,
        home_sold: isHomeProdSave ? homeSold : undefined,
      };
      const createdMovie = await createMovie(movieData);

      // Save rights we own rows (acquired only)
      if (source === "acquired" && rightsOwned.length > 0) {
        const validRights = rightsOwned
          .filter((r) => r.nature?.trim())
          .map(({ _key, id: _id, ...rest }) => ({
            ...rest,
            movie_id: createdMovie.id,
            start_date: rest.start_date || undefined,
            end_date: rest.end_date || undefined,
          }));
        if (validRights.length > 0) await createMovieRights(validRights);
      }

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
        <p className="text-(--text-faint) text-sm">Checking permissions…</p>
      </div>
    );
  }

  const isHomeProd = source === "home_production";
  const svfId = productionHouses.find(h => h.name.toLowerCase() === "svf")?.id ?? null;
  const currentStepIndex = STEPS.findIndex(s => s.id === activeTab);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="relative overflow-hidden rounded-[12px] bg-(--panel-solid) border border-(--svf-border) p-3">
        <div className="relative flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover) h-8 w-8 p-0 shrink-0">
            <Link href="/movies"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="p-2 rounded-[9px] bg-red-500/10 border border-red-500/20">
            <Plus className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-(--text)">Add New Movie</h1>
            <p className="text-(--text-faint) text-sm mt-0.5">Add a new film to the catalog. Cast &amp; Crew can be added after saving.</p>
          </div>
        </div>
      </div>

      {/* Step Nav */}
      <div className="flex items-stretch bg-(--bg-raise) border border-(--svf-border) rounded-[12px] p-1 gap-1 overflow-x-auto">
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
              className={["flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12.5px] font-semibold whitespace-nowrap transition-all duration-150 shrink-0 border",
                isActive   ? "bg-(--bg-raise) text-(--text) border-(--svf-border-strong) shadow-sm" :
                isDisabled ? "opacity-30 cursor-not-allowed text-(--text-faint) border-transparent" :
                             "text-(--text-faint) hover:text-(--text) hover:bg-(--hover) border-transparent",
              ].join(" ")}>
              <span className={["w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all duration-200",
                isActive ? "bg-gradient-to-br from-red-500 to-red-700 text-white" :
                isDone   ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400" :
                           "bg-(--bg-deep) border border-(--svf-border) text-(--text-faint)",
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
              <span className="text-[11px] font-bold uppercase tracking-widest text-(--text-faint) shrink-0">Source</span>
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
                          setJointlyOwned(false);
                          setRightsOwned([]);
                        } else {
                          setWtpLibrary("");
                          setJointlyOwned(false);
                          setRightsOwned([newDraftRight("", "Satellite")]);
                        }
                      }}
                      className={["px-3 py-1 rounded-full border text-xs font-semibold transition-all duration-150 select-none",
                        sel ? "border-red-500/70 bg-red-500/12 text-red-400 shadow-[0_0_0_1px] shadow-red-500/20"
                            : "border-(--svf-border) bg-(--bg-raise) text-(--text-faint) hover:text-(--text) hover:border-(--svf-border-strong)",
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
                <div className="inline-flex bg-(--bg-raise) border border-(--svf-border) rounded-full p-0.5 gap-0.5">
                  {["Color", "B&W"].map(opt => (
                    <button key={opt} type="button" onClick={() => setColorOrBw(opt)}
                      className={["px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-150",
                        colorOrBw === opt ? "bg-emerald-500/20 text-emerald-400" : "text-(--text-faint) hover:text-(--text)",
                      ].join(" ")}>
                      {opt}
                    </button>
                  ))}
                </div>
              </FormField>

              {/* Bangladeshi Movie */}
              <FormField label="Bangladeshi Movie">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox
                    checked={isBangladeshi}
                    onCheckedChange={(v) => setIsBangladeshi(!!v)}
                  />
                  <span className="text-sm text-(--text)">This is a Bangladeshi movie</span>
                </label>
              </FormField>

              <FormField label="Trailer Link">
                <Input value={trailerLink} onChange={e => setTrailerLink(e.target.value)}
                  placeholder="YouTube URL" className={inputCls} />
              </FormField>

              {/* Jointly Owned — ONLY for home production */}
              {isHomeProd && (
                <div className="md:col-span-2">
                  <FormField label="Jointly Owned">
                    <TogglePill value={jointlyOwned ? "Yes" : "No"} onChange={v => {
                      const isJoint = v === "Yes";
                      setJointlyOwned(isJoint);
                      if (isJoint && svfId) {
                        setSelectedHouseIds(ids => {
                          const rest = ids.filter(id => id !== svfId && id !== "");
                          return [svfId, ...rest];
                        });
                      } else if (!isJoint) {
                        setSelectedHouseIds(ids => [ids[0] === svfId ? (svfId ?? "") : (ids[0] || "")]);
                      }
                    }} />
                  </FormField>
                </div>
              )}

              {/* Sold — ONLY for home production. Marks the movie as expired. */}
              {isHomeProd && (
                <div className="md:col-span-2">
                  <FormField label="Sold">
                    <TogglePill value={homeSold ? "Yes" : "No"} onChange={v => setHomeSold(v === "Yes")} />
                    {homeSold && (
                      <p className="text-xs text-(--text-faint) mt-1.5">This movie will appear in the Expired section.</p>
                    )}
                  </FormField>
                </div>
              )}

              {/* Production House(s) — only for home production */}
              {isHomeProd && selectedHouseIds.map((houseId, index) => {
                const isSvfLocked = jointlyOwned && index === 0 && svfId !== null && houseId === svfId;
                return (
                  <div key={index} className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-(--text-faint)">
                        Production House {jointlyOwned ? index + 1 : ""}
                      </label>
                      {jointlyOwned && !isSvfLocked && index > 0 && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => setSelectedHouseIds(ids => ids.filter((_, i) => i !== index))}>
                          Remove
                        </Button>
                      )}
                    </div>
                    {isSvfLocked ? (
                      <div className={`${selectTriggerCls} flex items-center px-3 rounded-[9px] border opacity-70 cursor-not-allowed`}>
                        <span className="text-(--text) text-sm">SVF</span>
                        <span className="ml-auto text-[10px] text-(--text-faint) uppercase tracking-widest">Default</span>
                      </div>
                    ) : (
                      <Select value={houseId} onValueChange={val => setSelectedHouseIds(ids => { const n = [...ids]; n[index] = val; return n; })}>
                        <SelectTrigger className={selectTriggerCls}><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {productionHouses
                            .filter(h => (!selectedHouseIds.includes(h.id) || h.id === houseId) && !(jointlyOwned && h.id === svfId))
                            .map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}

              {isHomeProd && jointlyOwned && (
                <div className="md:col-span-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setSelectedHouseIds(ids => [...ids, ""])}
                    className="w-full border-dashed border-(--svf-border) bg-transparent text-(--text-faint) hover:text-(--text) hover:bg-(--hover) hover:border-(--svf-border-strong)">
                    + Add Production House
                  </Button>
                </div>
              )}

              {isHomeProd && jointlyOwned && (
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
                                : "bg-(--bg-raise) border-(--svf-border) text-(--text-faint) hover:text-(--text)",
                          ].join(" ")}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
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

      {/* ══ RIGHTS ══ (acquired only) */}
      {activeTab === "rights" && !isHomeProd && (
        <div className="space-y-4">
          <SectionCard icon={ShieldCheck} title="Rights Owned">
            <MovieRightsOwnedSection
              movieId={createdMovieId ?? ""}
              entries={rightsOwned}
              onChange={setRightsOwned}
            />
          </SectionCard>

          {/* Clip Rights */}
          <SectionCard icon={Video} title="Clip Rights">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Clip Rights Acquired">
                <TogglePill value={clipRights} onChange={setClipRights} />
              </FormField>
              <FormField label="Clip Duration">
                <ClipDurationField value={clipRightsDuration} onChange={setClipRightsDuration} className={inputCls} />
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
        <SectionCard icon={Info} title="Notes">
          <div className="space-y-5">
            <FormField label="Syndication Holdback" hint="Comma-separated platform/exploitation types permanently restricted for this movie (e.g. AVOD, FVOD) — overrides individual platform availability.">
              <Textarea value={syndicationHoldback} onChange={e => setSyndicationHoldback(e.target.value)} rows={2} className={textareaCls} placeholder="e.g. AVOD, FVOD" />
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
              <div className="p-2 rounded-[9px] bg-(--bg-deep) border border-(--svf-border)">
                <Users className="h-5 w-5 text-(--text-faint)" />
              </div>
              <p className="text-(--text) font-medium">Save the movie first</p>
              <p className="text-(--text-faint) text-sm max-w-xs">Create the movie using the button below, then you can link cast and crew here.</p>
              <Button variant="outline" size="sm" className="mt-2 border-(--svf-border) text-(--text) hover:text-(--text) hover:bg-(--hover)"
                onClick={() => setActiveTab("basic")}>Go to Basic Info</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-[10px] bg-emerald-950/30 border border-emerald-700/40 px-4 py-3 text-sm text-emerald-300">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Movie created! Now search and link cast &amp; crew.
              </div>
              <p className="text-xs text-(--text-faint)">
                Search existing people and link them as actors or directors. To add a new person first go to the{" "}
                <Link href="/people" className="underline underline-offset-2 text-(--text) hover:text-(--text)">People directory</Link>.
              </p>

              {/* Cast */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-(--text)">Cast (Actors)</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs border-(--svf-border) text-(--text) hover:text-(--text) hover:bg-(--hover)"
                    onClick={() => { setAddingRole(addingRole === "cast" ? null : "cast"); setPersonSearch(""); setPersonResults([]); }}>
                    <Plus className="h-3 w-3 mr-1" />{addingRole === "cast" ? "Cancel" : "Add Actor"}
                  </Button>
                </div>
                {addingRole === "cast" && (
                  <div className="space-y-2 p-3 border border-(--svf-border) rounded-[10px] bg-(--bg-raise)">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-(--text-faint)" />
                      <Input placeholder="Search people by name…" value={personSearch} onChange={e => handlePersonSearch(e.target.value)} className={`${inputCls} pl-8`} autoFocus />
                    </div>
                    {searchingPeople && <div className="flex items-center gap-2 text-xs text-(--text-faint)"><Loader2 className="h-3 w-3 animate-spin" />Searching…</div>}
                    {personResults.length > 0 && (
                      <div className="border border-(--svf-border) rounded-[9px] max-h-40 overflow-y-auto bg-(--panel-solid)">
                        {personResults.map(p => (
                          <button key={p.id} className="w-full px-3 py-1.5 text-left text-sm text-(--text) hover:bg-(--hover) flex items-center justify-between" onClick={() => handleAddCast(p)}>
                            <span>{p.name}</span>
                            {p.role && <span className="text-xs text-(--text-faint) capitalize">{p.role}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {personSearch.length >= 2 && !searchingPeople && personResults.length === 0 && (
                      <p className="text-xs text-(--text-faint) px-1">No results. <Link href="/people" className="underline underline-offset-2 text-(--text-faint)">Create the person</Link> first.</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {cast.map(m => (
                    <span key={m.id} className="flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-(--bg-deep) border border-(--svf-border) text-sm text-(--text)">
                      {m.person?.name || "Unknown"}
                      <button onClick={() => handleRemoveCast(m)} className="w-5 h-5 flex items-center justify-center rounded-full text-(--text-faint) hover:text-red-400 hover:bg-red-500/15 transition-all"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  {cast.length === 0 && <span className="text-xs text-(--text-faint)">No cast linked yet</span>}
                </div>
              </div>

              {/* Directors */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-(--text)">Directors</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs border-(--svf-border) text-(--text) hover:text-(--text) hover:bg-(--hover)"
                    onClick={() => { setAddingRole(addingRole === "director" ? null : "director"); setPersonSearch(""); setPersonResults([]); }}>
                    <Plus className="h-3 w-3 mr-1" />{addingRole === "director" ? "Cancel" : "Add Director"}
                  </Button>
                </div>
                {addingRole === "director" && (
                  <div className="space-y-2 p-3 border border-(--svf-border) rounded-[10px] bg-(--bg-raise)">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-(--text-faint)" />
                      <Input placeholder="Search people by name…" value={personSearch} onChange={e => handlePersonSearch(e.target.value)} className={`${inputCls} pl-8`} autoFocus />
                    </div>
                    {searchingPeople && <div className="flex items-center gap-2 text-xs text-(--text-faint)"><Loader2 className="h-3 w-3 animate-spin" />Searching…</div>}
                    {personResults.length > 0 && (
                      <div className="border border-(--svf-border) rounded-[9px] max-h-40 overflow-y-auto bg-(--panel-solid)">
                        {personResults.map(p => (
                          <button key={p.id} className="w-full px-3 py-1.5 text-left text-sm text-(--text) hover:bg-(--hover) flex items-center justify-between" onClick={() => handleAddDirector(p)}>
                            <span>{p.name}</span>
                            {p.role && <span className="text-xs text-(--text-faint) capitalize">{p.role}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {personSearch.length >= 2 && !searchingPeople && personResults.length === 0 && (
                      <p className="text-xs text-(--text-faint) px-1">No results. <Link href="/people" className="underline underline-offset-2 text-(--text-faint)">Create the person</Link> first.</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {directors.map(d => (
                    <span key={d.id} className="flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-(--bg-deep) border border-(--svf-border) text-sm text-(--text)">
                      {d.person?.name || "Unknown"}
                      <button onClick={() => handleRemoveDirector(d)} className="w-5 h-5 flex items-center justify-center rounded-full text-(--text-faint) hover:text-red-400 hover:bg-red-500/15 transition-all"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  {directors.length === 0 && <span className="text-xs text-(--text-faint)">No directors linked yet</span>}
                </div>
              </div>

              <div className="pt-2 border-t border-(--svf-border)">
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
        <span className="text-xs text-(--text-faint)">
          {createdMovieId ? "Movie saved — add cast & crew or finish." : title ? `Ready to create "${title}"` : "Fill in the required fields to create the movie."}
        </span>
        <div className="flex items-center gap-3">
          <Link href="/movies">
            <Button variant="ghost" className="h-10 px-6 text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
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
