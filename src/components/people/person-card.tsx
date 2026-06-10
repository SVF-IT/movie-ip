"use client";

import { PersonWithStats } from "@/lib/api/people";
import { Film, Megaphone, Ticket } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

interface PersonCardProps {
  person: PersonWithStats;
}

// Hue values for oklch gradient per name hash
const HUE_PALETTE = [330, 20, 45, 160, 185, 210, 260, 290, 310, 140, 0];

function getAvatarHue(name: string, id: string): number {
  const s = name + (id || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return HUE_PALETTE[Math.abs(h) % HUE_PALETTE.length];
}

export function PersonCard({ person }: PersonCardProps) {
  const initials = person.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  const hue = getAvatarHue(person.name, person.id);

  const roleLabel = useMemo(() => {
    if (person.role === "both" || ((person.movies_as_actor || 0) > 0 && (person.movies_as_director || 0) > 0)) return "Actor & Director";
    if (person.role === "director" || (person.movies_as_director || 0) > 0) return "Director";
    return "Actor";
  }, [person.role, person.movies_as_actor, person.movies_as_director]);

  const movieTitles = useMemo(() => {
    if (person.movies_list) return person.movies_list;
    if (person.movies && Array.isArray(person.movies)) {
      return person.movies.map((m: any) => m.movie_title || m.title || (typeof m === "string" ? m : "")).filter(Boolean);
    }
    return [];
  }, [person.movies_list, person.movies]);

  const moviesText = useMemo(() => {
    if (movieTitles.length === 0) return "";
    const first = movieTitles.slice(0, 3);
    let s = first.join(" · ");
    if (movieTitles.length > 3) s += ` +${movieTitles.length - 3}`;
    return s;
  }, [movieTitles]);

  const moviesAsDirector = person.movies_as_director || 0;
  const moviesAsActor = person.movies_as_actor || 0;

  const avatarBg = `linear-gradient(145deg, oklch(0.52 0.20 ${hue}), oklch(0.38 0.22 ${(hue + 30) % 360}))`;
  const glowColor = `oklch(0.52 0.20 ${hue} / 0.25)`;

  return (
    <Link
      href={`/people/${person.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "18px",
        borderRadius: 14,
        border: "1px solid var(--svf-border)",
        background: "var(--panel)",
        backdropFilter: "blur(14px)",
        textDecoration: "none",
        transition: "all 0.2s ease",
        cursor: "pointer",
        gap: 14,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = `oklch(0.52 0.20 ${hue} / 0.5)`;
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = `0 8px 32px ${glowColor}`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "var(--svf-border)";
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "none";
      }}
    >
      {/* Avatar + Name row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Large colored circular avatar */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: avatarBg,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
            color: "white",
            letterSpacing: "-0.01em",
            boxShadow: `0 0 0 2px oklch(0.52 0.20 ${hue} / 0.3), 0 4px 14px ${glowColor}`,
          }}
        >
          {initials}
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.25,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {person.name}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-faint)",
              marginTop: 2,
              fontWeight: 500,
              textTransform: "capitalize",
            }}
          >
            {roleLabel}
          </div>
        </div>
      </div>

      {/* Count badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {moviesAsDirector > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 9px",
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 600,
              color: `oklch(0.78 0.14 ${hue})`,
              background: `oklch(0.52 0.20 ${hue} / 0.12)`,
              border: `1px solid oklch(0.52 0.20 ${hue} / 0.25)`,
            }}
          >
            <Megaphone style={{ width: 11, height: 11 }} />
            {moviesAsDirector} directed
          </span>
        )}
        {moviesAsActor > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 9px",
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-dim)",
              background: "var(--bg-raise)",
              border: "1px solid var(--svf-border)",
            }}
          >
            <Ticket style={{ width: 11, height: 11 }} />
            {moviesAsActor} as cast
          </span>
        )}
        {moviesAsDirector === 0 && moviesAsActor === 0 && (person.movies_count || 0) > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 9px",
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-dim)",
              background: "var(--bg-raise)",
              border: "1px solid var(--svf-border)",
            }}
          >
            <Film style={{ width: 11, height: 11 }} />
            {person.movies_count} films
          </span>
        )}
      </div>

      {/* Film titles dotted list */}
      {moviesText && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-faint)",
            lineHeight: 1.5,
            letterSpacing: "0.01em",
            borderTop: "1px solid var(--svf-border)",
            paddingTop: 10,
            marginTop: -2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <Film style={{ width: 10, height: 10, display: "inline", marginRight: 5, opacity: 0.5 }} />
          {moviesText}
        </div>
      )}
    </Link>
  );
}
