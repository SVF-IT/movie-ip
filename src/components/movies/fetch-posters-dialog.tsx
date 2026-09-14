"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
    Search,
    CheckCircle2,
    Loader2,
    AlertCircle,
    Download,
    ImageOff,
} from "lucide-react";

type Confidence = "exact" | "likely" | "weak";

interface ScanRow {
    movieId: string;
    title: string;
    searchedTitle: string;
    releaseYear?: string;
    language?: string;
    found: boolean;
    provider?: "tmdb" | "omdb";
    imageUrl?: string;
    matchedTitle?: string;
    matchedYear?: string;
    confidence?: Confidence;
}

interface Row extends ScanRow {
    selected: boolean;
}

interface FetchPostersDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

const CONFIDENCE_STYLES: Record<Confidence, string> = {
    exact: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    likely: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    weak: "bg-amber-500/10 text-amber-500 border-amber-500/20",
};

export function FetchPostersDialog({ open, onOpenChange, onSuccess }: FetchPostersDialogProps) {
    const [rows, setRows] = useState<Row[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [summary, setSummary] = useState<{ savedCount: number; failed: Array<{ title: string; reason: string }> } | null>(null);

    const found = rows.filter(r => r.found);
    const notFound = rows.filter(r => !r.found);
    const selectedRows = found.filter(r => r.selected);

    const handleScan = async () => {
        setIsScanning(true);
        setScanError(null);
        setSummary(null);
        setRows([]);

        try {
            const res = await fetch("/api/posters/scan", { method: "POST" });
            const json = await res.json();

            if (!res.ok) {
                setScanError(json.error || "Scan failed");
                return;
            }

            // Only exact matches are pre-selected — weak and year-less matches
            // are the ones most likely to be wrong, so they need a deliberate tick.
            setRows(
                (json.results as ScanRow[]).map(r => ({
                    ...r,
                    selected: r.found && r.confidence === "exact",
                }))
            );
        } catch (err) {
            setScanError(err instanceof Error ? err.message : "Scan failed");
        } finally {
            setIsScanning(false);
        }
    };

    const handleToggle = (movieId: string) => {
        setRows(prev => prev.map(r => (r.movieId === movieId ? { ...r, selected: !r.selected } : r)));
    };

    const handleToggleAll = () => {
        const allOn = found.length > 0 && found.every(r => r.selected);
        setRows(prev => prev.map(r => (r.found ? { ...r, selected: !allOn } : r)));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch("/api/posters/commit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: selectedRows.map(r => ({
                        movieId: r.movieId,
                        title: r.title,
                        imageUrl: r.imageUrl,
                    })),
                }),
            });
            const json = await res.json();

            if (!res.ok) {
                setScanError(json.error || "Save failed");
                return;
            }

            setSummary({ savedCount: json.savedCount, failed: json.failed ?? [] });

            // Drop the saved rows so the table shows only what still needs work.
            const savedIds = new Set(selectedRows.map(r => r.movieId));
            const failedIds = new Set((json.failed ?? []).map((f: { movieId: string }) => f.movieId));
            setRows(prev => prev.filter(r => !savedIds.has(r.movieId) || failedIds.has(r.movieId)));

            onSuccess();
        } catch (err) {
            setScanError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = (next: boolean) => {
        if (!next) {
            setRows([]);
            setSummary(null);
            setScanError(null);
        }
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Fetch Missing Posters</DialogTitle>
                    <DialogDescription>
                        Looks up posters for movies that have none, using TMDB with an IMDb/OMDb fallback.
                        Nothing is saved until you approve it below.
                    </DialogDescription>
                </DialogHeader>

                {rows.length === 0 && !isScanning && (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <Search className="h-10 w-10 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground text-center max-w-md">
                            Scan the catalogue for movies with no poster and look each one up.
                            This may take a couple of minutes.
                        </p>
                        <Button onClick={handleScan} className="gap-2">
                            <Search className="h-4 w-4" /> Scan for missing posters
                        </Button>
                    </div>
                )}

                {isScanning && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Looking up posters…</p>
                    </div>
                )}

                {scanError && (
                    <div className="flex items-center gap-2 text-sm text-destructive border border-destructive/30 rounded-[12px] p-3">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {scanError}
                    </div>
                )}

                {rows.length > 0 && (
                    <>
                        <div className="flex flex-wrap items-center gap-2 text-sm shrink-0">
                            <Badge variant="outline">{rows.length} missing posters</Badge>
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                {found.length} found
                            </Badge>
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                                {notFound.length} not found
                            </Badge>
                            <Badge variant="outline">{selectedRows.length} selected</Badge>
                        </div>

                        <div className="flex-1 min-h-0 border border-border/60 rounded-[12px] overflow-hidden">
                            <ScrollArea className="h-[420px]">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background z-10">
                                        <TableRow>
                                            <TableHead className="w-[50px]">
                                                <Checkbox
                                                    checked={found.length > 0 && found.every(r => r.selected)}
                                                    onCheckedChange={handleToggleAll}
                                                    disabled={isSaving}
                                                />
                                            </TableHead>
                                            <TableHead className="w-[70px]">Poster</TableHead>
                                            <TableHead>Your movie</TableHead>
                                            <TableHead>Matched as</TableHead>
                                            <TableHead>Match</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {[...found, ...notFound].map(row => (
                                            <TableRow key={row.movieId} className="border-border/40 hover:bg-muted/30">
                                                <TableCell>
                                                    <Checkbox
                                                        checked={row.selected}
                                                        onCheckedChange={() => handleToggle(row.movieId)}
                                                        disabled={!row.found || isSaving}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    {row.imageUrl ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={row.imageUrl}
                                                            alt={row.title}
                                                            className="h-16 w-11 object-cover rounded-[6px] border border-border/40"
                                                        />
                                                    ) : (
                                                        <div className="h-16 w-11 rounded-[6px] border border-border/40 bg-muted/30 flex items-center justify-center">
                                                            <ImageOff className="h-4 w-4 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    <div className="font-medium">{row.title}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {row.releaseYear || "no year"}
                                                        {row.language ? ` · ${row.language}` : ""}
                                                    </div>
                                                    {row.searchedTitle !== row.title && (
                                                        <div className="text-xs text-muted-foreground italic">
                                                            searched as “{row.searchedTitle}”
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {row.found ? (
                                                        <>
                                                            <div className="font-medium">{row.matchedTitle}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {row.matchedYear || "no year"} · {row.provider === "tmdb" ? "TMDB" : "IMDb"}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <span className="text-sm text-muted-foreground italic">No poster found</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {row.confidence && (
                                                        <Badge variant="outline" className={CONFIDENCE_STYLES[row.confidence]}>
                                                            {row.confidence}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>
                    </>
                )}

                {summary && (
                    <div className="border border-border/60 rounded-[12px] p-4 bg-muted/20 space-y-2 shrink-0 max-h-40 overflow-y-auto">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            Saved {summary.savedCount} poster{summary.savedCount === 1 ? "" : "s"}
                        </div>
                        {summary.failed.length > 0 && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm font-semibold text-amber-500">
                                    <AlertCircle className="h-4 w-4" />
                                    {summary.failed.length} failed
                                </div>
                                {summary.failed.map((f, i) => (
                                    <div key={i} className="text-xs text-muted-foreground pl-6">
                                        {f.title} — {f.reason}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="shrink-0">
                    <Button variant="outline" onClick={() => handleClose(false)} disabled={isSaving}>
                        Close
                    </Button>
                    {rows.length > 0 && (
                        <Button onClick={handleSave} disabled={selectedRows.length === 0 || isSaving} className="gap-2">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Save {selectedRows.length} poster{selectedRows.length === 1 ? "" : "s"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
