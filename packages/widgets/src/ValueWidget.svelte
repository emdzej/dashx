<script lang="ts">
  /**
   * Numeric readout — large monospaced value + small unit. Used
   * for vehicle speed and steering angle in the v1 dashboard.
   *
   * Simplest of the widgets — no scale, no warning, no animation.
   * When you don't need range context (e.g. odometer pulse, raw
   * sensor reading), prefer this over the bar or gauge.
   */

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
</script>

<div class="flex flex-col rounded border border-divider bg-surface p-3" title={tooltip}>
  <span class="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">
    {label}
  </span>
  <span class="font-mono text-3xl font-bold tabular-nums">
    {value === null ? "—" : value.toFixed(fractionDigits)}
    {#if unit}
      <span class="ml-1 text-xs font-normal text-faint">{unit}</span>
    {/if}
  </span>
</div>
