import { createClient } from "@/lib/supabase/client";
import type { Person } from "@/lib/types/database";
import { sanitizeError } from "@/lib/utils/sanitize-error";

const supabase = createClient();
export interface PersonWithStats extends Person {
  role?: "actor" | "director" | "both";
  movies_count?: number;
  movies_as_actor?: number;
  movies_as_director?: number;
  movies_list?: string[];
  movies?: any[];
  // role is also stored on people.role in DB; PersonWithStats mirrors it
}

// Title normalization (stripping "(Hindi)", "(Dubbed)", … so language versions
// count once) now happens in the people_with_stats view, alongside the counts.

export async function getPeopleWithStats(options?: {
  search?: string;
  role?: ("actor" | "director")[];
  limit?: number;
  offset?: number;
}): Promise<{ data: PersonWithStats[]; count: number }> {
  if (options?.role && options.role.length === 0) {
    return { data: [], count: 0 };
  }
  try {
    // One query against people_with_stats: the view computes the per-person
    // counts in the database. This used to fan out into ~23 sequential round
    // trips (people, then movie_people in chunks of 50, then movies in chunks
    // of 200), which cost about six seconds before the page could paint.
    let query = supabase.from("people_with_stats").select("*", { count: "exact" });

    if (options?.search) {
      query = query.ilike("name", `%${options.search}%`);
    }

    query = query.order("name");

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 1000) - 1);
    }

    const { data, error, count } = await query;

    if (error) throw sanitizeError(error);

    // Postgres returns the COUNT columns as bigint, which supabase-js hands
    // back as strings, so the counts are widened here and coerced below.
    type StatsRow = Person & {
      movies_count?: number | string | null;
      movies_as_actor?: number | string | null;
      movies_as_director?: number | string | null;
      movies_list?: string[] | null;
    };

    const peopleWithStats: PersonWithStats[] = (data || []).map((person: StatsRow) => {
      const moviesAsActor = Number(person.movies_as_actor) || 0;
      const moviesAsDirector = Number(person.movies_as_director) || 0;

      // Prefer DB role tag; fall back to deriving it from counts
      let role: "actor" | "director" | "both" = "actor";
      if (person.role === "both" || (moviesAsActor > 0 && moviesAsDirector > 0)) {
        role = "both";
      } else if (person.role === "director" || moviesAsDirector > 0) {
        role = "director";
      }

      return {
        ...person,
        role,
        movies_count: Number(person.movies_count) || 0,
        movies_as_actor: moviesAsActor,
        movies_as_director: moviesAsDirector,
        movies_list: person.movies_list ?? [],
      };
    });

    // Filter by role if specified — only a genuine narrowing (partial or empty selection) is
    // applied; when both actor/director are selected, that's equivalent to no filter.
    let filteredPeople = peopleWithStats;
    if (options?.role && options.role.length < 2) {
      const selected = new Set(options.role);
      filteredPeople = peopleWithStats.filter((p) => {
        if (p.role === "both") return selected.has("actor") || selected.has("director");
        return selected.has(p.role as "actor" | "director");
      });
    }

    return { data: filteredPeople, count: count || 0 };
  } catch (error) {
    console.error("Error fetching people with stats:", error);
    return { data: [], count: 0 };
  }
}

export async function getPersonById(id: string): Promise<PersonWithStats | null> {
  try {
    // Single query against the view — it already carries the counts and the
    // deduplicated title list, so no follow-up movie_people/movies fetches.
    const { data: person, error } = await supabase
      .from("people_with_stats")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw sanitizeError(error);
    if (!person) return null;

    const moviesAsActor = Number(person.movies_as_actor) || 0;
    const moviesAsDirector = Number(person.movies_as_director) || 0;

    let role: "actor" | "director" | "both" = "actor";
    if (person.role === "both" || (moviesAsActor > 0 && moviesAsDirector > 0)) {
      role = "both";
    } else if (person.role === "director" || moviesAsDirector > 0) {
      role = "director";
    }

    return {
      ...person,
      role,
      movies_count: Number(person.movies_count) || 0,
      movies_as_actor: moviesAsActor,
      movies_as_director: moviesAsDirector,
      movies_list: person.movies_list ?? [],
    };
  } catch (error) {
    console.error("Error fetching person:", error);
    return null;
  }
}

export async function createPerson(name: string, role?: "actor" | "director" | "both"): Promise<Person> {
  const { data, error } = await supabase
    .from("people")
    .insert({ name, role: role ?? null })
    .select()
    .single();

  if (error) throw sanitizeError(error);
  return data;
}

export async function updatePerson(id: string, name: string, role?: "actor" | "director" | "both"): Promise<Person> {
  const update: Record<string, unknown> = { name };
  if (role !== undefined) update.role = role;
  const { data, error } = await supabase
    .from("people")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) throw sanitizeError(error);
  return data;
}

export async function getPersonMovieTitles(personId: string): Promise<string> {
  const { data } = await supabase
    .from("movie_people")
    .select("movies(title)")
    .eq("person_id", personId);

  if (!data) return "";
  const normalized = (title: string) => title.replace(/\s*\([^)]*\)/g, "").trim();
  const unique = [...new Set((data as any[]).map(r => normalized(r.movies?.title || "")).filter(Boolean))];
  unique.sort();
  return unique.join(", ");
}

export async function deletePerson(id: string): Promise<void> {
  const { error } = await supabase.from("people").delete().eq("id", id);
  if (error) throw sanitizeError(error);
}
