/**
 * Module-level reactive configuration shared across every
 * `HistoryChart` + `useHistory` instance.
 *
 * The consumer (the web app's `App.svelte`) sets `chartConfig.windowSec`
 * from its persisted `app.config.chartWindowSec`. Every widget reads
 * the same object reactively — when the user changes the window in
 * Settings, every chart updates without reconfiguring per-widget
 * props.
 */

export const chartConfig = $state({
  /** Visible time window in seconds. Default 15 — short enough to
   *  watch transients (throttle lift, brake event) on a glance,
   *  long enough that a steady idle reads as a flat line, not noise. */
  windowSec: 15,
});
