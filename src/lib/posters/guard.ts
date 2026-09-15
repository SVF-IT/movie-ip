import { createClient as createServerClient } from "@/lib/supabase/server";
import { isEditorRole } from "@/lib/types/database";

/**
 * Poster backfill is restricted to editor-tier roles (editor, data_analyst).
 *
 * Hiding the button is not enough — these routes write to storage and to
 * movies.poster_url, so the role is re-checked server-side against the
 * caller's session on every request.
 *
 * Returns null when the caller is allowed, or the response to send back.
 */
export async function requireEditor(): Promise<Response | null> {
  const serverClient = await createServerClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await serverClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !isEditorRole(profile.role)) {
    return Response.json(
      { error: "Only editors can fetch posters." },
      { status: 403 }
    );
  }

  return null;
}
