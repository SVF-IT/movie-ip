"use client";

import { useCallback, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { uploadFile, deleteFile } from "@/lib/api/storage";

interface FileUploadProps {
  bucket: string;
  folder: string;
  accept?: string;
  maxSizeMB?: number;
  currentUrl?: string;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  label?: string;
  variant?: "image" | "document";
}

const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const docTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export function FileUpload({
  bucket,
  folder,
  accept,
  maxSizeMB = 5,
  currentUrl,
  onUpload,
  onRemove,
  label = "Upload file",
  variant = "document",
}: FileUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const allowedTypes = variant === "image" ? imageTypes : docTypes;

  const validateFile = useCallback(
    (file: File): string | null => {
      if (file.size > maxSizeMB * 1024 * 1024) {
        return `File must be under ${maxSizeMB >= 1 ? `${maxSizeMB}MB` : `${Math.round(maxSizeMB * 1024)}KB`}. Selected file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`;
      }
      if (accept) {
        const acceptedExts = accept.split(",").map((a) => a.trim());
        const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
        if (!acceptedExts.includes(ext) && !acceptedExts.includes(file.type)) {
          return `Unsupported file type. Allowed: ${accept}`;
        }
      } else if (!allowedTypes.includes(file.type)) {
        return `Unsupported file type`;
      }
      return null;
    },
    [maxSizeMB, accept, allowedTypes]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setUploading(true);
      setError(null);
      setProgress(0);

      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const timestamp = Date.now();
        const path = `${folder}/${timestamp}.${ext}`;

        const url = await uploadFile(bucket, path, file, setProgress);
        onUpload(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [bucket, folder, validateFile, onUpload]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleRemove = async () => {
    if (currentUrl) {
      try {
        const urlObj = new URL(currentUrl);
        const pathParts = urlObj.pathname.split(`/storage/v1/object/public/${bucket}/`);
        if (pathParts[1]) {
          await deleteFile(bucket, pathParts[1]);
        }
      } catch {
        // Ignore delete errors — file may not exist
      }
    }
    onRemove?.();
  };

  const acceptStr =
    accept ||
    (variant === "image"
      ? ".jpg,.jpeg,.png,.webp"
      : ".pdf,.doc,.docx,.xls,.xlsx");

  if (currentUrl) {
    return (
      <div className="border rounded-lg p-3 flex items-center gap-3">
        {variant === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt="Preview"
            className="h-16 w-16 object-cover rounded"
          />
        ) : (
          <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {variant === "image" ? "Poster uploaded" : "Document uploaded"}
          </p>
          <p className="text-xs text-muted-foreground truncate">{currentUrl}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          className="shrink-0 text-destructive hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50"
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="space-y-2">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm font-medium">Uploading...</p>
            <div className="w-full bg-muted rounded-full h-1.5 max-w-xs mx-auto">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            {variant === "image" ? (
              <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            ) : (
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            )}
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Drag & drop or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {acceptStr.replace(/\./g, "").toUpperCase().replace(/,/g, ", ")} &mdash; Max {maxSizeMB >= 1 ? `${maxSizeMB}MB` : `${Math.round(maxSizeMB * 1024)}KB`}
            </p>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={acceptStr}
        onChange={handleFileChange}
        className="hidden"
      />
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
