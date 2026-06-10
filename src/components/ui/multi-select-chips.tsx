"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectChipsProps {
  value: string;          // comma-separated stored value
  onChange: (v: string) => void;
  options: string[];      // preset options shown in dropdown
  placeholder?: string;
  allowCustom?: boolean;  // show "Custom…" entry + free-type input
  className?: string;
  triggerCls?: string;
}

function parse(raw: string): string[] {
  return raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];
}
function serialize(items: string[]): string {
  return items.join(",");
}

export function MultiSelectChips({
  value,
  onChange,
  options,
  placeholder = "Select…",
  allowCustom = true,
  triggerCls,
}: MultiSelectChipsProps) {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = parse(value);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustomInput(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (item: string) => {
    const next = selected.includes(item)
      ? selected.filter(s => s !== item)
      : [...selected, item];
    onChange(serialize(next));
  };

  const remove = (item: string) => {
    onChange(serialize(selected.filter(s => s !== item)));
  };

  const addCustom = () => {
    const t = customInput.trim();
    if (t && !selected.includes(t)) {
      onChange(serialize([...selected, t]));
    }
    setCustomInput("");
    setShowCustomInput(false);
  };

  const available = options.filter(o => !selected.includes(o));

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setShowCustomInput(false); }}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 rounded-md border text-sm text-left",
          "bg-(--bg-raise)/40 border-(--svf-border) text-(--text) h-9",
          "hover:border-slate-600/60 transition-colors",
          triggerCls
        )}
      >
        <span className={selected.length === 0 ? "text-(--text-faint)" : "text-(--text) truncate"}>
          {selected.length === 0 ? placeholder : selected.join(", ")}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-(--text-faint) shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Chips row */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(item => (
            <Badge key={item} variant="secondary" className="gap-1 pr-1 bg-slate-800 text-(--text) border-(--svf-border) text-xs">
              {item}
              <button
                type="button"
                onClick={() => remove(item)}
                className="ml-0.5 rounded-full hover:bg-slate-700 p-0.5"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-0.5 rounded-md border border-(--svf-border)/60 bg-(--panel-solid) shadow-xl max-h-52 overflow-y-auto">
          {available.length === 0 && !allowCustom && (
            <p className="px-3 py-2 text-xs text-(--text-faint)">All options selected</p>
          )}
          {available.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { toggle(opt); }}
              className="w-full text-left px-3 py-1.5 text-sm text-(--text) hover:bg-slate-800 hover:text-(--text) transition-colors"
            >
              {opt}
            </button>
          ))}
          {allowCustom && !showCustomInput && (
            <button
              type="button"
              onClick={() => setShowCustomInput(true)}
              className="w-full text-left px-3 py-1.5 text-sm text-(--text-faint) hover:bg-slate-800 hover:text-(--text) border-t border-(--svf-border) transition-colors"
            >
              + Custom…
            </button>
          )}
          {allowCustom && showCustomInput && (
            <div className="px-2 py-2 border-t border-(--svf-border)">
              <Input
                value={customInput}
                autoFocus
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } if (e.key === "Escape") setShowCustomInput(false); }}
                placeholder="Type and press Enter"
                className="h-7 text-xs bg-(--bg-raise)/60 border-(--svf-border) text-(--text) placeholder:text-(--text-faint)"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
