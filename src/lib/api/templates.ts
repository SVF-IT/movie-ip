import { createClient } from '@/lib/supabase/client'
import type { MovieWithDetails } from '@/lib/types/database'
import {
  anyClassificationAllowsType,
  buildHoldbackInfo,
  filterHoldbackTextForTypes,
  flattenHoldbackInfo,
  holdsBackType,
  type ExploitationType,
  type HoldbackInfo,
} from '@/lib/utils/holdbacks'
import {
  blocksFurtherSale,
  EXCLUSIVITY_LABELS,
  namedPlatformRestrictions,
  readExclusivity,
  readTerritory,
  territoryCovers,
} from '@/lib/utils/exclusivity'
import {
  normaliseDefinition,
  type Template,
  type TemplateDefinition,
} from '@/lib/types/templates'
import { NONE_KEY } from '@/lib/utils/rights-types'

const supabase = createClient()

const CHUNK_SIZE = 200

// ── Template CRUD ────────────────────────────────────────────────────────────

function hydrate(row: any): Template {
  return { ...row, definition: normaliseDefinition(row.definition) } as Template
}

export async function getTemplates(kind = 'open_titles'): Promise<Template[]> {
  try {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('kind', kind)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) throw error
    return (data || []).map(hydrate)
  } catch (error) {
    console.error('Error fetching templates:', error)
    return []
  }
}

export async function getTemplate(id: string): Promise<Template | null> {
  try {
    const { data, error } = await supabase.from('templates').select('*').eq('id', id).single()
    if (error) throw error
    return data ? hydrate(data) : null
  } catch (error) {
    console.error('Error fetching template:', error)
    return null
  }
}

export async function createTemplate(input: {
  name: string
  description?: string | null
  definition: TemplateDefinition
}): Promise<{ data: Template | null; error: string | null }> {
  try {
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('templates')
      .insert({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        kind: input.definition.templateType,
        definition: input.definition,
        created_by: userData?.user?.id ?? null,
      })
      .select()
      .single()
    if (error) throw error
    return { data: hydrate(data), error: null }
  } catch (error: any) {
    console.error('Error creating template:', error)
    return { data: null, error: error?.message || 'Could not create template' }
  }
}

export async function updateTemplate(
  id: string,
  input: { name?: string; description?: string | null; definition?: TemplateDefinition },
): Promise<{ data: Template | null; error: string | null }> {
  try {
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description?.trim() || null
    if (input.definition !== undefined) {
      patch.definition = input.definition
      patch.kind = input.definition.templateType
    }
    const { data, error } = await supabase.from('templates').update(patch).eq('id', id).select().single()
    if (error) throw error
    return { data: hydrate(data), error: null }
  } catch (error: any) {
    console.error('Error updating template:', error)
    return { data: null, error: error?.message || 'Could not update template' }
  }
}

export async function deleteTemplate(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('templates').delete().eq('id', id)
    if (error) throw error
    return { error: null }
  } catch (error: any) {
    console.error('Error deleting template:', error)
    return { error: error?.message || 'Could not delete template' }
  }
}

// ── Satellite platform classification ────────────────────────────────────────
// platform_type is free text, so these read it the way the catalogue does
// rather than assuming the seeded spellings are the only ones present.

function isSatellitePlatform(pt: string): boolean {
  const n = (pt || '').toLowerCase()
  return n.includes('satellite') || n.includes('dth') || n.includes('terrestrial') || n.includes('cable')
}

/** platform_type read as an internet sub-type, or null when it is not one. */
function internetTypeOf(pt: string): ExploitationType | null {
  const n = (pt || '').trim().toLowerCase()
  if (n === 'svod') return 'svod'
  if (n === 'avod') return 'avod'
  if (n === 'tvod') return 'tvod'
  if (n === 'fvod') return 'fvod'
  if (n === 'iptv') return 'iptv'
  if (n === 'nvod') return 'nvod'
  return null
}

/** Does this platform exploit the right the template is about? */
function platformMatchesRight(
  pt: string,
  family: 'satellite' | 'internet',
  right: ExploitationType,
): boolean {
  return family === 'satellite' ? isSatellitePlatform(pt) : internetTypeOf(pt) === right
}

