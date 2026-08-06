import { createClient } from "@/lib/supabase/client";
import { uploadFile, deleteFile } from "@/lib/api/storage";
import { sanitizeError } from "@/lib/utils/sanitize-error";

const supabase = createClient();

const BUCKET = "censor-certificates";
export const CENSOR_CERTIFICATE_ACCEPTED_TYPES = [".pdf", ".txt"];
const ACCEPTED_MIME_TYPES = ["application/pdf", "text/plain"];

export interface CensorCertificate {
  id: string;
  movie_id: string;
  file_name: string;
  file_path: string;
  tag: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

function validateFile(file: File): void {
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (!CENSOR_CERTIFICATE_ACCEPTED_TYPES.includes(ext) || !ACCEPTED_MIME_TYPES.includes(file.type)) {
    throw new Error("Only PDF and TXT files are supported.");
  }
}

export function getCensorCertificateUrl(filePath: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

export async function getCensorCertificates(movieId: string): Promise<CensorCertificate[]> {
  const { data, error } = await supabase
    .from("movie_censor_certificates")
    .select("*")
    .eq("movie_id", movieId)
    .order("created_at", { ascending: false });

  if (error) throw sanitizeError(error);
  return data || [];
}

export async function createCensorCertificate(params: {
  movieId: string;
  file: File;
  tag: string | null;
  createdBy: string;
  createdByName: string;
}): Promise<CensorCertificate> {
  validateFile(params.file);

  const ext = params.file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${params.movieId}/${Date.now()}.${ext}`;

  await uploadFile(BUCKET, path, params.file);

  const { data, error } = await supabase
    .from("movie_censor_certificates")
    .insert({
      movie_id: params.movieId,
      file_name: params.file.name,
      file_path: path,
      tag: params.tag,
      created_by: params.createdBy,
      created_by_name: params.createdByName,
    })
    .select()
    .single();

  if (error) {
    // Roll back the uploaded file if the DB insert failed, to avoid an orphan.
    await deleteFile(BUCKET, path).catch(() => {});
    throw sanitizeError(error);
  }
  return data;
}

export async function updateCensorCertificateTag(id: string, tag: string | null): Promise<CensorCertificate> {
  const { data, error } = await supabase
    .from("movie_censor_certificates")
    .update({ tag })
    .eq("id", id)
    .select()
    .single();

  if (error) throw sanitizeError(error);
  return data;
}

export async function replaceCensorCertificateFile(params: {
  id: string;
  movieId: string;
  file: File;
  oldFilePath: string;
}): Promise<CensorCertificate> {
  validateFile(params.file);

  const ext = params.file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${params.movieId}/${Date.now()}.${ext}`;

  await uploadFile(BUCKET, path, params.file);

  const { data, error } = await supabase
    .from("movie_censor_certificates")
    .update({ file_name: params.file.name, file_path: path })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    await deleteFile(BUCKET, path).catch(() => {});
    throw sanitizeError(error);
  }

  // Delete the old file only after the DB row is successfully repointed.
  await deleteFile(BUCKET, params.oldFilePath).catch(() => {});

  return data;
}

export async function deleteCensorCertificate(id: string, filePath: string): Promise<void> {
  const { error } = await supabase
    .from("movie_censor_certificates")
    .delete()
    .eq("id", id);

  if (error) throw sanitizeError(error);

  await deleteFile(BUCKET, filePath).catch(() => {});
}
