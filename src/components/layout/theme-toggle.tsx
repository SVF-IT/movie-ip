"use client";

import { useTheme } from "@/contexts/theme-context";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="relative h-8 w-14 rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        background: theme === "dark"
          ? "oklch(0.28 0.016 265 / 0.8)"
          : "oklch(0.90 0.010 265)",
        border: "1px solid var(--svf-border-strong)",
      }}
    >
      {/* Track icons */}
      <Sun
        className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-opacity duration-200"
        style={{
          color: theme === "light" ? "var(--svf-accent)" : "var(--text-faint)",
          opacity: theme === "light" ? 0 : 0.5,
        }}
      />
      <Moon
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-opacity duration-200"
        style={{
          color: theme === "dark" ? "oklch(0.80 0.10 265)" : "var(--text-faint)",
          opacity: theme === "dark" ? 0 : 0.5,
        }}
      />

      {/* Thumb */}
      <span
        className="absolute top-0.5 h-7 w-7 rounded-full shadow-sm transition-transform duration-300 flex items-center justify-center"
        style={{
          transform: theme === "dark" ? "translateX(calc(100% - 4px))" : "translateX(2px)",
          background: theme === "dark"
            ? "oklch(0.215 0.015 265)"
            : "oklch(1 0 0)",
          border: "1px solid var(--svf-border-strong)",
          boxShadow: "0 1px 4px oklch(0 0 0 / 0.15)",
        }}
      >
        {theme === "dark" ? (
          <Moon className="h-3.5 w-3.5" style={{ color: "oklch(0.74 0.12 235)" }} />
        ) : (
          <Sun className="h-3.5 w-3.5" style={{ color: "var(--svf-accent)" }} />
        )}
      </span>
    </button>
  );
}
