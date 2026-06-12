<script lang="ts">
  /**
   * Rolling log of recent CAN frames. The web app feeds this with
   * a ring-buffered array (newest first) — keeping that buffer
   * bounded is the caller's job; this widget just renders what it
   * gets.
   *
   * Layout: 4-column table — timestamp delta, ID hex, DLC, hex
   * payload. Mono font, tight rows. Big-screen-friendly; the
   * widget grid hides it on narrow viewports (App.svelte branch).
   */

  type LoggedFrame = {
    /** Microsecond timestamp from the transport. */
    ts: number;
    id: number;
    ext?: boolean;
    rtr?: boolean;
    data: Uint8Array;
  };

  type Props = {
    /** Most-recent frames first. Caller bounds the length. */
    frames: LoggedFrame[];
  };

  const { frames }: Props = $props();

  function formatId(f: LoggedFrame): string {
    const hex = f.id.toString(16).toUpperCase();
    return f.ext ? hex.padStart(8, "0") : hex.padStart(3, "0");
  }

  function formatPayload(data: Uint8Array): string {
    return Array.from(data)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");
  }
</script>

<div class="overflow-auto rounded border border-divider bg-surface">
  <table class="w-full text-left font-mono text-xs tabular-nums">
    <thead class="sticky top-0 bg-elevated text-faint">
      <tr>
        <th class="px-2 py-1 text-left">ts (µs)</th>
        <th class="px-2 py-1 text-left">id</th>
        <th class="px-2 py-1 text-left">dlc</th>
        <th class="px-2 py-1 text-left">data</th>
      </tr>
    </thead>
    <tbody>
      {#each frames as f, i (i + ":" + f.ts + ":" + f.id)}
        <tr class="border-t border-divider hover:bg-elevated/50">
          <td class="px-2 py-0.5">{f.ts}</td>
          <td class="px-2 py-0.5 text-accent">
            {f.ext ? "x" : ""}{formatId(f)}{f.rtr ? "r" : ""}
          </td>
          <td class="px-2 py-0.5">{f.data.length}</td>
          <td class="px-2 py-0.5">{formatPayload(f.data)}</td>
        </tr>
      {/each}
      {#if frames.length === 0}
        <tr>
          <td colspan="4" class="px-2 py-3 text-center text-faint">
            No frames yet.
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>