/**
 * A platform right only encumbers a title while it is itself live.
 *
 * is_current and the end date are checked together: a stale is_current row
 * whose end date has passed is no longer an exploitation, and its holdbacks
 * encumber nothing. Every gate and every display reads this, so what the
 * results show always matches what the rules applied.
 */
function isLivePlatformRight(r: any, today: string): boolean {
  if (r?.is_current === false) return false
  return !r?.end_date || r.end_date >= today
}

/** Hoichoi is SVF's own OTT, so its deals never close a title. */
function isHoichoiPlatform(name: string): boolean {
  return (name || '').toLowerCase().includes('hoichoi')
}

/**
 * Every platform name on record.
 *
 * Used to tell a company holdback ("Sony", "Zee-owned and affiliated") from a
 * category one ("SVOD"). Reading it from the table means adding a platform
 * teaches the matcher without a code change.
 */
async function fetchPlatformNames(): Promise<string[]> {
  const { data } = await supabase.from('platforms').select('name')
  return Array.from(
    new Set<string>((data || []).map((r: any) => (r.name || '').trim()).filter(Boolean)),
  )
}

async function fetchPlatformRightsChunked(movieIds: string[]): Promise<any[]> {
  if (movieIds.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < movieIds.length; i += CHUNK_SIZE) chunks.push(movieIds.slice(i, i + CHUNK_SIZE))
  const settled = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from('platform_rights')
        .select('movie_id, start_date, end_date, holdbacks, is_current, nature, platforms(name, platform_type)')
        .in('movie_id', chunk),
    ),
  )
  const out: any[] = []
  for (const { data } of settled) if (data) out.push(...data)
  return out
}

interface MovieRightsRow {
  movie_id: string
  right_type: string
  end_date: string | null
  holdbacks: string | null
  classification: string | null
  nature: string | null
}

async function fetchMovieRights(movieIds: string[], rightTypes: string[]): Promise<MovieRightsRow[]> {
  if (movieIds.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < movieIds.length; i += CHUNK_SIZE) chunks.push(movieIds.slice(i, i + CHUNK_SIZE))
  const settled = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from('movie_rights')
        .select('movie_id, right_type, end_date, holdbacks, classification, nature')
        .in('movie_id', chunk)
        .in('right_type', rightTypes),
    ),
  )
  const out: MovieRightsRow[] = []
  for (const { data } of settled) for (const row of data || []) out.push(row as MovieRightsRow)
  return out
}

/**
 * Does a movie's field value satisfy a multi-select filter?
 *
 * A blank, null or whitespace-only value is matched by NONE_KEY, so titles with
 * the field unset stay reachable. Without this they were unfilterable AND were
 * dropped whenever any selection was made — including "select all", which must
 * behave exactly like selecting nothing.
 */
function matchesValueFilter(value: unknown, selected: string[]): boolean {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) return selected.includes(NONE_KEY)
  return selected.includes(v)
}

/**
 * Certification match, tolerating the several spellings of the same certificate.
 *
 * The catalogue holds 'UA', 'U/A' and 'UA 13+' style variants for what is one
 * certificate, so ticking any UA variant matches them all.
 */
function matchesCertification(value: unknown, selected: string[]): boolean {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) return selected.includes(NONE_KEY)
  if (selected.includes(v)) return true
  const isUaVariant = (c: string) => c === 'UA' || c === 'U/A' || /^UA\b/.test(c) || /^U\/A\b/.test(c)
  return isUaVariant(v) && selected.some(isUaVariant)
}

/**
 * Jointly-owned home titles where the named exploitation-rights holder is not
 * SVF. Free text, so matching tolerates casing, whitespace and the
 * "SVF Entertainment" long form. Blank is permissive: it means unrecorded, not
 * someone else's, and blanking a field should not silently drop a title.
 */
function heldByOtherHouse(m: any): boolean {
  if (m.jointly_owned !== true) return false
  const holder = (m.jointly_exploitation_rights || '').trim()
  if (!holder) return false
  return !/^svf\b/i.test(holder)
}

