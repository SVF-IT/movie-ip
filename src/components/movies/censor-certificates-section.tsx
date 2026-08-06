"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoleGate } from "@/components/role-gate";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type CensorCertificate,
  CENSOR_CERTIFICATE_ACCEPTED_TYPES,
  createCensorCertificate,
  deleteCensorCertificate,
  getCensorCertificates,
  getCensorCertificateUrl,
  replaceCensorCertificateFile,
  updateCensorCertificateTag,
} from "@/lib/api/censor-certificates";
import {
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function CensorCertificatesSection({ movieId }: { movieId: string }) {
  const { profile } = useAuth();
  const toast = useAppToast();

  const [certificates, setCertificates] = useState<CensorCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTag, setEditTag] = useState("");
  const [savingTagId, setSavingTagId] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [deletingCert, setDeletingCert] = useState<CensorCertificate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCensorCertificates(movieId);
      setCertificates(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load censor certificates");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUploadClick = () => uploadInputRef.current?.click();

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadInputRef.current) uploadInputRef.current.value = "";

    setUploading(true);
    try {
      const created = await createCensorCertificate({
        movieId,
        file,
        tag: tagInput.trim() || null,
        createdBy: profile?.id || "",
        createdByName: profile?.full_name || "Unknown",
      });
      setCertificates(prev => [created, ...prev]);
      setTagInput("");
      toast.success("Certificate uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload certificate");
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceClick = (id: string) => {
    setReplacingId(id);
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    const id = replacingId;
    setReplacingId(null);
    if (!file || !id) return;

    const existing = certificates.find(c => c.id === id);
    if (!existing) return;

    setUploading(true);
    try {
      const updated = await replaceCensorCertificateFile({
        id,
        movieId,
        file,
        oldFilePath: existing.file_path,
      });
      setCertificates(prev => prev.map(c => (c.id === id ? updated : c)));
      toast.success("Certificate file replaced");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to replace certificate file");
    } finally {
      setUploading(false);
    }
  };

  const startEditTag = (cert: CensorCertificate) => {
    setEditingId(cert.id);
    setEditTag(cert.tag || "");
  };

  const saveTag = async (id: string) => {
    setSavingTagId(id);
    try {
      const updated = await updateCensorCertificateTag(id, editTag.trim() || null);
      setCertificates(prev => prev.map(c => (c.id === id ? updated : c)));
      setEditingId(null);
      toast.success("Tag updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update tag");
    } finally {
      setSavingTagId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deletingCert) return;
    setIsDeleting(true);
    try {
      await deleteCensorCertificate(deletingCert.id, deletingCert.file_path);
      setCertificates(prev => prev.filter(c => c.id !== deletingCert.id));
      toast.success("Certificate deleted");
      setDeletingCert(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete certificate");
    } finally {
      setIsDeleting(false);
    }
  };

  const acceptAttr = CENSOR_CERTIFICATE_ACCEPTED_TYPES.join(",");

  return (
    <div className="bg-(--panel-solid) border border-(--svf-border) rounded-[12px] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-(--svf-border) flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-[10px] bg-emerald-500/10 border border-emerald-500/20">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-(--text)">Censor Certificates</h3>
            <p className="text-[11px] text-(--text-faint)">Certificate files for this movie</p>
          </div>
          {certificates.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-(--bg-deep) text-(--text-faint)">
              {certificates.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            placeholder="Tag (optional) e.g. New Censor Certificate"
            className="h-8 text-xs w-56"
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept={acceptAttr}
            className="hidden"
            onChange={handleUploadFile}
          />
          <RoleGate
            action="create"
            resource="censor_certificate"
            showDisabledFallback
            disabledReason="You don't have permission to upload censor certificates."
          >
            <Button
              size="sm"
              className="h-8 px-4 text-xs"
              onClick={handleUploadClick}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Upload Certificate
            </Button>
          </RoleGate>
        </div>
      </div>

      <input
        ref={replaceInputRef}
        type="file"
        accept={acceptAttr}
        className="hidden"
        onChange={handleReplaceFile}
      />

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-(--text-faint)" />
        </div>
      ) : certificates.length === 0 ? (
        <div className="py-10 text-center">
          <FileText className="h-7 w-7 mx-auto mb-2 text-(--text-faint) opacity-40" />
          <p className="text-sm text-(--text-faint)">No censor certificates uploaded yet</p>
        </div>
      ) : (
        <div className="divide-y divide-(--svf-border)">
          {certificates.map(cert => (
            <div key={cert.id} className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-(--hover) transition-colors">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-9 w-9 rounded-[10px] bg-(--bg-raise) border border-(--svf-border) flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-(--text-faint)" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-(--text) truncate">{cert.file_name}</span>
                    {editingId === cert.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editTag}
                          onChange={e => setEditTag(e.target.value)}
                          className="h-6 text-[11px] w-40"
                          autoFocus
                        />
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => saveTag(cert.id)}
                          disabled={savingTagId === cert.id}
                        >
                          {savingTagId === cert.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                        </Button>
                        <Button size="icon-sm" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : cert.tag ? (
                      <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-(--bg-deep) border border-(--svf-border) text-(--text-faint)">
                        {cert.tag}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-(--text-faint) mt-0.5">
                    Uploaded {formatDate(cert.created_at)}
                    {cert.created_by_name ? ` by ${cert.created_by_name}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon-sm" asChild className="text-(--text-faint) hover:text-(--text)">
                  <a href={getCensorCertificateUrl(cert.file_path)} target="_blank" rel="noopener noreferrer" download={cert.file_name}>
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </Button>

                <RoleGate
                  action="edit"
                  resource="censor_certificate"
                  showDisabledFallback
                  disabledReason="You don't have permission to edit censor certificates."
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-(--text-faint) hover:text-(--text)"
                    onClick={() => startEditTag(cert)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </RoleGate>

                <RoleGate
                  action="edit"
                  resource="censor_certificate"
                  showDisabledFallback
                  disabledReason="You don't have permission to replace censor certificate files."
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-(--text-faint) hover:text-(--text)"
                    onClick={() => handleReplaceClick(cert.id)}
                    disabled={uploading}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </RoleGate>

                <RoleGate
                  action="delete"
                  resource="censor_certificate"
                  showDisabledFallback
                  disabledReason="You don't have permission to delete censor certificates."
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-(--text-faint) hover:text-red-500"
                    onClick={() => setDeletingCert(cert)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </RoleGate>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deletingCert} onOpenChange={open => !open && setDeletingCert(null)}>
        <AlertDialogContent className="bg-(--panel-solid) border-(--svf-border-strong) shadow-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-[10px] bg-red-500/10 border border-red-500/20">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <AlertDialogTitle className="text-(--text) text-lg">Delete Certificate?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-(--text-faint) leading-relaxed">
              <span className="font-semibold text-(--text)">{deletingCert?.file_name}</span> will be permanently deleted, including the stored file. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-2">
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Deleting…</> : <><Trash2 className="h-4 w-4 mr-1.5" />Delete</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
