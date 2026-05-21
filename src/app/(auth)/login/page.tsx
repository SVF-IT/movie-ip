"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, AlertCircle, Film, Play, MonitorPlay } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic client-side validation
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("Invalid email or password.");
        return;
      }

      // Check if user profile exists and is active
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

        // Check if user must change password
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
    <div className="min-h-screen w-full flex bg-slate-950 overflow-hidden font-sans">
      {/* Left panel - Branding / Cinematic Hero */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center bg-black">
        {/* Rich cinematic background */}
        <div
          className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-30 mix-blend-luminosity"
          style={{
            transform: mounted ? 'scale(1.05)' : 'scale(1)',
            transition: 'transform 20s ease-out'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent z-0" />
        <div className="absolute inset-0 bg-gradient-to-r from-red-950/40 to-slate-950/80 z-0" />

        {/* Animated ambient glowing orbs */}
        <div className="absolute top-[20%] left-[20%] w-96 h-96 bg-red-600/20 rounded-full blur-[100px] mix-blend-screen animate-pulse duration-[4000ms] pointer-events-none" />
        <div className="absolute bottom-[20%] right-[20%] w-96 h-96 bg-amber-600/10 rounded-full blur-[100px] mix-blend-screen animate-pulse duration-[6000ms] delay-700 pointer-events-none" />

        {/* Content container */}
        <div
          className="relative z-10 px-12 max-w-2xl flex flex-col items-center text-center transition-all duration-1000 ease-out translate-y-0 opacity-100"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)'
          }}
        >
          <div className="bg-white/5 p-8 rounded-full backdrop-blur-sm border border-white/10 mb-8 shadow-2xl">
            {/* Fallback SVF-like visual if standard image isn't available, but keeping the requested image tag */}
            <Image
              src="/svf-logo.png"
              alt="SVF Entertainment"
              width={180}
              height={100}
              priority
              className="object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            />
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4 drop-shadow-lg">
            Eastern India's <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-amber-500">
              Entertainment Hub
            </span>
          </h1>

          <p className="text-lg text-slate-300 mb-10 max-w-md font-light leading-relaxed">
            Manage intellectual property, film rights, and distribution networks seamlessly through our advanced enterprise platform.
          </p>

          <div className="grid grid-cols-3 gap-6 w-full max-w-md">
            {[
              { icon: Film, label: "Production" },
              { icon: Play, label: "Distribution" },
              { icon: MonitorPlay, label: "Television" }
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center space-y-2 group">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 group-hover:bg-red-500/20 group-hover:border-red-500/50 transition-all duration-300">
                  <item.icon className="w-6 h-6 text-slate-400 group-hover:text-red-400 transition-colors" />
                </div>
                <span className="text-xs text-slate-400 font-medium group-hover:text-slate-200 transition-colors">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - Login Box */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        {/* Mobile background decor */}
        <div className="absolute inset-0 lg:hidden overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-red-950/20 to-slate-950" />
          <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-red-900/20 rounded-full blur-[100px]" />
        </div>

        <div
          className="w-full max-w-md relative z-10 transition-all duration-700 ease-out delay-300"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateX(0)' : 'translateX(20px)'
          }}
        >
          {/* Logo visible only on mobile */}
          <div className="lg:hidden flex justify-center mb-10">
            <Image
              src="/svf-logo.png"
              alt="SVF Entertainment"
              width={140}
              height={80}
              priority
              className="object-contain"
            />
          </div>

          <div className="mb-8 space-y-2">
            <h2 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h2>
            <p className="text-slate-400 text-sm">
              Sign in to the <span className="text-slate-200 font-semibold">Film IP Manager</span> to continue.
            </p>
          </div>

          <Card className="border-slate-800/60 bg-slate-900/60 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-amber-600" />
            <CardContent className="p-8 pt-10">
              <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-200 leading-tight flex-1">{error}</p>
                  </div>
                )}

                <div className="space-y-3">
                  <label htmlFor="email" className="text-sm font-medium text-slate-300">
                    Email address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@svf.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="email"
                    className="bg-slate-950/50 border-slate-800 focus-visible:ring-red-500/50 focus-visible:border-red-500 transition-all h-12 text-slate-200 placeholder:text-slate-600"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium text-slate-300">
                      Password
                    </label>
                    {/* Optional: Add forgot password link here in the future */}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                    className="bg-slate-950/50 border-slate-800 focus-visible:ring-red-500/50 focus-visible:border-red-500 transition-all h-12 text-slate-200 placeholder:text-slate-600"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-white text-slate-950 hover:bg-slate-200 hover:scale-[1.02] transition-all duration-200 font-semibold shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] mt-4"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin text-slate-950" />
                      Authenticating...
                    </>
                  ) : (
                    "Secure Sign In"
                  )}
                </Button>

                <div className="pt-4 border-t border-slate-800/50 mt-6 flex justify-center">
                  <p className="text-xs text-slate-500 text-center max-w-[250px]">
                    Authorized personnel only. Contact your IT administrator for access issues.
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