// ── Result shape ─────────────────────────────────────────────────────────────

/** What is currently standing between a title and being sellable. */
export interface AttachedRight {
  /** Platform name, or the source of a holdback. */
  label: string
  kind: 'deal' | 'holdback' | 'owned_right'
  startDate: string | null
  /** null = perpetual: this never clears. */
  endDate: string | null
}

export type TemplateResultRow = MovieWithDetails & {
  /** null when the title is open today. */
  opensOn: string | null
  /** 0 when open today; null when it never opens (a perpetual blocker). */
  opensInDays: number | null
  attached: AttachedRight[]
  /**
   * Platforms a holdback bars as buyers. The title is still open — these only
   * say who cannot have it, so the sales team keeps the lead and the caveat.
   */
  cannotSellTo: string[]
  holdback_info: HoldbackInfo
  holdback_summary: string
}

export interface TemplateRunResult {
  data: TemplateResultRow[]
  count: number
  /** Every matching row, for export — the table paginates, the export does not. */
  all: TemplateResultRow[]
  /** Split of the matching set, for the preview panel. */
  openNow: number
  openingLater: number
}

const EMPTY: TemplateRunResult = { data: [], count: 0, all: [], openNow: 0, openingLater: 0 }

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso + 'T00:00:00Z').getTime() - new Date(fromIso + 'T00:00:00Z').getTime()
  return Math.ceil(ms / 86_400_000)
}

/** The day after a right ends is the first day the title is free. */
function dayAfter(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().split('T')[0]
}

/**
 * Run a stored definition.
 *
 * Only Open Titles + Satellite is implemented. Other combinations return empty
 * rather than guessing at rules that have not been specified — a wrong "open"
 * would put a title in front of a buyer that SVF cannot actually sell.
 */
