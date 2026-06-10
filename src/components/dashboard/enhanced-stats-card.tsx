"use client";

import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "./animated-counter";

interface EnhancedStatsCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  sparklineData?: number[];
  accentColor?: string;
  animationDelay?: number;
}

export function EnhancedStatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  sparklineData,
  accentColor = "#ef4444",
  animationDelay = 0,
}: EnhancedStatsCardProps) {
  const sparkData = sparklineData?.map((v, i) => ({ value: v, index: i })) || [];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[12px] border border-(--svf-border) bg-(--panel-solid)/40 backdrop-blur-xl p-5 shadow-xl",
        "transition-all duration-200 hover:-translate-y-0.5 hover:border-(--svf-border)/60",
        "animate-in fade-in slide-in-from-bottom-2"
      )}
      style={{
        animationDelay: `${animationDelay}ms`,
        animationFillMode: "backwards",
        borderLeftWidth: "3px",
        borderLeftColor: accentColor,
      }}
    >
      {/* Accent glow */}
      <div
        className="absolute top-0 right-0 w-40 h-40 rounded-bl-full opacity-[0.06] pointer-events-none"
        style={{ background: `radial-gradient(circle at top right, ${accentColor}, transparent)` }}
      />

      <div className="relative flex items-start justify-between">
        <div className="space-y-1.5 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint)">{title}</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-3xl font-extrabold tracking-tight text-(--text)">
              {typeof value === "number" ? <AnimatedCounter value={value} /> : value}
            </h3>
            {trend && (
              <span className={cn(
                "inline-flex items-center gap-0.5 text-xs font-semibold",
                trend.isPositive ? "text-emerald-400" : "text-red-400"
              )}>
                {trend.isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend.value}%
              </span>
            )}
          </div>
          {description && <p className="text-xs text-(--text-faint)">{description}</p>}
        </div>

        <div
          className="shrink-0 rounded-[12px] p-2.5 border"
          style={{
            backgroundColor: `${accentColor}18`,
            borderColor: `${accentColor}30`,
          }}
        >
          <Icon className="h-5 w-5" style={{ color: accentColor }} />
        </div>
      </div>

      {sparkData.length > 0 && (
        <div className="mt-4 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id={`spark-${title.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={accentColor}
                strokeWidth={1.5}
                fill={`url(#spark-${title.replace(/\s/g, "")})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
