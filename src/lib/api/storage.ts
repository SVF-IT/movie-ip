import { createClient } from "@/lib/supabase/client";

export interface FileObject {
  name: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: Record<string, unknown>;
}

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

export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) throw new Error(`Failed to get signed URL: ${error.message}`);
  return data.signedUrl;
}

export async function deleteFile(
  bucket: string,
  path: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) throw new Error(`Delete failed: ${error.message}`);
}

export async function listFiles(
  bucket: string,
  folder: string
): Promise<FileObject[]> {
  const supabase = createClient();

  const { data, error } = await supabase.storage.from(bucket).list(folder);

  if (error) throw new Error(`List failed: ${error.message}`);
  return (data as FileObject[]) || [];
}
