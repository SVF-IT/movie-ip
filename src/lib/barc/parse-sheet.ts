import * as XLSX from "xlsx";

/**
 * Parser for BARC raw telecast exports (e.g. "pp GECs RAW 28 1.xlsx").
 *
 * The sheet has one row per (telecast x target audience), so a single telecast
 * appears three times — once for "MF 15+ ABCDE All", "15 - 50 ABC" and
 * "2+ All". All three are kept; aggregation happens later, from the rows.
 *
 * Only rows with Programme Theme = "FILM BASED" are imported; everything else
 * (MUSIC, etc.) is skipped and counted.
 */

/** Only this Programme Theme is imported. */
export const FILM_BASED_THEME = "FILM BASED";

/**
 * The 13 identity fields (region..target) are never null: barc_telecasts
 * declares them NOT NULL with sentinel defaults ('' / -1) so the uniqueness
 * guard is a plain-column index. Missing values use those same sentinels.
 */
export interface ParsedTelecast {
  region: string;
  week: number;
  channel: string;
  telecast_date: string; // ISO yyyy-mm-dd
  description_raw: string;
  programme_theme: string;
  programme_genre: string;
  week_day: string;
  start_time_raw: string | null;
  start_time_sec: number;
  end_time_raw: string | null;
  end_time_sec: number;
  length_raw: string;
  length_sec: number;
  target: string;
  rat_pct: number | null;
  daily_avg_rch_pct: number | null;
  ats_raw: string | null;
  ats_sec: number | null;

  /** Derived at import: (length_sec * rat_pct) / 1800. */
  grp: number | null;
  /** Derived at import: start time rounded to the nearest half hour. */
  nst_raw: string | null;
  nst_sec: number | null;
}

export interface ParseResult {
  rows: ParsedTelecast[];
  periodStart: string | null;
  periodEnd: string | null;
  /** Rows skipped because a required field (date, description, target) was missing. */
  skipped: number;
  /** Rows skipped because Programme Theme was not "FILM BASED". */
  skippedNonFilm: number;
  /** Distinct normalized descriptions found, for the mapping lookup. */
  descriptions: string[];
  warnings: string[];
}

/**
 * Must stay byte-identical to barc_normalize_description() in sql/31_barc.sql —
 * it is the lookup key joining a sheet row to barc_descriptions.
 */
