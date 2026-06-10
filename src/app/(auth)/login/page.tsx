"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, ArrowRight, Check, Loader2, Lock, Shield, Users } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Cinematic duotone poster tiles — uses CSS only, no images needed
const POSTER_HUES = [210, 280, 340, 160, 50, 200, 310, 130, 25, 260, 80, 190, 330, 110, 240, 30, 170, 295, 60, 220, 350, 145, 270, 15];
const POSTER_TITLES = [
  "Zulfiqar", "Bohurupi", "Tekka", "Baishe Srabon", "Padatik", "Antar Mahal",
  "Belashuru", "Khadaan", "Vinci Da", "Obhijaan", "Dracula Sir", "Karnasuvarna",
  "Dawshom Awbotaar", "Ballavpurer", "Roopkatha", "Guptodhoner", "Amazon Obhijaan", "Har Har Byomkesh",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [keepSignedIn, setKeepSignedIn] = useState(true);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) { setError("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }
    if (!password) { setError("Please enter your password."); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) { setError("Invalid email or password."); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("is_active, must_change_password")
          .eq("id", user.id)
          .single();
        if (profile && !profile.is_active) {
          await supabase.auth.signOut();
          setError("Your account has been deactivated. Please contact an administrator.");
          return;
        }
        if (profile?.must_change_password) {
          router.push("/change-password?first=true");
          return;
        }
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex overflow-hidden"
      style={{ background: "var(--bg)", fontFamily: "var(--font-sans)" }}
    >
      {/* ── Left: cinematic poster wall hero ── */}
      <div className="hidden lg:flex w-[54%] relative overflow-hidden flex-col justify-between p-12">

        {/* Poster wall — rotated grid behind everything */}
        <div style={{
          position: "absolute", inset: 0,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridAutoRows: "1fr",
          gap: 12,
          padding: 12,
          opacity: 0.52,
          transform: "rotate(-8deg) scale(1.5) translateY(-4%)",
          filter: "saturate(0.9)",
          pointerEvents: "none",
        }}>
          {POSTER_HUES.concat(POSTER_HUES).slice(0, 24).map((hue, i) => (
            <div key={i} style={{
              borderRadius: 10,
              background: `linear-gradient(150deg,
                oklch(0.42 0.13 ${hue}) 0%,
                oklch(0.26 0.10 ${hue}) 42%,
                oklch(0.17 0.06 ${(hue + 20) % 360}) 100%)`,
              border: "1px solid rgba(255,255,255,0.1)",
              position: "relative",
              minHeight: 120,
            }}>
              {/* top highlight */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "45%",
                background: `radial-gradient(ellipse at 70% 0%, oklch(0.85 0.12 ${hue} / 0.18), transparent 65%)`,
                mixBlendMode: "screen",
                borderRadius: "10px 10px 0 0",
              }} />
              {/* bottom vignette */}
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)",
                borderRadius: 10,
              }} />
              {/* prod number top-left */}
              <div style={{
                position: "absolute", top: 9, left: 10,
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.07em",
                color: "rgba(255,255,255,0.55)",
              }}>
                P-{2000 + (i * 100) % 1400}
              </div>
              {/* movie title bottom */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                padding: "0 11px 11px",
                fontFamily: "var(--font-serif)",
                fontSize: 17,
                fontWeight: 400,
                color: "white",
                lineHeight: 1.15,
                textShadow: "0 2px 12px rgba(0,0,0,0.8)",
              }}>
                {POSTER_TITLES[i % POSTER_TITLES.length]}
              </div>
            </div>
          ))}
        </div>

        {/* Dark gradient overlay over poster wall */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, color-mix(in oklch, var(--bg) 55%, transparent), color-mix(in oklch, var(--bg) 90%, transparent))",
          pointerEvents: "none",
        }} />
        {/* Accent radial glow from bottom-left */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(80% 60% at 30% 100%, color-mix(in oklch, var(--svf-accent) 16%, transparent), transparent)",
          pointerEvents: "none",
        }} />

        {/* Logo + wordmark */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 13 }}>
          <Image
            src="/svf-logo.png"
            alt="SVF Entertainment"
            width={44}
            height={44}
            priority
            className="object-contain"
            style={{ filter: "drop-shadow(0 0 18px color-mix(in oklch, var(--svf-accent) 45%, transparent))" }}
          />
          <div style={{ width: 1, height: 30, background: "var(--svf-border-strong)" }} />
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.02em", color: "var(--text)" }}>
            Movie IP Management
          </span>
        </div>

        {/* Hero copy */}
        <div style={{ position: "relative", maxWidth: 480 }}>
          <h1 style={{
            fontFamily: "var(--font-serif)",
            fontSize: 48,
            lineHeight: 1.07,
            margin: 0,
            letterSpacing: "0.01em",
            color: "var(--text)",
          }}>
            Every frame.<br />
            Every right.<br />
            <span style={{ color: "var(--svf-accent-bright)" }}>
              One source<br />of truth.
            </span>
          </h1>
          <p style={{
            fontSize: 14.5,
            color: "var(--text-dim)",
            marginTop: 18,
            lineHeight: 1.65,
            maxWidth: 400,
          }}>
            Track satellite and digital rights, censor status, and expiry across
            the entire SVF catalogue — from{" "}
            <em style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>Baishe Srabon</em> to{" "}
            <em style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>Bohurupi</em>.
          </p>
        </div>

        <div style={{ position: "relative", fontSize: 11.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
          © 2026 SVF Entertainment · Internal Tool
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div
        className="w-full lg:w-[46%] flex items-center justify-center p-8 lg:p-12"
        style={{ background: "var(--bg-deep)", borderLeft: "1px solid var(--svf-border)" }}
      >
        <div style={{ width: "100%", maxWidth: 360 }}>

          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <Image
              src="/svf-logo.png"
              alt="SVF"
              width={120}
              height={68}
              priority
              className="object-contain"
              style={{ filter: "drop-shadow(0 0 14px color-mix(in oklch, var(--svf-accent) 40%, transparent))" }}
            />
          </div>

          <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.01em", color: "var(--text)" }}>
            Welcome back
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--text-faint)", marginTop: 8, marginBottom: 30 }}>
            Sign in to access the rights ledger.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {/* Error */}
            {error && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "12px 14px", borderRadius: 11, marginBottom: 20,
                background: "color-mix(in oklch, var(--st-expired) 10%, transparent)",
                border: "1px solid color-mix(in oklch, var(--st-expired) 28%, transparent)",
              }}>
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--st-expired)" }} />
                <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.45 }}>{error}</p>
              </div>
            )}

            {/* Email field */}
            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: "block", fontSize: 12, fontWeight: 600,
                color: "var(--text-dim)", marginBottom: 8, letterSpacing: "0.01em",
              }}>
                Work Email
              </label>
              <div style={{ position: "relative" }}>
                <Users
                  className="h-4 w-4"
                  style={{
                    position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                    color: focusField === "email" ? "var(--svf-accent)" : "var(--text-faint)",
                    transition: "color .2s", pointerEvents: "none",
                  }}
                />
                <input
                  type="email"
                  placeholder="you@svf.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusField("email")}
                  onBlur={() => setFocusField(null)}
                  required
                  disabled={loading}
                  autoComplete="email"
                  style={{
                    width: "100%", height: 46, paddingLeft: 40, paddingRight: 14,
                    fontSize: 14, fontFamily: "var(--font-sans)",
                    background: "var(--bg-raise)", color: "var(--text)",
                    border: `1px solid ${focusField === "email" ? "var(--svf-accent-line)" : "var(--svf-border)"}`,
                    borderRadius: 11, outline: "none", transition: "border-color .2s",
                  }}
                />
              </div>
            </div>

            {/* Password field */}
            <div style={{ marginBottom: 22 }}>
              <label style={{
                display: "block", fontSize: 12, fontWeight: 600,
                color: "var(--text-dim)", marginBottom: 8, letterSpacing: "0.01em",
              }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  className="h-4 w-4"
                  style={{
                    position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                    color: focusField === "password" ? "var(--svf-accent)" : "var(--text-faint)",
                    transition: "color .2s", pointerEvents: "none",
                  }}
                />
                <input
                  type="password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusField("password")}
                  onBlur={() => setFocusField(null)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                  style={{
                    width: "100%", height: 46, paddingLeft: 40, paddingRight: 14,
                    fontSize: 14, fontFamily: "var(--font-sans)",
                    background: "var(--bg-raise)", color: "var(--text)",
                    border: `1px solid ${focusField === "password" ? "var(--svf-accent-line)" : "var(--svf-border)"}`,
                    borderRadius: 11, outline: "none", transition: "border-color .2s",
                  }}
                />
              </div>
            </div>

            {/* Keep signed in + Forgot password */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, fontSize: 12.5 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-dim)", cursor: "pointer", userSelect: "none" }}>
                <span
                  onClick={() => setKeepSignedIn(!keepSignedIn)}
                  style={{
                    width: 17, height: 17, borderRadius: 5, border: `1px solid ${keepSignedIn ? "transparent" : "var(--svf-border-strong)"}`,
                    background: keepSignedIn ? "var(--svf-accent)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, cursor: "pointer", transition: "background .15s, border-color .15s",
                  }}
                >
                  {keepSignedIn && <Check className="h-2.5 w-2.5" style={{ color: "white" }} />}
                </span>
                Keep me signed in
              </label>
              <span style={{ color: "var(--svf-accent-bright)", fontWeight: 500, cursor: "pointer" }}>
                Forgot password?
              </span>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              style={{ height: 47, fontSize: 14.5 }}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Authenticating…</>
              ) : (
                <><ArrowRight className="h-4 w-4" />Sign In</>
              )}
            </Button>
          </form>

          {/* Security note */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            marginTop: 26, padding: 13, borderRadius: 11,
            background: "var(--panel)", border: "1px solid var(--svf-border)",
          }}>
            <Shield className="h-4 w-4 shrink-0" style={{ color: "var(--st-active)" }} />
            <span style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.5 }}>
              Access restricted to SVF staff. All actions are logged for audit.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