export async function runTemplate(
  def: TemplateDefinition,
  overrides?: { search?: string; limit?: number; offset?: number },
): Promise<TemplateRunResult> {
  if (def.templateType !== 'open_titles') return EMPTY
  const family = def.rights.family
  if (family !== 'satellite' && family !== 'internet') return EMPTY
  // Internet is asked one sub-type at a time — "open for SVOD" and "open for
  // AVOD" are different questions with different answers.
  const subType = def.rights.exploitationType
  if (family === 'internet' && !subType) return EMPTY
  // The exploitation type every check is about.
  const RIGHT: ExploitationType = family === 'satellite' ? 'satellite' : subType!
  // The territory the template is selling into. Blank means World.
  const askingTerritory = readTerritory(def.filters.territory)

  try {
    const today = new Date().toISOString().split('T')[0]
    const { filters } = def

    let query = supabase.from('movies_with_details').select('*').eq('approval_status', 'approved')

    if (overrides?.search) {
      const term = overrides.search.replace(/[%,()]/g, '').trim()
      if (term) query = query.or(`title.ilike.%${term}%,production_no.ilike.%${term}%`)
    }
    const { data: rawMovies, error } = await query
    if (error) throw error

    let movies = (rawMovies || []) as any[]

    // ── Value filters ────────────────────────────────────────────────────────
    // Applied here rather than as SQL `.in()` clauses, because `.in()` can never
    // match a NULL: `NULL IN ('U','A')` is unknown, not true. That silently
    // dropped every title with a blank certification, language or WTP even when
    // the user had ticked every option — selecting all is meant to be identical
    // to selecting none. Blanks are matched through NONE_KEY instead, the same
    // way the rights and expiring pages already handle them.
    if (filters.languages.length > 0) {
      movies = movies.filter((m) => matchesValueFilter(m.language, filters.languages))
    }
    if (filters.certifications.length > 0) {
      movies = movies.filter((m) => matchesCertification(m.certification, filters.certifications))
    }
    if (filters.wtp.length > 0) {
      movies = movies.filter((m) => matchesValueFilter(m.wtp_library, filters.wtp))
    }

    // ── User narrowing ───────────────────────────────────────────────────────
    // Empty means everything: a template covers the whole catalogue unless the
    // user deliberately narrows it.
    //
    // The three options are not mutually exclusive in the data — an acquired
    // title can also be Bangladeshi — so this is a union: a title matching ANY
    // selected option is kept.
    if (filters.sources.length > 0) {
      movies = movies.filter((m) => {
        if (filters.sources.includes('home') && m.source === 'home_production') return true
        if (filters.sources.includes('acquired') && m.source === 'acquired') return true
        if (filters.sources.includes('bangladesh') && m.is_bangladeshi === true) return true
        return false
      })
    }

    // Licensor. Home productions have no assignor_licensor of their own — SVF is
    // the licensor — so they answer to 'SVF', matching how the catalogue reads it.
    // An acquired title with the field left blank answers to "— Not set —".
    if (filters.licensors.length > 0) {
      movies = movies.filter((m) =>
        matchesValueFilter(
          m.source === 'home_production' ? 'SVF' : m.assignor_licensor,
          filters.licensors,
        ),
      )
    }

    // ── Base rule: A-certified titles are not broadcastable ──────────────────
    // Satellite only. Broadcast is regulated; streaming is not, so an
    // A-certificate film is perfectly sellable to SVOD, AVOD and the rest.
    if (family === 'satellite') {
      movies = movies.filter((m) => (m.certification || '').trim().toUpperCase() !== 'A')
    }

    // ── Base rules: home exclusions ──────────────────────────────────────────
    movies = movies.filter((m) => {
      if (m.source !== 'home_production') return true
      // home_sold is the current flag; a "Sold" marker in the joint-rights text
      // is the legacy form still present on imported rows. Both mean sold.
      if (m.home_sold === true) return false
      if (/sold/i.test(m.jointly_exploitation_rights || '')) return false
      if (heldByOtherHouse(m)) return false
      return true
    })

    // ── Base rules: acquired eligibility ─────────────────────────────────────
    const acquiredIds = movies.filter((m) => m.source === 'acquired').map((m) => m.id)
    const ownedTypes = family === 'satellite' ? ['Satellite', 'Negative'] : ['Internet', 'Negative']
    const mrRows = await fetchMovieRights(acquiredIds, ownedTypes)
    const mrByMovie = new Map<string, MovieRightsRow[]>()
    for (const r of mrRows) {
      const list = mrByMovie.get(r.movie_id) || []
      list.push(r)
      mrByMovie.set(r.movie_id, list)
    }

    movies = movies.filter((m) => {
      if (m.source !== 'acquired') return true

      // Rights Owned must include the family's right type.
      const owned = mrByMovie.get(m.id)
      if (!owned || owned.length === 0) return false

      // Internet: the classification must name the sub-type. A blank
      // classification means the whole Internet right was acquired, so it
      // permits everything — that is the convention the catalogue already uses.
      if (family === 'internet') {
        const classifications = owned.map((r) => r.classification)
        if (!anyClassificationAllowsType(classifications, RIGHT)) return false
      }

      // Satellite end date: the most generous wins; null means perpetual.
      let satEnd: string | null | undefined
      for (const r of owned) {
        if (r.end_date === null) { satEnd = null; break }
        if (satEnd === undefined || (satEnd !== null && r.end_date && r.end_date > satEnd)) {
          satEnd = r.end_date
        }
      }
      // Where the right carries no end date of its own, the agreement's date
      // governs whether SVF still holds it.
      const effectiveEnd = satEnd === undefined ? (m.agreement_end_date ?? null) : satEnd
      if (effectiveEnd !== null && effectiveEnd < today) return false

      // Agreement End Date must be in the future or empty (perpetual).
      if (m.agreement_end_date && m.agreement_end_date < today) return false

      return true
    })

    // ── Blockers: live deals and holdbacks ───────────────────────────────────
    const candidateIds = movies.map((m) => m.id)
    const [platformRights, platformNames] = await Promise.all([
      fetchPlatformRightsChunked(candidateIds),
      fetchPlatformNames(),
    ])
    const prByMovie = new Map<string, any[]>()
    for (const r of platformRights) {
      const list = prByMovie.get(r.movie_id) || []
      list.push(r)
      prByMovie.set(r.movie_id, list)
    }

    const rows: TemplateResultRow[] = []


    for (const m of movies) {
      const attached: AttachedRight[] = []
      // Every blocker's end date. resolveOpenDate turns these into the day the
      // title actually becomes sellable.
      const blockers: (string | null)[] = []
      const note = (end: string | null) => blockers.push(end)

      const rights = prByMovie.get(m.id) || []
      // Companies a holdback bars as buyers. These never close the right — they
      // narrow who it can be sold to — so they are collected for display.
      const cannotSellTo = new Set<string>()
      // Platforms already holding a live deal on this right. A non-exclusive
      // deal leaves the title open to OTHER buyers, but not to this one again,
      // so "selling to" must exclude it.
      const alreadyWith = new Set<string>()
      // Holdback text from deals of the SAME family as the right being sold,
      // which is what the "without holdbacks" filter weighs.
      const sameFamilyHoldbacks: string[] = []

      for (const r of rights) {
        const platformType = r.platforms?.platform_type || ''
        const platformName = r.platforms?.name || 'Platform'
        if (!isLivePlatformRight(r, today)) continue

        const onThisRight = platformMatchesRight(platformType, family, RIGHT)

        if (onThisRight) {
          // Hoichoi is SVF's own OTT and non-exclusive, so a Hoichoi deal never
          // closes a title — it is not even worth showing as an encumbrance.
          const inHouse = family === 'internet' && isHoichoiPlatform(platformName)
          // A deal only blocks where it actually applies. An exclusive India
          // deal leaves Rest of World free to sell, so the territories must
          // overlap before exclusivity matters at all. A right with no
          // territory recorded covers World.
          const dealTerritory = readTerritory(r.territory)
          // The deal only blocks where it actually grants the territory being
          // sold into. An exclusive India deal leaves Rest of World sellable.
          const sameTerritory = territoryCovers(dealTerritory, askingTerritory)
          // Only an exclusive deal stops another sale. Shared and non-exclusive
          // deals leave the title sellable, so they are shown as context.
          const blocks = !inHouse && sameTerritory && blocksFurtherSale(r.nature, RIGHT)

          if (!inHouse) {
            const nature = EXCLUSIVITY_LABELS[readExclusivity(r.nature, RIGHT)]
            // Name the territory when it is not the World default, so a row
            // that stays open despite a live exclusive deal explains itself.
            const where = dealTerritory === 'World' ? '' : ` — ${dealTerritory}`
            attached.push({
              label: blocks ? `${platformName}${where}` : `${platformName} (${nature}${where})`,
              kind: 'deal',
              startDate: r.start_date ?? null,
              endDate: r.end_date ?? null,
            })
          }
          if (blocks) note(r.end_date ?? null)
          // Already-with only counts where the deal actually applies: the same
          // buyer can take the title in a territory they do not yet hold.
          if (!inHouse && sameTerritory) alreadyWith.add(platformName)
        }

        // Holdbacks are only weighed on deals of the same family. A holdback
        // written on an internet deal says nothing about satellite, and vice
        // versa — reading across families would exclude titles for a
        // restriction that does not apply to the right being sold.
        const sameFamily =
          family === 'satellite'
            ? isSatellitePlatform(platformType)
            : internetTypeOf(platformType) !== null
        if (sameFamily && r.holdbacks) sameFamilyHoldbacks.push(r.holdbacks)

        // A holdback naming the RIGHT ITSELF closes it while that deal is live.
        if (holdsBackType(r.holdbacks, RIGHT)) {
          attached.push({
            label: `${platformName} holdback`,
            kind: 'holdback',
            startDate: r.start_date ?? null,
            endDate: r.end_date ?? null,
          })
          note(r.end_date ?? null)
        }

        // A holdback naming a COMPANY only says who cannot buy — and only on a
        // deal of this family, for the same reason as above.
        if (sameFamily) {
          for (const p of namedPlatformRestrictions(r.holdbacks, platformNames)) cannotSellTo.add(p)
        }
      }

      // Movie-wide holdback. It carries no date of its own, so it blocks
      // indefinitely — there is nothing to count down to.
      // The movie-wide holdback carries no date of its own, so it blocks for as
      // long as the title is held — which for an acquired title means until the
      // agreement lapses. note(null) marks it perpetual; the agreement boundary
      // applied below turns that into a real open date where one exists.
      for (const p of namedPlatformRestrictions(m.syndication_holdback, platformNames)) cannotSellTo.add(p)
      if (holdsBackType(m.syndication_holdback, RIGHT)) {
        attached.push({
          label: 'Movie-wide holdback',
          kind: 'holdback',
          startDate: null,
          endDate: m.agreement_end_date ?? null,
        })
        note(null)
      }

      // Acquired titles can also carry a holdback on the right they own.
      //
      // Only while that right is still held: a holdback recorded against a
      // right SVF no longer owns encumbers nothing, and letting it block would
      // hide a title that is in fact free to sell. The agreement end date
      // governs where the right carries no end date of its own.
      const liveOwnedRights = (mrByMovie.get(m.id) || []).filter((r) => {
        const end = r.end_date ?? m.agreement_end_date ?? null
        return end === null || end >= today
      })
      for (const r of liveOwnedRights) {
        for (const p of namedPlatformRestrictions(r.holdbacks, platformNames)) cannotSellTo.add(p)
        if (holdsBackType(r.holdbacks, RIGHT)) {
          attached.push({
            label: `Rights-level holdback (${r.right_type})`,
            kind: 'owned_right',
            startDate: null,
            endDate: r.end_date ?? null,
          })
          note(r.end_date ?? null)
        }
      }

      let { opensOn: resolvedOpensOn, never } = resolveOpenDate(blockers)

      // The agreement is the outer boundary on every blocker beneath it.
      //
      // A blocker with no end date is perpetual only in its own terms: a
      // holdback recorded against an acquired title cannot outlive the
      // agreement that granted it. So where the movie has an agreement end
      // date, that date resolves the blocker — the title opens the day after
      // the agreement lapses rather than never.
      //
      // Home productions have no agreement, so a perpetual blocker there really
      // is perpetual and the title is dropped as before.
      if (never && m.agreement_end_date) {
        const freeAfterAgreement = dayAfter(m.agreement_end_date)
        never = false
        resolvedOpensOn =
          resolvedOpensOn === null || freeAfterAgreement > resolvedOpensOn
            ? freeAfterAgreement
            : resolvedOpensOn
      }

      // A perpetual blocker with no agreement above it means the title never
      // becomes open — drop it rather than showing a countdown that never
      // arrives.
      if (never) continue

      const opensInDays = resolvedOpensOn === null ? 0 : daysBetween(today, resolvedOpensOn)

      // Rights window. Blank means today onwards — every open title, however far
      // out. `from` is compared against the day the title actually opens, so a
      // title already open counts as opening today.
      const openDay = resolvedOpensOn ?? today
      const win = filters.rightsWindow
      if (win.from && openDay < win.from) continue
      if (win.to && openDay > win.to) continue

      // What is displayed must match what the gate applied: a lapsed deal's
      // holdback is shown nowhere, or the column would explain an exclusion
      // that never happened.
      const info = buildHoldbackInfo([
        { label: 'Movie-wide', raw: filterHoldbackTextForTypes(m.syndication_holdback, [RIGHT]) },
        ...rights
          .filter((r: any) => r.holdbacks && isLivePlatformRight(r, today))
          .map((r: any) => ({
            label: `Platform right (${r.platforms?.name || 'Platform'})`,
            raw: filterHoldbackTextForTypes(r.holdbacks, [RIGHT]),
          })),
        ...liveOwnedRights
          .filter((r) => r.holdbacks)
          .map((r) => ({
            label: `Rights-level (${r.right_type})`,
            raw: filterHoldbackTextForTypes(r.holdbacks, [RIGHT]),
          })),
      ])

      const restrictions = Array.from(cannotSellTo).sort()

      // Buyer exclusion. Selecting a platform means "I am selling to this
      // buyer", so a title is dropped when it cannot be pitched to them —
      // either a holdback bars it, or they already hold a live deal on this
      // right. A title already on YouTube is not an AVOD lead for YouTube even
      // though the non-exclusive deal leaves it open to everyone else.
      // Selecting several keeps only titles pitchable to ALL of them.
      if (
        filters.sellingTo.length > 0 &&
        filters.sellingTo.some((p) => restrictions.includes(p) || alreadyWith.has(p))
      ) {
        continue
      }

      // "Without holdbacks": drop anything carrying a holdback on the right
      // being sold — a satellite holdback for a satellite template, an SVOD one
      // for an SVOD template. Company restrictions ("Sony, Zee-owned") count
      // too: they narrow the buyer list even though they do not close the right.
      //
      // Deliberately scoped: an AVOD holdback must not exclude a title from
      // SVOD results, because it says nothing about selling SVOD.
      if (filters.withoutHoldbacks) {
        const movieWide = holdsBackType(m.syndication_holdback, RIGHT)
        const onThisFamily = sameFamilyHoldbacks.some(
          (h) => holdsBackType(h, RIGHT) || namedPlatformRestrictions(h, platformNames).length > 0,
        )
        const onOwnedRights = liveOwnedRights.some(
          (r) =>
            holdsBackType(r.holdbacks, RIGHT) ||
            namedPlatformRestrictions(r.holdbacks, platformNames).length > 0,
        )
        if (movieWide || onThisFamily || onOwnedRights) continue
      }

      rows.push({
        ...m,
        language_name: m.language,
        opensOn: resolvedOpensOn,
        opensInDays,
        cannotSellTo: restrictions,
        attached,
        holdback_info: info,
        holdback_summary: flattenHoldbackInfo(info),
      } as TemplateResultRow)
    }

    // ── Sort ─────────────────────────────────────────────────────────────────
    const sort = def.sort
    rows.sort((a, b) => {
      if (sort === 'open_date_asc') {
        // Soonest-sellable first: open today, then by how soon they free up.
        if (a.opensInDays !== b.opensInDays) return (a.opensInDays ?? 0) - (b.opensInDays ?? 0)
        return (a.title || '').localeCompare(b.title || '')
      }
      if (sort === 'title_asc') return (a.title || '').localeCompare(b.title || '')
      if (sort === 'title_desc') return (b.title || '').localeCompare(a.title || '')
      if (sort === 'release_date_desc') return ((b as any).release_date || '').localeCompare((a as any).release_date || '')
      if (sort === 'release_date_asc') return ((a as any).release_date || '').localeCompare((b as any).release_date || '')
      return 0
    })

    const openNow = rows.filter((r) => r.opensInDays === 0).length
    // `all` always carries every matching row; `data` is the paged slice for
    // callers that want one. The results table scrolls instead of paging, so it
    // passes limit: 0 and reads `all`. ?? rather than || so 0 is honoured.
    const limit = overrides?.limit ?? 25
    const offset = overrides?.offset ?? 0

    return {
      data: rows.slice(offset, offset + limit),
      count: rows.length,
      all: rows,
      openNow,
      openingLater: rows.length - openNow,
    }
  } catch (error) {
    console.error('Error running template:', error)
    return EMPTY
  }
}

