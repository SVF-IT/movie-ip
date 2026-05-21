import { createClient } from "@/lib/supabase/client";
import type { ProductionHouse } from "@/lib/types/database";
import { sanitizeError } from "@/lib/utils/sanitize-error";

const supabase = createClient();
const MAX_LIMIT = 200;

export interface ProductionHouseWithStats extends ProductionHouse {
  movie_count?: number;
}

export async function getProductionHousesWithStats(options?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: ProductionHouseWithStats[]; count: number }> {
  try {
    let query = supabase.from("production_houses").select("*", { count: "exact" });

    if (options?.search) {
      query = query.ilike("name", `%${options.search}%`);
    }

    query = query.order("name");

    const limit = Math.min(options?.limit || 50, MAX_LIMIT);
    query = query.limit(limit);

    if (options?.offset) {
      query = query.range(options.offset, options.offset + limit - 1);
    }

    const { data: houses, error, count } = await query;

    if (error) throw sanitizeError(error);

    const houseNames = (houses || []).map((h: { name: string }) => h.name);

    // Batch fetch movie counts by name
    const { data: movieData } = await supabase
      .from("movies")
      .select("production_house_name")
      .in("production_house_name", houseNames);

    const movieCounts = new Map<string, number>();
    (movieData || []).forEach((m: { production_house_name: string }) => {
      movieCounts.set(m.production_house_name, (movieCounts.get(m.production_house_name) || 0) + 1);
    });

    const housesWithStats: ProductionHouseWithStats[] = (houses || []).map(
      (house: ProductionHouse) => ({
        ...house,
        movie_count: movieCounts.get(house.name) || 0,
      })
    );

    return { data: housesWithStats, count: count || 0 };
  } catch (error) {
    console.error("Error fetching production houses with stats:", error);
    return { data: [], count: 0 };
  }
}

export async function getProductionHouseById(id: string): Promise<ProductionHouseWithStats | null> {
  try {
    const { data: house, error } = await supabase
      .from("production_houses")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw sanitizeError(error);
    if (!house) return null;

    const { count } = await supabase
      .from("movies")
      .select("*", { count: "exact", head: true })
      .eq("production_house_name", house.name);

    return {
      ...house,
      movie_count: count || 0,
    };
  } catch (error) {
    console.error("Error fetching production house:", error);
    return null;
  }
}

export async function getProductionHouses(): Promise<ProductionHouse[]> {
  const { data, error } = await supabase
    .from("production_houses")
    .select("*")
    .order("name");

  if (error) throw sanitizeError(error);
  return data || [];
}

export async function createProductionHouse(
  data: { name: string }
): Promise<ProductionHouse> {
  const { data: house, error } = await supabase
    .from("production_houses")
    .insert(data)
    .select()
    .single();

  if (error) throw sanitizeError(error);
  return house;
}

export async function getOrCreateProductionHouse(name: string): Promise<ProductionHouse> {
  const { data: existing, error: fetchError } = await supabase
    .from("production_houses")
    .select("*")
    .ilike("name", name.trim())
    .single();

  if (existing) return existing;

  return createProductionHouse({ name: name.trim() });
}

export async function updateProductionHouse(
  id: string,
  data: { name?: string }
): Promise<ProductionHouse> {
  const { data: house, error } = await supabase
    .from("production_houses")
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) throw sanitizeError(error);
  return house;
}

export async function deleteProductionHouse(id: string): Promise<void> {
  const { error } = await supabase.from("production_houses").delete().eq("id", id);
  if (error) throw sanitizeError(error);
}
