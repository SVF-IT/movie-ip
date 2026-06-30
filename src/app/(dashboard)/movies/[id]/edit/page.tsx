"use client";

import { LanguageSelector } from "@/components/forms/language-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { getMovieApprovalHistory, resubmitMovie } from "@/lib/api/approvals";
import { getMovieRightsOwned, syncMovieRights } from "@/lib/api/movie-rights";
import {
  addMoviePerson,
  getMovieById,
  getMovieCast,
  getMovieDirectors,
  getProductionHouses,
  removeMoviePerson,
  searchPeople,
  updateMovie,
} from "@/lib/api/movies";
import {
  getMoviePendingChanges,
  submitMovieFieldChange,
  submitPersonChange,
  type PendingChange,
} from "@/lib/api/pending-changes";
import {
  DraftMovieRight,
  MovieRightsOwnedSection,
  newDraftRight,
} from "@/components/forms/movie-rights-owned-section";
import type {
  CertificationType,
  MovieApproval,
  MoviePeople,
  MovieRight,
  MovieSource,
  MovieWithDetails,
  Person,
  ProductionHouse,
  RightNature,
} from "@/lib/types/database";
import { AlertTriangle, ArrowLeft, CheckCircle, Clock, Film, GitPullRequest, Loader2, Plus, RotateCcw, Search, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const CERTIFICATIONS = ["U", "UA", "U/A", "UA 7+", "UA 13+", "UA 16+", "A", "S", "V/U", "V/UA", "UNCENSORED", "TBD"];

const HOME_NATURE_OPTIONS = [
  { value: "Exclusive", label: "Exclusively Owned" },
  { value: "Jointly Owned", label: "Jointly Owned" },
  { value: "Sold/Expired", label: "Sold / Expired" },
];


const inputCls = "bg-(--bg-raise) border-(--svf-border) text-(--text) placeholder:text-(--text-faint) focus-visible:border-(--svf-border-strong) focus-visible:ring-0 h-10";
const selectCls = "bg-(--bg-raise) border-(--svf-border) text-(--text) h-10";
const textareaCls = "bg-(--bg-raise) border-(--svf-border) text-(--text) placeholder:text-(--text-faint) focus-visible:border-(--svf-border-strong) focus-visible:ring-0";
const labelCls = "text-xs font-semibold text-(--text-faint) uppercase tracking-wider";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[12px] bg-(--panel-solid) border border-(--svf-border) shadow-sm">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-(--svf-border)">
        <div className="p-1.5 rounded-[10px] bg-amber-500/15 border border-amber-500/30">
          <Film className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <span className="text-sm font-semibold text-(--text)">{title}</span>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

function FormField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className={labelCls}>{label}{required && <span className="text-red-400 ml-0.5">*</span>}</Label>
      {children}
      {hint && <p className="text-[10px] text-(--text-faint) leading-relaxed">{hint}</p>}
    </div>
  );
}

