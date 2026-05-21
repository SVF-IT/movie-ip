"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReportFiltersProps {
  templateId: string;
  filters: Record<string, unknown>;
  onChange: (filters: Record<string, unknown>) => void;
}

export function ReportFilters({ templateId, filters, onChange }: ReportFiltersProps) {
  switch (templateId) {
    case "expiry_forecast":
      return (
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Forecast Period</Label>
            <Select
              value={String(filters.months || 12)}
              onValueChange={(v) => onChange({ ...filters, months: parseInt(v) })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 Months</SelectItem>
                <SelectItem value="6">6 Months</SelectItem>
                <SelectItem value="12">12 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "rights_timeline":
      return (
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Year</Label>
            <Input
              type="number"
              className="w-28"
              value={String(filters.year || new Date().getFullYear())}
              onChange={(e) => onChange({ ...filters, year: parseInt(e.target.value) })}
              min={2020}
              max={2030}
            />
          </div>
        </div>
      );

    case "world_premiere":
      return (
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Source</Label>
            <Select
              value={String(filters.source || "all")}
              onValueChange={(v) => onChange({ ...filters, source: v })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="home_production">Home Production</SelectItem>
                <SelectItem value="acquired">Acquired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    default:
      return null;
  }
}
