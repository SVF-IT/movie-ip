"use client";

import { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

export interface Column<T> {
  key: string;
  label: string;
  header?: ReactNode;
  render: (item: T) => ReactNode;
  hideOnMobile?: boolean;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  renderMobileCard?: (item: T) => ReactNode;
  emptyMessage?: string;
  rowClassName?: (item: T) => string;
}

export function ResponsiveTable<T>({
  columns,
  data,
  keyExtractor,
  renderMobileCard,
  emptyMessage = "No data found",
  rowClassName,
}: ResponsiveTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>
                  {col.header || col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow
                key={keyExtractor(item)}
                className={rowClassName?.(item)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key}>{col.render(item)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {data.map((item) => (
          <Card key={keyExtractor(item)} className={rowClassName?.(item)}>
            <CardContent className="py-3 px-4">
              {renderMobileCard ? (
                renderMobileCard(item)
              ) : (
                <div className="space-y-2">
                  {columns
                    .filter((col) => !col.hideOnMobile)
                    .map((col) => (
                      <div
                        key={col.key}
                        className="flex items-start justify-between gap-2"
                      >
                        <span className="text-xs text-muted-foreground shrink-0">
                          {col.label}
                        </span>
                        <span className="text-sm text-right">
                          {col.render(item)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
