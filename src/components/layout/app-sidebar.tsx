"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/auth-context";
import { useSidebarCounts } from "@/hooks/use-sidebar-counts";
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
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// ── Nav structure — all original items preserved ─────────────────────────────
const NAV_BASE = [
  {
    group: "Catalogue",
    accent: "oklch(0.7867 0.1467 203.29)",
    groupIcon: Compass,
    items: [
      { title: "Rights Dashboard", icon: Satellite, href: "/rights-dashboard" },
      { title: "Movies", icon: Film, href: "/movies" },
      { title: "Censor Tracker", icon: ShieldAlert, href: "/recensor" },
      { title: "Rights Management", icon: Scale, href: "/rights" },
      { title: "Expiring Rights", icon: Clock, href: "/expiring", badgeKey: "expiringRights" as const },
      { title: "Analytics", icon: TrendingUp, href: "/analytics" },
      { title: "Dubbed", icon: Languages, href: "/dubbed" },
    ],
  },
  {
    group: "Legal",
    accent: "var(--st-active)",
    groupIcon: Gavel,
    roleCheck: "legal",
    items: [
      { title: "Movie Approvals", icon: Gavel, href: "/legal-approvals", badgeKey: "pendingApprovals" as const },
    ],
  },
  {
    group: "Submissions",
    accent: "var(--st-expiring)",
    groupIcon: SendHorizonal,
    roleCheck: "editor",
    items: [
      { title: "Movie Submissions", icon: SendHorizonal, href: "/my-submissions" },
    ],
  },
  {
    group: "Management",
    accent: "oklch(0.80 0.15 78)",
    groupIcon: FolderCog,
    items: [
      { title: "People", icon: Users, href: "/people" },
      { title: "Actors", icon: Drama, href: "/actors" },
      { title: "Directors", icon: Megaphone, href: "/directors" },
      { title: "Platforms", icon: Building2, href: "/platforms" },
      { title: "Production Houses", icon: Factory, href: "/production-houses" },
    ],
  },
  {
    group: "Admin",
    accent: "var(--st-wtp)",
    groupIcon: ShieldCheck,
    roleCheck: "admin",
    items: [
      { title: "Notification Setting", icon: Bell, href: "/settings/notifications" },
      { title: "Audit Log", icon: ScrollText, href: "/audit-log" },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, profile, signOut } = useAuth();
  const isLegal = profile?.role === "legal" || isAdmin;
  const isEditor = profile?.role === "editor" && !isAdmin;

  const sidebarCounts = useSidebarCounts();

  const NAV = NAV_BASE.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      badge: "badgeKey" in item && item.badgeKey && sidebarCounts[item.badgeKey] > 0
        ? String(sidebarCounts[item.badgeKey])
        : undefined,
    })),
  }));

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <Sidebar
      collapsible="icon"
      style={{ background: "var(--bg-deep)", borderRight: "1px solid var(--svf-border)" }}
      className="backdrop-blur-xl"
    >
      {/* ── Logo header ── */}
      <SidebarHeader
        style={{ borderBottom: "1px solid var(--svf-border)", padding: "18px 18px 14px" }}
        className="bg-transparent group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3"
      >
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          <div style={{ filter: "drop-shadow(0 0 14px color-mix(in oklch, var(--svf-accent) 35%, transparent))" }}>
            <Image src="/svf-logo.png" alt="SVF Entertainment" width={80} height={80}
              className="object-contain group-data-[collapsible=icon]:hidden" />
            <Image src="/svf-logo.png" alt="SVF" width={32} height={32}
              className="object-contain hidden group-data-[collapsible=icon]:block" />
          </div>
          <div className="leading-tight group-data-[collapsible=icon]:hidden">
            <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "0.02em", color: "var(--text)" }}>
              Bengali Movie IP
            </div>
          </div>
        </Link>
      </SidebarHeader>

      {/* ── Nav ── */}
      <SidebarContent className="bg-transparent gap-0 px-3.5 py-3.5">
        {NAV.map((section) => {
          // Role-based visibility
          if (section.roleCheck === "legal" && !isLegal) return null;
          if (section.roleCheck === "editor" && !isEditor) return null;
          if (section.roleCheck === "admin" && !isAdmin) return null;

          return (
            <SidebarGroup key={section.group} className="p-0 mb-5">
              {/* Group label */}
              <div className="flex items-center gap-2 px-3 mb-2">
                <span style={{ width: 5, height: 5, borderRadius: 9, background: section.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-faint)" }}>
                  {section.group}
                </span>
              </div>

              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {section.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className="p-0 h-auto hover:bg-transparent data-[active=true]:bg-transparent"
                        >
                          <Link
                            href={item.href}
                            style={{
                              position: "relative",
                              display: "flex",
                              alignItems: "center",
                              gap: 11,
                              width: "100%",
                              padding: "0 12px",
                              height: 40,
                              borderRadius: 9,
                              cursor: "pointer",
                              fontSize: 13.5,
                              fontWeight: active ? 600 : 500,
                              textDecoration: "none",
                              background: active
                                ? section.accent
                                : "transparent",
                              color: active ? "#fff" : "var(--text-dim)",
                              boxShadow: active
                                ? `0 2px 10px color-mix(in oklch, ${section.accent} 40%, transparent)`
                                : "none",
                              transition: "all .18s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (!active) {
                                (e.currentTarget as HTMLElement).style.background = "var(--hover)";
                                (e.currentTarget as HTMLElement).style.color = "var(--text)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!active) {
                                (e.currentTarget as HTMLElement).style.background = "transparent";
                                (e.currentTarget as HTMLElement).style.color = "var(--text-dim)";
                              }
                            }}
                          >
                            {/* Active left indicator bar */}
                            {active && (
                              <span style={{
                                position: "absolute",
                                left: -10,
                                top: 9,
                                bottom: 9,
                                width: 3,
                                borderRadius: 3,
                                background: section.accent,
                                boxShadow: `0 0 8px ${section.accent}`,
                              }} />
                            )}
                            <item.icon style={{ width: 17, height: 17, flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{item.title}</span>
                            {/* Badge */}
                            {"badge" in item && item.badge && (
                              <span style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 10.5,
                                fontWeight: 700,
                                minWidth: 18,
                                height: 18,
                                padding: "0 5px",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 999,
                                color: active ? section.accent : "var(--text-faint)",
                                background: active
                                  ? "rgba(255,255,255,0.25)"
                                  : "var(--bg-deep)",
                                border: `1px solid ${active ? "rgba(255,255,255,0.3)" : "var(--svf-border)"}`,
                              }}>
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      {/* ── Footer / User ── */}
      <SidebarFooter
        style={{ borderTop: "1px solid var(--svf-border)" }}
        className="bg-transparent p-3.5"
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: "var(--panel)",
          border: "1px solid var(--svf-border)",
        }}>
          {/* Avatar initials */}
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "white",
            background: "linear-gradient(135deg, var(--svf-accent), oklch(0.4 0.16 var(--accent-h)))",
          }}>
            {profile?.full_name
              ? profile.full_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
              : "U"}
          </div>

          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }} className="group-data-[collapsible=icon]:hidden">
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {profile?.full_name || "User"}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-faint)", textTransform: "capitalize" }}>
              {profile?.role || "Member"}
            </div>
          </div>

          <button
            onClick={handleSignOut}
            title="Sign out"
            style={{
              background: "none", border: "none",
              color: "var(--text-faint)", cursor: "pointer",
              padding: 5, display: "flex", borderRadius: 7,
              transition: "color .18s, background .18s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--svf-accent)";
              (e.currentTarget as HTMLElement).style.background = "var(--hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-faint)";
              (e.currentTarget as HTMLElement).style.background = "none";
            }}
          >
            <LogOut style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </SidebarFooter>

      <SidebarRail className="opacity-0 hover:opacity-100 transition-opacity" />
    </Sidebar>
  );
}
