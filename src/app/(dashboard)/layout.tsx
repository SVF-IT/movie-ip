"use client";

import { ErrorBoundary } from "@/components/error-boundary";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Toaster } from "sonner";
import "../globals.css";


const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/rights-dashboard": { title: "Bengali IP Rights Dashboard", subtitle: "Monitor satellite & internet rights across the catalogue" },
  "/movies": { title: "Movies", subtitle: "Browse and manage the full SVF film library" },
  "/recensor": { title: "Censor Tracker", subtitle: "Manage re-censoring status for A-certified titles" },
  "/rights": { title: "Platform Rights Management", subtitle: "View and manage all platform rights" },
  "/expiring": { title: "Expiring Rights", subtitle: "Rights approaching expiry — act before they lapse" },
  "/analytics": { title: "Analytics", subtitle: "Portfolio performance and rights coverage insights" },
  "/dubbed": { title: "Dubbed Titles", subtitle: "Manage dubbed language versions" },
  "/legal-approvals": { title: "Movie Approvals", subtitle: "Review and approve pending changes to rights records" },
  "/my-submissions": { title: "Movie Submissions", subtitle: "Track your submitted changes awaiting approval" },
  "/people": { title: "People", subtitle: "Actors, directors and collaborators" },
  "/actors": { title: "Actors", subtitle: "Browse all actors in the catalogue" },
  "/directors": { title: "Directors", subtitle: "Browse all directors in the catalogue" },
  "/platforms": { title: "Platforms", subtitle: "Broadcast and streaming partners" },
  "/production-houses": { title: "Production Houses", subtitle: "Co-production and ownership partners" },
  "/audit-log": { title: "Audit Log", subtitle: "Full history of changes made in the system" },
  "/notifications": { title: "Notifications", subtitle: "Manage system notifications" },
  "/admin/users": { title: "User Management", subtitle: "Manage user accounts and permissions" },
  "/settings": { title: "Settings", subtitle: "Account and application preferences" },
  "/reports": { title: "Reports", subtitle: "Generated reports and exports" },
  "/access-denied": { title: "Access Denied", subtitle: "" },
};

function getPageMeta(pathname: string) {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Prefix match for nested routes (e.g. /movies/123)
  const prefix = Object.keys(PAGE_TITLES).find(k => pathname.startsWith(k + "/"));
  if (prefix) return PAGE_TITLES[prefix];
  return { title: "Bengali IP Management Dashboard", subtitle: "" };
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { loading, user, session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const pageMeta = getPageMeta(pathname);

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
        <SidebarInset className="relative" style={{ background: "var(--bg)" }}>
          {/* Ambient background blobs */}
          <div
            style={{
              position: "absolute",
              top: -180,
              left: "18%",
              width: 720,
              height: 460,
              borderRadius: "50%",
              background: "color-mix(in oklch, var(--svf-accent) 10%, transparent)",
              filter: "blur(150px)",
              opacity: 0.45,
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: -120,
              right: "10%",
              width: 560,
              height: 420,
              borderRadius: "50%",
              background: "color-mix(in oklch, var(--st-wtp) 8%, transparent)",
              filter: "blur(150px)",
              opacity: 0.35,
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          <div className="relative z-10 flex flex-col h-full">
            <Header title={pageMeta.title} subtitle={pageMeta.subtitle} />
            <main
              className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 pb-20 md:pb-8 min-w-0"
              style={{ fontFamily: "var(--font-sans)", color: "var(--text)" }}
            >
              {children}
            </main>
          </div>
        </SidebarInset>
        <MobileNav />
        <Toaster
          position="top-right"
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
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <ThemeProvider>
            <ErrorBoundary>
              <DashboardContent>{children}</DashboardContent>
            </ErrorBoundary>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
