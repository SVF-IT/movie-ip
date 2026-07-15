import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyMovieCreated } from "@/lib/email/notification-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/movie-created
 * Notify eligible users that a new movie was added. Called from the client
 * right after a successful createMovie() — best-effort, non-blocking for the caller.
 *
 * Body: { movieId, movieTitle, movieCode, source, releaseYear?, language? }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { movieId, movieTitle, movieCode, source, releaseYear, language } = body;
    if (!movieId || !movieTitle || !source) {
      return NextResponse.json({ error: "movieId, movieTitle, and source are required" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    await notifyMovieCreated(
      {
        movieId,
        movieTitle,
        movieCode: movieCode || movieId,
        source,
        releaseYear: releaseYear || undefined,
        language: language || undefined,
        createdBy: profile?.full_name || "A team member",
      },
      user.id
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending movie-created notification:", error);
    // Best-effort — don't fail the movie-creation flow over a notification error
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
