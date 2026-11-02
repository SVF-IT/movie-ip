import { createClient } from "@/lib/supabase/client";
import { uploadFile, deleteFile } from "@/lib/api/storage";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import { parseBarcSheet, normalizeDescription, type ParsedTelecast, type ParseResult } from "@/lib/barc/parse-sheet";

export { computeBarcMetrics } from "@/lib/barc/metrics";

const supabase = createClient();

const BUCKET = "barc-sheets";
export const BARC_SHEET_ACCEPTED_TYPES = [".xlsx", ".xls", ".csv"];
/** Rows per insert batch — a year of data is tens of thousands of rows. */
const INSERT_CHUNK = 1000;
/** Rows per duplicate-check call; keeps the JSON payload to a sane size. */
const DUPLICATE_CHECK_CHUNK = 2000;

export interface BarcSheet {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  row_count: number;
  matched_count: number;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface BarcDescription {
  id: string;
  description: string;
  description_key: string;
  movie_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BarcUploadResult {
  sheet: BarcSheet;
  rowCount: number;
  matchedCount: number;
  skipped: number;
  /** Rows dropped because Programme Theme was not FILM BASED. */
  skippedNonFilm: number;
  /** Rows skipped as already present (duplicate mode "skip"). */
  duplicatesSkipped: number;
  /** Existing rows replaced (duplicate mode "override"). */
  duplicatesOverridden: number;
  /** Descriptions in the sheet with no barc_descriptions mapping yet. */
  unmappedDescriptions: string[];
  warnings: string[];
}

/** How to treat incoming rows that already exist. */
export type DuplicateMode = "skip" | "override";

/**
 * A parsed sheet held client-side between the duplicate check and the import,
 * so the user decides skip-vs-override once, before anything is written.
 */
export interface BarcStagedSheet {
  file: File;
  parsed: ParseResult;
  /** How many parsed rows already exist in barc_telecasts. */
  existingCount: number;
}

/** The 13 sheet columns that make a telecast row unique. */
function identityOf(r: ParsedTelecast) {
  return {
    region: r.region,
    week: r.week,
    channel: r.channel,
    telecast_date: r.telecast_date,
    description_raw: r.description_raw,
    programme_theme: r.programme_theme,
    programme_genre: r.programme_genre,
    week_day: r.week_day,
    start_time_sec: r.start_time_sec,
    end_time_sec: r.end_time_sec,
    length_raw: r.length_raw,
    length_sec: r.length_sec,
    target: r.target,
  };
}

/**
 * Parses the sheet and reports how many of its rows already exist, without
 * writing anything. The caller shows the skip/override choice, then passes the
 * staged result to importStagedSheet.
 */
export async function stageBarcSheet(file: File): Promise<BarcStagedSheet> {
  validateFile(file);

  // CSV is read as text so UTF-8 titles decode correctly; workbooks as bytes.
  const parsed = parseBarcSheet(
    fileExtension(file) === ".csv" ? await file.text() : await file.arrayBuffer()
  );
  if (parsed.rows.length === 0) {
    throw new Error(
      parsed.warnings[0] ??
        (parsed.skippedNonFilm > 0
          ? `No FILM BASED rows in this sheet — all ${parsed.skippedNonFilm.toLocaleString()} rows were another Programme Theme.`
          : "No usable rows were found in this sheet.")
    );
  }

  // Chunked so a large sheet does not exceed the request size limit.
  let existingCount = 0;
  for (let i = 0; i < parsed.rows.length; i += DUPLICATE_CHECK_CHUNK) {
    const { data, error } = await supabase.rpc("barc_count_existing_rows", {
      p_rows: parsed.rows.slice(i, i + DUPLICATE_CHECK_CHUNK).map(identityOf),
    });
    if (error) throw sanitizeError(error);
    existingCount += (data as number) ?? 0;
  }

  return { file, parsed, existingCount };
}

export interface BarcFilters {
  year?: number | null;
  target?: string | null;
  channel?: string | null;
  region?: string | null;
  week?: number | null;
  movieId?: string | null;
  sheetId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

function fileExtension(file: File): string {
  return `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
}

function validateFile(file: File): void {
  if (!BARC_SHEET_ACCEPTED_TYPES.includes(fileExtension(file))) {
    throw new Error("Only .xlsx, .xls and .csv files are supported.");
  }
}

// ── Sheets ───────────────────────────────────────────────────

export async function getBarcSheets(): Promise<BarcSheet[]> {
  const { data, error } = await supabase
    .from("barc_sheets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw sanitizeError(error);
  return data || [];
}

export async function getBarcSheetDownloadUrl(filePath: string): Promise<string> {
  // Private bucket — a short-lived signed URL, not a public one.
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 300);
  if (error) throw sanitizeError(error);
  return data.signedUrl;
}

/**
 * Imports a sheet already staged by stageBarcSheet.
 *
 * Descriptions are resolved by exact lookup against the barc_descriptions
 * dictionary — never fuzzy-matched. A description with no dictionary entry
 * still imports, with movie_id NULL, and is reported back so it can be seeded;
 * seeding later back-fills those rows.
 *
 * `duplicateMode` decides what happens to rows that already exist:
 *   "skip"     — leave the stored rows alone and import only the new ones
 *   "override" — delete the stored rows first, so the incoming values win
 */
export async function importStagedSheet(params: {
  staged: BarcStagedSheet;
  duplicateMode: DuplicateMode;
  notes?: string | null;
  createdBy: string;
  createdByName: string;
  onProgress?: (pct: number) => void;
}): Promise<BarcUploadResult> {
  const { file, parsed } = params.staged;
  params.onProgress?.(10);

  // Resolve descriptions to movies via the dictionary.
  const { data: dict, error: dictError } = await supabase
    .from("barc_descriptions")
    .select("id, description_key, movie_id")
    .in("description_key", parsed.descriptions);

  if (dictError) throw sanitizeError(dictError);

  type DictRow = { id: string; description_key: string; movie_id: string | null };
  const byKey = new Map(
    ((dict || []) as DictRow[]).map((d) => [d.description_key, d] as const)
  );
  const unmapped = parsed.descriptions.filter((d) => !byKey.get(d)?.movie_id);
  params.onProgress?.(20);

  // Override replaces the colliding rows; do it before the file is stored so a
  // failure here leaves nothing behind.
  let duplicatesOverridden = 0;
  if (params.duplicateMode === "override" && params.staged.existingCount > 0) {
    for (let i = 0; i < parsed.rows.length; i += DUPLICATE_CHECK_CHUNK) {
      const { data, error } = await supabase.rpc("barc_delete_colliding_rows", {
        p_rows: parsed.rows.slice(i, i + DUPLICATE_CHECK_CHUNK).map(identityOf),
      });
      if (error) throw sanitizeError(error);
      duplicatesOverridden += (data as number) ?? 0;
    }
  }
  params.onProgress?.(35);

  const sheetId = crypto.randomUUID();
  const ext = file.name.split(".").pop()?.toLowerCase() || "xlsx";
  const path = `${sheetId}/${Date.now()}.${ext}`;

  await uploadFile(BUCKET, path, file);
  params.onProgress?.(45);

  const matchedCount = parsed.rows.filter(
    (r) => byKey.get(normalizeDescription(r.description_raw))?.movie_id
  ).length;

  const { data: sheet, error: sheetError } = await supabase
    .from("barc_sheets")
    .insert({
      id: sheetId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      row_count: parsed.rows.length,
      matched_count: matchedCount,
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
      notes: params.notes ?? null,
      created_by: params.createdBy,
      created_by_name: params.createdByName,
    })
    .select()
    .single();

  if (sheetError) {
    await deleteFile(BUCKET, path).catch(() => {});
    throw sanitizeError(sheetError);
  }

  const payload = parsed.rows.map((r: ParsedTelecast) => {
    const match = byKey.get(normalizeDescription(r.description_raw));
    return {
      ...r,
      sheet_id: sheetId,
      description_id: match?.id ?? null,
      movie_id: match?.movie_id ?? null,
    };
  });

  // In skip mode the duplicates are still in the payload; ignoreDuplicates
  // lets Postgres drop them on the unique index instead of erroring.
  const ignoreDuplicates = params.duplicateMode === "skip";
  let inserted = 0;

  try {
    for (let i = 0; i < payload.length; i += INSERT_CHUNK) {
      const chunk = payload.slice(i, i + INSERT_CHUNK);
      const { data, error } = await supabase
        .from("barc_telecasts")
        .upsert(chunk, {
          onConflict:
            "region,week,channel,telecast_date,description_raw,programme_theme,programme_genre,week_day,start_time_sec,end_time_sec,length_raw,length_sec,target",
          ignoreDuplicates,
        })
        .select("id");

      if (error) throw sanitizeError(error);
      inserted += (data as { id: string }[] | null)?.length ?? 0;
      params.onProgress?.(45 + Math.round(((i + INSERT_CHUNK) / payload.length) * 50));
    }
  } catch (e) {
    // Roll the whole upload back so a partial import can never be aggregated.
    await supabase.from("barc_sheets").delete().eq("id", sheetId);
    await deleteFile(BUCKET, path).catch(() => {});
    throw e;
  }

  const duplicatesSkipped = ignoreDuplicates ? parsed.rows.length - inserted : 0;

  // row_count is what actually landed, not what the sheet contained.
  if (duplicatesSkipped > 0) {
    await supabase.from("barc_sheets").update({ row_count: inserted }).eq("id", sheetId);
  }

  params.onProgress?.(100);

  return {
    sheet,
    rowCount: inserted,
    matchedCount,
    skipped: parsed.skipped,
    skippedNonFilm: parsed.skippedNonFilm,
    duplicatesSkipped,
    duplicatesOverridden,
    unmappedDescriptions: unmapped,
    warnings: parsed.warnings,
  };
}

/** Deletes the sheet row (telecasts cascade) and its stored file. */
export async function deleteBarcSheet(id: string, filePath: string): Promise<void> {
  const { error } = await supabase.from("barc_sheets").delete().eq("id", id);
  if (error) throw sanitizeError(error);

  await deleteFile(BUCKET, filePath).catch(() => {});
}

// ── Descriptions ─────────────────────────────────────────────

export async function getBarcDescriptions(): Promise<BarcDescription[]> {
  const { data, error } = await supabase
    .from("barc_descriptions")
    .select("*")
    .order("description");

  if (error) throw sanitizeError(error);
  return data || [];
}

/**
 * Points a description at a movie and back-fills every telecast already
 * imported under it, so historical sheets pick up the mapping.
 */
export async function mapBarcDescription(params: {
  descriptionId: string;
  movieId: string | null;
}): Promise<BarcDescription> {
  const { data, error } = await supabase
    .from("barc_descriptions")
    .update({ movie_id: params.movieId })
    .eq("id", params.descriptionId)
    .select()
    .single();

  if (error) throw sanitizeError(error);

  const { error: backfillError } = await supabase
    .from("barc_telecasts")
    .update({ movie_id: params.movieId })
    .eq("description_id", params.descriptionId);

  if (backfillError) throw sanitizeError(backfillError);

  return data;
}

// ── Filter options ───────────────────────────────────────────

/**
 * Distinct values backing the BARC page filter dropdowns. Computed in Postgres
 * (barc_filter_options) so the page makes one request instead of paging
 * through every telecast row.
 */
export async function getBarcFilterOptions(): Promise<{
  years: number[];
  targets: string[];
  channels: string[];
  regions: string[];
  weeks: number[];
}> {
  const { data, error } = await supabase.rpc("barc_filter_options");
  if (error) throw sanitizeError(error);

  const opts = (data ?? {}) as Partial<Record<"years" | "weeks", number[]> & Record<"targets" | "channels" | "regions", string[]>>;
  // Text lists are sorted here, not in SQL, so the order follows JS string
  // comparison exactly as before rather than the database collation.
  return {
    years: opts.years ?? [],
    targets: [...(opts.targets ?? [])].sort(),
    channels: [...(opts.channels ?? [])].sort(),
    regions: [...(opts.regions ?? [])].sort(),
    weeks: opts.weeks ?? [],
  };
}

// ── Movie rows for the BARC page ─────────────────────────────

export interface BarcMovieRow {
  movie_id: string;
  title: string;
  /** BARC description(s) this movie is mapped from. */
  descriptions: string[];
  source: string | null;
  certification: string | null;
  release_date: string | null;
  language: string | null;
  production_house_name: string | null;
  channels: string[];
  /** Distinct BARC weeks the movie appeared in, under the current filters. */
  weekCount: number;
  /** Distinct airings (week + date + day + start + end + target). */
  nims: number;
  /** Average across weeks of each week's summed GRP. */
  grp: number | null;
  /** Average across weeks of each week's average rat%. */
  rating: number | null;
  weighted_ats_sec: number | null;
}

/**
 * Per-movie BARC metrics under the given filters. Aggregated in Postgres by
 * barc_movie_metrics, which mirrors computeBarcMetrics, so only one summary
 * row per movie crosses the wire instead of every telecast.
 */
export async function getBarcMovieRows(filters: BarcFilters = {}): Promise<BarcMovieRow[]> {
  const { data, error } = await supabase.rpc("barc_movie_metrics", {
    p_year: filters.year || null,
    p_target: filters.target || null,
    p_channel: filters.channel || null,
    p_region: filters.region || null,
    p_week: filters.week || null,
    p_movie_id: filters.movieId || null,
    p_sheet_id: filters.sheetId || null,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
  });
  if (error) throw sanitizeError(error);

  return ((data ?? []) as BarcMovieRow[])
    .map((r) => ({
      ...r,
      descriptions: [...r.descriptions].sort(),
      channels: [...r.channels].sort(),
    }))
    .sort((a, b) => (b.grp ?? -1) - (a.grp ?? -1) || a.title.localeCompare(b.title));
}
