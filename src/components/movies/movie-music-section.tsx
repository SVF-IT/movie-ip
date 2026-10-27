"use client";

import { useEffect, useRef, useState } from "react";
import { STREAMING_PLATFORMS, type MusicRelease, type MusicTrack } from "@/lib/types/music";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, Disc3, ExternalLink, Loader2, Music, Pause, Play } from "lucide-react";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function typeLabel(type: string | null): string {
  if (!type) return "Release";
  return type.toLowerCase() === "ep" ? "EP" : type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function DetailItem({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">{label}</dt>
      <dd className={cn("mt-0.5 text-xs text-(--text)", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

interface TrackRowProps {
  track: MusicTrack;
  index: number;
  playing: boolean;
  onTogglePlay: () => void;
}

function TrackRow({ track, index, playing, onTogglePlay }: TrackRowProps) {
  const [open, setOpen] = useState(false);
  const join = (names: string[]) => (names.length ? names.join(", ") : null);
  const links = STREAMING_PLATFORMS.filter(({ key }) => track.streaming_links[key]);
  const number = track.track_number ?? index + 1;

  return (
    <div className={cn("group transition-colors", open ? "bg-(--bg-raise)" : "hover:bg-(--hover)")}>
      <div className="flex items-center gap-3 pl-4 pr-3">
        {/* Number, swapped for a play button when a preview exists */}
        <div className="w-8 h-8 shrink-0 flex items-center justify-center">
          {track.preview_url ? (
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={playing ? `Pause ${track.title}` : `Play preview of ${track.title}`}
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center transition-colors",
                playing
                  ? "bg-(--svf-accent) text-white"
                  : "text-(--text-faint) hover:bg-(--svf-accent) hover:text-white"
              )}
            >
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-px" />}
            </button>
          ) : (
            <span className="text-xs font-mono text-(--text-faint)">{number}</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-3 py-2.5 text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn("text-sm font-medium truncate", playing ? "text-(--svf-accent-bright)" : "text-(--text)")}>
                {track.title}
              </span>
              {track.version && track.version.toLowerCase() !== "original" && (
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-[5px] border border-(--svf-border) text-(--text-faint)">
                  {track.version}
                </span>
              )}
              {track.explicit && (
                <span title="Explicit" className="shrink-0 text-[9px] font-bold px-1 py-px rounded-[4px] bg-(--text-faint) text-(--bg-deep)">E</span>
              )}
            </div>
            {track.singers.length > 0 && (
              <p className="text-xs text-(--text-faint) truncate">{track.singers.join(", ")}</p>
            )}
          </div>
          <span className="text-xs font-mono text-(--text-faint) tabular-nums shrink-0">
            {formatDuration(track.duration_seconds)}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-(--text-faint) transition-transform",
              open ? "rotate-180" : "opacity-0 group-hover:opacity-100"
            )}
          />
        </button>
      </div>

      {open && (
        <div className="pl-15 pr-6 pb-4 space-y-3">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
            <DetailItem label="Composer" value={join(track.composers)} />
            <DetailItem label="Lyricist" value={join(track.lyricists)} />
            <DetailItem label="Arranger" value={join(track.music_arrangers)} />
            <DetailItem label="Picturised on" value={join(track.picturised_on)} />
            <DetailItem label="Language" value={track.language} />
            <DetailItem label="ISRC" value={track.isrc} mono />
          </dl>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {links.map(({ key, label }) => (
                <a
                  key={key}
                  href={track.streaming_links[key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-6 px-2.5 rounded-[11px] border border-(--svf-border) text-[11px] text-(--text-dim) hover:text-(--text) hover:border-(--svf-border-strong) transition-colors"
                >
                  {label}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ReleaseCardProps {
  release: MusicRelease;
  defaultOpen: boolean;
  playingId: string | null;
  onTogglePlay: (track: MusicTrack) => void;
}

function ReleaseCard({ release, defaultOpen, playingId, onTogglePlay }: ReleaseCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = [
    typeLabel(release.type),
    release.release_date && formatDate(release.release_date),
    release.language,
    release.genre,
  ].filter(Boolean).join(" · ");
  const summary = [
    plural(release.tracks.length, "track"),
    release.total_duration_seconds != null && formatDuration(release.total_duration_seconds),
  ].filter(Boolean).join(" · ");

  return (
    <div className="border-b border-(--svf-border) last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3.5 px-4 py-3 text-left hover:bg-(--hover) transition-colors"
      >
        {release.artwork_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={release.artwork_url}
            alt=""
            className="h-12 w-12 rounded-[9px] object-cover border border-(--svf-border) shrink-0"
          />
        ) : (
          <div className="h-12 w-12 rounded-[9px] bg-(--bg-deep) border border-(--svf-border) flex items-center justify-center shrink-0">
            <Disc3 className="h-5 w-5 text-(--text-faint)" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-(--text) truncate">{release.title}</p>
          <p className="text-xs text-(--text-faint) truncate">{meta}</p>
          {release.upc && <p className="text-[10px] font-mono text-(--text-faint) mt-0.5">UPC {release.upc}</p>}
        </div>
        <span className="hidden sm:block text-xs text-(--text-faint) shrink-0">{summary}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-(--text-faint) transition-transform", open && "rotate-180")} />
      </button>

      {open && release.tracks.length > 0 && (
        <div className="pb-2">
          {release.tracks.map((t, i) => (
            <TrackRow
              key={t.id || i}
              track={t}
              index={i}
              playing={playingId === t.id}
              onTogglePlay={() => onTogglePlay(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only list of albums/EPs/singles linked to this movie in the SVF Music app.
 * Linking and editing happen in the Music app — there are no actions here.
 * A Music API failure is contained to this section.
 */
export function MovieMusicSection({ movieId }: { movieId: string }) {
  const [releases, setReleases] = useState<MusicRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // One shared player so starting a preview stops whichever one was playing.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/movie-music/${movieId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Couldn't load music");
        return body as { releases: MusicRelease[] };
      })
      .then((body) => { if (!cancelled) setReleases(body.releases ?? []); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load music"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      audioRef.current?.pause();
      setPlayingId(null);
    };
  }, [movieId]);

  const togglePlay = (track: MusicTrack) => {
    if (!track.preview_url) return;
    audioRef.current ??= new Audio();
    const audio = audioRef.current;

    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = track.preview_url;
    audio.onended = () => setPlayingId(null);
    audio.play().then(
      () => setPlayingId(track.id),
      () => setPlayingId(null)
    );
  };

  const trackCount = releases.reduce((n, r) => n + r.tracks.length, 0);

  return (
    <div className="bg-(--panel-solid) border border-(--svf-border) rounded-[12px] overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-(--svf-border)">
        <div className="p-1.5 rounded-[10px] bg-(--svf-accent-soft) border border-(--svf-accent-line)">
          <Music className="h-4 w-4 text-(--svf-accent-bright)" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-(--text)">Music</h3>
          <p className="text-[11px] text-(--text-faint)">Albums and songs linked in the SVF Music app</p>
        </div>
        {!loading && !error && releases.length > 0 && (
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-(--bg-deep) text-(--text-faint)">
            {plural(releases.length, "release")} · {plural(trackCount, "track")}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-(--text-faint)">
          <Loader2 className="h-4 w-4 animate-spin" />Loading music…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 px-6 py-5 text-xs text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}. Try again later.
        </div>
      ) : releases.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-(--text-faint)">No music linked to this movie yet</p>
      ) : (
        // Expand everything for a short list; for long lists start with only the first open.
        releases.map((r, i) => (
          <ReleaseCard
            key={r.id}
            release={r}
            defaultOpen={releases.length <= 2 || i === 0}
            playingId={playingId}
            onTogglePlay={togglePlay}
          />
        ))
      )}
    </div>
  );
}
