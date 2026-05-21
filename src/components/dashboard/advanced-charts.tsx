"use client";

import dynamic from "next/dynamic";
import type { DistributionPoint, CatalogHealth } from "@/lib/types/database";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ── Shared dark theme for ApexCharts ─────────────────────────────────────────
const darkTheme: ApexCharts.ApexOptions = {
  theme: { mode: "dark" },
  chart: {
    background: "transparent",
    foreColor: "#64748b",
    toolbar: { show: false },
    fontFamily: "inherit",
  },
  tooltip: {
    theme: "dark",
    style: { fontSize: "12px" },
  },
  grid: {
    borderColor: "rgba(148,163,184,0.08)",
    strokeDashArray: 3,
  },
};

function ChartSection({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Territory Coverage Treemap ────────────────────────────────────────────────
interface TerritoryCoverageTreemapProps {
  data: DistributionPoint[];
}

export function TerritoryCoverageTreemap({ data }: TerritoryCoverageTreemapProps) {
  const series = [{ data: data.map((d) => ({ x: d.name, y: d.count })) }];

  const options: ApexCharts.ApexOptions = {
    ...darkTheme,
    chart: { ...darkTheme.chart, type: "treemap" },
    colors: [
      "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
      "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16",
    ],
    plotOptions: {
      treemap: {
        distributed: true,
        enableShades: true,
        shadeIntensity: 0.25,
        colorScale: {
          ranges: [],
        },
      },
    },
    dataLabels: {
      style: {
        fontSize: "11px",
        fontWeight: "600",
        colors: ["#fff"],
      },
    },
    tooltip: {
      ...darkTheme.tooltip,
      y: { formatter: (val: number) => `${val} rights` },
    },
    legend: { show: false },
  };

  return (
    <ChartSection title="Territory Coverage" description="Active rights density by territory">
      <div className="h-[280px]">
        {typeof window !== "undefined" && (
          <Chart options={options} series={series} type="treemap" height={280} />
        )}
      </div>
    </ChartSection>
  );
}

// ── Catalog Health Radial ─────────────────────────────────────────────────────
interface CatalogHealthRadialProps {
  health: CatalogHealth;
}

export function CatalogHealthRadial({ health }: CatalogHealthRadialProps) {
  const series = [health.percentCovered, health.metadataCompleteness];

  const options: ApexCharts.ApexOptions = {
    ...darkTheme,
    chart: { ...darkTheme.chart, type: "radialBar" },
    plotOptions: {
      radialBar: {
        hollow: {
          size: "38%",
          background: "transparent",
        },
        track: {
          background: "rgba(148,163,184,0.08)",
          strokeWidth: "100%",
          margin: 4,
        },
        dataLabels: {
          name: {
            fontSize: "13px",
            color: "#94a3b8",
            offsetY: -6,
          },
          value: {
            fontSize: "22px",
            fontWeight: 700,
            color: "#f1f5f9",
            formatter: (val: number) => `${val}%`,
          },
          total: {
            show: true,
            label: "Health",
            color: "#64748b",
            fontSize: "12px",
            formatter: () => {
              const avg = Math.round((health.percentCovered + health.metadataCompleteness) / 2);
              return `${avg}%`;
            },
          },
        },
      },
    },
    colors: ["#3b82f6", "#10b981"],
    labels: ["Rights Coverage", "Metadata"],
    stroke: { lineCap: "round" },
    legend: {
      show: true,
      position: "bottom",
      fontSize: "12px",
      labels: { colors: "#94a3b8" },
      markers: { size: 6 },
    },
  };

  return (
    <ChartSection
      title="Catalog Health"
      description={`${health.withActiveRights} of ${health.totalMovies} movies have active rights`}
    >
      <div className="h-[280px]">
        {typeof window !== "undefined" && (
          <Chart options={options} series={series} type="radialBar" height={280} />
        )}
      </div>
    </ChartSection>
  );
}
