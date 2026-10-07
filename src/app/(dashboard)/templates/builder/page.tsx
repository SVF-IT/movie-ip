"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAppToast } from "@/hooks/use-app-toast";
import {
  createTemplate,
  getTemplate,
  getTemplateCertifications,
  getTemplateLanguages,
  getTemplateLicensors,
  getTemplateWtpOptions,
  getPlatformNamesForType,
  runTemplate,
  updateTemplate,
  type FilterOption,
} from "@/lib/api/templates";
import {
  newDefinition,
  describeDefinition,
  FAMILY_LABELS,
  getBaseRules,
  isCombinationReady,
  SORT_OPTIONS,
  SOURCE_OPTIONS,
  TEMPLATE_TYPES,
  WINDOW_PRESETS,
  type RightsFamily,
  type SourceOption,
  type TemplateDefinition,
  type TemplateSort,
  type TemplateType,
} from "@/lib/types/templates";
import { TERRITORY_PRESETS } from "@/lib/utils/exclusivity";
import {
  EXPLOITATION_TYPE_LABELS,
  INTERNET_EXPLOITATION_TYPES,
  type ExploitationType,
} from "@/lib/utils/holdbacks";
import {
  ArrowLeft,
  CalendarRange,
  Check,
  Eye,
  Info,
  Loader2,
  Lock,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

/** Today as an ISO date, for the window presets. */
function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-(--border) bg-(--surface) p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--svf-accent-soft) text-sm font-semibold text-(--svf-accent)">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold leading-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-(--text-faint)">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function BuilderInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useAppToast();
  const editingId = params.get("id");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [def, setDef] = useState<TemplateDefinition>(newDefinition);
  const [loading, setLoading] = useState(!!editingId);
  const [saving, setSaving] = useState(false);

  const [languages, setLanguages] = useState<FilterOption[]>([]);
  const [certifications, setCertifications] = useState<FilterOption[]>([]);
  const [licensors, setLicensors] = useState<FilterOption[]>([]);
  const [wtpOptions, setWtpOptions] = useState<FilterOption[]>([]);
  const [buyerPlatforms, setBuyerPlatforms] = useState<string[]>([]);
  // A territory outside the three presets is typed in.
  const [useCustomTerritory, setUseCustomTerritory] = useState(false);

  const [preview, setPreview] = useState<{ total: number; now: number; later: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const baseRules = getBaseRules(def.templateType, def.rights.family, def.rights.exploitationType);
  const ready = isCombinationReady(def.templateType, def.rights.family, def.rights.exploitationType);

  useEffect(() => {
    (async () => {
      const [langs, certs, lics, wtps] = await Promise.all([
        getTemplateLanguages(),
        getTemplateCertifications(),
        getTemplateLicensors(),
        getTemplateWtpOptions(),
      ]);
      setLanguages(langs);
      setCertifications(certs);
      setLicensors(lics);
      setWtpOptions(wtps);
    })();
  }, []);

  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    (async () => {
      const t = await getTemplate(editingId);
      if (cancelled) return;
      if (t) {
        setName(t.name);
        setDescription(t.description || "");
        setDef(t.definition);
        // A saved template may carry a territory that is not a preset.
        if (t.definition.filters.territory && !TERRITORY_PRESETS.includes(t.definition.filters.territory)) {
          setUseCustomTerritory(true);
        }
      } else {
        toast.error("Template not found");
        router.push("/templates");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // toast/router are stable here; re-running would discard in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  // The buyers on offer depend on the sub-type: an AVOD template lists YouTube
  // and Viacom 18, an SVOD one lists Netflix, Hotstar and the rest.
  const subTypeForBuyers = def.rights.family === "internet" ? def.rights.exploitationType : undefined;
  useEffect(() => {
    if (!subTypeForBuyers) {
      setBuyerPlatforms([]);
      return;
    }
    let cancelled = false;
    getPlatformNamesForType(subTypeForBuyers).then((names) => {
      if (!cancelled) setBuyerPlatforms(names);
    });
    return () => {
      cancelled = true;
    };
  }, [subTypeForBuyers]);

  const patch = useCallback((next: Partial<TemplateDefinition>) => {
    setDef((prev) => ({ ...prev, ...next }));
  }, []);

  const setFilter = useCallback(
    (next: Partial<TemplateDefinition["filters"]>) => {
      setDef((prev) => ({ ...prev, filters: { ...prev.filters, ...next } }));
    },
    []
  );

  // Debounced preview: every change alters the answer, but running per
  // keystroke would issue a query per character.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready) {
      setPreview(null);
      setPreviewing(false);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setPreviewing(true);
    timer.current = setTimeout(async () => {
      const res = await runTemplate(def, { limit: 1 });
      setPreview({ total: res.count, now: res.openNow, later: res.openingLater });
      setPreviewing(false);
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [def, ready]);

  const canSave = name.trim().length > 0 && !saving && ready;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const payload = { name, description, definition: def };
    const res = editingId
      ? await updateTemplate(editingId, payload)
      : await createTemplate(payload);
    setSaving(false);
    if (res.error) {
      toast.error("Could not save template", res.error);
      return;
    }
    toast.success(editingId ? "Template updated" : "Template created");
    router.push(`/templates?t=${res.data?.id ?? ""}`);
  };

  /** Switching the rights type re-seeds the suggested language filter. */
  const selectFamily = (f: RightsFamily) => {
    // Internet defaults to SVOD so the step is never left in a half-chosen
    // state; the sub-type buttons below let it be changed.
    const sub = f === "internet" ? (def.rights.exploitationType ?? "svod") : undefined;
    const next = getBaseRules(def.templateType, f, sub);
    patch({
      rights: { family: f, exploitationType: sub },
      filters: {
        ...def.filters,
        languages: next?.suggestedLanguages ?? [],
        // Buyer restrictions only exist for internet rights, so a satellite
        // template must not carry an exclusion that can never apply.
        sellingTo: f === "internet" ? def.filters.sellingTo : [],
      },
    });
  };

  const selectSubType = (t: ExploitationType) => {
    patch({
      rights: { family: "internet", exploitationType: t },
      // Buyers are per sub-type, so a YouTube choice means nothing once the
      // template is about SVOD.
      filters: { ...def.filters, sellingTo: [] },
    });
  };

  const toggleSource = (s: SourceOption) => {
    const has = def.filters.sources.includes(s);
    setFilter({
      sources: has
        ? def.filters.sources.filter((x) => x !== s)
        : [...def.filters.sources, s],
    });
  };

  const applyPreset = (days: number | null) => {
    // "Any time" still starts at today — a title that opened last year is open
    // now, so there is nothing earlier to ask for. Setting `from` explicitly
    // rather than leaving it blank puts that start date in the field where the
    // user can see and change it.
    if (days === null) {
      setFilter({ rightsWindow: { from: todayIso() } });
      return;
    }
    setFilter({
      rightsWindow:
        days === 0
          ? { from: todayIso(), to: todayIso() }
          : { from: todayIso(), to: isoInDays(days) },
    });
  };

  const win = def.filters.rightsWindow;
  // "Any time" = a start date and no end. A stored template from before this
  // carried no dates at all, which means the same thing, so both read as Any time.
  const windowIsDefault = !win.to && (!win.from || win.from === todayIso());

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-faint)" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/templates"
            className="flex items-center gap-1.5 text-sm text-(--text-faint) transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Templates
          </Link>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <SlidersHorizontal className="h-6 w-6 text-(--svf-accent)" />
            {editingId ? "Edit template" : "Create template"}
          </h1>
          <p className="max-w-2xl text-sm text-(--text-faint)">
            Pick what you are selling. The system applies the rules for that
            combination — you narrow the list, name it, and from then on it is one
            click to the current answer.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!canSave} size="lg">
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          {editingId ? "Save changes" : "Create template"}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_21rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* 1 — Template type */}
          <Step n={1} title="Template type" hint="What question should this answer?">
            <div className="grid gap-3 sm:grid-cols-3">
              {TEMPLATE_TYPES.map((t) => {
                const selected = def.templateType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    disabled={!t.available}
                    onClick={() => patch({ templateType: t.value as TemplateType })}
                    className={`rounded-lg border p-3.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected
                        ? "border-(--svf-accent) bg-(--svf-accent-soft) ring-1 ring-(--svf-accent-line)"
                        : "border-(--border) hover:border-(--svf-accent-line) hover:bg-(--hover)"
                    }`}
                  >
                    <span className="flex items-center justify-between font-medium">
                      {t.label}
                      {selected && <Check className="h-4 w-4 text-(--svf-accent)" />}
                    </span>
                    <span className="mt-1 block text-xs text-(--text-faint)">{t.help}</span>
                    {!t.available && (
                      <Badge variant="outline" className="mt-2 text-[10px] font-normal">
                        Coming soon
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </Step>

          {/* 2 — Rights type */}
          <Step n={2} title="Rights type" hint="Which right are you looking to sell?">
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(FAMILY_LABELS) as RightsFamily[]).map((f) => {
                const selected = def.rights.family === f;
                // Internet is ready as a family; the sub-type is chosen below.
                const implemented = isCombinationReady(
                  def.templateType,
                  f,
                  f === "internet" ? (def.rights.exploitationType ?? "svod") : undefined,
                );
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => selectFamily(f)}
                    className={`rounded-lg border p-3.5 text-left transition-all ${
                      selected
                        ? "border-(--svf-accent) bg-(--svf-accent-soft) ring-1 ring-(--svf-accent-line)"
                        : "border-(--border) hover:border-(--svf-accent-line) hover:bg-(--hover)"
                    }`}
                  >
                    <span className="flex items-center justify-between font-medium">
                      {FAMILY_LABELS[f].label}
                      {selected && <Check className="h-4 w-4 text-(--svf-accent)" />}
                    </span>
                    <span className="mt-1 block text-xs text-(--text-faint)">
                      {FAMILY_LABELS[f].help}
                    </span>
                    {!implemented && (
                      <Badge variant="outline" className="mt-2 text-[10px] font-normal">
                        Rules pending
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
            {def.rights.family === "internet" && (
              <div className="mt-5 border-t border-(--border) pt-4">
                <Label className="mb-2 block">Which internet right?</Label>
                <p className="mb-3 text-xs text-(--text-faint)">
                  Each sub-type is its own question — a title locked up on SVOD may
                  still be free for AVOD.
                </p>
                <div className="flex flex-wrap gap-2">
                  {INTERNET_EXPLOITATION_TYPES.map((t) => {
                    const on = def.rights.exploitationType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => selectSubType(t)}
                        className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
                          on
                            ? "border-(--st-active) bg-(--st-active)/12 text-(--st-active)"
                            : "border-(--border) text-(--text-faint) hover:border-(--st-active)/50 hover:text-foreground"
                        }`}
                      >
                        {EXPLOITATION_TYPE_LABELS[t]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Step>

          {/* 3 — Base rules */}
          <Step
            n={3}
            title="Base rules applied"
            hint="Set by the system for this combination. These always run."
          >
            {!baseRules ? (
              <div className="flex items-start gap-2 rounded-lg border border-(--st-expiring)/30 bg-(--st-expiring)/8 p-3.5 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-(--st-expiring)" />
                <p>
                  Rules for this combination have not been defined yet, so it cannot
                  be saved. Open Titles + Satellite is ready now.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(["both", "home", "acquired"] as const).map((scope) => {
                  const list = baseRules.rules.filter((r) => r.scope === scope);
                  if (list.length === 0) return null;
                  const heading =
                    scope === "both"
                      ? "All titles"
                      : scope === "home"
                        ? "Home productions"
                        : "Acquired titles";
                  return (
                    <div key={scope}>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-(--text-faint)">
                        {heading}
                      </p>
                      <ul className="space-y-1.5">
                        {list.map((r) => (
                          <li key={r.text} className="flex items-start gap-2 text-sm">
                            <Lock className="mt-0.5 h-3 w-3 shrink-0 text-(--text-faint)" />
                            <span>{r.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Step>

          {/* 4 — Filters */}
          <Step
            n={4}
            title="Add filters"
            hint="Optional. Everything is included unless you narrow it here."
          >
            <div className="space-y-5">
              <div>
                <Label className="mb-2 block">Source type</Label>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_OPTIONS.map(({ value, label }) => {
                    const on = def.filters.sources.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleSource(value)}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
                          on
                            ? "border-(--svf-accent) bg-(--svf-accent-soft) text-(--svf-accent)"
                            : "border-(--border) text-(--text-faint) hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-(--text-faint)">
                  None selected includes the whole catalogue. A Bangladeshi title may
                  also be home or acquired.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <MultiSelectFilter
                  label="Language"
                  options={languages}
                  value={def.filters.languages}
                  onChange={(v) => setFilter({ languages: v })}
                  searchable
                />
                <MultiSelectFilter
                  label="Certification"
                  options={certifications}
                  value={def.filters.certifications}
                  onChange={(v) => setFilter({ certifications: v })}
                />
                <MultiSelectFilter
                  label="Assignor / Licensor"
                  options={licensors}
                  value={def.filters.licensors}
                  onChange={(v) => setFilter({ licensors: v })}
                  searchable
                  accent="emerald"
                  triggerWidth="w-52"
                />
                <MultiSelectFilter
                  label="WTP / Library"
                  options={wtpOptions}
                  value={def.filters.wtp}
                  onChange={(v) => setFilter({ wtp: v })}
                  accent="purple"
                />
                {def.rights.family === "internet" && (
                  <MultiSelectFilter
                    label="Selling to"
                    options={buyerPlatforms}
                    value={def.filters.sellingTo}
                    onChange={(v) => setFilter({ sellingTo: v })}
                    searchable
                    accent="amber"
                    triggerWidth="w-44"
                  />
                )}
              </div>
              {def.rights.family === "internet" && (
                <p className="text-xs text-(--text-faint)">
                  {def.filters.sellingTo.length > 0 ? (
                    <>
                      Excludes titles {def.filters.sellingTo.join(" or ")}{" "}
                      {def.filters.sellingTo.length === 1 ? "already holds" : "already hold"}{" "}
                      or {def.filters.sellingTo.length === 1 ? "is" : "are"} held back from,
                      so what is left can be pitched to{" "}
                      {def.filters.sellingTo.length === 1 ? "them" : "all of them"}.
                    </>
                  ) : (
                    <>
                      Pick the buyers you are pitching to. Titles they already hold, or
                      are held back from, are excluded. Leave empty to include every title.
                    </>
                  )}
                </p>
              )}

              {/* Rights window */}
              <div className="rounded-lg border border-(--border) p-4">
                <Label className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-(--svf-accent)" />
                  Rights window
                </Label>
                <p className="mt-1 text-xs text-(--text-faint)">
                  When the title becomes open. Leave blank for every title open from
                  today onwards, however far in the future.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset(null)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      windowIsDefault
                        ? "border-(--svf-accent) bg-(--svf-accent-soft) text-(--svf-accent)"
                        : "border-(--border) text-(--text-faint) hover:text-foreground"
                    }`}
                  >
                    Any time
                  </button>
                  {WINDOW_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p.days)}
                      className="rounded-full border border-(--border) px-3 py-1 text-xs font-medium text-(--text-faint) transition-all hover:border-(--svf-accent-line) hover:text-foreground"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="win-from" className="text-xs text-(--text-faint)">
                      Opens from
                    </Label>
                    <Input
                      id="win-from"
                      type="date"
                      value={win.from || ""}
                      onChange={(e) =>
                        setFilter({ rightsWindow: { ...win, from: e.target.value || undefined } })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="win-to" className="text-xs text-(--text-faint)">
                      Opens until
                    </Label>
                    <Input
                      id="win-to"
                      type="date"
                      value={win.to || ""}
                      onChange={(e) =>
                        setFilter({ rightsWindow: { ...win, to: e.target.value || undefined } })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="territory">Territory</Label>
                  {!useCustomTerritory ? (
                    <Select
                      value={def.filters.territory}
                      onValueChange={(v) => {
                        if (v === "__custom__") {
                          setUseCustomTerritory(true);
                          setFilter({ territory: "" });
                        } else {
                          setFilter({ territory: v });
                        }
                      }}
                    >
                      <SelectTrigger id="territory">
                        <SelectValue placeholder="Select territory…" />
                      </SelectTrigger>
                      <SelectContent>
                        {TERRITORY_PRESETS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">Custom…</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={def.filters.territory}
                        onChange={(e) => setFilter({ territory: e.target.value })}
                        placeholder="e.g. South Asia, Taiwan…"
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Back to the preset list"
                        onClick={() => {
                          setUseCustomTerritory(false);
                          setFilter({ territory: "World" });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-(--text-faint)">
                    Where you are selling. Only an exclusive deal covering this
                    territory blocks a title — an exclusive India deal leaves Rest
                    of World open.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nohb">Holdbacks</Label>
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-(--border) p-3">
                    <div className="min-w-0">
                      <Label htmlFor="nohb" className="cursor-pointer text-sm font-medium">
                        Without holdbacks only
                      </Label>
                      <p className="mt-0.5 text-xs text-(--text-faint)">
                        Drops titles carrying a holdback on{" "}
                        {def.rights.family === "internet" && def.rights.exploitationType
                          ? EXPLOITATION_TYPE_LABELS[def.rights.exploitationType]
                          : "satellite"}{" "}
                        rights, including buyer restrictions such as Sony or Zee.
                        Holdbacks on other rights are ignored.
                      </p>
                    </div>
                    <Switch
                      id="nohb"
                      checked={def.filters.withoutHoldbacks}
                      onCheckedChange={(v: boolean) => setFilter({ withoutHoldbacks: v })}
                    />
                  </div>
                </div>
              </div>

              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="sort">Sort results by</Label>
                <Select
                  value={def.sort}
                  onValueChange={(v) => patch({ sort: v as TemplateSort })}
                >
                  <SelectTrigger id="sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Step>

          {/* 5 — Name */}
          <Step n={5} title="Name and save" hint="How your team will find this later.">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Template name</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Bengali Satellite — Open & Opening Soon"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-desc">
                  Description <span className="text-(--text-faint)">(optional)</span>
                </Label>
                <Textarea
                  id="tpl-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this returns and who it is for."
                  rows={2}
                />
              </div>
              <Button onClick={handleSave} disabled={!canSave} className="w-full sm:w-auto">
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                {editingId ? "Save changes" : "Create template"}
              </Button>
              {!name.trim() && (
                <p className="text-xs text-(--text-faint)">
                  Give the template a name to save it.
                </p>
              )}
            </div>
          </Step>
        </div>

        {/* Preview */}
        <aside className="lg:sticky lg:top-6">
          <div className="rounded-xl border border-(--border) bg-(--surface) p-5">
            <h3 className="flex items-center gap-2 font-semibold">
              <Eye className="h-4 w-4 text-(--svf-accent)" />
              Preview
            </h3>

            {!ready ? (
              <p className="my-6 text-center text-sm text-(--text-faint)">
                Select a combination with rules defined.
              </p>
            ) : (
              <>
                <div className="my-5 text-center">
                  {previewing ? (
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-(--text-faint)" />
                  ) : (
                    <p className="text-4xl font-semibold tabular-nums">
                      {preview?.total ?? "—"}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-(--text-faint)">
                    {preview?.total === 1 ? "title matches" : "titles match"}
                  </p>
                </div>

                {preview && preview.total > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-(--st-active)/30 bg-(--st-active)/8 p-3 text-center">
                      <p className="text-xl font-semibold tabular-nums text-(--st-active)">
                        {preview.now}
                      </p>
                      <p className="mt-0.5 text-xs text-(--text-faint)">Open now</p>
                    </div>
                    <div className="rounded-lg border border-(--st-expiring)/30 bg-(--st-expiring)/8 p-3 text-center">
                      <p className="text-xl font-semibold tabular-nums text-(--st-expiring)">
                        {preview.later}
                      </p>
                      <p className="mt-0.5 text-xs text-(--text-faint)">Opening later</p>
                    </div>
                  </div>
                )}

                <div className="mt-4 rounded-lg bg-(--hover) p-3">
                  <p className="text-xs font-medium text-(--text-faint)">This returns</p>
                  <p className="mt-1 text-sm">{describeDefinition(def)}</p>
                </div>

                {baseRules && (
                  <p className="mt-4 border-t border-(--border) pt-3 text-xs text-(--text-faint)">
                    {baseRules.rules.length} base rules applied
                  </p>
                )}

                {preview?.total === 0 && !previewing && (
                  <p className="mt-4 rounded-lg border border-(--st-expiring)/30 bg-(--st-expiring)/8 p-3 text-xs">
                    Nothing matches. Try removing a filter above.
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function TemplateBuilderPage() {
  // useSearchParams needs a Suspense boundary under the app router.
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-(--text-faint)" />
        </div>
      }
    >
      <BuilderInner />
    </Suspense>
  );
}
