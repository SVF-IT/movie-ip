/**
 * The three-level shape of a right: group -> platform type -> platform.
 *
 * "Satellite", "Internet" and "Other" are groupings the business thinks in;
 * the database only stores the leaf `platform_type` on each platform row
 * ("Satellite TV", "SVOD", …). Every screen that filters by rights type reads
 * this one definition, so the Rights Management and Expiring Rights pages can
 * never drift apart on what counts as satellite.
 */
export const RIGHTS_TYPE_GROUPS: { group: string; types: string[] }[] = [
  { group: "Satellite", types: ["Satellite TV", "DTH VOD", "Terrestrial TV", "Cable TV"] },
  { group: "Internet", types: ["SVOD", "TVOD", "AVOD", "FVOD", "NVOD", "IPTV"] },
  { group: "Other", types: ["Air Rights", "Ship Rights", "Surface Rights", "Hotel Rights"] },
]

/** Every exact platform_type string, across all groups. */
export const ALL_RIGHTS_TYPES = RIGHTS_TYPE_GROUPS.flatMap((g) => g.types)

/** The platform types belonging to one group, or all of them for "all". */
export function typesForGroup(group: string): string[] {
  if (group === "all") return ALL_RIGHTS_TYPES
  return RIGHTS_TYPE_GROUPS.find((g) => g.group.toLowerCase() === group.toLowerCase())?.types ?? []
}

/**
 * Which group a platform type belongs to.
 *
 * Matching is loose because the stored values are free text and vary in case
 * and wording ("satellite tv", "DTH VOD"); an unrecognised value falls into
 * "Other" rather than vanishing from every filter.
 */
export function groupForType(platformType?: string | null): string {
  const t = (platformType || "").trim().toLowerCase()
  if (!t) return "Other"
  for (const { group, types } of RIGHTS_TYPE_GROUPS) {
    if (types.some((x) => x.toLowerCase() === t)) return group
  }
  // Fall back to keyword matching for values not in the canonical list.
  if (/satellite|dth|terrestrial|cable/.test(t)) return "Satellite"
  if (/svod|tvod|avod|fvod|nvod|iptv|internet|digital/.test(t)) return "Internet"
  return "Other"
}

/**
 * Filter key for rows where the value is blank or missing.
 *
 * Not the empty string: a lone "" encodes to an empty query param, which reads
 * back as "no filter" and would silently drop the selection on reload.
 */
export const NONE_KEY = "__none__"

/**
 * `nature` is free text, so the same value exists in several spellings
 * ("Non-exclusive" / "Non-Exclusive", "shared-Exclusive" / "Shared-Exclusive").
 * Folding them to one key groups the variants under a single filter entry
 * instead of listing each separately. sql/33_normalize_rights_nature.sql fixes
 * the stored data; this keeps the UI correct before and after it is run.
 */
export function natureKey(nature: string) {
  return nature.trim().toLowerCase().replace(/[\s_-]+/g, "-")
}

const NATURE_LABELS: Record<string, string> = {
  "exclusive": "Exclusive",
  "non-exclusive": "Non-Exclusive",
  "nonexclusive": "Non-Exclusive",
  "shared-exclusive": "Shared-Exclusive",
  "jointly-owned": "Jointly Owned",
  "jointly-production": "Jointly Owned",
  "sold-to-grassroot": "Sold to Grassroot",
  "sold-expired": "Sold/Expired",
  "n-a": "N/A",
}

/** The canonical display label for a stored nature value. */
export function natureLabel(nature: string) {
  return NATURE_LABELS[natureKey(nature)] ?? nature.trim()
}
