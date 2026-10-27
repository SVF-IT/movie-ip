import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STREAMING_PLATFORMS, type MusicRelease, type MusicTrack } from "@/lib/types/music";

/**
 * GET /api/movie-music/[movieId]
 *
 * Read-only proxy to the SVF Music app's movie-music API. Music data lives in the
 * Music Supabase project — nothing is stored here. Movie app users have no Music
 * accounts, so this route checks the session in THIS app and then calls the Music
 * API server-to-server with MUSIC_API_SECRET (never exposed to the browser).
 * Responses are cached for 10 minutes per movie.
 */

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_SECONDS = 600;

// The Music API is a separate codebase; normalise its payload so a drifted field
// type degrades to "missing" instead of crashing the movie page.
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function names(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter((s): s is string => !!s);
  const s = str(v);
  return s ? s.split(",").map((p) => p.trim()).filter(Boolean) : [];
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// Only http(s) links are rendered as anchors — drops javascript: and other schemes.
function link(v: unknown): string | null {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
}

function streamingLinks(v: unknown): MusicTrack["streaming_links"] {
  const out: MusicTrack["streaming_links"] = {};
  if (!v || typeof v !== "object") return out;
  for (const { key } of STREAMING_PLATFORMS) {
    const url = link((v as Record<string, unknown>)[key]);
    if (url) out[key] = url;
  }
  return out;
}

function toTrack(raw: Record<string, unknown>): MusicTrack {
  return {
    id: String(raw.id ?? ""),
    title: str(raw.title) ?? "Untitled",
    track_number: num(raw.track_number),
    singers: names(raw.singers),
    composers: names(raw.composers),
    lyricists: names(raw.lyricists),
    music_arrangers: names(raw.music_arrangers),
    picturised_on: names(raw.picturised_on),
    duration_seconds: num(raw.duration_seconds),
    isrc: str(raw.isrc),
    version: str(raw.version),
    language: str(raw.language),
    explicit: raw.explicit === true,
    preview_url: link(raw.preview_url),
    streaming_links: streamingLinks(raw.streaming_links),
  };
}

function toRelease(raw: Record<string, unknown>): MusicRelease {
  const tracks = Array.isArray(raw.tracks) ? (raw.tracks as Record<string, unknown>[]) : [];
  return {
    id: String(raw.id ?? ""),
    title: str(raw.title) ?? "Untitled",
    type: str(raw.type),
    release_date: str(raw.release_date),
    artwork_url: link(raw.artwork_url),
    upc: str(raw.upc),
    language: str(raw.language),
    genre: str(raw.genre),
    total_duration_seconds: num(raw.total_duration_seconds),
    tracks: tracks
      .map(toTrack)
      .sort((a, b) => (a.track_number ?? Infinity) - (b.track_number ?? Infinity)),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ movieId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // API routes bypass the middleware that signs out deactivated users, so
  // re-check here — a stale session must not keep reaching the Music API.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { movieId } = await params;
  if (!UUID_RE.test(movieId)) {
    return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });
  }

  const apiUrl = process.env.MUSIC_API_URL;
  const secret = process.env.MUSIC_API_SECRET;
  if (!apiUrl || !secret) {
    console.error("movie-music: MUSIC_API_URL / MUSIC_API_SECRET not configured");
    return NextResponse.json({ error: "Music service is not configured" }, { status: 503 });
  }

  const url = new URL(apiUrl);
  url.searchParams.set("movie_id", movieId);

  try {
    const res = await fetch(url, {
      headers: { "x-catalogue-key": secret },
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`movie-music: Music API responded ${res.status} for ${movieId}`);
      return NextResponse.json({ error: "Music service unavailable" }, { status: 502 });
    }

    const body = (await res.json()) as { releases?: unknown };
    const releases = Array.isArray(body.releases)
      ? (body.releases as Record<string, unknown>[]).map(toRelease)
      : [];

    return NextResponse.json(
      { releases },
      { headers: { "Cache-Control": `private, max-age=${CACHE_SECONDS}` } }
    );
  } catch (err) {
    console.error("movie-music: Music API request failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Music service unavailable" }, { status: 502 });
  }
}
