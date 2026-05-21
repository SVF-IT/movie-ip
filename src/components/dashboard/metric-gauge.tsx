"use client";

import { Card, CardContent } from "@/components/ui/card";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface MetricGaugeProps {
  label: string;
  value: number;
  color?: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
  thresholds?: { warning: number; danger: number };
}

function getColorByThreshold(
  value: number,
  thresholds?: { warning: number; danger: number },
  defaultColor?: string
): string {
  if (!thresholds) return defaultColor || "#3b82f6";
  if (value >= thresholds.warning) return "#10b981";
  if (value >= thresholds.danger) return "#f59e0b";
  return "#ef4444";
}

export function MetricGauge({
  label,
  value,
  color,
  subtitle,
  size = "md",
  thresholds,
}: MetricGaugeProps) {
  const resolvedColor = color || getColorByThreshold(value, thresholds);

  const sizeMap = { sm: 140, md: 180, lg: 220 };
  const hollowMap = { sm: "50%", md: "45%", lg: "40%" };
  const chartSize = sizeMap[size];

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "radialBar",
      sparkline: { enabled: true },
      animations: {
        enabled: true,
        speed: 1400,
        dynamicAnimation: { enabled: true, speed: 400 },
      },
    },
    plotOptions: {
      radialBar: {
        startAngle: -135,
        endAngle: 135,
        hollow: { size: hollowMap[size] },
        track: {
          background: "hsl(var(--muted))",
          strokeWidth: "100%",
        },
        dataLabels: {
          name: {
            show: true,
            fontSize: "12px",
            color: "hsl(var(--muted-foreground))",
            offsetY: -8,
          },
          value: {
            show: true,
            fontSize: "22px",
            fontWeight: "700",
            color: "hsl(var(--foreground))",
            offsetY: 4,
            formatter: (val: number) => `${Math.round(val)}%`,
          },
        },
      },
    },
    colors: [resolvedColor],
    stroke: { lineCap: "round" },
    labels: [label],
  };

  return (
    <div className="flex flex-col items-center">
      {typeof window !== "undefined" && (
        <Chart
          options={options}
          series={[Math.min(Math.max(value, 0), 100)]}
          type="radialBar"
          height={chartSize}
          width={chartSize}
        />
      )}
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1 text-center">{subtitle}</p>
      )}
    </div>
  );
}

interface RightsUtilizationGaugesProps {
  utilizationRate: number;
  renewalRate: number;
  exclusiveRatio: number;
}

export function RightsUtilizationGauges({
  utilizationRate,
  renewalRate,
  exclusiveRatio,
}: RightsUtilizationGaugesProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-4">Rights Performance</h3>
        <div className="grid grid-cols-3 gap-4">
          <MetricGauge
            label="Utilization"
            value={utilizationRate}
            thresholds={{ warning: 70, danger: 40 }}
            subtitle="Catalog with active rights"
          />
          <MetricGauge
            label="Renewal Rate"
            value={renewalRate}
            thresholds={{ warning: 60, danger: 30 }}
            subtitle="Expiring rights renewed"
          />
          <MetricGauge
            label="Exclusive"
            value={exclusiveRatio}
            color="#8b5cf6"
            subtitle="Exclusive rights ratio"
          />
        </div>
      </CardContent>
    </Card>
  );
}
