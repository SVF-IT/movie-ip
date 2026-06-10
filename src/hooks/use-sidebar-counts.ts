"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export interface SidebarCounts {
  expiringRights: number;
  pendingApprovals: number;
}

const supabase = createClient();

export function useSidebarCounts(): SidebarCounts {
  const [counts, setCounts] = useState<SidebarCounts>({ expiringRights: 0, pendingApprovals: 0 });

  useEffect(() => {
    async function load() {
      const today = new Date();
      const in90Days = new Date(today);
      in90Days.setDate(today.getDate() + 90);
      const startDate = today.toISOString().split("T")[0];
      const endDate = in90Days.toISOString().split("T")[0];

      const [expiringRes, approvalsRes] = await Promise.all([
        supabase
          .from("platform_rights")
          .select("*", { count: "exact", head: true })
          .eq("is_current", true)
          .gte("end_date", startDate)
          .lte("end_date", endDate),
        supabase
          .from("movies")
          .select("*", { count: "exact", head: true })
          .eq("approval_status", "pending"),
      ]);
      setCounts({
        expiringRights: expiringRes.count ?? 0,
        pendingApprovals: approvalsRes.count ?? 0,
      });
    }
    load();
  }, []);

  return counts;
}
