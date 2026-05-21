"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "sonner";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { loading, user, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If not loading and no user/session, redirect to login
    if (!loading && !user && !session) {
      router.push("/login");
    }
  }, [loading, user, session, router]);

  // Show loading only while checking auth state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If no user after loading, show redirect message
  if (!user || !session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-slate-950/40 relative">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-[0.03] pointer-events-none mix-blend-luminosity z-0" />
          <div className="absolute inset-0 bg-gradient-to-tr from-red-950/5 via-slate-950 to-amber-950/5 z-0 pointer-events-none" />

          <div className="relative z-10 flex flex-col h-full">
            <Header />
            <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 pb-20 md:pb-8 min-w-0 font-sans text-slate-200">
              {children}
            </main>
          </div>
        </SidebarInset>
        <MobileNav />
        <Toaster
          position="top-right"
          theme="dark"
          richColors
          closeButton
          toastOptions={{ duration: 5000 }}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <ErrorBoundary>
            <DashboardContent>{children}</DashboardContent>
          </ErrorBoundary>
        </AuthProvider>
      </body>
    </html>
  );
}
