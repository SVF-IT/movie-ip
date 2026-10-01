import { EXPLOITATION_TYPE_LABELS, INTERNET_EXPLOITATION_TYPES, type ExploitationType } from '@/lib/utils/holdbacks'

/**
 * A template is a saved question, not a code path.
 *
 * The purpose is commercial: marketing needs to know what SVF can sell right
 * now AND what frees up soon, so a conversation can start before the right
 * actually lapses. That is why results carry an open date, not just a flag.
 *
 * Two layers, deliberately separated:
 *
 *   BASE RULES — fixed per (template type x rights type). They define what
 *   "open" means for that combination and are shown, read-only, during
 *   creation so a number can always be traced to the rules behind it.
 *
 *   FILTERS — the user's own narrowing. Everything is included by default;
 *   narrowing is always opt-in.
 */

// ── Template type ────────────────────────────────────────────────────────────
// Only open_titles is implemented. The others are declared so the picker can
// show what is coming and so stored rows already carry the discriminator; each
// gets its own base rules, preview and export when specified.
export type TemplateType = 'open_titles' | 'platform_syndication' | 'platform_rights'

export const TEMPLATE_TYPES: {
  value: TemplateType
  label: string
  help: string
  available: boolean
}[] = [
  {
    value: 'open_titles',
    label: 'Open Titles',
    help: 'Titles free to license now, or becoming free soon.',
    available: true,
  },
  {
    value: 'platform_syndication',
    label: 'Platform Syndication',
    help: 'Syndication across platforms.',
    available: false,
  },
  {
    value: 'platform_rights',
    label: 'Platform Rights',
    help: 'Rights held per platform.',
    available: false,
  },
]

// ── Rights type ──────────────────────────────────────────────────────────────
export type RightsFamily = 'satellite' | 'internet' | 'other'

export const FAMILY_LABELS: Record<RightsFamily, { label: string; help: string }> = {
  satellite: { label: 'Satellite', help: 'Satellite TV, DTH VOD and Terrestrial TV.' },
  internet: { label: 'Internet', help: 'SVOD, AVOD, TVOD, FVOD, IPTV and NVOD.' },
  other: { label: 'Other', help: 'Airborne, shipping and other non-broadcast rights.' },
}

/**
 * Catalogue selector. Bangladeshi is a flag rather than a source in the
 * database — a title can be acquired AND Bangladeshi — but it reads as a third
 * catalogue to the people using this, so it sits in the same picker.
 */
export type SourceOption = 'home' | 'acquired' | 'bangladesh'

export const SOURCE_OPTIONS: { value: SourceOption; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'acquired', label: 'Acquired' },
  { value: 'bangladesh', label: 'Bangladesh' },
]

export type TemplateSort =
  | 'open_date_asc' | 'title_asc' | 'title_desc'
  | 'release_date_desc' | 'release_date_asc'

export const SORT_OPTIONS: { value: TemplateSort; label: string }[] = [
  { value: 'open_date_asc', label: 'Soonest open first' },
  { value: 'title_asc', label: 'Title (A–Z)' },
  { value: 'title_desc', label: 'Title (Z–A)' },
  { value: 'release_date_desc', label: 'Newest release first' },
  { value: 'release_date_asc', label: 'Oldest release first' },
]

/**
 * When the title becomes open.
 *
 * A new template opens with `from` set to today and no `to` — every title open
 * from today into the future, however far out. Today is the natural start
 * because a title that opened last year is open now, so there is nothing
 * earlier to ask for; it is set explicitly so the user sees it in the field.
 *
 * Both blank means the same thing and is still honoured, since templates saved
 * before this carry no dates.
 */
export interface RightsWindow {
  from?: string
  to?: string
}

/** Quick-picks that fill the window, so the common questions are one click. */
export const WINDOW_PRESETS: { label: string; days: number | null }[] = [
  { label: 'Open now', days: 0 },
  { label: 'Next 30 days', days: 30 },
  { label: 'Next 60 days', days: 60 },
  { label: 'Next 90 days', days: 90 },
  { label: 'Next 6 months', days: 180 },
  { label: 'Next year', days: 365 },
]

/**
 * The user's narrowing. Every field is empty/permissive by default: a template
 * covers the whole catalogue unless the user deliberately narrows it.
 */
export interface TemplateFilters
{
  /** Empty = the whole catalogue. */
  sources: SourceOption[]
  languages: string[]
  certifications: string[]
  /** movies.assignor_licensor. Home productions read as 'SVF'. */
  licensors: string[]
  /** wtp_library values as stored: 'WTP' | 'WTP/BD' | 'Library'. */
  wtp: string[]
  /**
   * Internet only: the buyers being pitched to, as platform names.
   *
   * A title is excluded when any of these already holds a live deal on this
   * right, or a holdback bars it from them — neither is a lead for that buyer,
   * even though a non-exclusive deal leaves the title open to everyone else.
   * Empty means no exclusion.
   */
  sellingTo: string[]
  /** Defaults to today onwards, i.e. every future open. */
  rightsWindow: RightsWindow
}

