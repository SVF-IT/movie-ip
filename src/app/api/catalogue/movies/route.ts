import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/catalogue/movies?title=<text>&limit=20
 * GET /api/catalogue/movies?id=<uuid>
 *
 * Read-only movie metadata for the SVF Music app (album → movie mapping).
 * Server-to-server only: callers must send `x-catalogue-key: CATALOGUE_API_SECRET`.
 * API routes are excluded from the auth middleware, so this key is the only gate.
 *
 * Only descriptive metadata leaves this app. Columns are whitelisted explicitly —
 * never `select("*")` here — so rights, licensor, holdbacks, revenue share,
 * BARC and approval data can't leak when new columns are added to `movies`.
 * Only approved movies are exposed.
 */

const METADATA_COLUMNS =
  "id, title, production_no, language, release_date, release_year, certification, production_house_name, color_or_bw, poster_url, trailer_link";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CATALOGUE_API_SECRET;
  const provided = request.headers.get("x-catalogue-key");
  if (!secret || !provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Escape LIKE wildcards so a title containing % or _ matches literally.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  const title = searchParams.get("title")?.trim() ?? "";
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  if (!id && title.length < 2) {
    return NextResponse.json(
      { error: "Provide ?title= (at least 2 characters) or ?id=" },
      { status: 400 }
    );
  }

  // A malformed id would make Postgres throw on the uuid cast — treat it as not found.
  if (id && !UUID_RE.test(id)) {
    return NextResponse.json({ results: [] });
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("movies")
    .select(METADATA_COLUMNS)
    .eq("approval_status", "approved");

  query = id
    ? query.eq("id", id)
    : query.ilike("title", `%${escapeLike(title)}%`).order("title").limit(limit);

  const { data: movies, error } = await query;
  if (error) {
    console.error("catalogue/movies query failed:", error.message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  const ids = (movies ?? []).map((m) => m.id);
  const { data: peopleRows } = ids.length
    ? await supabase
        .from("movie_people")
        .select("movie_id, role, billing_order, people(name)")
        .in("movie_id", ids)
        .order("billing_order")
    : { data: [] };

  const peopleByMovie = new Map<string, { cast: string[]; crew: Record<string, string[]> }>();
  for (const row of (peopleRows ?? []) as unknown as Array<{
    movie_id: string;
    role: string;
    people: { name: string } | null;
  }>) {
    const name = row.people?.name;
    if (!name) continue;
    const entry = peopleByMovie.get(row.movie_id) ?? { cast: [], crew: {} };
    if (row.role === "Actor") entry.cast.push(name);
    else (entry.crew[row.role] ??= []).push(name);
    peopleByMovie.set(row.movie_id, entry);
  }

  // Exact title matches first, then alphabetical (already ordered by the query).
  const needle = title.toLowerCase();
  const results = (movies ?? [])
    .map((m) => ({ ...m, ...(peopleByMovie.get(m.id) ?? { cast: [], crew: {} }) }))
    .sort((a, b) => Number(b.title.toLowerCase() === needle) - Number(a.title.toLowerCase() === needle));

  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
