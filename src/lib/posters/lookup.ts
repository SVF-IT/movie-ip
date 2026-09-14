/**
 * External poster lookup for movies with no poster_url.
 *
 * Queries TMDB first (better coverage of Bengali/Oriya/Assamese regional
 * cinema), falling back to OMDb/IMDb for anything TMDB misses. Used only by
 * the server-side backfill route — never called per-render.
 */

export type PosterProvider = "tmdb" | "omdb";

export interface PosterCandidate {
  provider: PosterProvider;
  /** Direct image URL, downloaded once and re-hosted in Supabase storage. */
  imageUrl: string;
  matchedTitle: string;
  matchedYear?: string;
  /** How much to trust the match — drives the review table's default checkbox. */
  confidence: "exact" | "likely" | "weak";
}

/**
 * Internal SVF title markers that aren't part of the real film title.
 *
 * Dub/language markers matter most: "Baishey Srabon (Odiya)" is the same film
 * as "Baishey Srabon", so stripping the marker finds the original — whose
 * poster the app already reuses for language versions.
 */
const TITLE_MARKERS = [
  "repeat", "hindi", "oriya", "odiya", "tamil", "telegu", "telugu",
  "assamese", "bhojpuri", "bengali", "malayalam", "kannada", "marathi",
  "dubbed", "remake", "new", "old", "documentary", "short film",
];

/** Strip dub/version markers and return the searchable title. */
export function cleanTitle(rawTitle: string): string {
  let title = rawTitle;

  // Drop parenthetical groups that are pure markers or a bare year.
  title = title.replace(/\(([^)]*)\)/g, (full, inner: string) => {
    const norm = inner.trim().toLowerCase();
    if (/^\d{4}$/.test(norm)) return "";
    if (TITLE_MARKERS.includes(norm)) return "";
    // Keep meaningful parentheticals such as "Mona (Jinn 2)" — a real subtitle.
    return full;
  });

  return title.replace(/\s+/g, " ").trim();
}

/** Normalized form used for comparing our title against a provider's title. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreMatch(
  ourTitle: string,
  ourYear: string | undefined,
  theirTitle: string,
  theirYear: string | undefined
): PosterCandidate["confidence"] {
  const a = normalize(ourTitle);
  const b = normalize(theirTitle);
  const titleExact = a === b;

  // Without a year on our side we can never call it exact — 73 rows in the
  // catalogue have no release_year, and regional titles repeat across decades.
  if (!ourYear) return titleExact ? "likely" : "weak";
  if (!theirYear) return titleExact ? "likely" : "weak";

  const yearGap = Math.abs(Number(ourYear) - Number(theirYear));
  if (titleExact && yearGap === 0) return "exact";
  if (titleExact && yearGap <= 1) return "likely";
  if (titleExact) return "weak";
  // Title mismatch is only worth surfacing when the year lines up exactly.
  return yearGap === 0 ? "weak" : "weak";
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

async function lookupTmdb(
  title: string,
  year: string | undefined,
  apiKey: string
): Promise<PosterCandidate | null> {
  const params = new URLSearchParams({
    api_key: apiKey,
    query: title,
    include_adult: "false",
  });
  if (year) params.set("year", year);

  const res = await fetch(
    `https://api.themoviedb.org/3/search/movie?${params.toString()}`
  );
  if (!res.ok) return null;

  const json = (await res.json()) as {
    results?: Array<{
      title?: string;
      original_title?: string;
      release_date?: string;
      poster_path?: string | null;
    }>;
  };

  const hit = json.results?.find((r) => r.poster_path);
  if (!hit?.poster_path) return null;

  const matchedTitle = hit.original_title || hit.title || title;
  const matchedYear = hit.release_date?.slice(0, 4) || undefined;

  return {
    provider: "tmdb",
    imageUrl: `${TMDB_IMAGE_BASE}${hit.poster_path}`,
    matchedTitle,
    matchedYear,
    confidence: scoreMatch(title, year, matchedTitle, matchedYear),
  };
}

async function lookupOmdb(
  title: string,
  year: string | undefined,
  apiKey: string
): Promise<PosterCandidate | null> {
  const params = new URLSearchParams({ apikey: apiKey, t: title, type: "movie" });
  if (year) params.set("y", year);

  const res = await fetch(`https://www.omdbapi.com/?${params.toString()}`);
  if (!res.ok) return null;

  const json = (await res.json()) as {
    Response?: string;
    Title?: string;
    Year?: string;
    Poster?: string;
  };

  // OMDb returns the string "N/A" rather than omitting a missing poster.
  if (json.Response !== "True" || !json.Poster || json.Poster === "N/A") {
    return null;
  }

  const matchedTitle = json.Title || title;
  const matchedYear = json.Year?.slice(0, 4) || undefined;

  return {
    provider: "omdb",
    imageUrl: json.Poster,
    matchedTitle,
    matchedYear,
    confidence: scoreMatch(title, year, matchedTitle, matchedYear),
  };
}

/**
 * Find a poster candidate for one movie: TMDB first, OMDb as fallback.
 * Returns null when neither provider has usable artwork.
 */
export async function findPoster(
  rawTitle: string,
  year?: string
): Promise<PosterCandidate | null> {
  const title = cleanTitle(rawTitle);
  if (!title) return null;

  const tmdbKey = process.env.TMDB_API_KEY;
  const omdbKey = process.env.OMDB_API_KEY;

  if (tmdbKey) {
    try {
      const hit = await lookupTmdb(title, year, tmdbKey);
      if (hit) return hit;
    } catch {
      // Fall through to OMDb rather than failing the whole batch.
    }
  }

  if (omdbKey) {
    try {
      const hit = await lookupOmdb(title, year, omdbKey);
      if (hit) return hit;
    } catch {
      // No provider produced a candidate.
    }
  }

  return null;
}
