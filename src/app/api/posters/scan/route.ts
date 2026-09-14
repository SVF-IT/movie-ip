import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findPoster, cleanTitle } from "@/lib/posters/lookup";
import { requireEditor } from "@/lib/posters/guard";

export const maxDuration = 300;

export interface ScanRow {
  movieId: string;
  title: string;
  searchedTitle: string;
  releaseYear?: string;
  language?: string;
  found: boolean;
  provider?: "tmdb" | "omdb";
  imageUrl?: string;
  matchedTitle?: string;
  matchedYear?: string;
  confidence?: "exact" | "likely" | "weak";
}

/**
 * Look up poster candidates for every movie with no poster_url.
 *
 * Read-only: nothing is written here. The client reviews the candidates and
 * posts the approved subset to /api/posters/commit.
 */
export async function POST() {
  const denied = await requireEditor();
  if (denied) return denied;

  if (!process.env.TMDB_API_KEY && !process.env.OMDB_API_KEY) {
    return NextResponse.json(
      { error: "No poster provider configured. Set TMDB_API_KEY and/or OMDB_API_KEY." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: movies, error } = await supabase
    .from("movies")
    .select("id, title, release_year, language, poster_url")
    .order("title");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const missing = (movies ?? []).filter((m) => !m.poster_url?.trim());

  const results: ScanRow[] = [];
  for (const movie of missing) {
    const candidate = await findPoster(movie.title, movie.release_year ?? undefined);
    results.push({
      movieId: movie.id,
      title: movie.title,
      searchedTitle: cleanTitle(movie.title),
      releaseYear: movie.release_year ?? undefined,
      language: movie.language ?? undefined,
      found: Boolean(candidate),
      provider: candidate?.provider,
      imageUrl: candidate?.imageUrl,
      matchedTitle: candidate?.matchedTitle,
      matchedYear: candidate?.matchedYear,
      confidence: candidate?.confidence,
    });
  }

  return NextResponse.json({
    totalMissing: missing.length,
    foundCount: results.filter((r) => r.found).length,
    results,
  });
}
