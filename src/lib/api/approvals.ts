import { createClient } from "@/lib/supabase/client";
import type { ApprovalStatus, MovieApproval } from "@/lib/types/database";
import { sanitizeError } from "@/lib/utils/sanitize-error";

const supabase = createClient();

export interface PendingMovieForApproval {
  id: string;
  title: string;
  code?: string;
  source: string;
  production_no?: string;
  release_year?: string;
  language?: string;
  certification?: string;
  production_house_name?: string;
  cast_names?: string;
  director_names?: string;
  jointly_owned?: boolean;
  revenue_share?: string;
  joint_prod_buy_back_date?: string;
  jointly_exploitation_rights?: string;
  approval_status: ApprovalStatus;
  created_at?: string;
  approval_history?: MovieApproval[];
}

export async function getPendingMovies(options?: {
  status?: ApprovalStatus | "all";
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: PendingMovieForApproval[]; count: number }> {
  try {
    let query = supabase
      .from("movies_with_details")
      .select("*", { count: "exact" });

    const status = options?.status || "pending";
    if (status !== "all") {
      query = query.eq("approval_status", status);
    }

    if (options?.search) {
      query = query.ilike("title", `%${options.search}%`);
    }

    query = query.order("created_at", { ascending: false });

    const limit = options?.limit || 50;
    query = query.limit(limit);

    if (options?.offset) {
      query = query.range(options.offset, options.offset + limit - 1);
    }

    const { data: movies, error, count } = await query;
    if (error) throw sanitizeError(error);

    return { data: (movies || []) as PendingMovieForApproval[], count: count || 0 };
  } catch (error) {
    console.error("Error fetching pending movies:", error);
    return { data: [], count: 0 };
  }
}

export async function getMovieApprovalHistory(movieId: string): Promise<MovieApproval[]> {
  try {
    const { data, error } = await supabase
      .from("movie_approvals")
      .select("*")
      .eq("movie_id", movieId)
      .order("created_at", { ascending: false });

    if (error) throw sanitizeError(error);
    return (data || []) as MovieApproval[];
  } catch (error) {
    console.error("Error fetching approval history:", error);
    return [];
  }
}

export async function approveMovie(
  movieId: string,
  reviewerName: string,
  reviewedBy?: string
): Promise<void> {
  // Guard: only pending/rejected movies can be approved
  const { data: movie, error: fetchError } = await supabase
    .from("movies")
    .select("approval_status")
    .eq("id", movieId)
    .single();
  if (fetchError) throw sanitizeError(fetchError);
  if (movie?.approval_status === "approved") throw new Error("Movie is already approved");

  const { error: updateError } = await supabase
    .from("movies")
    .update({ approval_status: "approved" })
    .eq("id", movieId);
  if (updateError) throw sanitizeError(updateError);

  const { error: logError } = await supabase.from("movie_approvals").insert({
    movie_id: movieId,
    status: "approved",
    reviewed_by: reviewedBy || null,
    reviewer_name: reviewerName,
    reason: null,
  });
  if (logError) throw sanitizeError(logError);
}

export async function rejectMovie(
  movieId: string,
  reason: string,
  reviewerName: string,
  reviewedBy?: string
): Promise<void> {
  if (!reason?.trim()) throw new Error("Rejection reason is required");

  // Guard: approved movies cannot be rejected
  const { data: movie, error: fetchError } = await supabase
    .from("movies")
    .select("approval_status")
    .eq("id", movieId)
    .single();
  if (fetchError) throw sanitizeError(fetchError);
  if (movie?.approval_status === "approved") throw new Error("Approved movies cannot be rejected");

  const { error: updateError } = await supabase
    .from("movies")
    .update({ approval_status: "rejected" })
    .eq("id", movieId);
  if (updateError) throw sanitizeError(updateError);

  const { error: logError } = await supabase.from("movie_approvals").insert({
    movie_id: movieId,
    status: "rejected",
    reviewed_by: reviewedBy || null,
    reviewer_name: reviewerName,
    reason: reason.trim(),
  });
  if (logError) throw sanitizeError(logError);
}

export async function resubmitMovie(movieId: string): Promise<void> {
  // Guard: only rejected movies can be resubmitted
  const { data: movie, error: fetchError } = await supabase
    .from("movies")
    .select("approval_status")
    .eq("id", movieId)
    .single();
  if (fetchError) throw sanitizeError(fetchError);
  if (movie?.approval_status === "approved") throw new Error("Movie is already approved");

  const { error: updateError } = await supabase
    .from("movies")
    .update({ approval_status: "pending" })
    .eq("id", movieId);
  if (updateError) throw sanitizeError(updateError);

  // Log the resubmission in the audit trail
  const reason = movie?.approval_status === "rejected"
    ? "Resubmitted after edit"
    : "Updated while pending review";
  const { error: logError } = await supabase.from("movie_approvals").insert({
    movie_id: movieId,
    status: "pending",
    reviewed_by: null,
    reviewer_name: null,
    reason,
  });
  if (logError) throw sanitizeError(logError);
}
