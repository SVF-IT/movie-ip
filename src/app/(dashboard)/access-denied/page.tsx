"use client";

import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const REASON_COPY: Record<string, { label: string; description: string }> = {
  admin: {
    label: "Admin access required",
    description: "This section is restricted to administrators. If you believe you should have access, contact an admin.",
  },
  legal: {
    label: "Legal team access required",
    description: "This section is restricted to the legal team and administrators.",
  },
  editor: {
    label: "Editor access required",
    description: "This section is restricted to editors.",
  },
};

function AccessDeniedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") ?? "";
  const from = searchParams.get("from") ?? "";
  const copy = REASON_COPY[reason] ?? {
    label: "You don't have permission to view that page",
    description: "This section is restricted based on your account role.",
  };

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-5">
      <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
        <ShieldAlert className="h-9 w-9 text-rose-400" />
      </div>
      <div className="space-y-1.5 max-w-md">
        <h1 className="text-lg font-semibold text-(--text)">{copy.label}</h1>
        <p className="text-sm text-(--text-faint) leading-relaxed">{copy.description}</p>
        {from && (
          <p className="text-xs text-(--text-faint) font-mono opacity-70 mt-2">{from}</p>
        )}
      </div>
      <Button asChild className="mt-2">
        <Link href="/">Back to Dashboard</Link>
      </Button>
    </div>
  );
}

export default function AccessDeniedPage() {
  return (
    <Suspense fallback={null}>
      <AccessDeniedContent />
    </Suspense>
  );
}
