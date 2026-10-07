/**
 * Exclusivity and buyer-restriction reading for internet rights.
 *
 * Two questions the satellite pipeline never had to ask:
 *
 *   1. Does a live deal actually BLOCK another sale? Only an exclusive one
 *      does. A non-exclusive or shared-exclusive deal leaves the title free to
 *      license to someone else, so it is shown as context rather than a blocker.
 *
 *   2. Does a holdback bar a CATEGORY or a COMPANY? "FVOD" bars an exploitation
 *      type outright; "Sony" only says which buyer cannot have it. Conflating
 *      the two would hide titles that are perfectly sellable to everyone else —
 *      the opposite of what the sales team needs.
 */

/** How a live deal constrains further sales of the same right. */
export type Exclusivity = 'exclusive' | 'shared' | 'non_exclusive'

/**
 * Read `platform_rights.nature` / `movie_rights.nature`.
 *
 * sql/33 canonicalises these to Exclusive / Non-Exclusive / Shared-Exclusive,
 * but the column is still free text and imports keep arriving, so matching
 * tolerates casing and separator variants the same way that migration does.
 *
 * A BLANK nature depends on the right:
 *
 *   - SVOD: read as Exclusive. Subscription deals normally are, and assuming
 *     otherwise would advertise a right that may already be locked up.
 *   - Everything else (AVOD, TVOD, FVOD, satellite, …): read as Non-Exclusive.
 *     A blank there means nobody recorded a restriction, and these rights are
 *     routinely sold to several buyers at once — 17 live YouTube AVOD deals
 *     carry no nature, and treating them as exclusive hid every one of those
 *     titles from AVOD results entirely.
 */
export function readExclusivity(
  nature: string | null | undefined,
  right?: string,
): Exclusivity {
  const n = (nature || '').trim().toLowerCase().replace(/[\s_-]+/g, '-')
  if (!n) return (right || '').toLowerCase() === 'svod' ? 'exclusive' : 'non_exclusive'
  if (n.startsWith('non-exclusive') || n === 'nonexclusive') return 'non_exclusive'
  if (n.startsWith('shared')) return 'shared'
  return 'exclusive'
}

/** Only an exclusive deal stops the title being sold to another platform. */
export function blocksFurtherSale(
  nature: string | null | undefined,
  right?: string,
): boolean {
  return readExclusivity(nature, right) === 'exclusive'
}

export const EXCLUSIVITY_LABELS: Record<Exclusivity, string> = {
  exclusive: 'Exclusive',
  shared: 'Shared-Exclusive',
  non_exclusive: 'Non-Exclusive',
}

/**
 * Corporate groups, for holdback matching.
 *
 * A holdback names a company, not a platform: "Sony" bars SonyLIV, and "Star",
 * "Disney" or "JioHotstar" all bar Hotstar, because they are one owner. Each
 * entry lists every alias that refers to that owner, and matching any one of
 * them bars the platform — a buyer restriction is about who owns the platform,
 * not the brand it trades under this year.
 *
 * `label` is the SVOD platform name as the catalogue spells it, because that is
 * the buyer the sales team would otherwise approach. `aliases` are matched
 * against the holdback text, so a group is recognised whether or not SVF has a
 * platform row for every brand in it — "Disney" appears in real holdbacks while
 * no Disney platform exists in the catalogue.
 */
interface CompanyGroup {
  label: string
  aliases: string[]
}

const COMPANY_GROUPS: CompanyGroup[] = [
  { label: 'SonyLIV', aliases: ['sony', 'sonyliv', 'set', 'sonypictures'] },
  // Star, Disney and Hotstar are one owner post-merger, trading as JioHotstar.
  { label: 'Hotstar', aliases: ['star', 'disney', 'hotstar', 'jiohotstar', 'disneyplus', 'starplus'] },
  { label: 'ZEE5', aliases: ['zee', 'zee5', 'zeel', 'zeetv'] },
  { label: 'Netflix', aliases: ['netflix'] },
  { label: 'Viacom 18', aliases: ['viacom', 'viacom18', 'jiocinema', 'colors'] },
  { label: 'Hoichoi', aliases: ['hoichoi'] },
  // Not SVOD platforms in the catalogue, but they appear in agreements.
  { label: 'Prime Video', aliases: ['amazon', 'primevideo'] },
  { label: 'YouTube', aliases: ['youtube', 'google'] },
  { label: 'Apple', aliases: ['apple', 'itunes', 'appletv'] },
  { label: 'Eros', aliases: ['eros', 'erosnow'] },
  { label: 'Klikk', aliases: ['klikk'] },
  { label: 'Addatimes', aliases: ['addatimes'] },
]

/**
 * The group a phrase belongs to, or null when it names no known company.
 *
 * Matching is on the whole phrase with punctuation and spaces removed, and an
 * alias may only EXTEND the phrase, never be extended by it. "sony" therefore
 * finds "sonyliv", while "primechannel" does not reach "primevideo" — a real
 * TVOD platform in the catalogue that has nothing to do with Amazon.
 */
function groupFor(phrase: string): CompanyGroup | null {
  const w = phrase.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!w) return null
  for (const group of COMPANY_GROUPS) {
    if (group.aliases.some((a) => a === w || a.startsWith(w))) return group
  }
  return null
}

