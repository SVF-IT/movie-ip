import { createClient } from "@/lib/supabase/client";
import type { Person } from "@/lib/types/database";
import { sanitizeError } from "@/lib/utils/sanitize-error";

const supabase = createClient();
export interface PersonWithStats extends Person {
  role?: "actor" | "director" | "both";
  movies_count?: number;
  movies_as_actor?: number;
  movies_as_director?: number;
  // role is also stored on people.role in DB; PersonWithStats mirrors it
}

/**
 * Normalizes a movie title by removing content in parentheses (e.g., "(Hindi)", "(Dubbed)")
 * and trimming whitespace. This ensures versioned movies are counted once.
 */
function normalizeMovieTitle(title: string): string {
  if (!title) return "";
  // Remove everything inside parentheses and the parentheses themselves
  // Also handle nested or multiple parentheses if needed, but basic one is most common
  return title.replace(/\s*\([^)]*\)/g, "").trim();
}

export async function getPeopleWithStats(options?: {
  search?: string;
  role?: "actor" | "director" | "both";
  limit?: number;
  offset?: number;
}): Promise<{ data: PersonWithStats[]; count: number }> {
  try {
    // Get all people with their counts
    let query = supabase.from("people").select("*", { count: "exact" });

    if (options?.search) {
      query = query.ilike("name", `%${options.search}%`);
    }

    query = query.order("name");

    const limit = options?.limit || 1000;
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 1000) - 1);
    }

    const { data: people, error, count } = await query;

    if (error) throw sanitizeError(error);

    const personIds = (people || []).map((p: { id: string }) => p.id);

    let allMoviePeopleData: any[] = [];
    if (personIds.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < personIds.length; i += CHUNK_SIZE) {
        const chunkIds = personIds.slice(i, i + CHUNK_SIZE);
        
        let mpOffset = 0;
        const mpLimit = 1000;
        let hasMoreMp = true;
        while (hasMoreMp) {
          const { data: mpData, error: mpError } = await supabase
            .from("movie_people")
            .select("person_id, role, movies(title)")
            .in("person_id", chunkIds)
            .range(mpOffset, mpOffset + mpLimit - 1);
          
          if (mpError) throw sanitizeError(mpError);
          
          if (mpData && mpData.length > 0) {
            allMoviePeopleData = [...allMoviePeopleData, ...mpData];
            if (mpData.length < mpLimit) {
              hasMoreMp = false;
            } else {
              mpOffset += mpLimit;
            }
          } else {
            hasMoreMp = false;
          }
        }
      }
    }

    const actorUniqueTitles = new Map<string, Set<string>>();
    const directorUniqueTitles = new Map<string, Set<string>>();

    (allMoviePeopleData || []).forEach((r: any) => {
      const title = r.movies?.title;
      if (!title) return;
      const normalized = normalizeMovieTitle(title);
      if (r.role === "Actor") {
        if (!actorUniqueTitles.has(r.person_id)) actorUniqueTitles.set(r.person_id, new Set());
        actorUniqueTitles.get(r.person_id)!.add(normalized);
      } else if (r.role === "Director") {
        if (!directorUniqueTitles.has(r.person_id)) directorUniqueTitles.set(r.person_id, new Set());
        directorUniqueTitles.get(r.person_id)!.add(normalized);
      }
    });

    const peopleWithStats: PersonWithStats[] = (people || []).map(
      (person: { id: string; name: string; role?: string; created_at?: string; updated_at?: string }) => {
        const actorTitles = actorUniqueTitles.get(person.id) || new Set();
        const directorTitles = directorUniqueTitles.get(person.id) || new Set();

        const moviesAsActor = actorTitles.size;
        const moviesAsDirector = directorTitles.size;

        const allUniqueTitles = new Set([...actorTitles, ...directorTitles]);
        const totalMovies = allUniqueTitles.size;

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
          movies_count: totalMovies,
          movies_as_actor: moviesAsActor,
          movies_as_director: moviesAsDirector,
        };
      }
    );

    // Filter by role if specified
    let filteredPeople = peopleWithStats;
    if (options?.role) {
      filteredPeople = peopleWithStats.filter((p) => {
        if (options.role === "both") return p.role === "both";
        if (options.role === "actor") return p.role === "actor" || p.role === "both";
        if (options.role === "director") return p.role === "director" || p.role === "both";
        return true;
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
    const { data: person, error } = await supabase
      .from("people")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw sanitizeError(error);
    if (!person) return null;

    const { data: moviePeopleData } = await supabase
      .from("movie_people")
      .select("role, movies(title)")
      .eq("person_id", id);

    const actorTitles = new Set<string>();
    const directorTitles = new Set<string>();

    (moviePeopleData || []).forEach((r: any) => {
      const title = r.movies?.title;
      if (!title) return;
      const normalized = normalizeMovieTitle(title);
      if (r.role === "Actor") actorTitles.add(normalized);
      else if (r.role === "Director") directorTitles.add(normalized);
    });

    const moviesAsActor = actorTitles.size;
    const moviesAsDirector = directorTitles.size;

    const allUniqueTitles = new Set([...actorTitles, ...directorTitles]);
    const totalMovies = allUniqueTitles.size;

    let role: "actor" | "director" | "both" = "actor";
    if (moviesAsActor > 0 && moviesAsDirector > 0) {
      role = "both";
    } else if (moviesAsDirector > 0) {
      role = "director";
    }

    return {
      ...person,
      role,
      movies_count: totalMovies,
      movies_as_actor: moviesAsActor,
      movies_as_director: moviesAsDirector,
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
