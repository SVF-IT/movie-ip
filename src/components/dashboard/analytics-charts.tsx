"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import type {
  RightsExpiryTimelinePoint,
  PlatformComparisonPoint,
  DistributionPoint,
  MonthlyActivityPoint,
  RightsWindowPoint,
} from "@/lib/types/database";

// ── Design tokens ────────────────────────────────────────────────────────────
const DARK_COLORS = [
  "#ef4444", // red
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
];

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid rgba(148,163,184,0.15)",
  borderRadius: "8px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
  color: "#e2e8f0",
  fontSize: "12px",
};

const axisTickStyle = { fill: "#64748b", fontSize: 11 };
const gridStyle = { stroke: "rgba(148,163,184,0.08)" };
const legendStyle = { fontSize: 12, color: "#94a3b8" };

function ChartSection({ title, description, children, height = 300 }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <div className="p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

// ── Rights Expiry Timeline ────────────────────────────────────────────────────
interface RightsExpiryTimelineChartProps {
  data: RightsExpiryTimelinePoint[];
}

export function RightsExpiryTimelineChart({ data }: RightsExpiryTimelineChartProps) {
  return (
    <ChartSection
      title="Rights Expiry Timeline"
      description="Upcoming expirations, renewals, and transfers over the next 12 months"
      height={300}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradExpiring" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradRenewed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradTransferred" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStyle.stroke} vertical={false} />
          <XAxis dataKey="month" tick={axisTickStyle} tickLine={false} axisLine={false} />
          <YAxis tick={axisTickStyle} tickLine={false} axisLine={false} width={32} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(148,163,184,0.1)", strokeWidth: 1 }} />
          <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
          <Area type="monotone" dataKey="expiring" name="Expiring" stroke="#ef4444" fill="url(#gradExpiring)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          <Area type="monotone" dataKey="renewed" name="Renewed" stroke="#10b981" fill="url(#gradRenewed)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          <Area type="monotone" dataKey="transferred" name="Transferred" stroke="#3b82f6" fill="url(#gradTransferred)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartSection>
  );
}

// ── Platform Comparison ───────────────────────────────────────────────────────
interface PlatformComparisonChartProps {
  data: PlatformComparisonPoint[];
}

export function PlatformComparisonChart({ data }: PlatformComparisonChartProps) {
  return (
    <ChartSection
      title="Platform Comparison"
      description="Active vs expired rights per platform"
      height={320}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke={gridStyle.stroke} horizontal={false} />
          <XAxis type="number" tick={axisTickStyle} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="platform" tick={axisTickStyle} width={90} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(148,163,184,0.04)" }} />
          <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
          <Bar dataKey="active" name="Active" fill="#10b981" radius={[0, 3, 3, 0]} />
          <Bar dataKey="expired" name="Expired" fill="#ef4444" radius={[0, 3, 3, 0]} opacity={0.7} />
        </BarChart>
      </ResponsiveContainer>
    </ChartSection>
  );
}

// ── Monthly Activity ──────────────────────────────────────────────────────────
interface MonthlyActivityChartProps {
  data: MonthlyActivityPoint[];
}

export function MonthlyActivityChart({ data }: MonthlyActivityChartProps) {
  return (
    <ChartSection
      title="Monthly Rights Activity"
      description="Renewals, expirations, and transfers over the past 12 months"
      height={280}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStyle.stroke} vertical={false} />
          <XAxis dataKey="month" tick={axisTickStyle} tickLine={false} axisLine={false} />
          <YAxis tick={axisTickStyle} tickLine={false} axisLine={false} width={32} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(148,163,184,0.1)", strokeWidth: 1 }} />
          <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
          <Line type="monotone" dataKey="renewals" name="Renewals" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} />
          <Line type="monotone" dataKey="expirations" name="Expirations" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#ef4444", strokeWidth: 0 }} />
          <Line type="monotone" dataKey="transfers" name="Transfers" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartSection>
  );
}

// ── Distribution Donut ────────────────────────────────────────────────────────
interface DistributionChartProps {
  data: DistributionPoint[];
  title: string;
  description: string;
}

export function DistributionDonutChart({ data, title, description }: DistributionChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <ChartSection title={title} description={description} height={260}>
      <div className="relative h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={100}
              paddingAngle={2}
              dataKey="count"
              nameKey="name"
              strokeWidth={0}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={DARK_COLORS[index % DARK_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => [value, name]}
            />
            <Legend
              wrapperStyle={legendStyle}
              iconType="circle"
              iconSize={8}
              formatter={(value) => <span style={{ color: "#94a3b8", fontSize: 11 }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: "-24px" }}>
          <span className="text-2xl font-extrabold text-slate-100 tabular-nums">{total}</span>
          <span className="text-[9px] text-slate-500 uppercase tracking-widest">Total</span>
        </div>
      </div>
    </ChartSection>
  );
}

