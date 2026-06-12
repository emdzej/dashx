<script lang="ts">
  /**
   * Circular gauge — value rendered as an arc with a needle. Used
   * for RPM and coolant temp in the v1 dashboard.
   *
   * Has two modes, toggled by a corner button:
   *   • current — circular gauge with rotating needle (default).
   *   • graph   — sparkline of the last 60 s with min/max locked
   *               to the gauge's range. Redline rendered as a
   *               horizontal reference colour (in v2 — drawn as a
   *               horizontal red rule at `redline`).
   *
   * Props:
   *   - label / unit: header strip
   *   - value: numeric value (or null while waiting for first frame)
   *   - min / max: gauge range
   *   - redline: optional warning threshold (value above paints red)
   *
   * Rendered via inline SVG so it scales cleanly and we don't drag
   * in a charting lib for the needle. uPlot handles the graph view.
   */

  import HistoryChart from "./HistoryChart.svelte";
  import { useHistory } from "./history.svelte";

  type Props = {
    label: string;
    unit: string;
    value: number | null;
    min: number;
    max: number;
    redline?: number;
    /** Native `title` tooltip shown on hover — usually the signal description. */
    tooltip?: string;
  };

  const { label, unit, value, min, max, redline, tooltip }: Props = $props();

  let showGraph = $state(false);
  const history = useHistory(() => value);

  /* Arc spans 270° (bottom-left through top to bottom-right). The
     needle rotation maps the value onto that arc; clamp so a
     transient out-of-range reading doesn't fling off-screen. */
  const ARC_START_DEG = 135;
  const ARC_END_DEG = 405;

  const angle = $derived.by(() => {
    if (value === null) return ARC_START_DEG;
    const clamped = Math.max(min, Math.min(max, value));
    const t = (clamped - min) / (max - min);
    return ARC_START_DEG + t * (ARC_END_DEG - ARC_START_DEG);
  });

  const overRedline = $derived(
    redline !== undefined && value !== null && value >= redline,
  );
</script>

<div
  class="flex flex-col items-center rounded border border-divider bg-surface p-3"
  title={tooltip}
>
  <div class="mb-1 flex w-full items-baseline justify-between">
    <span class="text-xs font-semibold uppercase tracking-wider text-faint">
      {label}
    </span>
    <span class="flex items-center gap-2">
      {#if unit}
        <span class="text-[10px] text-faint">{unit}</span>
      {/if}
      <button
        type="button"
        class="rounded p-0.5 text-faint transition hover:bg-elevated hover:text-foreground"
        class:text-accent={showGraph}
        onclick={() => (showGraph = !showGraph)}
        aria-label={showGraph ? "Show gauge" : "Show graph"}
        title={showGraph ? "Show gauge" : "Show history graph"}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="1 13, 5 8, 8 10, 14 3" />
        </svg>
      </button>
    </span>
  </div>

  {#if showGraph}
    <div class="w-full">
      {#if value === null && history.xs.length === 0}
        <div class="flex h-[140px] items-center justify-center text-xs text-faint">
          waiting for first frame…
        </div>
      {:else}
        <HistoryChart
          xs={history.xs}
          ys={history.ys}
          min={min}
          max={max}
          unit={unit}
          height={140}
          color={overRedline ? "rgb(196 30 58)" : undefined}
        />
      {/if}
    </div>
    <div class="mt-1 text-2xl font-mono font-bold tabular-nums" class:text-red-500={overRedline}>
      {value === null ? "—" : value.toFixed(0)}
    </div>
  {:else}
    <svg viewBox="0 0 100 100" class="aspect-square w-full max-w-[160px]">
      <!-- Background arc -->
      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-opacity="0.1" stroke-width="6" />
      <!-- Needle -->
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="14"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        class:text-red-500={overRedline}
        class:text-accent={!overRedline}
        transform="rotate({angle - 90} 50 50)"
      />
      <circle cx="50" cy="50" r="3" fill="currentColor" class="text-foreground" />
    </svg>
    <div class="mt-1 text-2xl font-mono font-bold tabular-nums" class:text-red-500={overRedline}>
      {value === null ? "—" : value.toFixed(0)}
    </div>
  {/if}
</div>
