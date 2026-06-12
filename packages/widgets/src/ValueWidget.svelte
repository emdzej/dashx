<script lang="ts">
  /**
   * Numeric readout — large monospaced value + small unit. Used
   * for vehicle speed and steering angle in the v1 dashboard.
   *
   * Has two modes, toggled by a corner button:
   *   • current — large mono value + unit (default).
   *   • graph   — sparkline of the last 60 s of values via uPlot.
   *
   * History is always recorded (capped buffer, ~10 Hz max sample
   * rate) so toggling on shows an immediately populated chart.
   *
   * The mode toggle is widget-local — each widget remembers its
   * own preference for the session. Not persisted: a user who
   * needs every widget in graph mode can toggle each, but the
   * common case is "I want to glance at this one signal over
   * time".
   */

  import HistoryChart from "./HistoryChart.svelte";
  import { useHistory } from "./history.svelte";

  type Props = {
    label: string;
    unit: string;
    value: number | null;
    /** Decimal places to render. Default 0. */
    fractionDigits?: number;
    /** Native `title` tooltip shown on hover — usually the signal description. */
    tooltip?: string;
  };

  const { label, unit, value, fractionDigits = 0, tooltip }: Props = $props();

  let showGraph = $state(false);
  const history = useHistory(() => value);
</script>

<div
  class="relative flex flex-col rounded border border-divider bg-surface p-3"
  title={tooltip}
>
  <span class="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-faint">
    {label}
    <button
      type="button"
      class="rounded p-0.5 text-faint transition hover:bg-elevated hover:text-foreground"
      class:text-accent={showGraph}
      onclick={() => (showGraph = !showGraph)}
      aria-label={showGraph ? "Show current value" : "Show graph"}
      title={showGraph ? "Show current value" : "Show history graph"}
    >
      <!-- Compact line-chart glyph. Inline SVG so we don't pull in
           an icon package; ~12px square. -->
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="1 13, 5 8, 8 10, 14 3" />
      </svg>
    </button>
  </span>

  {#if showGraph}
    {#if value === null && history.xs.length === 0}
      <span class="flex h-24 items-center justify-center text-xs text-faint">
        waiting for first frame…
      </span>
    {:else}
      <HistoryChart xs={history.xs} ys={history.ys} unit={unit} height={100} />
    {/if}
    <span class="mt-1 font-mono text-sm tabular-nums">
      {value === null ? "—" : value.toFixed(fractionDigits)}
      {#if unit}
        <span class="ml-1 text-xs font-normal text-faint">{unit}</span>
      {/if}
    </span>
  {:else}
    <span class="font-mono text-3xl font-bold tabular-nums">
      {value === null ? "—" : value.toFixed(fractionDigits)}
      {#if unit}
        <span class="ml-1 text-xs font-normal text-faint">{unit}</span>
      {/if}
    </span>
  {/if}
</div>