// ── Distribution Bar ──────────────────────────────────────────────────────────
export function DistributionBarChart({ data, title, description }: DistributionChartProps) {
  return (
    <ChartSection title={title} description={description} height={280}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }} barCategoryGap="30%">
          <XAxis type="number" tick={axisTickStyle} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" tick={axisTickStyle} width={90} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(148,163,184,0.04)" }} />
          <Bar dataKey="count" fill="#3b82f6" radius={[0, 3, 3, 0]}>
            <LabelList
              dataKey="count"
              position="right"
              style={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartSection>
  );
}

// ── Rights Window ─────────────────────────────────────────────────────────────
interface RightsWindowChartProps {
  data: RightsWindowPoint[];
}

const WINDOW_COLORS: Record<string, string> = {
  active: "#10b981",
  upcoming: "#3b82f6",
  expired_30d: "#f59e0b",
  expired_90d: "#ef4444",
};

export function RightsWindowChart({ data }: RightsWindowChartProps) {
  const chartData = [
    data.reduce(
      (acc, d) => ({ ...acc, [d.status]: d.count }),
      { name: "Rights" } as Record<string, string | number>
    ),
  ];

  return (
    <ChartSection
      title="Rights Window Management"
      description="Current distribution of rights by status window"
      height={120}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" barSize={36}>
          <XAxis type="number" tick={axisTickStyle} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip contentStyle={tooltipStyle} />
          {data.map((d) => (
            <Bar
              key={d.status}
              dataKey={d.status}
              stackId="a"
              fill={WINDOW_COLORS[d.status] || "#94a3b8"}
              name={d.label}
              radius={
                d.status === data[0]?.status
                  ? [3, 0, 0, 3]
                  : d.status === data[data.length - 1]?.status
                    ? [0, 3, 3, 0]
                    : [0, 0, 0, 0]
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-3 justify-center flex-wrap">
        {data.map((d) => (
          <div key={d.status} className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: WINDOW_COLORS[d.status] }} />
            <span className="text-slate-400">{d.label}:</span>
            <span className="font-semibold text-slate-200">{d.count}</span>
          </div>
        ))}
      </div>
    </ChartSection>
  );
}

// ── Deal Duration ─────────────────────────────────────────────────────────────
interface DealDurationChartProps {
  data: { platform: string; avgDays: number }[];
  overall: number;
}

export function DealDurationChart({ data, overall }: DealDurationChartProps) {
  return (
    <ChartSection
      title="Average Deal Duration"
      description={`Mean license period by platform — Overall avg: ${Math.round(overall)} days`}
      height={260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStyle.stroke} horizontal={false} />
          <XAxis type="number" tick={axisTickStyle} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}d`} />
          <YAxis type="category" dataKey="platform" tick={axisTickStyle} width={90} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Math.round(Number(value))} days`, "Avg Duration"]} />
          <Bar dataKey="avgDays" fill="#8b5cf6" radius={[0, 3, 3, 0]} name="Avg Days">
            <LabelList dataKey="avgDays" position="right" style={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }} formatter={(v: unknown) => `${Math.round(Number(v))}d`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartSection>
  );
}

// ── Platform Concentration ────────────────────────────────────────────────────
interface PlatformConcentrationChartProps {
  data: { platform: string; share: number; count: number; isTopConcentrated: boolean }[];
  hhi: number;
}

export function PlatformConcentrationChart({ data, hhi }: PlatformConcentrationChartProps) {
  const riskColor = hhi > 2500 ? "#ef4444" : hhi > 1500 ? "#f59e0b" : "#10b981";
  const riskLabel = hhi > 2500 ? "High" : hhi > 1500 ? "Moderate" : "Low";

  return (
    <ChartSection
      title="Platform Concentration Risk"
      description={`HHI: ${Math.round(hhi)} — ${riskLabel} concentration`}
      height={260}
    >
      <div className="relative h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={100}
              paddingAngle={2}
              dataKey="share"
              nameKey="platform"
              strokeWidth={0}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isTopConcentrated ? "#ef4444" : DARK_COLORS[index % DARK_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, String(name)]} />
            <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 11 }}>{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: "-28px" }}>
          <span className="text-2xl font-extrabold tabular-nums" style={{ color: riskColor }}>{Math.round(hhi)}</span>
          <span className="text-[9px] text-slate-500 uppercase tracking-widest">HHI</span>
        </div>
      </div>
    </ChartSection>
  );
}

// ── Rights Type ───────────────────────────────────────────────────────────────
interface RightsTypeChartProps {
  data: DistributionPoint[];
}

export function RightsTypeChart({ data }: RightsTypeChartProps) {
  return (
    <ChartSection title="Rights by Type" description="Active rights count per type" height={280}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 40 }} barCategoryGap="35%">
          <CartesianGrid strokeDasharray="3 3" stroke={gridStyle.stroke} vertical={false} />
          <XAxis dataKey="name" tick={axisTickStyle} tickLine={false} axisLine={false} angle={-25} textAnchor="end" height={56} />
          <YAxis tick={axisTickStyle} tickLine={false} axisLine={false} width={32} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(148,163,184,0.04)" }} />
          <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]}>
            <LabelList dataKey="count" position="top" style={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartSection>
  );
}
