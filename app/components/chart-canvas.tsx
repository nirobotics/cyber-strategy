import { useEffect, useRef, useState } from "react";
import type { ChartConfiguration } from "chart.js";

type ChartPalette = {
  accent: string;
  text: string;
  muted: string;
  grid: string;
  panel: string;
  colors: string[];
};

export function ChartCanvas({
  label,
  configKey,
  buildConfig,
  className = "h-64",
}: {
  label: string;
  configKey: string;
  buildConfig: (palette: ChartPalette) => ChartConfiguration;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buildRef = useRef(buildConfig);
  const themeRevision = useThemeRevision();

  useEffect(() => {
    buildRef.current = buildConfig;
  }, [buildConfig]);

  useEffect(() => {
    let chart: { destroy: () => void } | null = null;
    let cancelled = false;

    import("chart.js/auto").then(({ default: Chart }) => {
      if (cancelled || !canvasRef.current) return;
      chart = new Chart(canvasRef.current, buildRef.current(readPalette()));
    });

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [configKey, themeRevision]);

  return (
    <div className={className}>
      <canvas ref={canvasRef} aria-label={label} role="img" />
    </div>
  );
}

function useThemeRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bump = () => setRevision((value) => value + 1);
    window.addEventListener("cyber-strategy-theme-change", bump);
    return () => window.removeEventListener("cyber-strategy-theme-change", bump);
  }, []);

  return revision;
}

function readPalette(): ChartPalette {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    accent: color("--accent", "#5b35d5"),
    text: color("--foreground", "#17151f"),
    muted: color("--muted", "#6b6875"),
    grid: color("--border", "#dedbe7"),
    panel: color("--panel", "#ffffff"),
    colors: ["#5b35d5", "#f97316", "#16a34a"],
  };
}
