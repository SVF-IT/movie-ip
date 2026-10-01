/**
 * The platform types a platform can be given.
 *
 * The creation form used to offer only the types already in use, so a type
 * nobody had used yet was unreachable — you could not create the first IPTV or
 * Airborne platform without typing the name by hand, and a typo there silently
 * broke every rights check that matches on this column.
 *
 * These spellings are what the matchers expect:
 *   - satellite:  isSatellitePlatform() matches satellite / dth / terrestrial / cable
 *   - internet:   internetTypeOf() matches the sub-type name exactly
 *   - other:      isOtherExploitationPlatform() matches air / ship / surface / hotel,
 *                 plus "other" (see that function)
 *
 * Change a name here and the matcher must change with it.
 */
export const PLATFORM_TYPES: string[] = [
  // Internet
  'SVOD',
  'AVOD',
  'TVOD',
  'FVOD',
  'IPTV',
  'NVOD',
  // Satellite
  'Satellite TV',
  'DTH VOD',
  'Terrestrial TV',
  // Other
  'Airborne Rights',
  'Ship Rights',
  'Other Rights',
]

/**
 * The canonical list first, in the order above, then any other spelling already
 * present in the data. Types from the data are kept so an older or custom value
 * never disappears from the picker, and they sort after the canonical ones
 * rather than being mixed in.
 */
export function platformTypeOptions(inUse: string[]): string[] {
  const known = new Set(PLATFORM_TYPES.map((t) => t.toLowerCase()))
  const extra = Array.from(
    new Set(inUse.map((t) => t.trim()).filter((t) => t && !known.has(t.toLowerCase()))),
  ).sort()
  return [...PLATFORM_TYPES, ...extra]
}
