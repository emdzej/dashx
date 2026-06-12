/**
 * Per-widget history buffer. Each `Value` / `Bar` / `Gauge` widget
 * calls `useHistory(() => value)` and gets back a reactive
 * `{ xs, ys }` pair suitable for handing straight to
 * `<HistoryChart xs={...} ys={...} />`.
 *
 * Implementation notes — both matter at scale (80 widgets × 10 Hz):
 *
 *   • **`$state.raw` for the buffers**, not regular `$state`. A
 *     deep-reactive `$state<number[]>` would notify on every
 *     individual element write — a 600-point `shift()` fires 600
 *     reactivity notifications. With the raw variant only top-level
 *     reassignments are tracked, so swapping in a fresh array
 *     slice per tick is one notification regardless of size.
 *
 *   • **`untrack` for the initial sample**. The first `sample()`
 *     call runs synchronously inside the `$effect` body, so any
 *     reactive read inside it (the user's `read()` accessor on
 *     the signal value) gets registered as a dependency. Without
 *     `untrack`, every signal change would tear down + rebuild the
 *     `setInterval` — 100 Hz × 80 widgets = 8 000 timer rebuilds /
 *     sec. `untrack` keeps the first read off the dependency list.
 *
 *   • **Timer-driven, not effect-driven**. Reactive effects only
 *     fire when the value CHANGES — a signal that stays constant
 *     (RPM at idle) would never accumulate samples and the chart
 *     would appear stuck on the first point. A fixed-period timer
 *     resamples regardless, so constant signals plot as flat lines.
 *
 *   • **Time-budget cap, not just count cap**. Drops samples older
 *     than `windowSec` so the visible window matches the chart's
 *     X-axis range. The count cap is a safety net for pathological
 *     cases (clock skew, paused tab).
 */

import { untrack } from "svelte";
import { chartConfig } from "./chart-config.svelte.js";

export interface UseHistoryOptions {
  /** Sample period (ms). Default 100 — 10 Hz, matches typical CAN
   *  broadcast rate while keeping the buffer compact. */
  minIntervalMs?: number;
  /** Hard cap override. Default = chartConfig.windowSec × 10 + 50. */
  capacity?: number;
}

export interface History {
  /** Unix seconds (float). Same length as `ys`. */
  readonly xs: number[];
  /** Numeric values, in the same order. */
  readonly ys: number[];
  /** Clear both arrays. */
  reset(): void;
}

const DEFAULT_MIN_INTERVAL_MS = 100;

export function useHistory(
  read: () => number | boolean | null | undefined,
  options: UseHistoryOptions = {},
): History {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;

  /* `$state.raw` opts out of the deep Proxy so mutating array
     contents wouldn't fire reactivity — but we don't mutate, we
     reassign with a fresh slice each tick. That's one tracked
     write per sample, regardless of buffer size. */
  let xs: number[] = $state.raw([]);
  let ys: number[] = $state.raw([]);

  $effect(() => {
    const sample = () => {
      const raw = read();
      if (raw === null || raw === undefined) return;
      const v = typeof raw === "boolean" ? (raw ? 1 : 0) : Number(raw);
      if (!Number.isFinite(v)) return;
      const now = Date.now() / 1000;

      const windowSec = chartConfig.windowSec;
      const oldestKeep = now - windowSec;
      const hardCap =
        options.capacity ?? Math.ceil(windowSec * (1000 / minIntervalMs)) + 50;

      const nx = [...xs, now];
      const ny = [...ys, v];
      /* Walk forward to the first kept index. Most ticks only the
         head sample expires, so this is typically O(1). */
      let start = 0;
      while (start < nx.length && nx[start]! < oldestKeep) start++;
      if (nx.length - start > hardCap) start = nx.length - hardCap;
      if (start > 0) {
        xs = nx.slice(start);
        ys = ny.slice(start);
      } else {
        xs = nx;
        ys = ny;
      }
    };

    /* Initial sample runs inside the $effect synchronous body.
       Without `untrack`, the `read()` call inside `sample()` would
       register a dependency on the signal value — every signal
       update would tear down + rebuild the interval. */
    untrack(sample);
    const id = setInterval(sample, minIntervalMs);
    return () => clearInterval(id);
  });

  return {
    get xs() {
      return xs;
    },
    get ys() {
      return ys;
    },
    reset() {
      xs = [];
      ys = [];
    },
  };
}
