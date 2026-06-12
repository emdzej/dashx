<script lang="ts">
  /**
   * Horizontal bar — value as a filled rectangle on a 0..max scale.
   * Used for throttle position, battery voltage in the v1 dashboard.
   *
   * Cheap, dense layout — three of these fit in the same space as
   * a single gauge. Reach for it for "secondary" readings.
   */

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
    <span class="font-mono text-sm tabular-nums" class:text-amber-500={warn}>
      {value === null ? "—" : value.toFixed(1)}
      {#if unit}
        <span class="ml-1 text-xs text-faint">{unit}</span>
      {/if}
    </span>
  </div>
  <div class="h-2 w-full overflow-hidden rounded bg-base">
    <div
      class="h-full transition-[width] duration-150 ease-out"
      class:bg-accent={!warn}
      class:bg-amber-500={warn}
      style="width: {fillPercent}%"
    ></div>
  </div>
</div>
