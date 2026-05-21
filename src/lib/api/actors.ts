import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export interface ActorMovie {
  movie_id: string;
  movie_title: string;
  release_year: string | null;
  source: string | null;
  language_name: string | null;
}

export interface ActorWithMovies {
  id: string;
  name: string;
  movies: ActorMovie[];
  movies_count: number;
}

export async function getActorsWithMovies(options?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: ActorWithMovies[]; count: number }> {
  try {
    // First get person IDs that appear in movie_people as Actor (catches null-role people)
    const { data: linkedEntries, error: linkedError } = await supabase
      .from("movie_people")
      .select("person_id, movie_id")
      .eq("role", "Actor");
    if (linkedError) throw linkedError;

    const linkedPersonIds = [...new Set((linkedEntries || []).map((e: { person_id: string }) => e.person_id))];

    // Fetch people who are explicitly tagged actor/both OR are linked as Actor in movie_people
    let peopleQuery = supabase
      .from("people")
      .select("id, name, role")
      .order("name");

    if (linkedPersonIds.length > 0) {
      peopleQuery = (peopleQuery as any).or(
        `role.eq.actor,role.eq.both,id.in.(${linkedPersonIds.join(",")})`
      );
    } else {
      peopleQuery = peopleQuery.in("role", ["actor", "both"]);
    }

    if (options?.search) {
      peopleQuery = peopleQuery.ilike("name", `%${options.search}%`);
    }

    const { data: people, error: peopleError } = await peopleQuery;
    if (peopleError) throw peopleError;
    if (!people || people.length === 0) return { data: [], count: 0 };

    // Reuse already-fetched movie_people entries, filtered to matched people
    const personIds = people.map((p: { id: string }) => p.id);
    const personIdSet = new Set(personIds);
    const entries = (linkedEntries || []).filter((e: { person_id: string }) => personIdSet.has(e.person_id));

    // Fetch movie details for any linked movies
    const movieIds = [...new Set((entries || []).map((e: { movie_id: string }) => e.movie_id))];
    const movieMap = new Map<string, ActorMovie>();
    if (movieIds.length > 0) {
      const { data: movies, error: moviesError } = await supabase
        .from("movies")
        .select("id, title, release_year, source, language")
        .in("id", movieIds);
      if (moviesError) throw moviesError;
      for (const movie of movies || []) {
        movieMap.set(movie.id, {
          movie_id: movie.id,
          movie_title: movie.title,
          release_year: movie.release_year,
          source: movie.source,
          language_name: movie.language || null,
        });
      }
    }

    // Build per-actor movie list
    const actorMoviesMap = new Map<string, Set<string>>();
    for (const entry of entries || []) {
      if (!actorMoviesMap.has(entry.person_id)) actorMoviesMap.set(entry.person_id, new Set());
      actorMoviesMap.get(entry.person_id)!.add(entry.movie_id);
    }

    let actors: ActorWithMovies[] = people.map((person: { id: string; name: string }) => {
      const movieIdSet = actorMoviesMap.get(person.id) || new Set();
      const actorMovies: ActorMovie[] = [];
      for (const movieId of movieIdSet) {
        const m = movieMap.get(movieId);
        if (m) actorMovies.push(m);
      }
      actorMovies.sort((a, b) => (parseInt(b.release_year || "0") || 0) - (parseInt(a.release_year || "0") || 0));
      return { id: person.id, name: person.name, movies: actorMovies, movies_count: actorMovies.length };
    });

    const totalCount = actors.length;
    if (options?.offset !== undefined) actors = actors.slice(options.offset);
    if (options?.limit !== undefined) actors = actors.slice(0, options.limit);

    return { data: actors, count: totalCount };
  } catch (error) {
    console.error("Error fetching actors with movies:", error);
    return { data: [], count: 0 };
  }
}

export async function getActorById(id: string): Promise<ActorWithMovies | null> {
  try {
    const { data: person, error: personError } = await supabase
      .from("people")
      .select("id, name")
      .eq("id", id)
      .single();

    if (personError) throw personError;
    if (!person) return null;

    const { data: entries, error: entriesError } = await supabase
      .from("movie_people")
      .select("movie_id")
      .eq("person_id", id)
      .eq("role", "Actor");

    if (entriesError) throw entriesError;

    const movieIds = (entries || []).map((e: { movie_id: string }) => e.movie_id);

    if (movieIds.length === 0) return { id: person.id, name: person.name, movies: [], movies_count: 0 };

    const { data: movies, error: moviesError } = await supabase
      .from("movies")
      .select("id, title, release_year, source, language")
      .in("id", movieIds);

    if (moviesError) throw moviesError;

    const actorMovies: ActorMovie[] = (movies || []).map((movie: any) => ({
      movie_id: movie.id,
      movie_title: movie.title,
      release_year: movie.release_year,
      source: movie.source,
      language_name: movie.language || null,
    }));

    actorMovies.sort((a, b) => (parseInt(b.release_year || "0") || 0) - (parseInt(a.release_year || "0") || 0));

    return { id: person.id, name: person.name, movies: actorMovies, movies_count: actorMovies.length };
  } catch (error) {
    console.error("Error fetching actor:", error);
    return null;
  }
}
