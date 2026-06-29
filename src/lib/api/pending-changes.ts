import { createClient } from "@/lib/supabase/client";
import { sanitizeError } from "@/lib/utils/sanitize-error";
import type { PlatformRight } from "@/lib/types/database";

const supabase = createClient();

export type PendingChangeType =
  | "movie_fields"
  | "right_create"
  | "right_update"
  | "right_delete"
  | "person_add"
  | "person_remove";

export type PendingChangeStatus = "pending" | "approved" | "rejected";

export interface PendingChange {
  id: string;
  movie_id: string;
  changed_by?: string;
  changed_by_name?: string;
  change_type: PendingChangeType;
  change_summary: string;
  payload: Record<string, unknown>;
  status: PendingChangeStatus;
  reviewed_by?: string;
  reviewer_name?: string;
  reason?: string;
  reviewed_at?: string;
  created_at: string;
  // joined
  movie?: { id: string; title: string };
}

// ─── Submit ───────────────────────────────────────────────────────────────────

function emptyToNull(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === "" ? null : v])
  );
}

export async function submitMovieFieldChange(
  movieId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changedByName: string,
  changedBy?: string
): Promise<PendingChange> {
  const cleanBefore = emptyToNull(before);
  const cleanAfter = emptyToNull(after);

  const changedFields = Object.keys(cleanAfter).filter(
    (k) => JSON.stringify(cleanBefore[k]) !== JSON.stringify(cleanAfter[k])
  );
  const summary = `Updated field${changedFields.length !== 1 ? "s" : ""}: ${changedFields.join(", ")}`;

  const { data, error } = await supabase
    .from("movie_pending_changes")
    .insert({
      movie_id: movieId,
      changed_by: changedBy || null,
      changed_by_name: changedByName,
      change_type: "movie_fields",
      change_summary: summary,
      payload: { before: cleanBefore, after: cleanAfter },
    })
    .select()
    .single();

  if (error) throw sanitizeError(error);
  return data as PendingChange;
}

export async function submitRightChange(
  movieId: string,
  changeType: "right_create" | "right_update" | "right_delete",
  rightData: Partial<PlatformRight>,
  changedByName: string,
  changedBy?: string,
  originalRight?: Partial<PlatformRight>
): Promise<PendingChange> {
  const verb = changeType === "right_create" ? "Create" : changeType === "right_update" ? "Update" : "Delete";
  const platform = (rightData as any)?.platforms?.name || rightData.platform_id || "platform";
  const rightsType = (rightData as any)?.platforms?.platform_type || "right";
  const summary = `${verb} right — ${platform} / ${rightsType}`;

  const payload: Record<string, unknown> = { after: rightData };
  if (originalRight) payload.before = originalRight;
  if (rightData.id) payload.right_id = rightData.id;

  const { data, error } = await supabase
    .from("movie_pending_changes")
    .insert({
      movie_id: movieId,
      changed_by: changedBy || null,
      changed_by_name: changedByName,
      change_type: changeType,
      change_summary: summary,
      payload,
    })
    .select()
    .single();

  if (error) throw sanitizeError(error);
  return data as PendingChange;
}

