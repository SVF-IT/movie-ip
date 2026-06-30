import { createClient } from "@/lib/supabase/client";
import type {
  MovieWithDetails,
  PlatformRight,
  MoviePeople,
  ExpiringRight,
  Person,
  GroupedMovie,
  MovieLanguageVersion,
} from "@/lib/types/database";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import { generateNextCode, CODE_PREFIXES } from "@/lib/utils/code-generator";

const supabase = createClient();
const MAX_LIMIT = 200;

export async function getMovies(options?: {
  source?: "home_production" | "acquired";
  search?: string;
  language?: string;
  certification?: string[];
  yearFrom?: number;
  yearTo?: number;
  territory?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: MovieWithDetails[]; count: number }> {
  // First try the view
  let query = supabase
    .from("movies_with_details")
    .select("*", { count: "exact" });

  if (options?.source) {
    query = query.eq("source", options.source);
  }

  if (options?.search) {
    query = query.ilike("title", `%${options.search}%`);
  }

  if (options?.language) {
    query = query.eq("language", options.language);
  }

  if (options?.certification && options.certification.length > 0) {
    const certs = [...options.certification];
    if (certs.includes('UA') && !certs.includes('U/A')) {
      certs.push('U/A');
    }
    query = query.in("certification", certs);
  }

  if (options?.yearFrom) {
    query = query.gte("release_year", options.yearFrom);
  }

  if (options?.yearTo) {
    query = query.lte("release_year", options.yearTo);
  }

  if (options?.territory) {
    query = query.ilike("territory", `%${options.territory}%`);
  }

  query = query.order("title");

  const limit = Math.min(options?.limit || 50, MAX_LIMIT);
  query = query.limit(limit);

  if (options?.offset) {
    query = query.range(options.offset, options.offset + limit - 1);
  }

  const { data, error, count } = await query;

  // If view doesn't exist, fall back to direct query
  if (error && error.message.includes("does not exist")) {
    return getMoviesFromTable(options);
  }

  if (error) throw sanitizeError(error);

  return { data: data || [], count: count || 0 };
}

// Fallback function when view doesn't exist
async function getMoviesFromTable(options?: {
  source?: "home_production" | "acquired";
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: MovieWithDetails[]; count: number }> {
  let query = supabase
    .from("movies")
    .select(`*`, { count: "exact" });

  if (options?.source) {
    query = query.eq("source", options.source);
  }

  if (options?.search) {
    query = query.ilike("title", `%${options.search}%`);
  }

  query = query.order("title");

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error, count } = await query;

  if (error) throw sanitizeError(error);

  // Transform data to match MovieWithDetails interface
  const moviesWithDetails: MovieWithDetails[] = await Promise.all(
    (data || []).map(async (movie: Record<string, unknown>) => {
      const { data: peopleData } = await supabase
        .from("movie_people")
        .select("role, billing_order, people(name)")
        .eq("movie_id", movie.id)
        .order("billing_order");

      const castNames = peopleData
        ?.filter((r: Record<string, unknown>) => r.role === "Actor")
        .map((r: Record<string, unknown>) => (r.people as { name: string } | null)?.name)
        .filter(Boolean).join(", ");
      const directorNames = peopleData
        ?.filter((r: Record<string, unknown>) => r.role === "Director")
        .map((r: Record<string, unknown>) => (r.people as { name: string } | null)?.name)
        .filter(Boolean).join(", ");

      return {
        ...movie,
        language: movie.language as string | null,
        production_house_name: movie.production_house_name as string | null,
        cast_names: castNames || undefined,
        director_names: directorNames || undefined,
      };
    })
  );

  return { data: moviesWithDetails, count: count || 0 };
}

export async function getMovieById(id: string): Promise<MovieWithDetails | null> {
  // Try view first
  const { data, error } = await supabase
    .from("movies_with_details")
    .select("*")
    .eq("id", id)
    .single();

  if (error && error.message.includes("does not exist")) {
    // Fall back to direct query
    return getMovieByIdFromTable(id);
  }

  if (error) throw sanitizeError(error);
  return data;
}

async function getMovieByIdFromTable(id: string): Promise<MovieWithDetails | null> {
  const { data: movie, error } = await supabase
    .from("movies")
    .select(`*`)
    .eq("id", id)
    .single();

  if (error) throw sanitizeError(error);
  if (!movie) return null;

  const { data: peopleData } = await supabase
    .from("movie_people")
    .select("role, billing_order, people(name)")
    .eq("movie_id", id)
    .order("billing_order");

  const castNames = peopleData
    ?.filter((r: Record<string, unknown>) => r.role === "Actor")
    .map((r: Record<string, unknown>) => (r.people as { name: string } | null)?.name)
    .filter(Boolean).join(", ");
  const directorNames = peopleData
    ?.filter((r: Record<string, unknown>) => r.role === "Director")
    .map((r: Record<string, unknown>) => (r.people as { name: string } | null)?.name)
    .filter(Boolean).join(", ");

  return {
    ...movie,
    language_name: (movie as { language: string | null }).language,
    production_house_name: (movie as Record<string, unknown>).production_house_name as string,
    cast_names: castNames || undefined,
    director_names: directorNames || undefined,
  };
}

export async function getMovieRights(movieId: string): Promise<PlatformRight[]> {
  const { data, error } = await supabase
    .from("platform_rights")
    .select(`
      *,
      platforms(name, platform_type)
    `)
    .eq("movie_id", movieId)
    .or(`end_date.is.null,end_date.gte.${new Date().toISOString().split("T")[0]}`)
    .order("start_date", { ascending: false });

  if (error) throw sanitizeError(error);
  return data || [];
}

export async function getMovieExpiredRights(movieId: string): Promise<PlatformRight[]> {
  const { data, error } = await supabase
    .from("platform_rights")
    .select(`
      *,
      platforms(name, platform_type)
    `)
    .eq("movie_id", movieId)
    .not("end_date", "is", null)
    .lt("end_date", new Date().toISOString().split("T")[0])
    .order("end_date", { ascending: false });

  if (error) throw sanitizeError(error);
  return data || [];
}

export async function getBulkMoviePlatformRights(movieIds: string[]): Promise<Record<string, PlatformRight[]>> {
  if (movieIds.length === 0) return {};
  const { data, error } = await supabase
    .from("platform_rights")
    .select(`*, platforms(name, platform_type)`)
    .in("movie_id", movieIds)
    .order("start_date", { ascending: true });
  if (error) throw sanitizeError(error);
  const map: Record<string, PlatformRight[]> = {};
  for (const r of data || []) {
    if (!map[r.movie_id]) map[r.movie_id] = [];
    map[r.movie_id].push(r);
  }
  return map;
}

export async function getMoviePeople(movieId: string): Promise<MoviePeople[]> {
  const { data, error } = await supabase
    .from("movie_people")
    .select(`*, person:people(id, name, role)`)
    .eq("movie_id", movieId)
    .order("role")
    .order("billing_order");

  if (error) throw sanitizeError(error);
  return data || [];
}

export async function getMovieCast(movieId: string): Promise<MoviePeople[]> {
  const { data, error } = await supabase
    .from("movie_people")
    .select(`*, person:people(id, name, role)`)
    .eq("movie_id", movieId)
    .eq("role", "Actor")
    .order("billing_order");

  if (error) throw sanitizeError(error);
  return data || [];
}

export async function getMovieDirectors(movieId: string): Promise<MoviePeople[]> {
  const { data, error } = await supabase
    .from("movie_people")
    .select(`*, person:people(id, name, role)`)
    .eq("movie_id", movieId)
    .eq("role", "Director");

  if (error) throw sanitizeError(error);
  return data || [];
}

export async function getExpiringRights(
  fromDate?: string,
  toDate?: string
): Promise<ExpiringRight[]> {
  const today = new Date();
  const startDate = fromDate || today.toISOString().split('T')[0];
  // If toDate is not provided, we assume "All time" and use a far-future date
  const endDate = toDate || '2099-12-31';

  // Try to fetch from platform_rights with date range
  const { data, error } = await supabase
    .from("platform_rights")
    .select(`
      *,
      movies(id, title, source),
      platforms(name, platform_type)
    `)
    .eq("is_current", true)
    .gte("end_date", startDate)
    .lte("end_date", endDate)
    .order("end_date");

  if (error) throw sanitizeError(error);

  return (data || []).map((right: Record<string, unknown>) => {
    const rightEndDate = new Date(right.end_date as string);
    const daysUntilExpiry = Math.ceil((rightEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    const movies = right.movies as { id?: string; title?: string; source?: string } | null;
    const platforms = right.platforms as { name?: string; platform_type?: string } | null;

    return {
      ...right,
      movie_id: movies?.id || (right.movie_id as string),
      movie_title: movies?.title || "Unknown",
      movie_source: (movies?.source as "home_production" | "acquired") || "home_production",
      platform_name: platforms?.name,
      rights_type_name: platforms?.platform_type,
      days_until_expiry: daysUntilExpiry,
    } as ExpiringRight;
  });
}

export async function getAvailableForRights(): Promise<MovieWithDetails[]> {
  // First try the view
  const { data, error } = await supabase
    .from("available_for_rights")
    .select("*")
    .limit(50);

  if (!error && data) {
    return data;
  }

  // Fall back to getting movies without active rights
  const { data: moviesData, error: moviesError } = await supabase
    .from("movies")
    .select("*")
    .limit(50);

  if (moviesError) throw sanitizeError(moviesError);
  return moviesData || [];
}

export async function createMovie(
  movie: Partial<MovieWithDetails>
): Promise<MovieWithDetails> {
  const code = await generateNextCode(CODE_PREFIXES.movies, "movies");
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch the creator's role to determine approval status
  let approvalStatus: "pending" | "approved" = "pending";
  if (user?.id) {
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single();
    if (profile?.role === "legal" || profile?.role === "admin") approvalStatus = "approved";
  }

  const { data, error } = await supabase
    .from("movies")
    .insert({
      ...movie,
      code,
      wtp_library: movie.wtp_library || "WTP",
      approval_status: approvalStatus,
      created_by: user?.id ?? null,
      recensor_flag: movie.certification === "A" ? true : (movie.recensor_flag ?? false),
    })
    .select()
    .single();

  if (error) throw sanitizeError(error);
  return data;
}

export async function updateMovie(
  id: string,
  movie: Partial<MovieWithDetails>
): Promise<MovieWithDetails> {
  // Auto-set recensor_flag when certification explicitly changes to A
  const payload = { ...movie };
  if (payload.certification === "A" && payload.recensor_flag === undefined) {
    payload.recensor_flag = true;
  }

  const { data, error } = await supabase
    .from("movies")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw sanitizeError(error);
  return data;
}

export async function deleteMovie(id: string): Promise<void> {
  const { error } = await supabase.from("movies").delete().eq("id", id);

  if (error) throw sanitizeError(error);
}

// Lookup functions for movie form
export async function getLanguages(): Promise<string[]> {
  const { data, error } = await supabase
    .from("movies")
    .select("language")
    .not("language", "is", null);

  if (error) throw sanitizeError(error);

  const uniqueLanguages = Array.from(new Set((data as { language: string }[]).map(m => m.language)));
  return uniqueLanguages.sort();
}

// Re-exported from production-houses.ts for backward compatibility
export { getProductionHouses } from "@/lib/api/production-houses";

export async function searchPeople(search: string): Promise<Person[]> {
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .ilike("name", `%${search}%`)
    .order("name")
    .limit(20);

  if (error) throw sanitizeError(error);
  return data || [];
}

export async function addMoviePerson(
  movieId: string,
  personId: string,
  role: "Actor" | "Director",
  billingOrder?: number
): Promise<MoviePeople> {
  const { data, error } = await supabase
    .from("movie_people")
    .upsert(
      { movie_id: movieId, person_id: personId, role, billing_order: billingOrder ?? null },
      { onConflict: "movie_id,person_id,role", ignoreDuplicates: false }
    )
    .select(`*, person:people(id, name, role)`)
    .single();

  if (error) throw sanitizeError(error);

  // Keep people.role tag in sync
  await syncPersonRole(personId);

  return data;
}

export async function removeMoviePerson(id: string, personId: string): Promise<void> {
  const { error } = await supabase.from("movie_people").delete().eq("id", id);
  if (error) throw sanitizeError(error);
  await syncPersonRole(personId);
}

async function syncPersonRole(personId: string): Promise<void> {
  const { data } = await supabase
    .from("movie_people")
    .select("role")
    .eq("person_id", personId);

  const roles = new Set((data || []).map((r: { role: string }) => r.role));
  let newRole: string | null = null;
  if (roles.has("Actor") && roles.has("Director")) newRole = "both";
  else if (roles.has("Director")) newRole = "director";
  else if (roles.has("Actor")) newRole = "actor";

  await supabase.from("people").update({ role: newRole }).eq("id", personId);
}

// ─── Legacy shims (kept for any existing callers) ────────────────────────────
export async function addMovieCast(movieId: string, personId: string, _role = "Actor", billingOrder = 0): Promise<MoviePeople> {
  return addMoviePerson(movieId, personId, "Actor", billingOrder);
}
export async function removeMovieCast(id: string): Promise<void> {
  const { data } = await supabase.from("movie_people").select("person_id").eq("id", id).single();
  await removeMoviePerson(id, data?.person_id ?? "");
}
export async function addMovieDirector(movieId: string, personId: string): Promise<MoviePeople> {
  return addMoviePerson(movieId, personId, "Director");
}
export async function removeMovieDirector(id: string): Promise<void> {
  const { data } = await supabase.from("movie_people").select("person_id").eq("id", id).single();
  await removeMoviePerson(id, data?.person_id ?? "");
}

/**
 * Get movies grouped by production number
 * Each group contains all language versions of the same movie
 */
export async function getGroupedMovies(options?: {
  source?: "home_production" | "acquired" | "expired" | "bangladeshi" | "sold";
  search?: string;
  language?: string;
  certification?: string[];
  yearFrom?: number;
  yearTo?: number;
  territory?: string;
  natureOfRights?: string;
  sortBy?: 'title_asc' | 'title_desc' | 'created_at_desc' | 'release_date_asc' | 'release_date_desc';
  limit?: number;
  offset?: number;
  approvalStatus?: "pending" | "approved" | "rejected" | "all";
}): Promise<{ data: GroupedMovie[]; count: number }> {
  let query = supabase
    .from("movies_with_details")
    .select("*", { count: "exact" });

  const now = new Date().toISOString().split('T')[0];

  if (options?.source === 'expired') {
    // EXPIRED: acquired movies with a past agreement_end_date
    query = query.eq("source", "acquired").lt("agreement_end_date", now);
  } else if (options?.source === 'home_production') {
    // HOME: all home_production movies — only explicitly Sold are hidden
    query = query.eq("source", "home_production")
      .or(`nature_of_rights.is.null,nature_of_rights.not.ilike.%Sold%`);
  } else if (options?.source === 'acquired') {
    // ACQUIRED: non-expired acquired movies (no end date, or end date >= today)
    query = query.eq("source", "acquired")
      .or(`agreement_end_date.is.null,agreement_end_date.gte.${now}`);
  } else if (options?.source === 'bangladeshi') {
    // BANGLADESHI: all movies flagged as bangladeshi — no agreement date filtering
    query = query.eq("is_bangladeshi", true);
  } else if (options?.source === 'sold') {
    // SOLD: home prod movies with "Sold" in nature_of_rights
    query = query.eq("source", "home_production").ilike("nature_of_rights", "%Sold%");
  } else {
    // ALL: home (not explicitly sold) + acquired (not expired)
    query = query.or(
      `and(source.eq.home_production,or(nature_of_rights.is.null,nature_of_rights.not.ilike.%Sold%)),` +
      `and(source.eq.acquired,or(agreement_end_date.is.null,agreement_end_date.gte.${now}))`
    );
  }

  // By default show only approved movies; pass approvalStatus="all" to see everything
  const approvalFilter = options?.approvalStatus || "approved";
  if (approvalFilter !== "all") {
    query = query.eq("approval_status", approvalFilter);
  }

  if (options?.search) {
    // Note: director_names and cast_names only exist on the movies_with_details view,
    // not the base movies table, so we only search title and production_no here.
    query = query.or(`title.ilike.%${options.search}%,production_no.ilike.%${options.search}%`);
  }

  if (options?.language) {
    query = query.eq("language", options.language);
  }

  if (options?.certification && options.certification.length > 0) {
    const certs = [...options.certification];
    if (certs.includes('UA') && !certs.includes('U/A')) {
      certs.push('U/A');
    }
    query = query.in("certification", certs);
  }

  if (options?.yearFrom) {
    query = query.gte("release_year", options.yearFrom);
  }

  if (options?.yearTo) {
    query = query.lte("release_year", options.yearTo);
  }

  if (options?.territory) {
    const territory = options.territory;
    if (territory === 'World Wide') {
      query = query.eq("territory", "World");
    } else if (territory === 'India') {
      query = query.ilike("territory", "%India%");
    } else if (territory === 'Others') {
      // Not World exactly AND does not contain India
      query = query.not("territory", "eq", "World").not("territory", "ilike", "%India%");
    } else {
      query = query.ilike("territory", `%${territory}%`);
    }
  }

  if (options?.natureOfRights && options.natureOfRights !== 'all') {
    const nature = options.natureOfRights;
    const standardNatures = ['Exclusive', 'Non-Exclusive', 'Jointly Owned', 'Sold', 'Sold to Grassroot'];

    if (nature === 'Sold' || nature === 'Sold/Expired') {
      query = query.ilike("nature_of_rights", "%Sold%");
    } else if (nature === 'Jointly Owned') {
      query = query.eq("nature_of_rights", 'Jointly Owned');
    } else if (nature === 'Other') {
      query = query.not("nature_of_rights", "in", `(${standardNatures.map(n => `'${n}'`).join(',')})`);
    } else {
      query = query.eq("nature_of_rights", nature);
    }
  }

  // Initial database sort by title just in case
  query = query.order("title");

  const { data: allMovies, error } = await query;

  if (error) throw sanitizeError(error);

  // Group movies by production_no
  const groupsMap = new Map<string, GroupedMovie>();

  (allMovies || []).forEach((movie: MovieWithDetails) => {
    // Use production_no if available, otherwise use the movie ID as a unique key
    const groupKey = movie.production_no || `single_${movie.id}`;

    if (!groupsMap.has(groupKey)) {
      // Determine base title (remove language suffix in parentheses)
      const baseTitle = movie.title.replace(/\s*\([^)]*\)\s*$/, "").trim();

      // Create new group
      groupsMap.set(groupKey, {
        production_no: groupKey,
        title: baseTitle,
        source: movie.source,
        release_year: movie.release_year,
        poster_url: movie.poster_url,
        trailer_link: movie.trailer_link,
        production_house_name: movie.production_house_name,
        cast_names: movie.cast_names,
        director_names: movie.director_names,
        certification: movie.certification,
        nature_of_rights: movie.nature_of_rights === 'Jointly Production' ? 'Jointly Owned' : movie.nature_of_rights,
        versions: [],
        total_versions: 0,
        total_rights: 0,
        expired_rights: 0,
        created_at: movie.created_at,
      });
    }

    const group = groupsMap.get(groupKey)!;

    // Determine if this is the primary version (usually the one without language suffix or first one)
    const isPrimary = !movie.title.includes("(") || group.versions.length === 0;

    const version: MovieLanguageVersion = {
      ...movie,
      is_primary: isPrimary,
    };

    group.versions.push(version);
    if (isPrimary) {
      group.primary_version = version;
      // Update group's created_at to the primary version's if it exists
      if (movie.created_at) {
        group.created_at = movie.created_at;
      }
    }
    group.total_versions = group.versions.length;
  });

  // Calculate rights counts for each group
  const allMovieIds = (allMovies || []).map((m: MovieWithDetails) => m.id);

  if (allMovieIds.length > 0) {
    const [rightsRes, extraDetailsRes] = await Promise.all([
      supabase
        .from("platform_rights")
        .select("movie_id, end_date")
        .in("movie_id", allMovieIds),
      supabase
        .from("movies")
        .select("id, wtp_library")
        .in("id", allMovieIds)
    ]);

    const allRights = rightsRes.data;
    const extraDetails = extraDetailsRes.data;

    if (extraDetails) {
      const extraDetailsMap = new Map(extraDetails.map((d: any) => [d.id, d.wtp_library]));
      groupsMap.forEach(group => {
        group.versions.forEach(version => {
          version.wtp_library = extraDetailsMap.get(version.id) as string | undefined;
        });
        if (group.primary_version) {
          group.primary_version.wtp_library = extraDetailsMap.get(group.primary_version.id) as string | undefined;
        }
      });
    }

    if (allRights) {
      const movieRightsMap = new Map<string, { total: number; expired: number }>();

      allRights.forEach((right: any) => {
        const current = movieRightsMap.get(right.movie_id) || { total: 0, expired: 0 };
        const isExpired = right.end_date && new Date(right.end_date) < new Date();

        movieRightsMap.set(right.movie_id, {
          total: current.total + 1,
          expired: current.expired + (isExpired ? 1 : 0)
        });
      });

      groupsMap.forEach(group => {
        group.versions.forEach(version => {
          const counts = movieRightsMap.get(version.id);
          if (counts) {
            group.total_rights += counts.total;
            group.expired_rights += counts.expired;
          }
        });
      });
    }
  }

  // Convert map to array and apply sorting
  let groupedArray = Array.from(groupsMap.values());

  const sortBy = options?.sortBy || 'title_asc';

  if (sortBy === 'title_asc') {
    groupedArray.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'title_desc') {
    groupedArray.sort((a, b) => b.title.localeCompare(a.title));
  } else if (sortBy === 'release_date_desc') {
    groupedArray.sort((a, b) => {
      const dateA = a.primary_version?.release_date ? new Date(a.primary_version.release_date).getTime() : (a.release_year ? new Date(`${a.release_year}-01-01`).getTime() : 0);
      const dateB = b.primary_version?.release_date ? new Date(b.primary_version.release_date).getTime() : (b.release_year ? new Date(`${b.release_year}-01-01`).getTime() : 0);
      return dateB - dateA;
    });
  } else if (sortBy === 'release_date_asc') {
    groupedArray.sort((a, b) => {
      const dateA = a.primary_version?.release_date ? new Date(a.primary_version.release_date).getTime() : (a.release_year ? new Date(`${a.release_year}-01-01`).getTime() : 9999999999999);
      const dateB = b.primary_version?.release_date ? new Date(b.primary_version.release_date).getTime() : (b.release_year ? new Date(`${b.release_year}-01-01`).getTime() : 9999999999999);
      return dateA - dateB;
    });
  } else if (sortBy === 'created_at_desc') {
    groupedArray.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }

  const totalGroups = groupedArray.length;

  // Apply pagination to groups
  if (options?.limit || options?.offset) {
    const start = options?.offset || 0;
    const end = start + (options?.limit || 50);
    groupedArray = groupedArray.slice(start, end);
  }

  return { data: groupedArray, count: totalGroups };
}

/**
 * Get all language versions of a movie by production number
 */
export async function getMovieVersions(productionNo: string): Promise<MovieLanguageVersion[]> {
  const { data, error } = await supabase
    .from("movies_with_details")
    .select("*")
    .eq("production_no", productionNo)
    .order("title");

  if (error) throw sanitizeError(error);

  return (data || []).map((movie: MovieWithDetails, index: number): MovieLanguageVersion => ({
    ...movie,
    is_primary: index === 0, // First one is considered primary
  }));
}
