"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/auth-context";
import {
  Bell,
  Building2,
  Clock,
  Compass,
  Drama,
  Factory,
  Film,
  FolderCog,
  Gavel,
  Languages,
  LogOut,
  Megaphone,
  Satellite,
  Scale,
  ScrollText,
  SendHorizonal,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const menuItems = [
  {
    title: "Rights Dashboard",
    icon: Satellite,
    href: "/rights-dashboard",
  },
  {
    title: "Movies",
    icon: Film,
    href: "/movies",
  },
  {
    title: "Censor Tracker",
    icon: ShieldAlert,
    href: "/recensor",
  },
  {
    title: "Rights Management",
    icon: Scale,
    href: "/rights",
  },
  {
    title: "Expiring Rights",
    icon: Clock,
    href: "/expiring",
  },
  {
    title: "Analytics",
    icon: TrendingUp,
    href: "/analytics",
  },
  {
    title: "Dubbed",
    icon: Languages,
    href: "/dubbed",
  },
];

const managementItems = [
  {
    title: "People",
    icon: Users,
    href: "/people",
  },
  {
    title: "Actors",
    icon: Drama,
    href: "/actors",
  },
  {
    title: "Directors",
    icon: Megaphone,
    href: "/directors",
  },
  {
    title: "Platforms",
    icon: Building2,
    href: "/platforms",
  },
  {
    title: "Production Houses",
    icon: Factory,
    href: "/production-houses",
  },
];

const adminItems = [
  {
    title: "Notifications",
    icon: Bell,
    href: "/admin/notifications",
  },
  {
    title: "Audit Log",
    icon: ScrollText,
    href: "/audit-log",
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, profile, signOut } = useAuth();
  const isLegal = profile?.role === "legal" || isAdmin;
  const isEditor = profile?.role === "editor" && !isAdmin;

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <Sidebar collapsible="icon" className="border-r-slate-800/60 bg-slate-950/95 backdrop-blur-xl">
      <SidebarHeader className="border-b border-slate-800/60 px-4 py-3 group-data-[collapsible=icon]:px-2 bg-transparent">
        <Link href="/" className="flex items-center gap-2 transition-transform duration-200 hover:scale-105">
          <Image
            src="/svf-logo.png"
            alt="SVF Entertainment"
            width={80}
            height={80}
            className="object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] group-data-[collapsible=icon]:hidden"
          />
          <Image
            src="/svf-logo.png"
            alt="SVF"
            width={32}
            height={32}
            className="object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] hidden group-data-[collapsible=icon]:block"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent className="bg-transparent gap-0">
        <SidebarGroup>
          <div className="px-2 py-2">
            <SidebarGroupLabel className="text-slate-400 font-medium tracking-wider text-[10px] uppercase">
              <Compass className="h-3.5 w-3.5 mr-1.5 text-red-500" />
              Main
            </SidebarGroupLabel>
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                    className="hover:bg-red-500/10 hover:text-red-100 data-[active=true]:bg-gradient-to-r data-[active=true]:from-red-600/20 data-[active=true]:to-transparent data-[active=true]:text-red-400 data-[active=true]:border-l-2 data-[active=true]:border-red-500 transition-all duration-200 rounded-none h-10"
                  >
                    <Link href={item.href} className="flex items-center gap-3 px-3">
                      <item.icon className="h-4 w-4" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isLegal && (
          <SidebarGroup>
            <div className="px-2 py-2 mt-4">
              <SidebarGroupLabel className="text-slate-400 font-medium tracking-wider text-[10px] uppercase">
                <Gavel className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                Legal
              </SidebarGroupLabel>
            </div>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/legal-approvals")}
                    tooltip="Legal Approvals"
                    className="hover:bg-green-500/10 hover:text-green-100 data-[active=true]:bg-gradient-to-r data-[active=true]:from-green-600/20 data-[active=true]:to-transparent data-[active=true]:text-green-400 data-[active=true]:border-l-2 data-[active=true]:border-green-500 transition-all duration-200 rounded-none h-10"
                  >
                    <Link href="/legal-approvals" className="flex items-center gap-3 px-3">
                      <Gavel className="h-4 w-4" />
                      <span className="font-medium">Legal Approvals</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {isEditor && (
          <SidebarGroup>
            <div className="px-2 py-2 mt-4">
              <SidebarGroupLabel className="text-slate-400 font-medium tracking-wider text-[10px] uppercase">
                <SendHorizonal className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />
                Submissions
              </SidebarGroupLabel>
            </div>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/my-submissions")}
                    tooltip="My Submissions"
                    className="hover:bg-yellow-500/10 hover:text-yellow-100 data-[active=true]:bg-gradient-to-r data-[active=true]:from-yellow-600/20 data-[active=true]:to-transparent data-[active=true]:text-yellow-400 data-[active=true]:border-l-2 data-[active=true]:border-yellow-500 transition-all duration-200 rounded-none h-10"
                  >
                    <Link href="/my-submissions" className="flex items-center gap-3 px-3">
                      <SendHorizonal className="h-4 w-4" />
                      <span className="font-medium">My Submissions</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <div className="px-2 py-2 mt-4">
            <SidebarGroupLabel className="text-slate-400 font-medium tracking-wider text-[10px] uppercase">
              <FolderCog className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
              Management
            </SidebarGroupLabel>
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {managementItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                    className="hover:bg-amber-500/10 hover:text-amber-100 data-[active=true]:bg-gradient-to-r data-[active=true]:from-amber-600/20 data-[active=true]:to-transparent data-[active=true]:text-amber-400 data-[active=true]:border-l-2 data-[active=true]:border-amber-500 transition-all duration-200 rounded-none h-10"
                  >
                    <Link href={item.href} className="flex items-center gap-3 px-3">
                      <item.icon className="h-4 w-4" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <div className="px-2 py-2 mt-4">
              <SidebarGroupLabel className="text-slate-400 font-medium tracking-wider text-[10px] uppercase">
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-purple-500" />
                Admin
              </SidebarGroupLabel>
            </div>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                      className="hover:bg-purple-500/10 hover:text-purple-100 data-[active=true]:bg-gradient-to-r data-[active=true]:from-purple-600/20 data-[active=true]:to-transparent data-[active=true]:text-purple-400 data-[active=true]:border-l-2 data-[active=true]:border-purple-500 transition-all duration-200 rounded-none h-10"
                    >
                      <Link href={item.href} className="flex items-center gap-3 px-3">
                        <item.icon className="h-4 w-4" />
                        <span className="font-medium">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-slate-800/60 bg-transparent p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sign Out"
              className="text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 h-10 px-3 cursor-pointer"
            >
              <LogOut className="h-4 w-4 mr-2" />
              <span className="font-medium">Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail className="hover:bg-red-500/20 opacity-0 transition-opacity" />
    </Sidebar>
  );
}
