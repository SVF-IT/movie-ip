"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Film, Play, MonitorPlay, Loader2, AlertCircle, CheckCircle2, Lock } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

function ChangePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFirstLogin = searchParams.get("first") === "true";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [focusField, setFocusField] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) return "Password must be at least 8 characters long";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newPassword || !confirmPassword) { setError("Please fill in both password fields."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    const validationError = validatePassword(newPassword);
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) { setError(updateError.message); setLoading(false); return; }

      if (isFirstLogin) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("user_profiles").update({ must_change_password: false, updated_at: new Date().toISOString() }).eq("id", user.id);
        }
      }

      setSuccess(true);
      setTimeout(() => { router.push("/"); router.refresh(); }, 2000);
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Password change error:", err);
    } finally {
      setLoading(false);
    }
  };

  const requirements = [
    { label: "Minimum 8 characters long", met: newPassword.length >= 8 },
    { label: "At least one uppercase letter (A-Z)", met: /[A-Z]/.test(newPassword) },
    { label: "At least one lowercase letter (a-z)", met: /[a-z]/.test(newPassword) },
    { label: "At least one number (0-9)", met: /[0-9]/.test(newPassword) },
  ];

  if (success) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4"
        style={{ background: "var(--bg)", fontFamily: "var(--font-sans)" }}>
        <div style={{
          width: "100%", maxWidth: 420,
          background: "var(--panel-solid)", border: "1px solid var(--svf-border)",
          borderRadius: 20, padding: "48px 40px", textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%", margin: "0 auto 24px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "color-mix(in oklch, oklch(0.72 0.17 145) 12%, transparent)",
            border: "1px solid color-mix(in oklch, oklch(0.72 0.17 145) 25%, transparent)",
          }}>
            <CheckCircle2 style={{ width: 40, height: 40, color: "oklch(0.72 0.17 145)" }} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Password Changed!</h2>
          <p style={{ fontSize: 14, color: "var(--text-faint)", lineHeight: 1.6 }}>
            Your security credentials have been updated. Redirecting you…
          </p>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            <Loader2 style={{ width: 22, height: 22, color: "var(--text-faint)", animation: "spin 1s linear infinite" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex overflow-hidden"
      style={{ background: "var(--bg)", fontFamily: "var(--font-sans)" }}>

      {/* ── Left: cinematic branding panel ── */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden flex-col justify-between p-12"
        style={{ background: "var(--bg-deep)", borderRight: "1px solid var(--svf-border)" }}>

        {/* Poster wall */}
        <div style={{
          position: "absolute", inset: 0,
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: "1fr",
          gap: 10, padding: 10, opacity: 0.35,
          transform: "rotate(-8deg) scale(1.5) translateY(-4%)",
          pointerEvents: "none",
        }}>
          {Array.from({ length: 24 }, (_, i) => {
            const hue = (i * 37 + 210) % 360;
            return (
              <div key={i} style={{
                borderRadius: 8, minHeight: 110,
                background: `linear-gradient(150deg, oklch(0.42 0.13 ${hue}) 0%, oklch(0.26 0.10 ${hue}) 42%, oklch(0.17 0.06 ${(hue + 20) % 360}) 100%)`,
                border: "1px solid rgba(255,255,255,0.08)",
              }} />
            );
          })}
        </div>

        {/* Overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, color-mix(in oklch, var(--bg-deep) 60%, transparent), color-mix(in oklch, var(--bg-deep) 92%, transparent))",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(80% 60% at 30% 100%, color-mix(in oklch, var(--svf-accent) 14%, transparent), transparent)",
          pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <Image src="/svf-logo.png" alt="SVF Entertainment" width={40} height={40} priority
            className="object-contain"
            style={{ filter: "drop-shadow(0 0 14px color-mix(in oklch, var(--svf-accent) 40%, transparent))" }} />
          <div style={{ width: 1, height: 26, background: "var(--svf-border-strong)" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Movie IP Management</span>
        </div>

        {/* Hero copy */}
        <div style={{
          position: "relative", maxWidth: 440,
          opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}>
          <h1 style={{
            fontFamily: "var(--font-serif)", fontSize: 44, lineHeight: 1.08,
            margin: 0, color: "var(--text)",
          }}>
            Secure Your<br />
            <span style={{ color: "var(--svf-accent-bright)" }}>Account Access</span>
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 16, lineHeight: 1.65, maxWidth: 380 }}>
            Please update your security credentials to access the Film IP Manager platform.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 40, maxWidth: 340 }}>
            {[{ icon: Film, label: "Production" }, { icon: Play, label: "Distribution" }, { icon: MonitorPlay, label: "Television" }].map(({ icon: Icon, label }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{
                  padding: 12, borderRadius: 12,
                  background: "var(--bg-raise)", border: "1px solid var(--svf-border)",
                }}>
                  <Icon style={{ width: 20, height: 20, color: "var(--text-faint)" }} />
                </div>
                <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
          © 2026 SVF Entertainment · Internal Tool
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-12"
        style={{ background: "var(--bg)" }}>
        <div style={{
          width: "100%", maxWidth: 380,
          opacity: mounted ? 1 : 0, transform: mounted ? "translateX(0)" : "translateX(16px)",
          transition: "opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s",
        }}>

          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <Image src="/svf-logo.png" alt="SVF" width={110} height={62} priority className="object-contain"
              style={{ filter: "drop-shadow(0 0 12px color-mix(in oklch, var(--svf-accent) 40%, transparent))" }} />
          </div>

          <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em", color: "var(--text)" }}>
            {isFirstLogin ? "Set Password" : "Change Password"}
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--text-faint)", marginTop: 8, marginBottom: 32 }}>
            {isFirstLogin
              ? "Welcome! Please set a new secure password for your account."
              : "Enter your new password below to update your credentials."}
          </p>

          {/* Card */}
          <div style={{
            background: "var(--panel-solid)", border: "1px solid var(--svf-border)",
            borderRadius: 18, overflow: "hidden",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          }}>
            {/* Accent top bar */}
            <div style={{ height: 3, background: "linear-gradient(90deg, var(--svf-accent), oklch(0.72 0.18 50))" }} />

            <div style={{ padding: "32px 28px" }}>
              <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Error */}
                {error && (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "12px 14px", borderRadius: 10,
                    background: "color-mix(in oklch, var(--st-expired) 10%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--st-expired) 28%, transparent)",
                  }}>
                    <AlertCircle style={{ width: 16, height: 16, color: "var(--st-expired)", flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.45, margin: 0 }}>{error}</p>
                  </div>
                )}

                {/* New Password */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 8, letterSpacing: "0.01em" }}>
                    New Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <Lock style={{
                      position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                      width: 15, height: 15, pointerEvents: "none",
                      color: focusField === "new" ? "var(--svf-accent)" : "var(--text-faint)",
                      transition: "color .2s",
                    }} />
                    <input
                      type="password"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      onFocus={() => setFocusField("new")}
                      onBlur={() => setFocusField(null)}
                      required
                      disabled={loading}
                      autoComplete="new-password"
                      style={{
                        width: "100%", height: 46, paddingLeft: 40, paddingRight: 14,
                        fontSize: 14, fontFamily: "var(--font-sans)",
                        background: "var(--bg-raise)", color: "var(--text)",
                        border: `1px solid ${focusField === "new" ? "var(--svf-accent-line)" : "var(--svf-border)"}`,
                        borderRadius: 10, outline: "none", transition: "border-color .2s",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 8, letterSpacing: "0.01em" }}>
                    Confirm Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <Lock style={{
                      position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                      width: 15, height: 15, pointerEvents: "none",
                      color: focusField === "confirm" ? "var(--svf-accent)" : "var(--text-faint)",
                      transition: "color .2s",
                    }} />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onFocus={() => setFocusField("confirm")}
                      onBlur={() => setFocusField(null)}
                      required
                      disabled={loading}
                      autoComplete="new-password"
                      style={{
                        width: "100%", height: 46, paddingLeft: 40, paddingRight: 14,
                        fontSize: 14, fontFamily: "var(--font-sans)",
                        background: "var(--bg-raise)", color: "var(--text)",
                        border: `1px solid ${focusField === "confirm" ? "var(--svf-accent-line)" : "var(--svf-border)"}`,
                        borderRadius: 10, outline: "none", transition: "border-color .2s",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                {/* Requirements */}
                <div style={{
                  background: "var(--bg-raise)", border: "1px solid var(--svf-border)",
                  borderRadius: 10, padding: "14px 16px",
                }}>
                  <p style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-dim)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Password requirements
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {requirements.map(({ label, met }) => (
                      <li key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span style={{
                          width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: met
                            ? "color-mix(in oklch, oklch(0.72 0.17 145) 15%, transparent)"
                            : "var(--bg-deep)",
                          border: `1px solid ${met ? "color-mix(in oklch, oklch(0.72 0.17 145) 40%, transparent)" : "var(--svf-border)"}`,
                          transition: "all .2s",
                        }}>
                          {met && <CheckCircle2 style={{ width: 10, height: 10, color: "oklch(0.72 0.17 145)" }} />}
                        </span>
                        <span style={{ color: met ? "var(--text)" : "var(--text-faint)", transition: "color .2s" }}>{label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%", height: 46, borderRadius: 10, border: "none",
                    background: loading ? "var(--svf-border)" : "var(--svf-accent)",
                    color: "white", fontSize: 14.5, fontWeight: 600,
                    fontFamily: "var(--font-sans)", cursor: loading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "opacity .2s, transform .15s",
                    opacity: loading ? 0.7 : 1,
                    marginTop: 4,
                  }}
                  onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
                  onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                >
                  {loading
                    ? <><Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> Updating…</>
                    : "Secure Account"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--svf-accent)" }} />
      </div>
    }>
      <ChangePasswordForm />
    </Suspense>
  );
}