/**
 * Split a free-text holdback into the companies it bars as buyers.
 *
 * Holdbacks are written for humans — "FVOD, Sony, Disney, Zee-owned and
 * affiliated platforms" — so this reads the words of the text rather than
 * hunting for known platform names inside it. That direction matters: the
 * reverse missed "Disney" (no Disney platform on record) and missed "Sony"
 * (the platform is spelt "SonyLIV", with no space).
 *
 * A word is reported only when it resolves to a corporate group above.
 * Everything else is ignored, because most holdback text is prose — "2-month
 * holdback from first telecast" names no company, and treating its words as
 * buyer restrictions would be worse than saying nothing.
 *
 * `knownPlatforms` is accepted so a platform on record that belongs to no
 * listed group is still recognised by its own name.
 */
export function namedPlatformRestrictions(
  raw: string | null | undefined,
  knownPlatforms: string[],
): string[] {
  const text = (raw || '').trim()
  if (!text) return []

  const found = new Set<string>()

  // A comma-separated part can name more than one company ("No Amazon or
  // Sony"), so every word is considered. Two-word phrases are tried first and
  // their words then skipped, which is what keeps "Prime Video" apart from the
  // unrelated "Prime Channel" without losing either name.
  for (const part of text.split(/[,;/]/)) {
    const words = part.split(/[^A-Za-z0-9+]+/).map((x) => x.trim()).filter(Boolean)
    if (words.length === 0) continue

    const consumed = new Set<number>()

    // Pass 1 — adjacent pairs, longest-specific first.
    for (let i = 0; i < words.length - 1; i++) {
      if (consumed.has(i) || consumed.has(i + 1)) continue
      const hit = resolve(`${words[i]} ${words[i + 1]}`, knownPlatforms)
      if (hit) {
        found.add(hit)
        consumed.add(i)
        consumed.add(i + 1)
      }
    }

    // Pass 2 — any word a pair did not already account for.
    for (let i = 0; i < words.length; i++) {
      if (consumed.has(i)) continue
      const hit = resolve(words[i], knownPlatforms)
      if (hit) found.add(hit)
    }
  }
  return Array.from(found).sort()
}

/**
 * The company or platform a phrase names, or null when it names neither.
 *
 * Groups are consulted before the platform table so a holdback resolves to the
 * SVOD buyer the sales team would approach ("Disney" -> "Hotstar") rather than
 * to whichever brand happens to be on record.
 */
function resolve(phrase: string, knownPlatforms: string[]): string | null {
  const compact = phrase.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (compact.length < 3 || /^[0-9]+$/.test(compact)) return null
  const group = groupFor(phrase)
  if (group) return group.label
  return matchKnownPlatform(compact, knownPlatforms)
}

/**
 * The platform whose name matches this word, compared with punctuation and
 * spaces stripped. Returns null when nothing on record matches.
 */
function matchKnownPlatform(word: string, knownPlatforms: string[]): string | null {
  for (const platform of knownPlatforms) {
    const name = platform.trim()
    if (!name) continue
    const compact = name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!compact) continue
    if (compact === word || compact.startsWith(word) || word.startsWith(compact)) {
      return name
    }
  }
  return null
}

// ── Territory ────────────────────────────────────────────────────────────────

/**
 * The territories a right can be granted for.
 *
 * Three canonical options plus free text. "Rest of World" means everywhere
 * except India; anything outside these three is typed in as a custom value and
 * treated as its own place.
 */
export const TERRITORY_PRESETS = ['World', 'India', 'Rest of World']

/** A blank territory means World: a right granted with no limit covers everywhere. */
export function readTerritory(territory: string | null | undefined): string {
  const t = (territory || '').trim()
  return t || 'World'
}

/**
 * Does a deal in `dealTerritory` cover the territory being sold into?
 *
 * The question is containment, not overlap: an exclusive deal blocks a sale
 * only where the deal actually grants that territory.
 *
 *   World          contains everything.
 *   India          contains only India.
 *   Rest of World  is everywhere except India, so it contains neither India
 *                  nor World, but does contain any other named place.
 *
 * A custom territory (South Asia, Taiwan, …) is its own place: it covers a sale
 * into the same place, and into Rest of World, since that is where it sits.
 *
 * Asking for World is the strict case — only a World deal covers it — because
 * selling World rights means granting every territory at once.
 */
export function territoryCovers(dealTerritory: string, askingFor: string): boolean {
  const deal = dealTerritory.trim().toLowerCase()
  const want = askingFor.trim().toLowerCase()
  if (!deal || !want) return true
  if (deal === want) return true

  // "World except X" grants everywhere but the named exclusion.
  const except = deal.match(/^world\s+(?:except|excluding|other than)\s+(.+)$/)
  if (except) {
    const excluded = except[1].trim()
    return !(excluded.includes(want) || want.includes(excluded))
  }

  if (deal === 'world') return true
  // Only a World deal can block a World sale; a regional exclusive leaves the
  // other regions sellable, so it does not cover "everywhere at once".
  if (want === 'world') return false

  const isIndia = (t: string) => t === 'india'
  const isRow = (t: string) => t === 'rest of world'

  // Rest of World is everywhere except India.
  if (isRow(deal)) return !isIndia(want)
  // An India deal covers India alone.
  if (isIndia(deal)) return false

  // A custom territory sits inside Rest of World unless it IS India.
  if (isRow(want)) return !isIndia(deal)
  return false
}
