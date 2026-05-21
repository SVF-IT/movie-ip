"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ExpiringRight } from "@/lib/types/database";
import { format } from "date-fns";
import Link from "next/link";
import { ChevronDown, RefreshCw } from "lucide-react";

interface ExpiringRightsTableProps {
  rights: ExpiringRight[];
  onRenew?: (rightId: string) => void;
}

function groupByMonth(rights: ExpiringRight[]) {
  const now = new Date();
  const labels = ["This Month", "Next Month", "Month +2", "Month +3"];

  const months = [];
  for (let i = 0; i < 4; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 0, 23, 59, 59);
    const monthLabel = monthStart.toLocaleString("default", { month: "long", year: "numeric" });

    months.push({
      label: `${labels[i]} (${monthLabel})`,
      startDate: i === 0 ? now : monthStart,
      endDate: monthEnd,
      isCurrentMonth: i === 0,
      rights: rights.filter((r) => {
        if (!r.end_date) return false;
        const expiry = new Date(r.end_date);
        const start = i === 0 ? now : monthStart;
        return expiry >= start && expiry <= monthEnd;
      }),
    });
  }

  return months;
}

export function ExpiringRightsTable({
  rights,
  onRenew,
}: ExpiringRightsTableProps) {
  const monthGroups = groupByMonth(rights);

  const getUrgencyBadge = (days: number) => {
    if (days <= 7) {
      return <Badge variant="destructive" className="animate-pulse">Critical: {days}d</Badge>;
    }
    if (days <= 30) {
      return (
        <Badge variant="destructive" className="bg-orange-500">
          Urgent: {days}d
        </Badge>
      );
    }
    return <Badge variant="secondary">{days} days</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Expiring Rights</CardTitle>
          <CardDescription>
            Monthly breakdown for the next 4 months
          </CardDescription>
        </div>
        <Button variant="outline" asChild>
          <Link href="/expiring">View All</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {monthGroups.every((g) => g.rights.length === 0) ? (
          <p className="text-center text-muted-foreground py-8">
            No rights expiring in the next 4 months
          </p>
        ) : (
          monthGroups.map((group, index) => (
            <MonthSection
              key={group.label}
              group={group}
              defaultOpen={index < 2}
              getUrgencyBadge={getUrgencyBadge}
              onRenew={onRenew}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MonthSection({
  group,
  defaultOpen,
  getUrgencyBadge,
  onRenew,
}: {
  group: { label: string; isCurrentMonth: boolean; rights: ExpiringRight[] };
  defaultOpen: boolean;
  getUrgencyBadge: (days: number) => React.ReactNode;
  onRenew?: (rightId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={group.isCurrentMonth ? "border-destructive border-2" : ""}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <CardHeader className="flex flex-row items-center justify-between py-3 cursor-pointer hover:bg-muted/50 rounded-t-lg">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">{group.label}</CardTitle>
                <Badge
                  variant={group.isCurrentMonth ? "destructive" : "secondary"}
                >
                  {group.rights.length}
                </Badge>
              </div>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {group.rights.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No rights expiring this month
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Movie</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rights.map((right) => (
                    <TableRow key={right.id} className="transition-colors duration-150 hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <Link
                          href={`/movies/${right.movie_id}`}
                          className="hover:underline"
                        >
                          {right.movie_title}
                        </Link>
                      </TableCell>
                      <TableCell>{right.platform_name || "N/A"}</TableCell>
                      <TableCell>{right.rights_type_name || "N/A"}</TableCell>
                      <TableCell>
                        {right.end_date
                          ? format(new Date(right.end_date), "MMM dd, yyyy")
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {getUrgencyBadge(right.days_until_expiry)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRenew?.(right.id)}
                          aria-label="Renew right"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
