"use client";

import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { getMovies } from "@/lib/api/movies";
import type { MovieWithDetails } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Film, Loader2, Search } from "lucide-react";
import * as React from "react";

interface MovieSelectorProps {
    onSelect: (movieId: string | "all") => void;
    selectedId: string;
}

export function MovieSelector({ onSelect, selectedId }: MovieSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState("");
    const [movies, setMovies] = React.useState<MovieWithDetails[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [selectedMovie, setSelectedMovie] = React.useState<MovieWithDetails | null>(null);

    const fetchMovies = React.useCallback(async (search: string) => {
        setLoading(true);
        try {
            const { data } = await getMovies({ search, limit: 10 });
            setMovies(data);
        } catch (error) {
            console.error("Error fetching movies:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchMovies("");
    }, [fetchMovies]);

    // If selectedId changes from outside, try to find the movie object
    React.useEffect(() => {
        if (selectedId === "all") {
            setSelectedMovie(null);
            return;
        }
        const found = movies.find(m => m.id === selectedId);
        if (found) {
            setSelectedMovie(found);
        }
    }, [selectedId, movies]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchValue(value);

        // Debounce search
        const timer = setTimeout(() => {
            fetchMovies(value);
        }, 300);
        return () => clearTimeout(timer);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full max-w-[400px] justify-between bg-background/50 border-border/60 font-normal h-9 px-3 overflow-hidden"
                >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                        <Film className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate text-left">
                            {selectedId === "all" ? "All Movies" : selectedMovie?.title || "Select Movie..."}
                        </span>
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden" align="start">
                <div className="flex items-center border-b px-3 h-10">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 min-w-0"
                        placeholder="Search movie..."
                        value={searchValue}
                        onChange={handleSearchChange}
                    />
                    {loading && <Loader2 className="h-4 w-4 animate-spin opacity-50" />}
                </div>
                <div className="max-h-[300px] overflow-y-auto p-1 py-1 px-1">
                    <div className="space-y-1">
                        <Button
                            variant="ghost"
                            className="w-full justify-start font-normal h-9 px-2 relative"
                            onClick={() => {
                                onSelect("all");
                                setOpen(false);
                            }}
                        >
                            <Check
                                className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedId === "all" ? "opacity-100" : "opacity-0"
                                )}
                            />
                            All Movies
                        </Button>
                        {movies.map((movie) => (
                            <Button
                                key={movie.id}
                                variant="ghost"
                                className="w-full justify-between font-normal h-auto min-h-9 px-2 relative py-1.5"
                                onClick={() => {
                                    onSelect(movie.id);
                                    setSelectedMovie(movie);
                                    setOpen(false);
                                }}
                            >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                                        <Check
                                            className={cn(
                                                "h-3.5 w-3.5",
                                                selectedId === movie.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                    </div>
                                    <span className="truncate text-left text-xs font-medium flex-1">{movie.title}</span>
                                </div>

                            </Button>
                        ))}
                        {!loading && movies.length === 0 && (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                No movies found.
                            </div>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
