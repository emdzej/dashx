<script lang="ts">
  /**
   * Minimal uPlot wrapper for time-series widgets. Used by
   * Value/Bar/Gauge widgets when `showGraph` is enabled — renders
   * the recent rolling buffer with proper axes + labels.
   *
   * Why uPlot: pure canvas-2d, ~25 KB, framework-agnostic, fast
   * enough that we don't have to throttle per-widget updates on a
   * mid-range phone. Built for exactly this — streaming time-series
   * with a sliding window via `setData([xs, ys], false)` to preserve
   * zoom on each append.
   *
   * X-axis is pinned to a rolling [now − windowSec, now] range so
   * the chart slides smoothly even when no new data arrives in the
   * last tick (constant-signal case). The window is read reactively
   * from `chartConfig.windowSec` so changing it in Settings updates
   * every chart at once.
   *
   * Lifecycle:
   *   • `$effect` (mount): build the chart once into `container`,
   *     register a `ResizeObserver`, return a cleanup that destroys
   *     both.
   *   • `$effect` (data): whenever `xs` / `ys` reference changes,
   *     call `chart.setData([xs, ys], false)` — `false` keeps the
   *     current scale, which matters when min/max are user-supplied
   *     bounds rather than autoscaled.
   *
   * uPlot mutates the data arrays in-place internally — we pass
   * the parent's reactive arrays directly; reference equality is
   * stable so this is safe.
   */

  import uPlot from "uplot";
  import "uplot/dist/uPlot.min.css";
  import { chartConfig } from "./chart-config.svelte.js";

  type Props = {
    /** Unix seconds (float). Same length as `ys`. */
    xs: number[];
    /** Numeric values. Caller filters out null. */
    ys: number[];
    /** Pixel height of the chart. Default 100. */
    height?: number;
    /** Y-axis lower bound; `undefined` = autoscale. */
    min?: number;
    /** Y-axis upper bound; `undefined` = autoscale. */
    max?: number;
    /** Unit suffix shown on Y-axis tick labels. Empty = bare numbers. */
    unit?: string;
    /** Stroke colour for the line. Default BMW-family blue-600. */
    color?: string;
    /** Fill colour for the area under the line. Default = none. */
    fill?: string;
    /** Line width in CSS px. Default 1.5. */
    lineWidth?: number;
    /** Hide axes entirely (sparkline mode). Default false. */
    sparkline?: boolean;
  };

  const {
    xs,
    ys,
    height = 100,
    min,
    max,
    unit = "",
    color = "rgb(37 99 235)",
    fill,
    lineWidth = 1.5,
    sparkline = false,
  }: Props = $props();

  let container: HTMLDivElement | null = $state(null);
  let chart: uPlot | undefined = $state(undefined);

  $effect(() => {
    if (!container) return;

    const initialWidth = container.clientWidth || 200;

    /* Y range: lock to caller-supplied bounds when both present;
       otherwise let uPlot autoscale per-tick. */
    const yRange =
      typeof min === "number" && typeof max === "number"
        ? { range: [min, max] as [number, number] }
        : {};

    /* X range: dynamic callback reads chartConfig.windowSec every
       time uPlot needs to recompute. Anchored to the *last sample
       time* rather than `Date.now()` so a chart with no recent
       samples doesn't drift its end past where the data lives. */
    const xRange = (_u: uPlot, _dataMin: number, dataMax: number) => {
      const w = chartConfig.windowSec;
      const end = Number.isFinite(dataMax) ? dataMax : Date.now() / 1000;
      return [end - w, end] as [number, number];
    };

    const opts: uPlot.Options = {
      width: initialWidth,
      height,
      pxAlign: false,
      cursor: { show: !sparkline },
      legend: { show: false },
      scales: {
        x: { time: true, range: xRange },
        y: yRange,
      },
      axes: sparkline
        ? [
            { show: false },
            { show: false },
          ]
        : [
            {
              /* Time axis — uPlot's built-in formatter does the
                 right thing for sub-minute windows (HH:MM:SS,
                 seconds-only when zoomed in). */
              stroke: "rgb(148 163 184)",
              grid: { stroke: "rgba(148, 163, 184, 0.15)", width: 1 },
              ticks: { stroke: "rgba(148, 163, 184, 0.3)", width: 1 },
              size: 28,
              font: "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            },
            {
              /* Value axis. */
              stroke: "rgb(148 163 184)",
              grid: { stroke: "rgba(148, 163, 184, 0.15)", width: 1 },
              ticks: { stroke: "rgba(148, 163, 184, 0.3)", width: 1 },
              size: 44,
              font: "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              values: (_u, vals) =>
                vals.map((v) => {
                  const s = Number.isInteger(v)
                    ? String(v)
                    : v.toFixed(Math.abs(v) >= 10 ? 0 : 1);
                  return unit ? `${s} ${unit}` : s;
                }),
            },
          ],
      series: [
        {},
        {
          stroke: color,
          width: lineWidth,
          fill: fill,
          points: { show: false },
        },
      ],
    };

    const u = new uPlot(opts, [xs, ys], container);
    chart = u;

    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      if (w > 0) u.setSize({ width: w, height });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      u.destroy();
      chart = undefined;
    };
  });

  /* Push new data on every (xs, ys) reference change. The
     `resetScales: false` flag keeps any user-supplied y bounds and
     lets our `xRange` callback recompute the time window. */
  $effect(() => {
    if (!chart) return;
    chart.setData([xs, ys], false);
  });
</script>

<div bind:this={container} style="height: {height}px; width: 100%;"></div>
