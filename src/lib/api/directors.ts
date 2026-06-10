import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const normalizeTitle = (title: string) => title.replace(/\s*\([^)]*\)/g, "").trim();

export interface DirectorMovie {
  movie_id: string;
  movie_title: string;
  production_no: string | null;
  release_year: string | null;
  source: string | null;
  language_name: string | null;
}

export interface DirectorWithMovies {
  id: string;
  name: string;
  movies: DirectorMovie[];
  movies_count: number;
}

export async function getDirectorsWithMovies(options?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: DirectorWithMovies[]; count: number }> {
  try {
    // First get person IDs that appear in movie_people as Director (catches null-role people)
    const { data: linkedEntries, error: linkedError } = await supabase
      .from("movie_people")
      .select("person_id, movie_id")
      .in("role", ["Director", "director"]);
    if (linkedError) throw linkedError;

    const linkedPersonIds = [...new Set((linkedEntries || []).map((e: { person_id: string }) => e.person_id))];

    // Fetch people who are explicitly tagged director/both OR are linked as Director in movie_people
    let peopleQuery = supabase
      .from("people")
      .select("id, name, role")
      .order("name");

    if (linkedPersonIds.length > 0) {
      peopleQuery = (peopleQuery as any).or(
        `role.eq.director,role.eq.both,id.in.(${linkedPersonIds.join(",")})`
      );
    } else {
      peopleQuery = peopleQuery.in("role", ["director", "both"]);
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
    const movieMap = new Map<string, DirectorMovie>();
    if (movieIds.length > 0) {
      const { data: movies, error: moviesError } = await supabase
        .from("movies")
        .select("id, title, production_no, release_year, source, language")
        .in("id", movieIds);
      if (moviesError) throw moviesError;
      for (const movie of movies || []) {
        movieMap.set(movie.id, {
          movie_id: movie.id,
          movie_title: movie.title,
          production_no: movie.production_no || null,
          release_year: movie.release_year,
          source: movie.source,
          language_name: movie.language || null,
        });
      }
    }

    // Build per-director movie list
    const directorMoviesMap = new Map<string, Set<string>>();
    for (const entry of entries || []) {
      if (!directorMoviesMap.has(entry.person_id)) directorMoviesMap.set(entry.person_id, new Set());
      directorMoviesMap.get(entry.person_id)!.add(entry.movie_id);
    }

    let directors: DirectorWithMovies[] = people.map((person: { id: string; name: string }) => {
      const movieIdSet = directorMoviesMap.get(person.id) || new Set();
      const directorMovies: DirectorMovie[] = [];
      for (const movieId of movieIdSet) {
        const m = movieMap.get(movieId);
        if (m) directorMovies.push(m);
      }
      directorMovies.sort((a, b) => (parseInt(b.release_year || "0") || 0) - (parseInt(a.release_year || "0") || 0));
      const uniqueKeys = new Set(directorMovies.map((m) => m.production_no?.trim() || normalizeTitle(m.movie_title)));
      return { id: person.id, name: person.name, movies: directorMovies, movies_count: uniqueKeys.size };
    });

    const totalCount = directors.length;
    if (options?.offset !== undefined) directors = directors.slice(options.offset);
    if (options?.limit !== undefined) directors = directors.slice(0, options.limit);

    return { data: directors, count: totalCount };
  } catch (error) {
    console.error("Error fetching directors with movies:", error);
    return { data: [], count: 0 };
  }
}

export async function getDirectorById(id: string): Promise<DirectorWithMovies | null> {
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
      .in("role", ["Director", "director"]);

    if (entriesError) throw entriesError;

    const movieIds = (entries || []).map((e: { movie_id: string }) => e.movie_id);

    if (movieIds.length === 0) return { id: person.id, name: person.name, movies: [], movies_count: 0 };

    const { data: movies, error: moviesError } = await supabase
      .from("movies")
      .select("id, title, production_no, release_year, source, language")
      .in("id", movieIds);

    if (moviesError) throw moviesError;

    const directorMovies: DirectorMovie[] = (movies || []).map((movie: any) => ({
      movie_id: movie.id,
      movie_title: movie.title,
      production_no: movie.production_no || null,
      release_year: movie.release_year,
      source: movie.source,
      language_name: movie.language || null,
    }));

    directorMovies.sort((a, b) => (parseInt(b.release_year || "0") || 0) - (parseInt(a.release_year || "0") || 0));
    const uniqueKeys = new Set(directorMovies.map((m) => m.production_no?.trim() || normalizeTitle(m.movie_title)));
    return { id: person.id, name: person.name, movies: directorMovies, movies_count: uniqueKeys.size };
  } catch (error) {
    console.error("Error fetching director:", error);
    return null;
  }
}
