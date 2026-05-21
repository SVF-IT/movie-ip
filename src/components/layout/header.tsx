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
}

export function Header({ title = "Bengali IP Management Dashboard" }: HeaderProps) {
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
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl px-6 sticky top-0 z-50">
      <SidebarTrigger className="-ml-2 text-slate-400 hover:text-slate-200 transition-colors" />

      <div className="flex flex-1 items-center justify-between">
        <h1 className="text-xl font-semibold bg-gradient-to-r from-red-500 to-amber-500 bg-clip-text text-transparent tracking-tight">
          {title}
        </h1>

        <div className="flex items-center gap-4">
          {/* Search */}
          {/* <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search movies..."
              className="w-64 pl-8"
            />
          </div> */}

          {/* Notifications */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-xs text-slate-400 font-medium tracking-wide mr-2">
              {profile?.full_name ? `Welcome, ${profile.full_name.split(' ')[0]}` : ''}
            </div>
            <NotificationBell />
          </div>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:ring-2 hover:ring-red-500/50 transition-all p-0 overflow-hidden ring-1 ring-slate-800">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-gradient-to-br from-red-950 to-slate-900 text-slate-200 border-none">
                    {loading ? (
                      <Skeleton className="h-full w-full rounded-full bg-slate-800" />
                    ) : (
                      getInitials(profile?.full_name, profile?.email)
                    )}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 bg-slate-900 border-slate-800/60 text-slate-300 shadow-2xl backdrop-blur-xl rounded-xl" align="end" forceMount>
              <DropdownMenuLabel className="font-normal px-3 py-3">
                <div className="flex flex-col space-y-1.5">
                  {loading ? (
                    <>
                      <Skeleton className="h-4 w-24 bg-slate-800" />
                      <Skeleton className="h-3 w-32 bg-slate-800" />
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold leading-none text-slate-200">
                        {profile?.full_name || "User"}
                      </p>
                      <p className="text-xs leading-none text-slate-400">
                        {profile?.email}
                      </p>
                      {profile?.role && (
                        <Badge
                          variant="secondary"
                          className="w-fit mt-2 text-[10px] capitalize bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                        >
                          {profile.role}
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-800/60" />
              <DropdownMenuItem asChild className="focus:bg-slate-800 focus:text-slate-200 cursor-pointer py-2.5">
                <Link href="/settings" className="flex items-center">
                  <User className="mr-3 h-4 w-4 text-slate-400" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="focus:bg-slate-800 focus:text-slate-200 cursor-pointer py-2.5">
                <Link href="/settings" className="flex items-center">
                  <Settings className="mr-3 h-4 w-4 text-slate-400" />
                  Settings
                </Link>
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator className="bg-slate-800/60" />
                  <DropdownMenuItem asChild className="focus:bg-slate-800 focus:text-slate-200 cursor-pointer py-2.5">
                    <Link href="/admin/users" className="flex items-center">
                      <Shield className="mr-3 h-4 w-4 text-purple-400" />
                      User Management
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator className="bg-slate-800/60" />
              <DropdownMenuItem onClick={handleSignOut} className="focus:bg-red-500/10 focus:text-red-400 text-red-500 cursor-pointer py-2.5">
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
