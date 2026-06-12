<script lang="ts">
  /**
   * Horizontal bar — value as a filled rectangle on a 0..max scale.
   * Used for throttle position, battery voltage in the v1 dashboard.
   *
   * Has two modes, toggled by a corner button:
   *   • current — bar fill at the current value (default).
   *   • graph   — sparkline of the last 60 s with min/max locked
   *               to the same bounds as the bar.
   *
   * History is always recorded so toggling on shows immediately
   * populated data.
   */

  import HistoryChart from "./HistoryChart.svelte";
  import { useHistory } from "./history.svelte";

  type Props = {
    label: string;
    unit: string;
    value: number | null;
    min: number;
    max: number;
    /** Optional warning band — value below this paints amber. */
    lowWarn?: number;
    /** Native `title` tooltip shown on hover — usually the signal description. */
    tooltip?: string;
  };

  const { label, unit, value, min, max, lowWarn, tooltip }: Props = $props();

  let showGraph = $state(false);
  const history = useHistory(() => value);

  const fillPercent = $derived.by(() => {
    if (value === null) return 0;
    const clamped = Math.max(min, Math.min(max, value));
    return ((clamped - min) / (max - min)) * 100;
  });

  const warn = $derived(lowWarn !== undefined && value !== null && value < lowWarn);
</script>

<div class="rounded border border-divider bg-surface p-3" title={tooltip}>
  <div class="mb-1 flex items-baseline justify-between">
    <span class="text-xs font-semibold uppercase tracking-wider text-faint">
      {label}
    </span>
    <span class="flex items-center gap-2">
      <span class="font-mono text-sm tabular-nums" class:text-amber-500={warn}>
        {value === null ? "—" : value.toFixed(1)}
        {#if unit}
          <span class="ml-1 text-xs text-faint">{unit}</span>
        {/if}
      </span>
      <button
        type="button"
        class="rounded p-0.5 text-faint transition hover:bg-elevated hover:text-foreground"
        class:text-accent={showGraph}
        onclick={() => (showGraph = !showGraph)}
        aria-label={showGraph ? "Show current value" : "Show graph"}
        title={showGraph ? "Show current bar" : "Show history graph"}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="1 13, 5 8, 8 10, 14 3" />
        </svg>
      </button>
    </span>
  </div>

  {#if showGraph}
    {#if value === null && history.xs.length === 0}
      <div class="flex h-24 items-center justify-center text-xs text-faint">
        waiting for first frame…
      </div>
    {:else}
      <HistoryChart
        xs={history.xs}
        ys={history.ys}
        min={min}
        max={max}
        unit={unit}
        height={100}
      />
    {/if}
  {:else}
    <div class="h-2 w-full overflow-hidden rounded bg-base">
      <div
        class="h-full transition-[width] duration-150 ease-out"
        class:bg-accent={!warn}
        class:bg-amber-500={warn}
        style="width: {fillPercent}%"
      ></div>
    </div>
  {/if}
</div>
