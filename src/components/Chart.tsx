"use client";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { useTheme } from "./ThemeToggle";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false, loading: () => <div className="skeleton" style={{ height: 240 }} /> });

export const CHART_COLORS = ["#f26522", "#0c4b5e", "#1b84ff", "#03c95a", "#fd3995", "#ab47bc", "#ffc107", "#3b7080"];

type ChartType = "bar" | "line" | "area" | "donut" | "pie" | "radialBar";

/** ApexCharts with the HCM Lite palette; follows light / dark mode. */
export function Chart({ type, series, options = {}, height = 260 }: { type: ChartType; series: ApexOptions["series"]; options?: ApexOptions; height?: number }) {
  const theme = useTheme();
  const dark = theme === "dark";
  const base: ApexOptions = {
    chart: { toolbar: { show: false }, fontFamily: "inherit", background: "transparent", foreColor: dark ? "#a3acbb" : "#6b7280", animations: { speed: 400 } },
    colors: CHART_COLORS,
    theme: { mode: dark ? "dark" : "light" },
    grid: { borderColor: dark ? "#3b465c" : "#e5e7eb", strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { position: "bottom", fontSize: "12px" },
    stroke: { width: type === "line" || type === "area" ? 3 : 0, curve: "smooth" },
    tooltip: { theme: dark ? "dark" : "light" },
    plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
  };
  const merged: ApexOptions = {
    ...base,
    ...options,
    chart: { ...base.chart, ...options.chart },
    plotOptions: { ...base.plotOptions, ...options.plotOptions },
    grid: { ...base.grid, ...options.grid },
  };
  return <ApexChart key={theme} type={type} series={series} options={merged} height={height} width="100%" />;
}