/**
 * Option lists for the builder's filter pickers.
 *
 * Each returns "— Not set —" as a trailing option when the catalogue actually
 * contains blanks for that field, so those titles can be selected rather than
 * being invisible. Selecting every option must return the same set as selecting
 * none, which is only true if blanks are representable.
 */
export interface FilterOption {
  value: string
  label: string
}

const NOT_SET_OPTION: FilterOption = { value: NONE_KEY, label: '— Not set —' }

function toOptions(values: string[], hasBlank: boolean): FilterOption[] {
  const opts = Array.from(new Set(values)).sort().map((v) => ({ value: v, label: v }))
  // "Not set" belongs at the end rather than sorted among real values.
  return hasBlank ? [...opts, NOT_SET_OPTION] : opts
}

/**
 * Platform names for a given exploitation type, for the "Selling to" filter.
 *
 * Drawn from the platforms table rather than from the rows on screen, so the
 * funnel offers every buyer of that kind — including ones no current result
 * mentions. An AVOD template therefore offers YouTube and Viacom 18 rather than
 * the SVOD line-up.
 */
export async function getPlatformNamesForType(type: string): Promise<string[]> {
  try {
    const { data } = await supabase.from('platforms').select('name, platform_type')
    const wanted = type.trim().toUpperCase()
    const names = (data || [])
      .filter((r: any) => (r.platform_type || '').trim().toUpperCase() === wanted)
      .map((r: any) => (r.name || '').trim())
      .filter(Boolean)
    return Array.from(new Set<string>(names)).sort()
  } catch {
    return []
  }
}