export interface TemplateDefinition {
  templateType: TemplateType
  rights: {
    family: RightsFamily
    /**
     * Internet only: which sub-type this template is about. Exactly one, since
     * "open for SVOD" and "open for AVOD" are different questions with
     * different rules — a title exclusive on SVOD may be free for AVOD.
     */
    exploitationType?: ExploitationType
  }
  filters: TemplateFilters
  sort: TemplateSort
}

export interface Template {
  id: string
  name: string
  description: string | null
  kind: string
  definition: TemplateDefinition
  is_builtin: boolean
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Base rules ───────────────────────────────────────────────────────────────

export interface BaseRule {
  /** Which catalogue this rule governs, for the grouped display. */
  scope: 'both' | 'home' | 'acquired'
  text: string
}

export interface BaseRuleSet {
  rules: BaseRule[]
  /** Pre-ticked in the language filter. NOT a rule — the user may clear it. */
  suggestedLanguages: string[]
}

/**
 * Open Titles + Satellite — the only specified combination.
 *
 * Every rule here is enforced in runTemplate. The wording is what the builder
 * shows, so it must stay in step with the code.
 */
const OPEN_TITLES_SATELLITE: BaseRuleSet = {
  suggestedLanguages: ['Bengali'],
  rules: [
    { scope: 'both', text: 'Only approved titles are considered.' },
    { scope: 'both', text: 'A-certified titles are excluded — they are not broadcastable.' },
    { scope: 'both', text: 'No live satellite deal attached (Satellite TV, DTH VOD, Terrestrial TV).' },
    { scope: 'both', text: 'No holdback naming Satellite on the title or on any attached platform right.' },
    { scope: 'home', text: 'Sold titles are excluded.' },
    { scope: 'home', text: 'Jointly owned titles where a partner house holds exploitation rights are excluded.' },
    { scope: 'acquired', text: 'Rights Owned must include Satellite (or Negative).' },
    { scope: 'acquired', text: 'The satellite right must not have expired; where it carries no end date, the agreement end date is used.' },
    { scope: 'acquired', text: 'Agreement End Date must be in the future or empty (perpetual).' },
  ],
}

/**
 * Open Titles + Internet, per sub-type.
 *
 * The shape is identical for each sub-type — only the name changes — so it is
 * generated rather than written six times, which would drift.
 *
 * The two rules that make internet different from satellite:
 *   - Only an EXCLUSIVE deal blocks. Shared and non-exclusive deals leave the
 *     title sellable, so they show as context instead.
 *   - A holdback naming a COMPANY ("Sony", "Zee-owned") restricts who may buy,
 *     it does not close the right. Only a holdback naming the sub-type itself
 *     blocks.
 */
function internetRules(type: ExploitationType): BaseRuleSet {
  const T = EXPLOITATION_TYPE_LABELS[type]
  return {
    suggestedLanguages: ['Bengali'],
    rules: [
      { scope: 'both', text: 'Only approved titles are considered.' },
      { scope: 'both', text: 'A-certified titles are excluded.' },
      {
        scope: 'both',
        text: `No live EXCLUSIVE ${T} deal attached. Shared-Exclusive and Non-Exclusive deals leave the title open and are shown as context.`,
      },
      { scope: 'both', text: `No holdback naming ${T} on the title or on any attached platform right.` },
      {
        scope: 'both',
        text: 'Holdbacks naming a company (e.g. "Sony", "Zee-owned and affiliated") restrict who may buy rather than closing the right — those platforms are listed as "Cannot sell to". Use the "Selling to" filter to drop titles a given buyer already holds or is barred from.',
      },
      {
        scope: 'both',
        text: 'Hoichoi is SVF\'s own OTT and non-exclusive, so a live Hoichoi deal never closes a title.',
      },
      { scope: 'home', text: 'Sold titles are excluded.' },
      { scope: 'home', text: 'Jointly owned titles where a partner house holds exploitation rights are excluded.' },
      {
        scope: 'acquired',
        text: `Rights Owned must include Internet (or Negative), and its classification must include ${T} — a blank classification means the whole Internet right is owned.`,
      },
      { scope: 'acquired', text: 'The internet right must not have expired; where it carries no end date, the agreement end date is used.' },
      { scope: 'acquired', text: 'Agreement End Date must be in the future or empty (perpetual).' },
      { scope: 'acquired', text: `No holdback naming ${T} on the owned rights either.` },
    ],
  }
}

const BASE_RULES: Record<string, BaseRuleSet> = {
  'open_titles:satellite': OPEN_TITLES_SATELLITE,
  ...Object.fromEntries(
    INTERNET_EXPLOITATION_TYPES.map((t) => [`open_titles:internet:${t}`, internetRules(t)]),
  ),
}

/**
 * The base rules for a combination, or null when none are specified yet.
 *
 * Internet keys on the sub-type too, since each is its own question.
 */
export function getBaseRules(
  t: TemplateType,
  family: RightsFamily,
  exploitationType?: ExploitationType,
): BaseRuleSet | null {
  if (family === 'internet') {
    if (!exploitationType) return null
    return BASE_RULES[`${t}:internet:${exploitationType}`] ?? null
  }
  return BASE_RULES[`${t}:${family}`] ?? null
}

/** True once a combination's rules are specified AND implemented. */
export function isCombinationReady(
  t: TemplateType,
  family: RightsFamily,
  exploitationType?: ExploitationType,
): boolean {
  if (t !== 'open_titles') return false
  if (family === 'satellite') return true
  if (family === 'internet') return !!exploitationType
  return false
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_FILTERS: TemplateFilters = {
  sources: [],
  languages: [],
  certifications: [],
  licensors: [],
  wtp: [],
  sellingTo: [],
  rightsWindow: {},
}

export const DEFAULT_DEFINITION: TemplateDefinition = {
  templateType: 'open_titles',
  rights: { family: 'satellite' },
  filters: { ...DEFAULT_FILTERS, languages: ['Bengali'] },
  sort: 'open_date_asc',
}

/**
 * A fresh definition for a new template.
 *
 * DEFAULT_DEFINITION is a module constant and so cannot carry today's date —
 * it would freeze at whenever the module first loaded. This builds the window's
 * start date at call time, so the builder opens showing today rather than an
 * empty field the user has to interpret.
 */
export function newDefinition(): TemplateDefinition {
  return {
    ...DEFAULT_DEFINITION,
    filters: {
      ...DEFAULT_DEFINITION.filters,
      rightsWindow: { from: new Date().toISOString().split('T')[0] },
    },
  }
}

/**
 * Coerce a stored definition into the shape this build understands.
 *
 * Templates outlive deploys. A row written by a newer build may carry keys this
 * one has never seen; a hand-edited row may be missing keys. Unknown keys are
 * dropped and missing ones fall back to a permissive default, so a template
 * always runs rather than throwing.
 */
export function normaliseDefinition(raw: unknown): TemplateDefinition {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>

  const templateType: TemplateType =
    d.templateType === 'platform_syndication' || d.templateType === 'platform_rights'
      ? d.templateType
      : 'open_titles'

  const family: RightsFamily =
    d.rights?.family === 'internet' || d.rights?.family === 'other' || d.rights?.family === 'satellite'
      ? d.rights.family
      : DEFAULT_DEFINITION.rights.family

  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

  const sources: SourceOption[] = Array.isArray(d.filters?.sources)
    ? d.filters.sources.filter((s: unknown): s is SourceOption =>
        s === 'home' || s === 'acquired' || s === 'bangladesh')
    : []

  const isoDate = (v: unknown): string | undefined =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined

  const sort: TemplateSort = (
    ['open_date_asc', 'title_asc', 'title_desc', 'release_date_desc', 'release_date_asc'] as const
  ).includes(d.sort) ? d.sort : 'open_date_asc'

  const exploitationType: ExploitationType | undefined =
    INTERNET_EXPLOITATION_TYPES.includes(d.rights?.exploitationType)
      ? d.rights.exploitationType
      : undefined

  return {
    templateType,
    rights: { family, exploitationType: family === 'internet' ? exploitationType : undefined },
    filters: {
      sources,
      languages: strList(d.filters?.languages),
      certifications: strList(d.filters?.certifications),
      licensors: strList(d.filters?.licensors),
      wtp: strList(d.filters?.wtp),
      // Renamed from cannotSellTo, which read as "keep these" rather than
      // "exclude titles barred from these"; older templates are still honoured.
      sellingTo: strList(d.filters?.sellingTo ?? d.filters?.cannotSellTo),
      rightsWindow: {
        from: isoDate(d.filters?.rightsWindow?.from),
        to: isoDate(d.filters?.rightsWindow?.to),
      },
    },
    sort,
  }
}

/** A one-line reading of what a template returns, for the card and header. */
export function describeDefinition(def: TemplateDefinition): string {
  // Internet names the sub-type, since that is the actual question.
  const right =
    def.rights.family === 'internet' && def.rights.exploitationType
      ? EXPLOITATION_TYPE_LABELS[def.rights.exploitationType]
      : FAMILY_LABELS[def.rights.family].label
  const parts: string[] = [`Open for ${right}`]
  const f = def.filters
  if (f.sources.length > 0) {
    parts.push(f.sources.map((s) => SOURCE_OPTIONS.find((o) => o.value === s)?.label ?? s).join(' + '))
  }
  if (f.languages.length > 0) parts.push(f.languages.join(', '))
  if (f.licensors.length > 0) {
    parts.push(f.licensors.length === 1 ? f.licensors[0] : `${f.licensors.length} licensors`)
  }
  if (f.wtp.length > 0) parts.push(f.wtp.join('/'))
  if (f.sellingTo.length > 0) parts.push(`pitchable to ${f.sellingTo.join(', ')}`)
  // Only an end date is a real narrowing; a start date alone is the default
  // "from today onwards" and does not need spelling out.
  if (f.rightsWindow.to) {
    parts.push(`opening ${f.rightsWindow.from || 'today'} → ${f.rightsWindow.to}`)
  }
  return parts.join(' · ')
}
