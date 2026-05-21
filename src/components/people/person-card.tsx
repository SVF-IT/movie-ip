"use client";

import { Button } from "@/components/ui/button";
import { PersonWithStats } from "@/lib/api/people";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Clapperboard, Film, User, Video } from "lucide-react";
import Link from "next/link";

interface PersonCardProps {
  person: PersonWithStats;
}

const roleConfig = {
  director: { label: "Director", icon: Video, color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30", avatarGrad: "from-blue-500/20 to-blue-500/5", avatarBorder: "border-blue-500/30", avatarText: "text-blue-300" },
  actor: { label: "Actor", icon: User, color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30", avatarGrad: "from-amber-500/20 to-amber-500/5", avatarBorder: "border-amber-500/30", avatarText: "text-amber-300" },
  both: { label: "Actor & Director", icon: Clapperboard, color: "text-violet-400", bg: "bg-violet-500/15 border-violet-500/30", avatarGrad: "from-violet-500/20 to-violet-500/5", avatarBorder: "border-violet-500/30", avatarText: "text-violet-300" },
};

export function PersonCard({ person }: PersonCardProps) {
  const initials = person.name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  const cfg = roleConfig[person.role as keyof typeof roleConfig] ?? roleConfig.actor;
  const Icon = cfg.icon;

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-xl p-5 shadow-xl",
      "flex flex-col h-full transition-all duration-200 group",
      "hover:-translate-y-0.5 hover:border-slate-700/60 hover:shadow-2xl"
    )}>
      {/* Subtle accent glow */}
      <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.06] rounded-bl-full bg-gradient-to-br from-white to-transparent pointer-events-none" />

      {/* Avatar + role badge */}
      <div className="flex items-start justify-between mb-5">
        <div className="relative">
          <div className={cn(
            "h-14 w-14 rounded-full bg-gradient-to-br border flex items-center justify-center text-lg font-bold shadow-inner",
            cfg.avatarGrad, cfg.avatarBorder, cfg.avatarText
          )}>
            {initials}
          </div>
          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-slate-900 border border-slate-700/60 flex items-center justify-center shadow">
            <Icon className={cn("h-3 w-3", cfg.color)} />
          </div>
        </div>

        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border", cfg.bg, cfg.color)}>
          <Icon className="h-2.5 w-2.5" />
          {cfg.label}
        </span>
      </div>

      {/* Name */}
      <h3 className={cn("font-bold text-base leading-tight text-slate-100 line-clamp-1 mb-4 group-hover:transition-colors", `group-hover:${cfg.color}`)}>
        {person.name}
      </h3>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-5 mt-auto">
        <div className="rounded-lg bg-slate-800/40 border border-slate-700/30 px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Movies</div>
          <div className="flex items-center gap-1.5">
            <Film className="h-3 w-3 text-slate-400" />
            <span className="font-bold text-sm text-slate-200 tabular-nums">{person.movies_count || 0}</span>
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/40 border border-slate-700/30 px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Main Role</div>
          <div className="font-bold text-sm text-slate-200 truncate capitalize">
            {person.role === "both" ? "Directing" : person.role || "—"}
          </div>
        </div>
      </div>

      {/* CTA */}
      <Button
        asChild
        size="sm"
        className="w-full h-9 gap-2 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 hover:text-slate-100 border border-slate-700/50 shadow-none transition-all"
      >
        <Link href={`/people/${person.id}`}>
          View Profile
          <ArrowUpRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
        </Link>
      </Button>
    </div>
  );
}
