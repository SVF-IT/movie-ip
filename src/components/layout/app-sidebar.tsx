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
import { isBarcRole, isEditorRole } from "@/lib/types/database";
import {
  BarChart3,
  Bell,
  Building2,
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
      { title: "BARC", icon: BarChart3, href: "/barc", roleCheck: "barc" as const },
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
  const isViewer = profile?.role === "viewer";
  const isLegal = profile?.role === "legal" || isAdmin || isViewer;
  const isEditor = isEditorRole(profile?.role) && !isAdmin;
  // BARC data is licensed — only admin, super_admin and data_analyst may see it.
  const canSeeBarc = isBarcRole(profile?.role);

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
      style={{
        // v5: wine base + red glow top-left, gold glow bottom-right. Dark in both themes.
        background: `
          radial-gradient(38% 16% at 18% 7%, rgba(245,35,46,.42), transparent 70%),
          radial-gradient(90% 45% at 15% 0%, rgba(245,35,46,.35), transparent 55%),
          radial-gradient(70% 40% at 110% 100%, rgba(224,160,32,.18), transparent 60%),
          linear-gradient(180deg, var(--wine), var(--wine-2))`,
        borderRight: "1px solid rgba(255,255,255,.07)",
      }}
      className="backdrop-blur-xl [&_*]:border-white/10"
    >
      {/* ── Logo header ── */}
      {/* h-[74px] matches the main Header, so both bottom borders line up. */}
      <SidebarHeader
        style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}
        className="h-[74px] shrink-0 justify-center bg-transparent px-[18px] py-0 group-data-[collapsible=icon]:px-2"
      >
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          {/* Bare SVF logo — no tile. The reddish glow comes from a drop-shadow on
              the mark itself, so the artwork sits directly on the wine background. */}
          <div
            style={{
              flexShrink: 0,
              filter: "drop-shadow(0 6px 20px rgba(245,35,46,.55)) drop-shadow(0 0 10px rgba(245,35,46,.35))",
            }}
          >
            <Image src="/svf-logo.png" alt="SVF Entertainment" width={44} height={44}
              className="object-contain group-data-[collapsible=icon]:hidden" />
            <Image src="/svf-logo.png" alt="SVF" width={28} height={28}
              className="object-contain hidden group-data-[collapsible=icon]:block" />
          </div>
          <div className="leading-tight group-data-[collapsible=icon]:hidden">
            <div className="dsp" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: "#fff" }}>
              Bengali Movie IP
            </div>
            <div style={{ fontSize: 11, color: "#C79398", marginTop: 1 }}>SVF Entertainment</div>
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
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "#9A6167" }}>
                  {section.group}
                </span>
              </div>

              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {section.items.filter((item) =>
                    "roleCheck" in item && item.roleCheck === "barc" ? canSeeBarc : true
                  ).map((item) => {
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
                              gap: 13,
                              width: "100%",
                              padding: "0 12px",
                              height: 40,
                              borderRadius: 12,
                              cursor: "pointer",
                              fontSize: 13.5,
                              fontWeight: active ? 600 : 500,
                              textDecoration: "none",
                              background: active
                                ? "linear-gradient(100deg, rgba(245,35,46,.92), rgba(212,14,25,.78))"
                                : "transparent",
                              color: active ? "#fff" : "#D9BCBF",
                              boxShadow: active
                                ? "0 10px 24px -10px rgba(245,35,46,.8), inset 0 1px 0 rgba(255,255,255,.25)"
                                : "none",
                              transition: "all .18s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (!active) {
                                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.06)";
                                (e.currentTarget as HTMLElement).style.color = "#fff";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!active) {
                                (e.currentTarget as HTMLElement).style.background = "transparent";
                                (e.currentTarget as HTMLElement).style.color = "#D9BCBF";
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
                                background: "var(--red)",
                                boxShadow: "0 0 8px var(--red)",
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
                                color: active ? "#fff" : "#D9BCBF",
                                background: active
                                  ? "rgba(255,255,255,0.25)"
                                  : "rgba(0,0,0,0.28)",
                                border: `1px solid ${active ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.10)"}`,
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
        style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}
        className="bg-transparent p-3.5"
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(0,0,0,.25)",
          border: "1px solid rgba(255,255,255,.08)",
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
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {profile?.full_name || "User"}
            </div>
            <div style={{ fontSize: 10.5, color: "#C79398", textTransform: "capitalize" }}>
              {profile?.role || "Member"}
            </div>
          </div>

          <button
            onClick={handleSignOut}
            title="Sign out"
            style={{
              background: "none", border: "none",
              color: "#C79398", cursor: "pointer",
              padding: 5, display: "flex", borderRadius: 7,
              transition: "color .18s, background .18s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--svf-accent)";
              (e.currentTarget as HTMLElement).style.background = "var(--hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#C79398";
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
