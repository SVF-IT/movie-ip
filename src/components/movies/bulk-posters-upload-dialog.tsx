"use client";

import { useState, useCallback, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Upload,
    Search,
    CheckCircle2,
    XCircle,
    Loader2,
    Image as ImageIcon,
    FileImage,
    AlertCircle
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateMovie } from "@/lib/api/movies";
import { uploadFile } from "@/lib/api/storage";

interface BulkPostersUploadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

interface MatchResult {
    file: File;
    matchedMovieId?: string;
    matchedMovieTitle?: string;
    hasExistingPoster?: boolean;
    status: "idle" | "matched" | "no-match" | "uploading" | "success" | "error";
    error?: string;
    selected: boolean;
}

export function BulkPostersUploadDialog({
    open,
    onOpenChange,
    onSuccess,
}: BulkPostersUploadDialogProps) {
    const [matches, setMatches] = useState<MatchResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const normalize = (str: string) => {
        return str
            .toLowerCase()
            .replace(/[^\w\s]/g, " ") // Replace special characters with spaces
            .replace(/\s+/g, " ")    // Normalize spaces
            .trim();
    };

    const tightNormalize = (str: string) => {
        return str.toLowerCase().replace(/[^\w]/g, ""); // Remove everything except alphanumeric
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsProcessing(true);
        try {
            const supabase = createClient();
            // Fetch ALL movies (id, title, and poster_url) directly
            const { data: movies, error } = await supabase
                .from("movies")
                .select("id, title, poster_url");

            if (error) throw error;

            const newMatches: MatchResult[] = files.map((file) => {
                const fullFileName = file.name.split(".")[0];
                const normalizedFileName = normalize(fullFileName);
                const tightFileName = tightNormalize(fullFileName);

                // Extract base title by removing trailing numeric IDs and years
                const cleanedFileName = normalize(fullFileName.replace(/[-\s]\d+$/, "").replace(/\s*\([^)]*\)\s*$/, "").trim());
                const tightCleanedFileName = tightNormalize(fullFileName.replace(/[-\s]\d+$/, "").replace(/\s*\([^)]*\)\s*$/, "").trim());

                const matched = (movies || []).find((m: { id: string; title: string }) => {
                    const dbTitle = m.title;
                    const normTitle = normalize(dbTitle);
                    const tightTitle = tightNormalize(dbTitle);

                    // Remove year for base title matching
                    const baseTitleStr = dbTitle.replace(/\s*\([^)]*\)\s*$/, "").trim();
                    const normBaseTitle = normalize(baseTitleStr);
                    const tightBaseTitle = tightNormalize(baseTitleStr);

                    return (
                        normBaseTitle === normalizedFileName ||
                        tightBaseTitle === tightFileName ||
                        normBaseTitle === cleanedFileName ||
                        tightBaseTitle === tightCleanedFileName ||
                        normalizedFileName.includes(normBaseTitle) ||
                        cleanedFileName.includes(normBaseTitle) ||
                        tightFileName.includes(tightBaseTitle) ||
                        tightCleanedFileName.includes(tightBaseTitle) ||
                        normBaseTitle.includes(normalizedFileName) ||
                        normBaseTitle.includes(cleanedFileName) ||
                        tightBaseTitle.includes(tightFileName) ||
                        tightBaseTitle.includes(tightCleanedFileName)
                    );
                });

                return {
                    file,
                    matchedMovieId: matched?.id,
                    matchedMovieTitle: matched?.title,
                    hasExistingPoster: !!matched?.poster_url,
                    status: matched ? "matched" : "no-match",
                    selected: !!matched
                };
            });

            setMatches(newMatches);
        } catch (err) {
            console.error("Error matching posters:", err);
            alert("Matching Failed: " + (err instanceof Error ? err.message : "Could not fetch movie list."));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUpload = async () => {
        const toUpload = matches.filter(m => m.selected && m.matchedMovieId && m.status !== "success");
        if (toUpload.length === 0) return;

        setIsProcessing(true);
        setUploadProgress(0);
        let successCount = 0;

        for (let i = 0; i < toUpload.length; i++) {
            const match = toUpload[i];
            const matchIdx = matches.indexOf(match);

            // 0. Validation Checks
            const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

            if (!ALLOWED_TYPES.includes(match.file.type)) {
                setMatches(prev => prev.map((m, idx) => idx === matchIdx ? { ...m, status: "error", error: "Format not supported" } : m));
                continue;
            }

            // Update individual status
            setMatches(prev => prev.map((m, idx) => idx === matchIdx ? { ...m, status: "uploading" } : m));

            try {
                // 1. Upload to Supabase Storage ('images' bucket)
                const path = `posters/${Date.now()}_${match.file.name.replace(/\s+/g, "_")}`;
                const posterUrl = await uploadFile("images", path, match.file);

                // 2. Update Movie in Database
                await updateMovie(match.matchedMovieId!, { poster_url: posterUrl } as any);

                setMatches(prev => prev.map((m, idx) => idx === matchIdx ? { ...m, status: "success" } : m));
                successCount++;
            } catch (err) {
                console.error(`Failed to upload ${match.file.name}:`, err);
                setMatches(prev => prev.map((m, idx) => idx === matchIdx ? { ...m, status: "error", error: "Upload failed" } : m));
            }

            setUploadProgress(Math.round(((i + 1) / toUpload.length) * 100));
        }

        setIsProcessing(false);
        alert(`Upload Complete: Successfully updated ${successCount} movie posters.`);

        if (successCount > 0) {
            onSuccess();
        }
    };

    const handleToggleSelect = (index: number) => {
        setMatches(prev => prev.map((m, i) => i === index ? { ...m, selected: !m.selected } : m));
    };

    const handleToggleAll = (checked: boolean) => {
        setMatches(prev => prev.map(m => ({ ...m, selected: checked && m.status === "matched" })));
    };

    const reset = () => {
        setMatches([]);
        setUploadProgress(0);
        setIsProcessing(false);
    };

    const selectedCount = matches.filter(m => m.selected).length;

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!isProcessing) {
                onOpenChange(val);
                if (!val) reset();
            }
        }}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-2xl flex items-center gap-2">
                        <ImageIcon className="h-6 w-6 text-primary" />
                        Upload bulk poster
                    </DialogTitle>
                    <DialogDescription>
                        Select movie poster images to upload. We'll automatically match them to movies in your catalog by filename.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col p-6 pt-2">
                    {matches.length === 0 ? (
                        <div className="flex-1 border-2 border-dashed border-muted-foreground/20 rounded-[12px] flex flex-col items-center justify-center p-12 bg-muted/5">
                            <div className="p-4 rounded-full bg-primary/10 mb-4 text-primary">
                                <Upload className="h-10 w-10" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Select Poster Images</h3>
                            <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
                                Drag and drop your poster files here, or click to browse. Filenames should ideally match movie titles.
                            </p>
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                id="poster-upload"
                                onChange={handleFileSelect}
                            />
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                id="folder-upload"
                                // @ts-ignore - webkitdirectory and directory are non-standard attributes
                                webkitdirectory=""
                                directory=""
                                onChange={handleFileSelect}
                            />
                            <div className="flex gap-4">
                                <Button asChild size="lg" className="h-11 px-8">
                                    <label htmlFor="poster-upload" className="cursor-pointer flex items-center gap-2">
                                        <ImageIcon className="h-4 w-4" />
                                        Select Files
                                    </label>
                                </Button>
                                <Button asChild variant="outline" size="lg" className="h-11 px-8">
                                    <label htmlFor="folder-upload" className="cursor-pointer flex items-center gap-2">
                                        <Upload className="h-4 w-4" />
                                        Select Folder
                                    </label>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-sm py-1">
                                        {matches.length} Files Selected
                                    </Badge>
                                    <Badge variant="secondary" className="text-sm py-1">
                                        {matches.filter(m => m.status === "matched").length} Matches Found
                                    </Badge>
                                </div>
                                <Button variant="ghost" size="sm" onClick={reset} disabled={isProcessing}>
                                    Replace Files
                                </Button>
                            </div>

                            <div className="border border-border/60 rounded-[12px] overflow-hidden flex-1 bg-background/50">
                                <ScrollArea className="h-full">
                                    <Table>
                                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                            <TableRow>
                                                <TableHead className="w-[50px]">
                                                    <Checkbox
                                                        checked={matches.length > 0 && matches.every(m => m.selected || m.status === "no-match")}
                                                        onCheckedChange={handleToggleAll}
                                                        disabled={isProcessing}
                                                    />
                                                </TableHead>
                                                <TableHead>Filename</TableHead>
                                                <TableHead>Matched Movie</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {matches.map((match, idx) => (
                                                <TableRow key={idx} className="group border-border/40 hover:bg-muted/30">
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={match.selected}
                                                            onCheckedChange={() => handleToggleSelect(idx)}
                                                            disabled={isProcessing || match.status === "success"}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-medium text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <FileImage className="h-4 w-4 text-muted-foreground" />
                                                            <span className="truncate max-w-[200px]" title={match.file.name}>{match.file.name}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {match.matchedMovieId ? (
                                                            <div className="text-sm font-semibold text-primary flex items-center gap-1.5">
                                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                                <span className="truncate max-w-[200px]">{match.matchedMovieTitle}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm text-muted-foreground flex items-center gap-1.5 italic">
                                                                <AlertCircle className="h-3.5 w-3.5" />
                                                                No match found
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {match.status === "matched" && (
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Ready</Badge>
                                                                {match.hasExistingPoster && <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 uppercase text-[9px] font-bold">Overwrite</Badge>}
                                                            </div>
                                                        )}
                                                        {match.status === "no-match" && <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Skip</Badge>}
                                                        {match.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                                        {match.status === "success" && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Uploaded</Badge>}
                                                        {match.status === "error" && <Badge variant="destructive" className="text-[10px]">{match.error || "Error"}</Badge>}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </div>

                            {isProcessing && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-medium">
                                        <span>Uploading posters...</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <Progress value={uploadProgress} className="h-2" />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="p-6 pt-2 border-t border-border/40 bg-muted/20">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isProcessing}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleUpload}
                        disabled={isProcessing || selectedCount === 0 || matches.length === 0}
                        className="px-8 shadow-md shadow-primary/20"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            `Upload & Link ${selectedCount} Posters`
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