/** Back-compat alias: the results table asks for SVOD names by default. */
export async function getSvodPlatformNames(): Promise<string[]> {
  return getPlatformNamesForType('SVOD')
}

/** Distinct languages, plus "— Not set —" when some titles have none. */
export async function getTemplateLanguages(): Promise<FilterOption[]> {
  try {
    const { data } = await supabase.from('movies').select('language')
    const values: string[] = []
    let hasBlank = false
    for (const r of (data || []) as any[]) {
      const v = (r.language || '').trim()
      if (v) values.push(v)
      else hasBlank = true
    }
    return toOptions(values, hasBlank)
  } catch {
    return []
  }
}

/** Distinct certifications, plus "— Not set —" when some titles have none. */
export async function getTemplateCertifications(): Promise<FilterOption[]> {
  try {
    const { data } = await supabase.from('movies').select('certification')
    const values: string[] = []
    let hasBlank = false
    for (const r of (data || []) as any[]) {
      const v = (r.certification || '').trim()
      if (v) values.push(v)
      else hasBlank = true
    }
    return toOptions(values, hasBlank)
  } catch {
    return []
  }
}

/**
 * Distinct licensors, plus "— Not set —" when some acquired titles have none.
 *
 * Home productions carry no assignor_licensor — SVF is the licensor — so 'SVF'
 * is offered explicitly, matching how the catalogue presents it.
 */
