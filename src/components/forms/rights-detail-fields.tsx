"use client";

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

const PRESET_LANGUAGES = ["Hindi", "Bengali", "Tamil", "Telugu", "Malayalam", "Kannada", "Marathi", "Gujarati", "Punjabi", "Odia", "Assamese", "Urdu"];

function parseRightsValue(value: string): { yesNo: "Yes" | "No" | ""; languages: string[] } {
  if (!value || value === "No" || value === "N" || value === "N/A") return { yesNo: "No", languages: [] };
  if (value.startsWith("Yes")) {
    const match = value.match(/^Yes\s*\((.+)\)$/);
    if (match) return { yesNo: "Yes", languages: match[1].split(",").map(l => l.trim()).filter(Boolean) };
    return { yesNo: "Yes", languages: [] };
  }
  return { yesNo: "", languages: [] };
}

function buildRightsValue(yesNo: string, languages: string[]): string {
  if (yesNo !== "Yes") return yesNo === "No" ? "No" : "";
  if (languages.length === 0) return "Yes";
  return `Yes (${languages.join(", ")})`;
}

// ── Simple Yes/No dropdown (Prequel/Sequel, Character) ──────────────────────
interface YesNoFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputCls: string;
  selectCls: string;
  labelCls: string;
}

export function YesNoField({ label, value, onChange, inputCls: _inputCls, selectCls, labelCls }: YesNoFieldProps) {
  const yesNo = value === "Yes" || value.startsWith("Yes") ? "Yes"
    : value === "No" || value === "N" || value === "N/A" ? "No"
    : value ? "__other__" : "";

  return (
    <div className="space-y-2">
      <label className={labelCls}>{label}</label>
      <Select value={yesNo === "__other__" ? "" : yesNo} onValueChange={(v) => onChange(v === "Yes" ? "Yes" : v === "No" ? "No" : "")}>
        <SelectTrigger className={selectCls}><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="Yes">Yes</SelectItem>
          <SelectItem value="No">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Yes/No + language multi-select (Subtitling, Dubbing) ────────────────────
interface YesNoLangFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  selectCls: string;
  inputCls: string;
  labelCls: string;
}

export function YesNoLangField({ label, value, onChange, selectCls, inputCls, labelCls }: YesNoLangFieldProps) {
  const parsed = parseRightsValue(value);
  const [yesNo, setYesNo] = useState<"Yes" | "No" | "">(parsed.yesNo);
  const [languages, setLanguages] = useState<string[]>(parsed.languages);
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    const p = parseRightsValue(value);
    setYesNo(p.yesNo);
    setLanguages(p.languages);
  }, [value]);

  const emit = (nextYesNo: "Yes" | "No" | "", nextLangs: string[]) => {
    onChange(buildRightsValue(nextYesNo, nextLangs));
  };

  const handleYesNoChange = (v: string) => {
    const next = v as "Yes" | "No" | "";
    setYesNo(next);
    const nextLangs = next === "Yes" ? languages : [];
    setLanguages(nextLangs);
    setShowCustom(false);
    setCustomInput("");
    emit(next, nextLangs);
  };

  const addLanguage = (lang: string) => {
    if (!lang || languages.includes(lang)) return;
    const next = lang === "All" ? ["All"] : [...languages.filter(l => l !== "All"), lang];
    setLanguages(next);
    emit(yesNo, next);
  };

  const removeLanguage = (lang: string) => {
    const next = languages.filter(l => l !== lang);
    setLanguages(next);
    emit(yesNo, next);
  };

  const handleCustomAdd = () => {
    const trimmed = customInput.trim();
    if (trimmed) { addLanguage(trimmed); setCustomInput(""); setShowCustom(false); }
  };

  const availablePresets = PRESET_LANGUAGES.filter(l => !languages.includes(l) && !languages.includes("All"));

  return (
    <div className="space-y-2">
      <label className={labelCls}>{label}</label>

      <div className="flex gap-2 items-start">
        {/* Yes/No — fixed narrow width */}
        <div className="w-24 shrink-0">
          <Select value={yesNo} onValueChange={handleYesNoChange}>
            <SelectTrigger className={selectCls}><SelectValue placeholder="…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Language controls — right side, only when Yes */}
        {yesNo === "Yes" && (
          <div className="flex-1 space-y-1.5 animate-in fade-in slide-in-from-left-1 duration-200">
            {!languages.includes("All") && (
              <Select
                value=""
                onValueChange={(v) => {
                  if (v === "__custom__") { setShowCustom(true); return; }
                  addLanguage(v);
                  setShowCustom(false);
                  setCustomInput("");
                }}
              >
                <SelectTrigger className={selectCls}><SelectValue placeholder="Add language…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  {availablePresets.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  <SelectItem value="__custom__">Custom…</SelectItem>
                </SelectContent>
              </Select>
            )}

            {languages.includes("All") && (
              <Select value="" onValueChange={(v) => { if (v === "remove_all") removeLanguage("All"); }}>
                <SelectTrigger className={selectCls}><SelectValue placeholder="All languages" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="remove_all">Remove "All" — pick specific</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Custom input — only shown after selecting Custom… */}
            {showCustom && !languages.includes("All") && (
              <Input
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleCustomAdd(); } }}
                placeholder="Type language, press Enter"
                className={inputCls}
                autoFocus
              />
            )}

            {/* Selected chips */}
            {languages.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {languages.map(l => (
                  <Badge key={l} variant="secondary" className="gap-1 pr-1 bg-(--bg-deep) text-(--text) border-(--svf-border) text-xs">
                    {l}
                    <button type="button" onClick={() => removeLanguage(l)} className="ml-0.5 rounded-full hover:bg-(--hover) p-0.5">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
