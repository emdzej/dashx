<script lang="ts">
  /**
   * Circular gauge — value rendered as an arc with a needle. Used
   * for RPM and coolant temp in the v1 dashboard.
   *
   * Props:
   *   - label / unit: header strip
   *   - value: numeric value (or null while waiting for first frame)
   *   - min / max: gauge range
   *   - redline: optional warning threshold (value above paints red)
   *
   * Rendered via inline SVG so it scales cleanly and we don't drag
   * in a charting lib for a single needle. ~120 LoC including styles.
   */

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

<div class="flex flex-col items-center rounded border border-divider bg-surface p-3" title={tooltip}>
  <div class="mb-1 flex w-full items-baseline justify-between">
    <span class="text-xs font-semibold uppercase tracking-wider text-faint">
      {label}
    </span>
    {#if unit}
      <span class="text-[10px] text-faint">{unit}</span>
    {/if}
  </div>
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
</div>
