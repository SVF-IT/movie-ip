"use client";

import { useState, useMemo } from "react";

export interface SortConfig {
  column: string;
  direction: "asc" | "desc";
}

export function useSortableTable<T>(
  data: T[],
  defaultSort?: SortConfig
) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(
    defaultSort || null
  );

  const sortedData = useMemo(() => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortConfig.column];
      const bVal = (b as Record<string, unknown>)[sortConfig.column];

      // Handle nulls/undefined — push to end
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;

      if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else if (typeof aVal === "string" && typeof bVal === "string") {
        // Try date parsing if both look like dates
        const aDate = Date.parse(aVal);
        const bDate = Date.parse(bVal);
        if (!isNaN(aDate) && !isNaN(bDate)) {
          comparison = aDate - bDate;
        } else {
          comparison = aVal.localeCompare(bVal, undefined, {
            sensitivity: "base",
          });
        }
      } else if (typeof aVal === "boolean" && typeof bVal === "boolean") {
        comparison = aVal === bVal ? 0 : aVal ? -1 : 1;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
  }, [data, sortConfig]);

  const requestSort = (column: string) => {
    setSortConfig((prev) => {
      if (prev?.column === column) {
        if (prev.direction === "asc") return { column, direction: "desc" };
        return null; // Third click clears sort
      }
      return { column, direction: "asc" };
    });
  };

  return { sortedData, sortConfig, requestSort };
}
