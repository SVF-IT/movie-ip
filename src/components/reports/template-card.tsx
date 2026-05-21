"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Activity,
  Target,
  Shield,
  GitBranch,
  Calendar,
  Sparkles,
} from "lucide-react";
import type { ReportTemplate } from "@/lib/api/reports";

const iconMap: Record<string, typeof BarChart3> = {
  BarChart3,
  TrendingUp,
  PieChart,
  Activity,
  Target,
  Shield,
  GitBranch,
  Calendar,
  Sparkles,
};

interface TemplateCardProps {
  template: ReportTemplate;
  onClick: () => void;
  selected?: boolean;
}

export function TemplateCard({ template, onClick, selected }: TemplateCardProps) {
  const Icon = iconMap[template.icon] || BarChart3;

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        selected
          ? "ring-2 ring-primary border-primary"
          : "hover:border-primary/50"
      }`}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{template.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {template.description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
