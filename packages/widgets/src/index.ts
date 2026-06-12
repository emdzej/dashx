/**
 * `@emdzej/dashx-widgets` — Svelte 5 source-only widgets for the
 * DASHX dashboard. Consumer apps' Vite + svelte plugin compiles
 * these on demand, so HMR + tree-shake work end-to-end and we
 * don't lock to a specific Svelte runtime version at publish time.
 *
 * Each widget is reactive and accepts a small props bag — no
 * stores, no global state. The web app's `decode.svelte.ts`
 * reactive layer feeds widgets via `$state`-backed objects.
 */

export { default as GaugeWidget } from "./GaugeWidget.svelte";
export { default as BarWidget } from "./BarWidget.svelte";
export { default as LampWidget } from "./LampWidget.svelte";
export { default as ValueWidget } from "./ValueWidget.svelte";
export { default as FrameLog } from "./FrameLog.svelte";
export { default as HistoryChart } from "./HistoryChart.svelte";
export { useHistory, type History, type UseHistoryOptions } from "./history.svelte.js";
export { chartConfig } from "./chart-config.svelte.js";
