"use client";

import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { useSidebarCounts } from "@/hooks/use-sidebar-counts";
import { Clock, LogOut, Settings, Shield, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export function Header({ title = "Bengali IP Management Dashboard", subtitle }: HeaderProps) {
  const router = useRouter();
  const { profile, loading, signOut, isAdmin } = useAuth();
  const sidebarCounts = useSidebarCounts();
  const expiringCount = sidebarCounts.expiringRights;

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    if (email) return email[0].toUpperCase();
    return "U";
  };

  return (
    <header
      className="flex h-[74px] shrink-0 items-center gap-4 px-6 sticky top-0 z-30"
      style={{
        borderBottom: "1px solid var(--svf-border)",
        background: "var(--glass)",
        backdropFilter: "blur(14px) saturate(1.4)",
        WebkitBackdropFilter: "blur(14px) saturate(1.4)",
      }}
    >
      <SidebarTrigger
        className="transition-colors"
        style={{ color: "var(--text-faint)" }}
      />

      <div className="flex flex-1 items-center justify-between min-w-0 gap-4">
        {/* Title block */}
        <div className="min-w-0">
          {subtitle && (
            <p className="text-[11px] truncate" style={{ color: "var(--text-faint)" }}>
              {subtitle}
            </p>
          )}
          <h1
            className="dsp text-[23px] font-bold truncate"
            style={{ color: "var(--text)", lineHeight: 1.15 }}
          >
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Expiring rights — moved here from the sidebar. Only shown when there
              is something to act on, so the header stays quiet otherwise. */}
          {expiringCount > 0 && (
            <Link
              href="/expiring"
              title={`${expiringCount} rights expiring in the next 90 days`}
              className="hidden sm:inline-flex items-center gap-2 h-9 rounded-[9px] pl-2.5 pr-3 border border-(--st-expiring)/35 bg-(--st-expiring)/10 hover:bg-(--st-expiring)/15 transition-colors"
            >
              <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--st-expiring)" }} />
              <span className="text-[12.5px] font-semibold num" style={{ color: "var(--st-expiring)" }}>
                {expiringCount}
              </span>
              <span className="text-[12.5px] text-(--text-dim)">Expiring rights</span>
            </Link>
          )}

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <NotificationBell />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-10 w-10 rounded-full p-0 overflow-hidden"
                style={{
                  border: "1px solid var(--svf-border)",
                  background: "var(--bg-raise)",
                }}
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback
                    style={{
                      background: "linear-gradient(135deg, var(--svf-accent), oklch(0.4 0.16 var(--accent-h)))",
                      color: "white",
                      fontSize: 13,
                      fontWeight: 700,
                      border: "none",
                    }}
                  >
                    {loading ? (
                      <Skeleton className="h-full w-full rounded-full" style={{ background: "var(--hover)" }} />
                    ) : (
                      getInitials(profile?.full_name, profile?.email)
                    )}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              className="w-64 shadow-2xl rounded-[14px]"
              style={{
                background: "var(--panel-solid)",
                border: "1px solid var(--svf-border-strong)",
                color: "var(--text)",
                backdropFilter: "blur(14px)",
              }}
              align="end"
              forceMount
            >
              <DropdownMenuLabel className="font-normal px-3 py-3">
                <div className="flex flex-col gap-1.5">
                  {loading ? (
                    <>
                      <Skeleton className="h-4 w-24" style={{ background: "var(--hover)" }} />
                      <Skeleton className="h-3 w-32" style={{ background: "var(--hover)" }} />
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {profile?.full_name || "User"}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                        {profile?.email}
                      </p>
                      {profile?.role && (
                        <Badge variant="secondary" className="w-fit mt-1 text-[10px] capitalize">
                          {profile.role}
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator style={{ background: "var(--svf-border)" }} />

              <DropdownMenuItem
                asChild
                className="cursor-pointer py-2.5 rounded-[7px] mx-1"
                style={{ color: "var(--text-dim)" }}
              >
                <Link href="/settings" className="flex items-center">
                  <User className="mr-3 h-4 w-4" style={{ color: "var(--text-faint)" }} />
                  Profile
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                asChild
                className="cursor-pointer py-2.5 rounded-[7px] mx-1"
                style={{ color: "var(--text-dim)" }}
              >
                <Link href="/settings" className="flex items-center">
                  <Settings className="mr-3 h-4 w-4" style={{ color: "var(--text-faint)" }} />
                  Settings
                </Link>
              </DropdownMenuItem>

              {isAdmin && (
                <>
                  <DropdownMenuSeparator style={{ background: "var(--svf-border)" }} />
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer py-2.5 rounded-[7px] mx-1"
                    style={{ color: "var(--st-wtp)" }}
                  >
                    <Link href="/admin/users" className="flex items-center">
                      <Shield className="mr-3 h-4 w-4" />
                      User Management
                    </Link>
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator style={{ background: "var(--svf-border)" }} />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer py-2.5 rounded-[7px] mx-1 mb-1"
                style={{ color: "var(--st-expired)" }}
              >
                <LogOut className="mr-3 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
