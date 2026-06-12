<script lang="ts">
  /**
   * Indicator lamp — pill that glows when the boolean signal is
   * true. Used for MIL / EML / cruise / brake lights in the v1
   * dashboard.
   *
   * Three colour variants cover BMW dash conventions:
   *
   *   - `danger` (BMW M-red): MIL, brake, overheat, oil pressure
   *   - `warn`   (amber):     EML, fuel cap, sensor faults
   *   - `info`   (emerald):   cruise active, AC on, lighting on
   *
   * The danger red uses the canonical BMW M-stripe red from the
   * shared `@emdzej/bimmerz-theme` palette (`bg-m-red`) rather than
   * generic Tailwind red so warning lamps feel native to the BMW
   * cluster rather than imported. Warn (amber) and info (emerald)
   * stay on Tailwind's semantic colours — those don't have BMW-
   * specific equivalents in the M palette.
   *
   * Unlit state is the same neutral grey across all variants; the
   * colour only kicks in when the bool flips true.
   */

  type Variant = "danger" | "warn" | "info";

  type Props = {
    label: string;
    value: boolean | null;
    variant?: Variant;
    /** Native `title` tooltip shown on hover — usually the signal description. */
    tooltip?: string;
  };

  const { label, value, variant = "info", tooltip }: Props = $props();
  const lit = $derived(value === true);
</script>

<div class="flex items-center gap-2 rounded border border-divider bg-surface px-3 py-2" title={tooltip}>
  <span
    class="h-2.5 w-2.5 rounded-full transition-colors"
    class:bg-zinc-500={!lit}
    class:bg-m-red={lit && variant === "danger"}
    class:bg-amber-500={lit && variant === "warn"}
    class:bg-emerald-500={lit && variant === "info"}
    class:opacity-30={!lit}
    class:shadow-[0_0_8px_currentColor]={lit}
  ></span>
  <span class="text-xs font-semibold uppercase tracking-wider" class:text-faint={!lit}>
    {label}
  </span>
</div>