export function normalizeDescription(txt: string | null | undefined): string {
  return (txt ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A UTF-8 BOM would otherwise become part of the first header cell. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Header aliases, matched case/space-insensitively against the sheet's first row. */
const FIELD_KEYS = {
  region: ["regions", "region"],
  week: ["week"],
  channel: ["channel"],
  date: ["date"],
  description: ["description"],
  programmeTheme: ["programme theme", "programme type", "programme"],
  programmeGenre: ["programme genre", "programme sub category", "genre"],
  weekDay: ["week day", "weekday", "day"],
  startTime: ["start time"],
  endTime: ["end time"],
  lengthHms: ["length hhmmss", "length hh mm ss", "length"],
  lengthSec: ["length sec", "length seconds", "length in sec"],
  target: ["targets", "target"],
  ratPct: ["rat", "rat %", "rating", "rat%"],
  rchPct: ["daily avg rch", "daily avg rch %", "daily avg reach", "avg rch", "reach"],
  ats: ["ats viewer", "ats", "ats viewers", "avg time spent"],
} as const;

type FieldKey = keyof typeof FIELD_KEYS;

function normalizeHeader(h: string): string {
  return h.toString().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Maps sheet columns to fields by header name. Every header is tried for an
 * exact alias match first, so a specific header ("Programme Genre") can never
 * be swallowed by another field's looser prefix alias ("programme").
 */
function mapColumns(headerRow: unknown[]): { map: Partial<Record<FieldKey, number>>; warnings: string[] } {
  const map: Partial<Record<FieldKey, number>> = {};
  const warnings: string[] = [];
  const headers = headerRow.map((h) => normalizeHeader(String(h ?? "")));

  const claim = (field: FieldKey, idx: number) => {
    if (map[field] === undefined) map[field] = idx;
  };

  headers.forEach((h, idx) => {
    if (!h) return;
    for (const [field, aliases] of Object.entries(FIELD_KEYS) as [FieldKey, readonly string[]][]) {
      if (aliases.includes(h)) {
        claim(field, idx);
        return;
      }
    }
    // Prefix match as a fallback for truncated/decorated headers.
    for (const [field, aliases] of Object.entries(FIELD_KEYS) as [FieldKey, readonly string[]][]) {
      if (map[field] !== undefined) continue;
      if (aliases.some((a) => h.startsWith(a) || a.startsWith(h))) {
        claim(field, idx);
        return;
      }
    }
  });

  for (const required of ["date", "description", "target"] as FieldKey[]) {
    if (map[required] === undefined) {
      warnings.push(`Could not find a "${required}" column in the sheet header.`);
    }
  }
  return { map, warnings };
}

/**
 * BARC broadcast clocks run past midnight — 25:00:53 means 01:00:53 the next
 * calendar day, still belonging to the previous broadcast day. Returned as
 * seconds from the start of the broadcast day so values above 24h survive.
 */
export function parseClockToSeconds(value: unknown): { raw: string | null; sec: number | null } {
  if (value === null || value === undefined || value === "") return { raw: null, sec: null };

  // xlsx may hand back a fraction-of-a-day number for time-formatted cells.
  if (typeof value === "number" && Number.isFinite(value)) {
    const sec = Math.round(value * 86400);
    return { raw: secondsToClock(sec), sec };
  }

  const raw = String(value).trim();
  if (!raw || /^n\.?a\.?$/i.test(raw)) return { raw: raw || null, sec: null };

  const m = raw.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (!m) return { raw, sec: null };

  const [, h, mi, s] = m;
  return { raw, sec: Number(h) * 3600 + Number(mi) * 60 + Number(s ?? 0) };
}

/**
 * NST — the telecast's start time rounded to the NEAREST half hour, as a
 * clock label on a 24h day.
 *
 *   14:00:52 -> 14:00      14:14:52 -> 14:00      14:35:52 -> 14:30
 *   14:47:52 -> 15:00      (17 min past 14:30, so it rounds up)
 *
 * BARC broadcast clocks run past 24:00, so a value like 26:47:52 is first
 * brought back onto the real clock (2:47:52) and then rounded -> 03:00.
 * Rounding 23:45+ up lands on 24:00, which wraps to 00:00 of the next day;
 * NST is a label, not a timestamp, so it carries no date.
 */
export function computeNst(startSec: number | null): { raw: string | null; sec: number | null } {
  if (startSec === null) return { raw: null, sec: null };

  const HALF_HOUR = 1800;
  const DAY = 86400;

  // Bring broadcast-day times past 24:00 back onto the real clock first.
  const clockSec = ((startSec % DAY) + DAY) % DAY;
  // Round half up, then wrap 24:00 -> 00:00.
  const rounded = (Math.round(clockSec / HALF_HOUR) * HALF_HOUR) % DAY;

  return { raw: secondsToClock(rounded), sec: rounded };
}

/**
 * GRP = (length in seconds x rat%) / 1800.
 * Null when either input is missing, so a missing rating never reads as 0.
 */
export function computeGrp(lengthSec: number | null, ratPct: number | null): number | null {
  if (lengthSec === null || ratPct === null) return null;
  return (lengthSec * ratPct) / 1800;
}

function secondsToClock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "n.a" and blanks become null — never 0, which would skew weighted averages. */
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (!s || /^n\.?a\.?$/i.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Dates arrive as dd-mm-yyyy in the export, or as an Excel serial when the cell
 * is date-formatted. dd-mm-yyyy is assumed for ambiguous slashed dates, matching
 * the BARC export locale.
 */
export function parseSheetDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    // xlsx builds these from local-time parts; reading them as UTC shifts the
    // date by a day in any non-zero timezone offset.
    return toISODate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const d = XLSX.SSF.parse_date_code(value);
    return d ? toISODate(d.y, d.m, d.d) : null;
  }

  const s = String(value).trim();
  const m = s.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  if (!m) return null;

  const [, a, b, c] = m;
  // yyyy-mm-dd when the first part is a 4-digit year, else dd-mm-yyyy.
  if (a.length === 4) return toISODate(Number(a), Number(b), Number(c));

  const year = c.length === 2 ? 2000 + Number(c) : Number(c);
  return toISODate(year, Number(b), Number(a));
}

function toISODate(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Accepts a workbook as bytes, or a CSV/TSV as text.
 *
 * CSV is handed over as a string rather than bytes: read as an array a
 * UTF-8 CSV can mis-decode non-ASCII titles, and a leading BOM ends up inside
 * the first header cell, which would break column matching.
 *
 * cellDates is off for both. With it on, xlsx turns a date-formatted cell into
 * a local-time Date, and an Excel serial for 06-06-2026 comes back as
 * "Jun 05 2026 23:59:59" in a UTC+5:30 timezone — a day early. Reading the raw
 * serial and converting it with SSF.parse_date_code (see parseSheetDate) keeps
 * the calendar date the sheet actually holds, in any timezone.
 */
export function parseBarcSheet(data: ArrayBuffer | string): ParseResult {
  const wb =
    typeof data === "string"
      ? XLSX.read(stripBom(data), { type: "string", cellDates: false, raw: true })
      : XLSX.read(data, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], periodStart: null, periodEnd: null, skipped: 0, skippedNonFilm: 0, descriptions: [], warnings: ["The workbook has no sheets."] };
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    raw: true,
  });

  if (grid.length < 2) {
    return { rows: [], periodStart: null, periodEnd: null, skipped: 0, skippedNonFilm: 0, descriptions: [], warnings: ["The sheet has no data rows."] };
  }

  const { map, warnings } = mapColumns(grid[0]);
  if (map.date === undefined || map.description === undefined || map.target === undefined) {
    return { rows: [], periodStart: null, periodEnd: null, skipped: 0, skippedNonFilm: 0, descriptions: [], warnings };
  }

  const at = (row: unknown[], field: FieldKey) => {
    const idx = map[field];
    return idx === undefined ? null : row[idx] ?? null;
  };

  const rows: ParsedTelecast[] = [];
  const descriptions = new Set<string>();
  let skipped = 0;
  let skippedNonFilm = 0;

  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    if (!row || row.length === 0) continue;

    const telecastDate = parseSheetDate(at(row, "date"));
    const description = parseText(at(row, "description"));
    const target = parseText(at(row, "target"));

    if (!telecastDate || !description || !target) {
      skipped++;
      continue;
    }

    const theme = parseText(at(row, "programmeTheme"));
    if (normalizeDescription(theme) !== FILM_BASED_THEME) {
      skippedNonFilm++;
      continue;
    }

    const start = parseClockToSeconds(at(row, "startTime"));
    const end = parseClockToSeconds(at(row, "endTime"));
    const length = parseClockToSeconds(at(row, "lengthHms"));
    const ats = parseClockToSeconds(at(row, "ats"));

    descriptions.add(normalizeDescription(description));

    // Prefer the explicit seconds column; fall back to the hh:mm:ss one.
    // Sentinels (-1 / '') stand in for missing identity values — see
    // ParsedTelecast — so the uniqueness guard still compares them.
    const lengthSec = parseNumber(at(row, "lengthSec")) ?? length.sec ?? -1;
    const ratPct = parseNumber(at(row, "ratPct"));
    const startSec = start.sec ?? -1;
    const nst = computeNst(start.sec);

    rows.push({
      region: parseText(at(row, "region")) ?? "",
      week: parseNumber(at(row, "week")) ?? -1,
      channel: parseText(at(row, "channel")) ?? "",
      telecast_date: telecastDate,
      description_raw: description,
      programme_theme: theme ?? "",
      programme_genre: parseText(at(row, "programmeGenre")) ?? "",
      week_day: parseText(at(row, "weekDay")) ?? "",
      start_time_raw: start.raw,
      start_time_sec: startSec,
      end_time_raw: end.raw,
      end_time_sec: end.sec ?? -1,
      length_raw: length.raw ?? "",
      length_sec: lengthSec,
      target,
      rat_pct: ratPct,
      daily_avg_rch_pct: parseNumber(at(row, "rchPct")),
      ats_raw: ats.raw,
      ats_sec: ats.sec,
      grp: computeGrp(lengthSec === -1 ? null : lengthSec, ratPct),
      nst_raw: nst.raw,
      nst_sec: nst.sec,
    });
  }

  const dates = rows.map((r) => r.telecast_date).sort();

  return {
    rows,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    skipped,
    skippedNonFilm,
    descriptions: [...descriptions],
    warnings,
  };
}
