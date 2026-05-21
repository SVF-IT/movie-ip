"use client";

import { TableHead } from "@/components/ui/table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortConfig } from "@/hooks/use-sortable-table";

interface SortableHeaderProps {
  column: string;
  label: string;
  currentSort: SortConfig | null;
  onSort: (column: string) => void;
  className?: string;
}

export function SortableHeader({
  column,
  label,
  currentSort,
  onSort,
  className,
}: SortableHeaderProps) {
  const isActive = currentSort?.column === column;
  const direction = isActive ? currentSort.direction : null;

  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none hover:bg-muted/50 transition-colors",
        isActive && "text-foreground",
        className
      )}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        <span className="hover:underline">{label}</span>
        <span className="inline-flex shrink-0">
          {direction === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : direction === "desc" ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </span>
      </div>
    </TableHead>
  );
}
