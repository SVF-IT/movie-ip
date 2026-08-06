import { createClient } from "@/lib/supabase/client";

export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  const supabase = createClient();

  // Simulate progress since Supabase JS doesn't expose upload progress
  onProgress?.(10);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { cacheControl: "3600", upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  onProgress?.(90);

  // For public buckets, get public URL
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

  onProgress?.(100);

  return urlData.publicUrl;
}

export async function deleteFile(
  bucket: string,
  path: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) throw new Error(`Delete failed: ${error.message}`);
}
