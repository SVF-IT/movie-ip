// Read-only music data from the SVF Music app (separate Supabase project),
// served to the movie page via /api/movie-music/[movieId]. Nothing is stored here.

export const STREAMING_PLATFORMS = [
  { key: "spotify", label: "Spotify" },
  { key: "apple_music", label: "Apple Music" },
  { key: "jiosaavn", label: "JioSaavn" },
  { key: "amazon_music", label: "Amazon Music" },
  { key: "gaana", label: "Gaana" },
  { key: "youtube_music", label: "YouTube Music" },
] as const

export type StreamingPlatform = (typeof STREAMING_PLATFORMS)[number]["key"]

export interface MusicTrack {
  id: string
  title: string
  track_number: number | null
  singers: string[]
  composers: string[]
  lyricists: string[]
  music_arrangers: string[]
  picturised_on: string[] // on-screen actors
  duration_seconds: number | null
  isrc: string | null
  version: string | null // "Original" | "Lofi" | "Cover" | "Reprise" | ...
  language: string | null
  explicit: boolean
  preview_url: string | null
  streaming_links: Partial<Record<StreamingPlatform, string>>
}

export interface MusicRelease {
  id: string
  title: string
  type: string | null // "album" | "ep" | "single"
  release_date: string | null
  artwork_url: string | null
  upc: string | null
  language: string | null
  genre: string | null
  total_duration_seconds: number | null
  tracks: MusicTrack[]
}