export async function getTemplateLicensors(): Promise<FilterOption[]> {
  try {
    const { data } = await supabase.from('movies').select('assignor_licensor, source')
    const values: string[] = []
    let hasBlank = false
    for (const r of (data || []) as any[]) {
      if (r.source === 'home_production') {
        values.push('SVF')
        continue
      }
      const v = (r.assignor_licensor || '').trim()
      if (v) values.push(v)
      else hasBlank = true
    }
    return toOptions(values, hasBlank)
  } catch {
    return []
  }
}

/** WTP / Library values, plus "— Not set —" when some titles have none. */
export async function getTemplateWtpOptions(): Promise<FilterOption[]> {
  try {
    const { data } = await supabase.from('movies').select('wtp_library')
    const values: string[] = []
    let hasBlank = false
    for (const r of (data || []) as any[]) {
      const v = (r.wtp_library || '').trim()
      if (v) values.push(v)
      else hasBlank = true
    }
    return toOptions(values, hasBlank)
  } catch {
    return []
  }
}

/**
 * The day a title becomes sellable, given every blocker's end date.
 *
 * A title opens only once ALL blockers have cleared, so the latest end date
 * governs — reporting the earliest would send marketing at a title that is
 * still encumbered by a longer holdback.
 *
 * Returns null when the title is open today, and 'never' when any blocker is
 * perpetual (a null end date), since that countdown would never arrive.
 */
function resolveOpenDate(
  blockerEndDates: (string | null)[],
): { opensOn: string | null; never: boolean } {
  if (blockerEndDates.length === 0) return { opensOn: null, never: false }
  if (blockerEndDates.some((d) => d === null)) return { opensOn: null, never: true }
  let latest: string | null = null
  for (const end of blockerEndDates as string[]) {
    const free = dayAfter(end)
    if (latest === null || free > latest) latest = free
  }
  return { opensOn: latest, never: false }
}
