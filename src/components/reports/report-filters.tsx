"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SOURCE_OPTIONS = [
  { value: "home_production", label: "Home Production" },
  { value: "acquired", label: "Acquired" },
];

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

    case "world_premiere": {
      const sourceValue = (filters.source as string[] | undefined) ?? SOURCE_OPTIONS.map((o) => o.value);
      return (
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Source</Label>
            <MultiSelectFilter
              label="All Sources"
              options={SOURCE_OPTIONS}
              value={sourceValue}
              onChange={(v) => onChange({ ...filters, source: v })}
              triggerWidth="w-48"
            />
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}
