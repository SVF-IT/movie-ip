"use client";

import { ResponsiveBar, type BarDatum } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveCalendar } from "@nivo/calendar";
import { Badge } from "@/components/ui/badge";
import { Film, Sparkles } from "lucide-react";

interface ReportChartProps {
  templateId: string;
  data: Record<string, unknown>[];
}

export function ReportChart({ templateId, data }: ReportChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        No data available for this report
      </div>
    );
  }

  switch (templateId) {
    case "rights_by_platform":
      return (
        <div className="h-[400px]">
          <ResponsiveBar
            data={data as unknown as BarDatum[]}
            keys={["rights"]}
            indexBy="platform"
            margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
            padding={0.3}
            colors={{ scheme: "paired" }}
            axisBottom={{
              tickRotation: -45,
              legend: "Platform",
              legendPosition: "middle",
              legendOffset: 50,
            }}
            axisLeft={{
              legend: "Active Rights",
              legendPosition: "middle",
              legendOffset: -50,
            }}
            labelSkipWidth={12}
            labelSkipHeight={12}
            enableGridY
            animate
          />
        </div>
      );

    case "expiry_forecast":
      return (
        <div className="h-[400px]">
          <ResponsiveLine
            data={[
              {
                id: "Expiring Rights",
                data: data.map((d) => ({
                  x: d.month as string,
                  y: d.expiring as number,
                })),
              },
            ]}
            margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: 0, stacked: false }}
            curve="monotoneX"
            axisBottom={{
              tickRotation: -45,
              legend: "Month",
              legendPosition: "middle",
              legendOffset: 50,
            }}
            axisLeft={{
              legend: "Expiring Rights",
              legendPosition: "middle",
              legendOffset: -50,
            }}
            colors={["#f59e0b"]}
            pointSize={8}
            pointColor={{ from: "color" }}
            pointBorderWidth={2}
            pointBorderColor={{ from: "serieColor" }}
            enableArea
            areaOpacity={0.1}
            useMesh
            animate
          />
        </div>
      );

    case "catalog_coverage":
    case "source_distribution":
    case "platform_concentration":
      return (
        <div className="h-[400px]">
          <ResponsivePie
            data={data as { id: string; label: string; value: number }[]}
            margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
            innerRadius={0.5}
            padAngle={0.7}
            cornerRadius={3}
            colors={{ scheme: "paired" }}
            borderWidth={1}
            borderColor={{ from: "color", modifiers: [["darker", 0.2]] }}
            arcLinkLabelsSkipAngle={10}
            arcLinkLabelsTextColor="#888"
            arcLinkLabelsThickness={2}
            arcLinkLabelsColor={{ from: "color" }}
            arcLabelsSkipAngle={10}
            animate
          />
        </div>
      );

    case "monthly_activity": {
      const allKeys = new Set<string>();
      data.forEach((d) => {
        Object.keys(d).forEach((k) => {
          if (k !== "month") allKeys.add(k);
        });
      });
      const keys = Array.from(allKeys);

      return (
        <div className="h-[400px]">
          <ResponsiveBar
            data={data as unknown as BarDatum[]}
            keys={keys}
            indexBy="month"
            margin={{ top: 20, right: 120, bottom: 60, left: 60 }}
            padding={0.3}
            groupMode="grouped"
            colors={{ scheme: "set2" }}
            axisBottom={{
              tickRotation: -45,
              legend: "Month",
              legendPosition: "middle",
              legendOffset: 50,
            }}
            axisLeft={{
              legend: "Count",
              legendPosition: "middle",
              legendOffset: -50,
            }}
            legends={[
              {
                dataFrom: "keys",
                anchor: "bottom-right",
                direction: "column",
                translateX: 120,
                itemWidth: 100,
                itemHeight: 20,
                itemsSpacing: 2,
                symbolSize: 12,
              },
            ]}
            animate
          />
        </div>
      );
    }

    case "certification_breakdown":
      return (
        <div className="h-[400px]">
          <ResponsiveBar
            data={data as unknown as BarDatum[]}
            keys={["count"]}
            indexBy="certification"
            margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
            padding={0.3}
            layout="horizontal"
            colors={{ scheme: "nivo" }}
            axisBottom={{
              legend: "Count",
              legendPosition: "middle",
              legendOffset: 40,
            }}
            axisLeft={{
              legend: "Certification",
              legendPosition: "middle",
              legendOffset: -50,
            }}
            labelSkipWidth={12}
            animate
          />
        </div>
      );

    case "rights_timeline": {
      const year = new Date().getFullYear();
      return (
        <div className="h-[200px]">
          <ResponsiveCalendar
            data={data as { day: string; value: number }[]}
            from={`${year}-01-01`}
            to={`${year}-12-31`}
            emptyColor="#eeeeee"
            colors={["#a1d99b", "#74c476", "#31a354", "#006d2c"]}
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            yearSpacing={40}
            monthBorderColor="#ffffff"
            dayBorderWidth={2}
            dayBorderColor="#ffffff"
          />
        </div>
      );
    }

    case "world_premiere": {
      const homeCount = data.filter((m) => m.source === "home_production").length;
      const acquiredCount = data.filter((m) => m.source === "acquired").length;

      // Group by year for mini bar chart
      const byYear: Record<number, number> = {};
      data.forEach((m) => {
        const y = parseInt(m.release_year as string) || 0;
        byYear[y] = (byYear[y] || 0) + 1;
      });
      const yearData = Object.entries(byYear)
        .map(([year, count]) => ({ year: year === "0" ? "N/A" : year, count }))
        .sort((a, b) => String(a.year).localeCompare(String(b.year)));

      return (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <span className="text-3xl font-extrabold">{data.length}</span>
              <span className="text-sm text-muted-foreground">Unreleased Movies</span>
            </div>
            <div className="flex gap-4 text-sm">
              <span><span className="font-semibold">{homeCount}</span> Home Production</span>
              <span><span className="font-semibold">{acquiredCount}</span> Acquired</span>
            </div>
          </div>

          {/* Year distribution bar chart */}
          {yearData.length > 1 && (
            <div className="h-[180px]">
              <ResponsiveBar
                data={yearData as unknown as BarDatum[]}
                keys={["count"]}
                indexBy="year"
                margin={{ top: 10, right: 20, bottom: 40, left: 40 }}
                padding={0.4}
                colors={["#f59e0b"]}
                axisBottom={{ tickRotation: -45, legend: "Release Year", legendPosition: "middle", legendOffset: 35 }}
                axisLeft={{ legend: "Movies", legendPosition: "middle", legendOffset: -30 }}
                labelSkipWidth={12}
                animate
              />
            </div>
          )}

          {/* Movie list table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-3 font-medium">Movie</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Year</th>
                  <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Language</th>
                  <th className="text-left py-2 px-3 font-medium">Source</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Cert</th>
                </tr>
              </thead>
              <tbody>
                {data.map((movie, idx) => (
                  <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://fileapi.mni.agency/api/FileFolderManager/PreviewFile?path=%2Fmnt%2Fmni%2FMoviePoster%2F${encodeURIComponent(movie.title as string)}.jpg&userId=1&platform=WebMicrosoft%20Windows%20NT%2010.0.20348.0`}
                          alt={movie.title as string}
                          className="h-8 w-6 rounded object-cover flex-shrink-0 hidden sm:block"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                        <span className="font-medium truncate max-w-[200px]">{movie.title as string}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 hidden sm:table-cell">{(movie.release_year as string) || "N/A"}</td>
                    <td className="py-2 px-3 hidden md:table-cell">{(movie.language_name as string) || "N/A"}</td>
                    <td className="py-2 px-3">
                      <Badge variant={movie.source === "home_production" ? "default" : "secondary"}>
                        {movie.source === "home_production" ? "Home" : "Acquired"}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 hidden sm:table-cell">{(movie.certification as string) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="flex items-center justify-center h-[400px] text-muted-foreground">
          Unknown chart type
        </div>
      );
  }
}
