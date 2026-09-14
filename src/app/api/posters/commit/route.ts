import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEditor } from "@/lib/posters/guard";

export const maxDuration = 300;

interface CommitItem {
  movieId: string;
  title: string;
  imageUrl: string;
}

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

/**
 * Download each approved poster once and re-host it in Supabase storage, then
 * write poster_url. Storing rather than hotlinking keeps posters working if the
 * provider rotates or removes the image, and avoids per-render API calls.
 */
export async function POST(request: Request) {
  const denied = await requireEditor();
  if (denied) return denied;

  const body = (await request.json()) as { items?: CommitItem[] };
  const items = body.items ?? [];

  if (items.length === 0) {
    return NextResponse.json({ error: "No items supplied" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const saved: string[] = [];
  const failed: Array<{ movieId: string; title: string; reason: string }> = [];

  for (const item of items) {
    try {
      const imageRes = await fetch(item.imageUrl);
      if (!imageRes.ok) {
        failed.push({ movieId: item.movieId, title: item.title, reason: `Download failed (${imageRes.status})` });
        continue;
      }

      const contentType = (imageRes.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        failed.push({ movieId: item.movieId, title: item.title, reason: `Unsupported image type: ${contentType || "unknown"}` });
        continue;
      }

      const bytes = new Uint8Array(await imageRes.arrayBuffer());

      // Mirrors the path convention used by the bulk poster upload dialog.
      const safeTitle = item.title.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
      const path = `posters/${Date.now()}_${safeTitle}.${extensionFor(contentType)}`;

      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(path, bytes, { cacheControl: "3600", upsert: true, contentType });

      if (uploadError) {
        failed.push({ movieId: item.movieId, title: item.title, reason: `Upload failed: ${uploadError.message}` });
        continue;
      }

      const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);

      const { error: updateError } = await supabase
        .from("movies")
        .update({ poster_url: urlData.publicUrl })
        .eq("id", item.movieId);

      if (updateError) {
        failed.push({ movieId: item.movieId, title: item.title, reason: `DB update failed: ${updateError.message}` });
        continue;
      }

      saved.push(item.movieId);
    } catch (err) {
      failed.push({
        movieId: item.movieId,
        title: item.title,
        reason: err instanceof Error ? err.message : "Unexpected error",
      });
    }
  }

  return NextResponse.json({ savedCount: saved.length, failed });
}
