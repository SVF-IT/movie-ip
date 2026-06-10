"use client";

import { NotificationBell } from "@/components/layout/notification-bell";
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
import { LogOut, Settings, Shield, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export function Header({ title = "Bengali IP Management Dashboard", subtitle }: HeaderProps) {
  const router = useRouter();
  const { profile, loading, signOut, isAdmin } = useAuth();

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
      className="flex h-[66px] shrink-0 items-center gap-4 px-6 sticky top-0 z-30"
      style={{
        borderBottom: "1px solid var(--svf-border)",
        background: "color-mix(in oklch, var(--bg) 75%, transparent)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <SidebarTrigger
        className="transition-colors"
        style={{ color: "var(--text-faint)" }}
      />

      <div className="flex flex-1 items-center justify-between min-w-0 gap-4">
        {/* Title block */}
        <div className="min-w-0">
          <h1
            className="text-[19px] font-bold truncate"
            style={{ color: "var(--text)", letterSpacing: "-0.01em", lineHeight: 1.2 }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12.5px] truncate mt-0.5" style={{ color: "var(--text-faint)" }}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
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