function TogglePill({ value, onChange, options = ["Yes", "No"] }: { value: string; onChange: (v: string) => void; options?: string[] }) {
  return (
    <div className="inline-flex bg-(--bg-raise) border border-(--svf-border) rounded-full p-0.5 gap-0.5">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button key={opt} type="button" onClick={() => onChange(active ? "" : opt)}
            className={[
              "px-3 py-1 rounded-full text-[12.5px] font-semibold transition-all duration-150 whitespace-nowrap select-none",
              active && opt === "Yes" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" :
                active && opt === "No" ? "bg-red-500/20 text-red-700 dark:text-red-400" :
                  active ? "bg-(--hover) text-(--text)" :
                    "text-(--text-faint) hover:text-(--text)",
            ].filter(Boolean).join(" ")}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}


const LANG_LIST = ["Bengali", "Hindi", "English", "Tamil", "Telugu", "Malayalam", "Kannada", "Marathi", "Gujarati", "Punjabi", "Odia", "Assamese"];

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
                sel ? "bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300" : "bg-(--bg-raise) border-(--svf-border) text-(--text-faint) hover:text-(--text)",
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
            className="h-7 flex-1 bg-(--bg-raise) border-(--svf-border) text-(--text) placeholder:text-(--text-faint) text-xs" />
          <button type="button" onClick={addCustom} className="h-7 px-2.5 rounded-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-500/25">Add</button>
          <button type="button" onClick={() => { setShowCustom(false); setCustomInput(""); }} className="h-7 w-7 flex items-center justify-center rounded-[9px] text-(--text-faint) hover:text-(--text)">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(lang => (
            <span key={lang} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {lang}
              <button type="button" onClick={() => commit(selected.filter(s => s !== lang))} className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-amber-500/20">
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

function InlineRightsRow({ label, value, onChange, langValue, onLangChange }: { label: string; value: string; onChange: (v: string) => void; langValue?: string; onLangChange?: (v: string) => void }) {
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


function DurationInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. 2 mins, 30 sec, 00:02:30" className={className} />
  );
}

function ClipDurationField({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const isTimestamp = value === "" || (/^\d{0,2}:?\d{0,2}:?\d{0,2}$/.test(value) && !(/[a-zA-Z]/.test(value)));
  const [customMode, setCustomMode] = useState(!isTimestamp);
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
      <TogglePill value={activePill} onChange={handlePill} options={["Duration", "Custom"]} />
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


export default function EditMoviePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const movieId = params.id as string;
  const defaultTab = searchParams.get("tab") || "basic";
  const { allowed, loading: permLoading } = useRequirePermission("edit", "movie", "/movies");
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [productionHouses, setProductionHouses] = useState<ProductionHouse[]>([]);

  const [title, setTitle] = useState("");
  const [productionNo, setProductionNo] = useState("");
  const [source, setSource] = useState<MovieSource>("home_production");
  const [releaseDate, setReleaseDate] = useState("");
  const [releaseYear, setReleaseYear] = useState("");
  const [certification, setCertification] = useState("");
  const [language, setLanguage] = useState("");
  const [selectedHouseIds, setSelectedHouseIds] = useState<string[]>([""]);
  const [wtpLibrary, setWtpLibrary] = useState("");
  const [revenueShare, setRevenueShare] = useState("");
  const [colorOrBw, setColorOrBw] = useState("");
  const [isBangladeshi, setIsBangladeshi] = useState(false);
  const [trailerLink, setTrailerLink] = useState("");
  const [assignorLicensor, setAssignorLicensor] = useState("");
  const [licensee, setLicensee] = useState("");
  const [agreementDate, setAgreementDate] = useState("");
  const [agreementStartDate, setAgreementStartDate] = useState("");
  const [agreementEndDate, setAgreementEndDate] = useState("");
  const [prequelSequelRights, setPrequelSequelRights] = useState("");
  const [characterRights, setCharacterRights] = useState("");
  const [subtitlingRights, setSubtitlingRights] = useState("");
  const [subtitlingLang, setSubtitlingLang] = useState("");
  const [dubbingRights, setDubbingRights] = useState("");
  const [dubbingLang, setDubbingLang] = useState("");
  const [natureOfRights, setNatureOfRights] = useState("");
  const [territory, setTerritory] = useState("");
  const [remarks, setRemarks] = useState("");
  const [actionables, setActionables] = useState("");
  const [jointProdBuyBackDate, setJointProdBuyBackDate] = useState("");
  const [jointlyExploitationRights, setJointlyExploitationRights] = useState("");
  const [recensorFlag, setRecensorFlag] = useState(false);
  const [clipRights, setClipRights] = useState("");
  const [clipRightsDuration, setClipRightsDuration] = useState("");
  const [rightsOwned, setRightsOwned] = useState<DraftMovieRight[]>([]);
  const [existingRights, setExistingRights] = useState<MovieRight[]>([]);

  // Cast & Directors
  const [cast, setCast] = useState<MoviePeople[]>([]);
  const [directors, setDirectors] = useState<MoviePeople[]>([]);
  const [personSearch, setPersonSearch] = useState("");
  const [personResults, setPersonResults] = useState<Person[]>([]);
  const [searchingPeople, setSearchingPeople] = useState(false);
  const [addingRole, setAddingRole] = useState<"cast" | "director" | null>(null);

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [approvalStatus, setApprovalStatus] = useState<"pending" | "approved" | "rejected" | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<MovieApproval[]>([]);
  const [resubmitting, setResubmitting] = useState(false);

  const [saving, setSaving] = useState(false);
  const toast = useAppToast();

  // Snapshot of field values at load time — used to build a before/after diff for approved movies
  const [beforeSnapshot, setBeforeSnapshot] = useState<Record<string, unknown>>({});
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [movie, houses] = await Promise.all([
          getMovieById(movieId),
          getProductionHouses(),
        ]);
        setProductionHouses(houses);
        if (!movie) { toast.error("Movie not found"); setLoading(false); return; }
        setTitle(movie.title || "");
        setProductionNo(movie.production_no || "");
        setSource(movie.source || "home_production");
        setReleaseDate(movie.release_date || "");
        setReleaseYear(movie.release_year?.toString() || "");
        setCertification(movie.certification || "");
        setLanguage(movie.language || "");

        // Handle production houses - match by name text against production houses list
        const phName = movie.production_house_name || "";
        if (phName) {
          // Preserve DB order by mapping each name to its matching house id
          const names = phName.split(",").map(s => s.trim());
          const matchedHouseIds = names
            .map(n => houses.find(h => h.name.toLowerCase() === n.toLowerCase())?.id ?? "")
            .filter(id => id !== "");

          if (matchedHouseIds.length > 0) {
            setSelectedHouseIds(matchedHouseIds);
          } else {
            setSelectedHouseIds([""]);
          }
        } else {
          setSelectedHouseIds([""]);
        }
        setColorOrBw(movie.color_or_bw || "");
        setIsBangladeshi(movie.is_bangladeshi ?? false);
        setTrailerLink(movie.trailer_link || "");
        setAssignorLicensor(movie.assignor_licensor || "");
        setLicensee(movie.licensee || "");
        setAgreementDate(movie.agreement_date || "");
        setAgreementStartDate(movie.agreement_start_date || "");
        setAgreementEndDate(movie.agreement_end_date || "");
        setPrequelSequelRights(movie.prequel_sequel_rights || "");
        setCharacterRights(movie.character_rights || "");
        // subtitling/dubbing stored as "Yes(Bengali, Hindi)" or legacy "Yes: Bengali"
        const subRaw = movie.subtitling_rights || "";
        if (subRaw.startsWith("Yes(") && subRaw.endsWith(")")) {
          setSubtitlingRights("Yes"); setSubtitlingLang(subRaw.slice(4, -1).trim());
        } else if (subRaw.includes(":")) {
          setSubtitlingRights("Yes"); setSubtitlingLang(subRaw.split(":").slice(1).join(":").trim());
        } else { setSubtitlingRights(subRaw); setSubtitlingLang(""); }
        const dubRaw = movie.dubbing_rights || "";
        if (dubRaw.startsWith("Yes(") && dubRaw.endsWith(")")) {
          setDubbingRights("Yes"); setDubbingLang(dubRaw.slice(4, -1).trim());
        } else if (dubRaw.includes(":")) {
          setDubbingRights("Yes"); setDubbingLang(dubRaw.split(":").slice(1).join(":").trim());
        } else { setDubbingRights(dubRaw); setDubbingLang(""); }
        setNatureOfRights(movie.nature_of_rights || "");
        setTerritory(movie.territory || "");
        setRemarks(movie.remarks || "");
        setActionables(movie.actionables || "");
        setWtpLibrary(movie.wtp_library || "");
        setRevenueShare(movie.revenue_share || "");
        setJointProdBuyBackDate(movie.joint_prod_buy_back_date || "");
        setJointlyExploitationRights(movie.jointly_exploitation_rights || "");
        setRecensorFlag(movie.recensor_flag ?? false);
        setClipRights(movie.clip_rights || "");
        setClipRightsDuration(movie.clip_rights_duration || "");
        const status = (movie as any).approval_status ?? null;
        setApprovalStatus(status);
        // Only auto-switch to Approval tab if no explicit ?tab= param in URL
        if (!searchParams.get("tab") && (status === "pending" || status === "rejected")) {
          setActiveTab("approval");
        }
        // Capture snapshot for change diff (only relevant for approved movies)
        setBeforeSnapshot({
          title: movie.title || "",
          production_no: movie.production_no || "",
          source: movie.source || "home_production",
          release_date: movie.release_date || "",
          release_year: movie.release_year?.toString() || "",
          certification: movie.certification || "",
          language: movie.language || "",
          production_house_name: movie.production_house_name || "",
          color_or_bw: movie.color_or_bw || "",
          is_bangladeshi: movie.is_bangladeshi ?? false,
          trailer_link: movie.trailer_link || "",
          assignor_licensor: movie.assignor_licensor || "",
          licensee: movie.licensee || "",
          agreement_date: movie.agreement_date || "",
          agreement_start_date: movie.agreement_start_date || "",
          agreement_end_date: movie.agreement_end_date || "",
          prequel_sequel_rights: movie.prequel_sequel_rights || "",
          character_rights: movie.character_rights || "",
          subtitling_rights: movie.subtitling_rights || "",
          dubbing_rights: movie.dubbing_rights || "",
          nature_of_rights: movie.nature_of_rights || "",
          territory: movie.territory || "",
          remarks: movie.remarks || "",
          actionables: movie.actionables || "",
          wtp_library: movie.wtp_library || "",
          revenue_share: movie.revenue_share || "",
          joint_prod_buy_back_date: movie.joint_prod_buy_back_date || "",
          jointly_exploitation_rights: movie.jointly_exploitation_rights || "",
          recensor_flag: movie.recensor_flag ?? false,
          clip_rights: movie.clip_rights || "",
          clip_rights_duration: movie.clip_rights_duration || "",
        });

        const [castData, dirData, historyData, pendingData, rightsData] = await Promise.all([
          getMovieCast(movieId),
          getMovieDirectors(movieId),
          getMovieApprovalHistory(movieId),
          getMoviePendingChanges(movieId),
          movie.source === "acquired" ? getMovieRightsOwned(movieId) : Promise.resolve([] as MovieRight[]),
        ]);
        setCast(castData);
        setDirectors(dirData);
        setApprovalHistory(historyData);
        setPendingChanges(pendingData);
        setExistingRights(rightsData);
        let counter = 0;
        setRightsOwned(rightsData.map(r => ({ ...r, _key: `loaded-${++counter}` })));
      } catch { toast.error("Failed to load movie"); }
      finally { setLoading(false); }
    }
    load();
  }, [movieId]);

  const handlePersonSearch = useCallback(async (query: string) => {
    setPersonSearch(query);
    if (query.length < 2) { setPersonResults([]); return; }
    setSearchingPeople(true);
    try { const results = await searchPeople(query); setPersonResults(results); }
    catch { setPersonResults([]); }
    finally { setSearchingPeople(false); }
  }, []);

  const isApproved = approvalStatus === "approved";
  const isEditor = profile?.role === "editor";
  const submitterName = profile?.full_name || profile?.email || "Editor";
  // editor always stages changes; legal/admin always apply directly
  const shouldStage = isEditor;

  const handleAddCast = async (person: Person) => {
    try {
      if (shouldStage) {
        await submitPersonChange(movieId, "person_add", person.id, person.name, "Actor", submitterName, profile?.id);
        setPersonSearch(""); setPersonResults([]); setAddingRole(null);
        setPendingChanges(await getMoviePendingChanges(movieId));
        toast.success("Cast change submitted for approval.");
        return;
      }
      const newCast = await addMoviePerson(movieId, person.id, "Actor", cast.length + 1);
      setCast([...cast, newCast]);
      setPersonSearch(""); setPersonResults([]); setAddingRole(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to add cast member"); }
  };

  const handleRemoveCast = async (entry: MoviePeople) => {
    try {
      if (shouldStage) {
        await submitPersonChange(movieId, "person_remove", entry.person_id, entry.person?.name || entry.person_id, "Actor", submitterName, profile?.id);
        setPendingChanges(await getMoviePendingChanges(movieId));
        toast.success("Cast removal submitted for approval.");
        return;
      }
      await removeMoviePerson(entry.id, entry.person_id);
      setCast(cast.filter((c) => c.id !== entry.id));
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to remove cast member"); }
  };

  const handleAddDirector = async (person: Person) => {
    try {
      if (shouldStage) {
        await submitPersonChange(movieId, "person_add", person.id, person.name, "Director", submitterName, profile?.id);
        setPersonSearch(""); setPersonResults([]); setAddingRole(null);
        setPendingChanges(await getMoviePendingChanges(movieId));
        toast.success("Director change submitted for approval.");
        return;
      }
      const newDir = await addMoviePerson(movieId, person.id, "Director");
      setDirectors([...directors, newDir]);
      setPersonSearch(""); setPersonResults([]); setAddingRole(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to add director"); }
  };

  const handleRemoveDirector = async (entry: MoviePeople) => {
    try {
      if (shouldStage) {
        await submitPersonChange(movieId, "person_remove", entry.person_id, entry.person?.name || entry.person_id, "Director", submitterName, profile?.id);
        setPendingChanges(await getMoviePendingChanges(movieId));
        toast.success("Director removal submitted for approval.");
        return;
      }
      await removeMoviePerson(entry.id, entry.person_id);
      setDirectors(directors.filter((d) => d.id !== entry.id));
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to remove director"); }
  };

  const handleResubmit = async () => {
    setResubmitting(true);
    try {
      await resubmitMovie(movieId);
      setApprovalStatus("pending");
      const history = await getMovieApprovalHistory(movieId);
      setApprovalHistory(history);
      toast.success("Movie resubmitted for approval.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resubmit");
    } finally {
      setResubmitting(false);
    }
  };

  const isHomeProd = source === "home_production";
  const isJointlyOwned = natureOfRights === "Jointly Owned";

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      let finalProductionHouseName: string | undefined;

      const selectedHouses = selectedHouseIds
        .map(id => productionHouses.find(h => h.id === id))
        .filter((h): h is ProductionHouse => !!h);

      if (selectedHouses.length > 0) {
        finalProductionHouseName = selectedHouses.map(h => h.name).join(", ");
      }

      const afterSnapshot: Record<string, unknown> = {
        title: title.trim(),
        production_no: productionNo || "",
        source,
        release_date: releaseDate || "",
        release_year: releaseYear || "",
        certification: certification || "",
        language: language.replace(/\s*[Dd]ubbed\s*/g, "").trim() || "",
        production_house_name: finalProductionHouseName || "",
        color_or_bw: colorOrBw || "",
        is_bangladeshi: isBangladeshi,
        trailer_link: trailerLink || "",
        assignor_licensor: assignorLicensor || "",
        licensee: licensee || "",
        agreement_date: agreementDate || "",
        agreement_start_date: agreementStartDate || "",
        agreement_end_date: agreementEndDate || "",
        prequel_sequel_rights: prequelSequelRights || "",
        character_rights: characterRights || "",
        subtitling_rights: subtitlingLang ? `${subtitlingRights}(${subtitlingLang})` : subtitlingRights || "",
        dubbing_rights: dubbingLang ? `${dubbingRights}(${dubbingLang})` : dubbingRights || "",
        nature_of_rights: source === "acquired" ? "" : (natureOfRights || ""),
        territory: territory || "",
        remarks: remarks || "",
        actionables: actionables || "",
        wtp_library: wtpLibrary || "",
        revenue_share: isJointlyOwned ? revenueShare : "",
        joint_prod_buy_back_date: isJointlyOwned ? jointProdBuyBackDate : "",
        jointly_exploitation_rights: isJointlyOwned ? jointlyExploitationRights : "",
        recensor_flag: recensorFlag,
        clip_rights: clipRights || "",
        clip_rights_duration: clipRightsDuration || "",
      };

      // Editor always stages; legal/admin always apply directly
      if (shouldStage) {
        const changedFields = Object.keys(afterSnapshot).filter(
          k => JSON.stringify(beforeSnapshot[k]) !== JSON.stringify(afterSnapshot[k])
        );
        if (changedFields.length === 0) {
          toast.info("No changes detected.");
          return;
        }
        await submitMovieFieldChange(movieId, beforeSnapshot, afterSnapshot, submitterName, profile?.id);
        setPendingChanges(await getMoviePendingChanges(movieId));
        toast.success("Changes submitted for approval.", "They will be applied once reviewed.");
        setBeforeSnapshot(afterSnapshot);
        return;
      }

      // Legal / admin — apply directly
      const movieData: Partial<MovieWithDetails> = {
        title: title.trim(), production_no: productionNo || undefined, source,
        release_date: releaseDate || undefined, release_year: releaseYear || undefined,
        certification: (certification as CertificationType) || undefined,
        language: language.replace(/\s*[Dd]ubbed\s*/g, "").trim() || undefined,
        production_house_name: finalProductionHouseName,
        color_or_bw: colorOrBw || undefined, is_bangladeshi: isBangladeshi, trailer_link: trailerLink || undefined,
        assignor_licensor: assignorLicensor || undefined,
        licensee: licensee || undefined, agreement_date: agreementDate || undefined,
        agreement_start_date: agreementStartDate || undefined, agreement_end_date: agreementEndDate || undefined,
        prequel_sequel_rights: prequelSequelRights || undefined, character_rights: characterRights || undefined,
        subtitling_rights: (subtitlingLang ? `${subtitlingRights}(${subtitlingLang})` : subtitlingRights) || undefined,
        dubbing_rights: (dubbingLang ? `${dubbingRights}(${dubbingLang})` : dubbingRights) || undefined,
        nature_of_rights: isHomeProd ? (natureOfRights as RightNature) || undefined : undefined,
        territory: territory || undefined, remarks: remarks || undefined,
        actionables: actionables || undefined,
        wtp_library: wtpLibrary || undefined,
        revenue_share: isJointlyOwned ? revenueShare : undefined,
        joint_prod_buy_back_date: isJointlyOwned ? jointProdBuyBackDate : undefined,
        jointly_exploitation_rights: isJointlyOwned ? jointlyExploitationRights : undefined,
        recensor_flag: recensorFlag,
        clip_rights: clipRights || undefined,
        clip_rights_duration: clipRightsDuration || undefined,
      };
      await updateMovie(movieId, movieData);
      if (source === "acquired") {
        const validRights = rightsOwned.filter(r => r.nature.trim());
        await syncMovieRights(movieId, validRights, existingRights);
      }
      toast.success("Movie saved successfully.");
      router.push(`/movies/${movieId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save movie");
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
      <div className="relative overflow-hidden rounded-[12px] bg-(--panel-solid) border border-(--svf-border) p-3">

        <div className="relative flex items-center gap-4">
          <Link href="/movies">
            <Button variant="ghost" size="sm" className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover) gap-1.5 h-8">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
          </Link>
          <div className="h-4 w-px bg-(--hover)" />
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[12px] bg-amber-500/15 border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <Film className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-(--text)">
                Edit Movie
              </h1>
              <p className="text-xs text-(--text-faint) mt-0.5">Updating <span className="text-(--text)">{title}</span></p>
            </div>
          </div>
        </div>
      </div>

      {shouldStage && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-[12px] bg-blue-500/10 border border-blue-500/30">
          <GitPullRequest className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Changes you save will be <strong>submitted for review</strong> before being applied.
          </p>
        </div>
      )}

      {/* Step Nav */}
      <div className="flex items-stretch bg-(--bg-raise) border border-(--svf-border) rounded-[12px] p-1 gap-1 overflow-x-auto">
        {[
          { id: "basic",    label: "Basic" },
          { id: "acquired", label: "Acquired",  disabled: isHomeProd },
          { id: "rights",   label: "Rights",    disabled: isHomeProd, tag: isHomeProd ? "All Yes" : null },
          { id: "notes",    label: "Notes" },
          { id: "people",   label: "Cast & Crew" },
          { id: "approval", label: "Approval",  dot: approvalStatus === "rejected" ? "red" : approvalStatus === "pending" ? "amber" : null },
        ].map(step => {
          const isActive = activeTab === step.id;
          return (
            <button key={step.id} type="button" disabled={step.disabled}
              onClick={() => !step.disabled && setActiveTab(step.id)}
              className={["relative flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12.5px] font-semibold whitespace-nowrap transition-all duration-150 shrink-0 border",
                isActive      ? "bg-(--panel-solid) text-(--text) border-(--svf-border-strong) shadow-sm" :
                step.disabled ? "opacity-30 cursor-not-allowed text-(--text-faint) border-transparent" :
                                "text-(--text-faint) hover:text-(--text) hover:bg-(--hover) border-transparent",
              ].join(" ")}>
              {step.label}
              {step.tag && <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 rounded px-1 py-0.5">{step.tag}</span>}
              {step.dot === "red"   && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
              {step.dot === "amber" && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">

          {activeTab === "basic" && <div className="space-y-4">
            <SectionCard title="Movie Information">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Title" required>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Film title" className={`${inputCls} h-12 text-base font-semibold`} />
                </FormField>
                {source !== "acquired" && (
                  <FormField label="Production No.">
                    <Input value={productionNo} onChange={(e) => setProductionNo(e.target.value)} placeholder="e.g., SVF-2024-001" className={inputCls} />
                  </FormField>
                )}

                <FormField label="Release Date">
                  <Input type="date" value={releaseDate} onChange={(e) => { setReleaseDate(e.target.value); if (e.target.value) setReleaseYear(new Date(e.target.value).getFullYear().toString()); }} className={inputCls} />
                </FormField>
                <FormField label="Release Year">
                  <Input type="number" value={releaseYear} onChange={(e) => setReleaseYear(e.target.value)} placeholder="e.g., 2024" className={inputCls} />
                </FormField>
                <FormField label="Language">
                  <LanguageSelector value={language} onValueChange={setLanguage} />
                </FormField>

                {/* Color / B&W — toggle pill */}
                <FormField label="Color / B&W">
                  <div className="inline-flex bg-(--bg-raise) border border-(--svf-border) rounded-full p-0.5 gap-0.5">
                    {["Color", "B&W"].map((opt) => (
                      <button key={opt} type="button" onClick={() => setColorOrBw(opt)}
                        className={["px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-150",
                          colorOrBw === opt ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "text-(--text-faint) hover:text-(--text)",
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

                <FormField label="WTP / Library">
                  <Select value={wtpLibrary} onValueChange={setWtpLibrary}>
                    <SelectTrigger className={selectCls}><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WTP">WTP</SelectItem>
                      <SelectItem value="WTP/BD">WTP/BD</SelectItem>
                      <SelectItem value="Library">Library</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Trailer Link">
                  <Input value={trailerLink} onChange={(e) => setTrailerLink(e.target.value)} placeholder="YouTube URL" className={inputCls} />
                </FormField>

                {/* Source — cards */}
                <div className="md:col-span-2">
                  <FormField label="Source" required>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      {[
                        { value: "home_production", label: "Home Production", desc: "Film produced in-house by SVF" },
                        { value: "acquired", label: "Acquired", desc: "Rights acquired from a third party" },
                      ].map((opt) => {
                        const sel = source === opt.value;
                        return (
                          <button key={opt.value} type="button"
                            onClick={() => { setSource(opt.value as MovieSource); if (opt.value === 'home_production' && natureOfRights === 'Non-Exclusive') setNatureOfRights(''); }}
                            className={["text-left p-4 rounded-[10px] border-[1.5px] transition-all duration-150 cursor-pointer",
                              sel ? "border-amber-500/70 bg-amber-500/10 shadow-[0_0_0_1px] shadow-amber-500/30"
                                : "border-(--svf-border) bg-(--bg-raise) hover:border-amber-500/30 hover:bg-amber-500/5",
                            ].join(" ")}>
                            <strong className={`block text-sm font-bold mb-0.5 ${sel ? "text-amber-700 dark:text-amber-400" : "text-(--text)"}`}>{opt.label}</strong>
                            <span className="text-xs text-(--text-faint)">{opt.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </FormField>
                </div>

                {/* Nature of Rights — pill options */}
                {isHomeProd && (
                  <div className="md:col-span-2">
                    <FormField label="Nature of Rights">
                      <div className="flex flex-wrap gap-2 mt-1">
                        {HOME_NATURE_OPTIONS.map((opt) => {
                          const sel = natureOfRights === opt.value;
                          return (
                            <button key={opt.value} type="button"
                              onClick={() => {
                                const newVal = sel ? "" : opt.value;
                                setNatureOfRights(newVal);
                                const jointly = newVal === "Jointly Owned";
                                const svfId = productionHouses.find(h => h.name.toLowerCase() === 'svf')?.id ?? null;
                                if (jointly && svfId) {
                                  setSelectedHouseIds(ids => {
                                    const rest = ids.filter(id => id !== svfId && id !== "");
                                    return [svfId, ...rest];
                                  });
                                } else if (!jointly) {
                                  setSelectedHouseIds(ids => [ids[0] === svfId ? "" : (ids[0] || "")]);
                                }
                              }}
                              className={["px-4 py-2 rounded-full border text-[12.5px] font-semibold transition-all duration-120 select-none",
                                sel ? "bg-amber-500/12 border-amber-500/60 text-amber-700 dark:text-amber-400"
                                  : "bg-(--bg-raise) border-(--svf-border) text-(--text-faint) hover:text-(--text)",
                              ].join(" ")}>
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </FormField>
                  </div>
                )}

                {isHomeProd && selectedHouseIds.map((houseId, index) => {
                  const svfId = productionHouses.find(h => h.name.toLowerCase() === 'svf')?.id ?? null;
                  const isJointly = isJointlyOwned && isHomeProd;
                  const isSvfLocked = isJointly && index === 0 && svfId !== null && houseId === svfId;
                  return (
                    <div key={index} className="animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <Label className={labelCls}>
                          Production House {isJointly ? index + 1 : ''}
                        </Label>
                        {isJointly && !isSvfLocked && index > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                            onClick={() => setSelectedHouseIds(ids => ids.filter((_, i) => i !== index))}>
                            Remove
                          </Button>
                        )}
                      </div>
                      {isSvfLocked ? (
                        <div className={`${selectCls} flex items-center px-3 rounded-[9px] border opacity-70 cursor-not-allowed`}>
                          <span className="text-(--text) text-sm">SVF</span>
                          <span className="ml-auto text-[10px] text-(--text-faint) uppercase tracking-widest">Default</span>
                        </div>
                      ) : (
                        <Select value={houseId} onValueChange={(val) => setSelectedHouseIds(ids => { const n = [...ids]; n[index] = val; return n; })}>
                          <SelectTrigger className={selectCls}><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {productionHouses
                              .filter(h => {
                                // Don't show already-selected houses in other slots
                                if (selectedHouseIds.includes(h.id) && h.id !== houseId) return false;
                                // In jointly+home mode, hide SVF from slots other than index 0 (it's locked there)
                                if (isJointly && source === 'home_production' && h.id === svfId && index !== 0) return false;
                                return true;
                              })
                              .map((h) => (<SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}

                {isJointlyOwned && isHomeProd && (
                  <div className="md:col-span-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => setSelectedHouseIds(ids => [...ids, ""])}
                      className="w-full border-dashed border-(--svf-border) text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
                      <Plus className="h-3 w-3 mr-1" /> Add Production House
                    </Button>
                  </div>
                )}

                {isJointlyOwned && isHomeProd && (
                  <>
                    <FormField label="Revenue Share">
                      <Input placeholder="e.g., 50% / 50%" value={revenueShare} onChange={(e) => setRevenueShare(e.target.value)} className={inputCls} />
                    </FormField>
                    <FormField label="Joint Prod. Buy-Back Date">
                      <Input type="date" value={jointProdBuyBackDate} onChange={(e) => setJointProdBuyBackDate(e.target.value)} className={inputCls} />
                    </FormField>
                    <div className="md:col-span-2">
                      <FormField label="Exploitation Rights Held By" hint="Which production house currently holds the rights to exploit this title">
                        <Select value={jointlyExploitationRights} onValueChange={setJointlyExploitationRights}>
                          <SelectTrigger className={selectCls}><SelectValue placeholder="Select house…" /></SelectTrigger>
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
                    <div className="flex flex-wrap gap-2 mt-1">
                      {CERTIFICATIONS.map((c) => {
                        const sel = certification === c;
                        return (
                          <button key={c} type="button"
                            onClick={() => { const newVal = sel ? "" : c; setCertification(newVal); setRecensorFlag(newVal === "A"); }}
                            className={["px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-100 select-none",
                              sel ? "bg-amber-500/12 border-amber-500/60 text-amber-700 dark:text-amber-400"
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
            </SectionCard>
          </div>}

          {activeTab === "acquired" && <div className="space-y-4">
            <SectionCard title="Acquisition Details">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Assignor / Licensor">
                  <Input value={assignorLicensor} onChange={(e) => setAssignorLicensor(e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Licensee">
                  <Input value={licensee} onChange={(e) => setLicensee(e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Agreement Date">
                  <Input type="date" value={agreementDate} onChange={(e) => setAgreementDate(e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Agreement Start">
                  <Input type="date" value={agreementStartDate} onChange={(e) => setAgreementStartDate(e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Agreement End">
                  <Input type="date" value={agreementEndDate} onChange={(e) => setAgreementEndDate(e.target.value)} className={inputCls} />
                </FormField>
              </div>
            </SectionCard>
          </div>}

          {activeTab === "rights" && <div className="space-y-4">
            <SectionCard title="Rights We Own">
              <MovieRightsOwnedSection
                movieId={movieId}
                entries={rightsOwned}
                onChange={setRightsOwned}
              />
            </SectionCard>

            <SectionCard title="Clip Rights">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Clip Rights Acquired">
                  <TogglePill value={clipRights} onChange={setClipRights} />
                </FormField>
                <FormField label="Clip Rights Duration">
                  <ClipDurationField value={clipRightsDuration} onChange={setClipRightsDuration} className={inputCls} />
                </FormField>
              </div>
            </SectionCard>

            <SectionCard title="Derivative Rights">
              <div>
                <InlineRightsRow label="Prequel / Sequel Rights" value={prequelSequelRights} onChange={setPrequelSequelRights} />
                <InlineRightsRow label="Character Rights" value={characterRights} onChange={setCharacterRights} />
                <InlineRightsRow label="Sub-Titling Rights" value={subtitlingRights} onChange={(v) => { setSubtitlingRights(v); if (v !== "Yes" && v !== "No") setSubtitlingLang(""); }}
                  langValue={subtitlingLang} onLangChange={setSubtitlingLang} />
                {(subtitlingRights === "Yes" || subtitlingRights === "No") && subtitlingLang && (
                  <div className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-[9px] bg-(--bg-raise) border border-(--svf-border)">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) shrink-0">DB value:</span>
                    <span className="text-[11px] text-(--text-faint) font-mono">{subtitlingRights}({subtitlingLang})</span>
                  </div>
                )}
                <InlineRightsRow label="Dubbing Rights" value={dubbingRights} onChange={(v) => { setDubbingRights(v); if (v !== "Yes" && v !== "No") setDubbingLang(""); }}
                  langValue={dubbingLang} onLangChange={setDubbingLang} />
                {(dubbingRights === "Yes" || dubbingRights === "No") && dubbingLang && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-[9px] bg-(--bg-raise) border border-(--svf-border)">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) shrink-0">DB value:</span>
                    <span className="text-[11px] text-(--text-faint) font-mono">{dubbingRights}({dubbingLang})</span>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>}

          {activeTab === "notes" && <div className="space-y-4">
            <SectionCard title="Notes">
              <div className="space-y-4">
                <FormField label="Remarks">
                  <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className={textareaCls} />
                </FormField>
                <FormField label="Actionables">
                  <Textarea value={actionables} onChange={(e) => setActionables(e.target.value)} rows={3} className={textareaCls} />
                </FormField>
                <div className="flex items-start gap-3 rounded-[10px] border border-(--svf-border) p-3 bg-(--bg-raise)">
                  <Checkbox
                    id="recensor_flag"
                    checked={recensorFlag}
                    onCheckedChange={(v) => setRecensorFlag(Boolean(v))}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="recensor_flag" className="cursor-pointer font-medium text-(--text)">Censor Flag</Label>
                    <p className="text-xs text-(--text-faint) mt-0.5">
                      Auto-enabled for &quot;A&quot; certified movies. Monthly recensor reminders are sent to admins while this is on. Uncheck to stop notifications.
                    </p>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>}

          {activeTab === "people" && <div className="space-y-4">
            <SectionCard title="Cast & Crew">
              <p className="text-xs text-(--text-faint) mb-4">
                Search existing people and link them. To add a new person first go to the{" "}
                <Link href="/people" className="underline underline-offset-2 hover:text-(--text)">People directory</Link>.
              </p>

              {/* Cast */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-(--text)">Cast (Actors)</Label>
                  <Button variant="ghost" size="sm" onClick={() => { setAddingRole(addingRole === "cast" ? null : "cast"); setPersonSearch(""); setPersonResults([]); }} className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover) h-8 px-3">
                    <Plus className="h-3 w-3 mr-1" />{addingRole === "cast" ? "Cancel" : "Add Actor"}
                  </Button>
                </div>
                {addingRole === "cast" && (
                  <div className="space-y-2 p-3 border border-(--svf-border) rounded-[10px] bg-(--bg-raise)">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-(--text-faint)" />
                      <Input placeholder="Search people by name…" value={personSearch} onChange={(e) => handlePersonSearch(e.target.value)} className={`${inputCls} pl-8`} autoFocus />
                    </div>
                    {searchingPeople && <div className="flex items-center gap-2 text-sm text-(--text-faint)"><Loader2 className="h-3 w-3 animate-spin" />Searching…</div>}
                    {personResults.length > 0 && (
                      <div className="border border-(--svf-border) rounded-[10px] max-h-40 overflow-y-auto bg-(--bg-raise)">
                        {personResults.map((p) => (
                          <button key={p.id} className="w-full px-3 py-1.5 text-left text-sm text-(--text) hover:bg-(--hover) flex items-center justify-between border-b border-(--svf-border) last:border-0" onClick={() => handleAddCast(p)}>
                            <span>{p.name}</span>
                            {p.role && <span className="text-xs text-(--text-faint) capitalize">{p.role}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {personSearch.length >= 2 && !searchingPeople && personResults.length === 0 && (
                      <p className="text-xs text-(--text-faint) px-1">No results. <Link href="/people" className="underline underline-offset-2 text-(--text-faint) hover:text-(--text)">Create the person</Link> in the People directory first.</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {cast.map((m) => (
                    <Badge key={m.id} variant="secondary" className="gap-1 pr-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                      {m.person?.name || "Unknown"}
                      <button onClick={() => handleRemoveCast(m)} className="ml-1 rounded-full hover:bg-amber-500/30 p-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  {cast.length === 0 && <span className="text-sm text-(--text-faint)">No cast members linked</span>}
                </div>
              </div>

              {/* Directors */}
              <div className="space-y-4 pt-4 border-t border-(--svf-border)">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-(--text)">Directors</Label>
                  <Button variant="ghost" size="sm" onClick={() => { setAddingRole(addingRole === "director" ? null : "director"); setPersonSearch(""); setPersonResults([]); }} className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover) h-8 px-3">
                    <Plus className="h-3 w-3 mr-1" />{addingRole === "director" ? "Cancel" : "Add Director"}
                  </Button>
                </div>
                {addingRole === "director" && (
                  <div className="space-y-2 p-3 border border-(--svf-border) rounded-[10px] bg-(--bg-raise)">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-(--text-faint)" />
                      <Input placeholder="Search people by name…" value={personSearch} onChange={(e) => handlePersonSearch(e.target.value)} className={`${inputCls} pl-8`} autoFocus />
                    </div>
                    {searchingPeople && <div className="flex items-center gap-2 text-sm text-(--text-faint)"><Loader2 className="h-3 w-3 animate-spin" />Searching…</div>}
                    {personResults.length > 0 && (
                      <div className="border border-(--svf-border) rounded-[10px] max-h-40 overflow-y-auto bg-(--bg-raise)">
                        {personResults.map((p) => (
                          <button key={p.id} className="w-full px-3 py-1.5 text-left text-sm text-(--text) hover:bg-(--hover) flex items-center justify-between border-b border-(--svf-border) last:border-0" onClick={() => handleAddDirector(p)}>
                            <span>{p.name}</span>
                            {p.role && <span className="text-xs text-(--text-faint) capitalize">{p.role}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {personSearch.length >= 2 && !searchingPeople && personResults.length === 0 && (
                      <p className="text-xs text-(--text-faint) px-1">No results. <Link href="/people" className="underline underline-offset-2 text-(--text-faint) hover:text-(--text)">Create the person</Link> in the People directory first.</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {directors.map((d) => (
                    <Badge key={d.id} variant="secondary" className="gap-1 pr-1 bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">
                      {d.person?.name || "Unknown"}
                      <button onClick={() => handleRemoveDirector(d)} className="ml-1 rounded-full hover:bg-blue-500/30 p-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  {directors.length === 0 && <span className="text-sm text-(--text-faint)">No directors linked</span>}
                </div>
              </div>
            </SectionCard>
          </div>}

          {activeTab === "approval" && <div className="space-y-4">
            <SectionCard title="Approval Status">
              <div className="space-y-4">
                {/* Current status */}
                <div className="flex items-center gap-3 p-3 rounded-[10px] bg-(--bg-raise) border border-(--svf-border)">
                  <span className="text-xs font-bold uppercase tracking-widest text-(--text-faint)">Current Status:</span>
                  {approvalStatus === "approved" && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle className="h-4 w-4" /> Approved
                    </span>
                  )}
                  {approvalStatus === "pending" && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
                      <Clock className="h-4 w-4" /> Pending Review
                    </span>
                  )}
                  {approvalStatus === "rejected" && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
                      <XCircle className="h-4 w-4" /> Rejected
                    </span>
                  )}
                  {!approvalStatus && <span className="text-sm text-(--text-faint)">—</span>}
                </div>

                {/* Rejection reason + resubmit */}
                {approvalStatus === "rejected" && (() => {
                  const lastRejection = approvalHistory.find(h => h.status === "rejected");
                  return (
                    <div className="rounded-[10px] border border-red-500/30 bg-red-500/10 p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Rejection reason</p>
                          {lastRejection?.reason ? (
                            <p className="text-sm text-(--text) italic">&quot;{lastRejection.reason}&quot;</p>
                          ) : (
                            <p className="text-sm text-(--text-faint)">No reason provided.</p>
                          )}
                          {lastRejection?.reviewer_name && (
                            <p className="text-xs text-(--text-faint)">— {lastRejection.reviewer_name}</p>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-(--text-faint)">
                        Fix the issues above using the other tabs, then resubmit for review.
                      </p>
                      <Button
                        onClick={handleResubmit}
                        disabled={resubmitting}
                        size="sm"
                        className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                        variant="outline"
                      >
                        {resubmitting
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Resubmitting…</>
                          : <><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Resubmit for Approval</>
                        }
                      </Button>
                    </div>
                  );
                })()}

                {approvalStatus === "pending" && (() => {
                  const lastRejection = approvalHistory.find(h => h.status === "rejected");
                  return (
                    <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Awaiting legal review</p>
                          <p className="text-xs text-(--text-faint)">
                            This movie is in the approval queue. If you make changes here, it will be resubmitted automatically when you save.
                          </p>
                          {lastRejection?.reason && (
                            <p className="text-xs text-(--text-faint) mt-1 italic">
                              Previous rejection: &quot;{lastRejection.reason}&quot;
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={handleResubmit}
                        disabled={resubmitting}
                        size="sm"
                        className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                        variant="outline"
                      >
                        {resubmitting
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Resubmitting…</>
                          : <><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Resubmit for Approval</>
                        }
                      </Button>
                    </div>
                  );
                })()}

                {approvalStatus === "approved" && (
                  <div className="rounded-[10px] border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>This movie has been approved and is live in the catalog. Approval status cannot be changed.</span>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Pending field/people/rights changes */}
            {pendingChanges.length > 0 && (
              <SectionCard title="Pending Change Requests">
                <div className="space-y-3">
                  {pendingChanges.map((c) => (
                    <div key={c.id} className={`p-3 rounded-[10px] border text-sm space-y-1 ${c.status === "pending" ? "bg-amber-500/10 border-amber-500/30" :
                      c.status === "approved" ? "bg-emerald-500/10 border-emerald-500/30" :
                        "bg-red-500/10 border-red-500/30"
                      }`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-(--text)">{c.change_summary}</span>
                        <span className={`text-xs font-semibold uppercase tracking-wide ${c.status === "pending" ? "text-amber-700 dark:text-amber-400" :
                          c.status === "approved" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                          }`}>{c.status}</span>
                      </div>
                      {c.change_type === "movie_fields" && c.status === "pending" && (() => {
                        const before = (c.payload.before || {}) as Record<string, unknown>;
                        const after = (c.payload.after || {}) as Record<string, unknown>;
                        const changed = Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
                        return (
                          <div className="mt-2 space-y-1">
                            {changed.map(k => (
                              <div key={k} className="text-xs grid grid-cols-3 gap-2">
                                <span className="text-(--text-faint) uppercase tracking-wide">{k.replace(/_/g, " ")}</span>
                                <span className="text-red-600 dark:text-red-400 line-through truncate">{String(before[k] ?? "—")}</span>
                                <span className="text-emerald-700 dark:text-emerald-400 truncate">{String(after[k] ?? "—")}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {c.reason && <p className="text-xs text-(--text-faint) italic">"{c.reason}"</p>}
                      <p className="text-xs text-(--text-faint)">
                        {c.changed_by_name && `by ${c.changed_by_name} · `}
                        {new Date(c.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Approval history */}
            {approvalHistory.length > 0 && (
              <SectionCard title="Approval History">
                <div className="space-y-3">
                  {approvalHistory.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 text-sm p-3 rounded-[10px] bg-(--bg-raise) border border-(--svf-border)">
                      <div className="mt-0.5 shrink-0">
                        {entry.status === "approved"
                          ? <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          : entry.status === "rejected"
                            ? <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            : <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-(--text) font-medium capitalize">{entry.status}</p>
                        {entry.reviewer_name && <p className="text-(--text-faint) text-xs">by {entry.reviewer_name}</p>}
                        {entry.reason && <p className="text-(--text-faint) text-xs mt-0.5 italic">&quot;{entry.reason}&quot;</p>}
                        <p className="text-(--text-faint) text-xs mt-0.5">
                          {entry.created_at
                            ? new Date(entry.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>}
        </div>

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3">
        <Link href="/movies">
          <Button variant="outline" className="border-(--svf-border) text-(--text) hover:bg-(--hover)">
            Cancel
          </Button>
        </Link>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-600/30 min-w-[140px]"
        >
          {saving
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{isApproved ? "Submitting..." : "Saving..."}</>
            : isApproved ? <><GitPullRequest className="mr-2 h-4 w-4" />Submit for Approval</> : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