export async function submitPersonChange(
  movieId: string,
  changeType: "person_add" | "person_remove",
  personId: string,
  personName: string,
  role: "Actor" | "Director",
  changedByName: string,
  changedBy?: string
): Promise<PendingChange> {
  const verb = changeType === "person_add" ? "Add" : "Remove";
  const summary = `${verb} ${role}: ${personName}`;

  const { data, error } = await supabase
    .from("movie_pending_changes")
    .insert({
      movie_id: movieId,
      changed_by: changedBy || null,
      changed_by_name: changedByName,
      change_type: changeType,
      change_summary: summary,
      payload: { person_id: personId, person_name: personName, role },
    })
    .select()
    .single();

  if (error) throw sanitizeError(error);
  return data as PendingChange;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function getPendingChanges(options?: {
  status?: PendingChangeStatus | "all";
  movieId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: PendingChange[]; count: number }> {
  try {
    let query = supabase
      .from("movie_pending_changes")
      .select("*", { count: "exact" });

    const status = options?.status ?? "pending";
    if (status !== "all") query = query.eq("status", status);
    if (options?.movieId) query = query.eq("movie_id", options.movieId);

    query = query.order("created_at", { ascending: false });

    const limit = options?.limit ?? 50;
    query = query.limit(limit);
    if (options?.offset) query = query.range(options.offset, options.offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw sanitizeError(error);

    let results = (data || []) as PendingChange[];

    // Enrich with movie titles via a separate query (avoids PostgREST FK join ambiguity)
    if (results.length > 0) {
      const movieIds = [...new Set(results.map((r) => r.movie_id))];
      const { data: movies } = await supabase
        .from("movies")
        .select("id, title")
        .in("id", movieIds);
      if (movies) {
        const movieMap = Object.fromEntries(movies.map((m) => [m.id, m]));
        results = results.map((r) => ({ ...r, movie: movieMap[r.movie_id] ?? null }));
      }
    }

    if (options?.search) {
      const q = options.search.toLowerCase();
      results = results.filter(
        (c) =>
          (c.movie as any)?.title?.toLowerCase().includes(q) ||
          c.change_summary.toLowerCase().includes(q)
      );
    }

    return { data: results, count: count || 0 };
  } catch (err) {
    console.error("Error fetching pending changes:", err);
    throw err;
  }
}

export async function getMoviePendingChanges(movieId: string): Promise<PendingChange[]> {
  try {
    const { data, error } = await supabase
      .from("movie_pending_changes")
      .select("*")
      .eq("movie_id", movieId)
      .order("created_at", { ascending: false });

    if (error) throw sanitizeError(error);
    return (data || []) as PendingChange[];
  } catch (err) {
    console.error("Error fetching movie pending changes:", err);
    return [];
  }
}

// ─── Approve ──────────────────────────────────────────────────────────────────

export async function approvePendingChange(
  changeId: string,
  reviewerName: string,
  reviewedBy?: string
): Promise<void> {
  // Fetch the change
  const { data: change, error: fetchError } = await supabase
    .from("movie_pending_changes")
    .select("*")
    .eq("id", changeId)
    .single();

  if (fetchError) throw sanitizeError(fetchError);
  if (!change) throw new Error("Change not found");
  if (change.status !== "pending") throw new Error("Change is no longer pending");

  const c = change as PendingChange;

  // Convert empty strings to null for any field — Postgres rejects "" for date/uuid columns
  function cleanPayload(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, v === "" ? null : v])
    );
  }

  // Strip non-column joined relation keys
  const JOIN_KEYS = ["movies", "platforms", "id"];

  // Apply the change
  if (c.change_type === "movie_fields") {
    const after = cleanPayload((c.payload.after || {}) as Record<string, unknown>);
    const { error } = await supabase.from("movies").update(after).eq("id", c.movie_id);
    if (error) throw sanitizeError(error);
  } else if (c.change_type === "right_create") {
    const raw = { ...(c.payload.after as Record<string, unknown>) };
    JOIN_KEYS.forEach(k => delete raw[k]);
    const rightData = cleanPayload(raw);
    const { error } = await supabase.from("platform_rights").insert(rightData);
    if (error) throw sanitizeError(error);
  } else if (c.change_type === "right_update") {
    const rightId = c.payload.right_id as string;
    const raw = { ...(c.payload.after as Record<string, unknown>) };
    JOIN_KEYS.forEach(k => delete raw[k]);
    const rightData = cleanPayload(raw);
    const { error } = await supabase.from("platform_rights").update(rightData).eq("id", rightId);
    if (error) throw sanitizeError(error);
  } else if (c.change_type === "right_delete") {
    const rightId = c.payload.right_id as string;
    const { error } = await supabase.from("platform_rights").delete().eq("id", rightId);
    if (error) throw sanitizeError(error);
  } else if (c.change_type === "person_add") {
    const { person_id, role } = c.payload as { person_id: string; role: string };
    const { error } = await supabase.from("movie_people").insert({
      movie_id: c.movie_id,
      person_id,
      role,
    });
    if (error) throw sanitizeError(error);
  } else if (c.change_type === "person_remove") {
    const { person_id } = c.payload as { person_id: string };
    const { error } = await supabase
      .from("movie_people")
      .delete()
      .eq("movie_id", c.movie_id)
      .eq("person_id", person_id);
    if (error) throw sanitizeError(error);
  }

  // Mark as approved
  const { error: updateError } = await supabase
    .from("movie_pending_changes")
    .update({
      status: "approved",
      reviewed_by: reviewedBy || null,
      reviewer_name: reviewerName,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", changeId);

  if (updateError) throw sanitizeError(updateError);
}

// ─── Reject ───────────────────────────────────────────────────────────────────

export async function rejectPendingChange(
  changeId: string,
  reason: string,
  reviewerName: string,
  reviewedBy?: string
): Promise<void> {
  if (!reason?.trim()) throw new Error("Rejection reason is required");

  const { error } = await supabase
    .from("movie_pending_changes")
    .update({
      status: "rejected",
      reviewed_by: reviewedBy || null,
      reviewer_name: reviewerName,
      reason: reason.trim(),
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", changeId);

  if (error) throw sanitizeError(error);
}
