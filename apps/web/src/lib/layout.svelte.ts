/**
 * Dashboard layout model — per-vehicle, user-editable, persisted.
 *
 * The DBC + overlay layer supplies INTRINSIC widget data (label,
 * unit, min/max, redline, description, value tables) — that's the
 * data shape every widget needs to render correctly, and it's not
 * up to the user to edit. The layout layer here, on top of that,
 * captures USER PRESENTATION choices: which signals are visible,
 * which group they belong to and in what order, which widget kind
 * to use, and how wide each widget should be in the grid.
 *
 * Storage: localStorage at `dashx.web.layouts.v1`. Per-vehicle —
 * MS43 layout and MS42 layout don't bleed into each other. Multiple
 * saved layouts per profile (e.g. "Daily driver", "Track mode").
 *
 * Defaults: when no saved layout exists for a profile, we build one
 * from the overlay's groups + per-signal widget hints. That's the
 * starting point the user can clone + modify.
 *
 * Migration: when rendering, signals that exist in the current
 * `composed.metadata` but are absent from the layout's `signals`
 * map are appended with default values (visible, overlay widget,
 * span 1, group from overlay, order = end-of-group). Signals that
 * once existed in the layout but no longer in the profile are
 * silently ignored at render time. Net effect: adding a signal to
 * the DBC + overlay automatically shows up in the user's layout
 * without losing their customizations.
 */

import { untrack } from "svelte";
import type {
  ComposedProfile,
  WidgetKind,
} from "@emdzej/dashx-vehicles";

export type WidgetSpan = 1 | 2 | 3 | 4;

export interface LayoutSignal {
  /** Render this signal at all. */
  visible: boolean;
  /** Widget kind override. Falls back to overlay default. */
  widget: WidgetKind;
  /** Grid columns this widget spans (1-4). Capped to the row at
   *  render time on narrower viewports. */
  span: WidgetSpan;
  /** Group id the signal renders under. May differ from overlay. */
  group: string;
  /** Position within group (lower first). */
  order: number;
}

export interface LayoutGroup {
  /** Stable group id — matches `composed.groups[].id` when from
   *  overlay; user-created groups get a unique generated id. */
  id: string;
  /** User-visible section heading. Defaults to overlay label. */
  label: string;
  /** Hide the entire group. */
  visible: boolean;
  /** Position in the dashboard (lower first). */
  order: number;
}

export interface LayoutConfig {
  /** Stable id within this profile's layouts. `"default"` is
   *  reserved for the auto-generated one. */
  id: string;
  /** User-visible name. */
  name: string;
  /** Vehicle profile this layout applies to. */
  profileId: string;
  /** Groups in display order. */
  groups: LayoutGroup[];
  /** Per-signal customisation keyed by signal id. */
  signals: Record<string, LayoutSignal>;
}

interface LayoutsStorage {
  /** profileId → list of saved layouts (the "default" always lives at index 0). */
  byProfile: Record<string, LayoutConfig[]>;
  /** profileId → active layout id. */
  active: Record<string, string>;
}

const STORAGE_KEY = "dashx.web.layouts.v1";

function loadStorage(): LayoutsStorage {
  if (typeof localStorage === "undefined") return { byProfile: {}, active: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byProfile: {}, active: {} };
    const parsed = JSON.parse(raw) as Partial<LayoutsStorage>;
    return {
      byProfile: parsed.byProfile ?? {},
      active: parsed.active ?? {},
    };
  } catch {
    return { byProfile: {}, active: {} };
  }
}

function saveStorage(s: LayoutsStorage): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* QuotaExceededError / SecurityError on private-tab Safari —
       swallow; the in-memory state still works for this session. */
  }
}

/* ── Reactive registry ─────────────────────────────────────────── */

const initial = loadStorage();

/**
 * Shared reactive store for all layouts. Components mutate this
 * object; a single $effect mirrors it back to localStorage.
 */
export const layoutStore = $state({
  byProfile: initial.byProfile,
  activeId: initial.active,
  /** Edit-mode toggle. Component-local would be fine but lifting it
   *  here lets the header button and the dashboard share state
   *  without prop drilling. */
  editMode: false,
});

/* Auto-persist. `$state.snapshot` strips the proxies so JSON.stringify
   doesn't choke. Runs whenever any tracked field of `layoutStore`
   changes (including the deep-reactive arrays + records inside). */
$effect.root(() => {
  $effect(() => {
    /* Touch tracked fields so the effect re-runs on any mutation. */
    void layoutStore.byProfile;
    void layoutStore.activeId;
    untrack(() => {
      saveStorage({
        byProfile: $state.snapshot(layoutStore.byProfile),
        active: $state.snapshot(layoutStore.activeId),
      });
    });
  });
});

/* ── Building defaults from an overlay ─────────────────────────── */

/**
 * Translate a `ComposedProfile` into a default `LayoutConfig`. The
 * overlay's group ordering + per-signal widget kind become the
 * starting layout the user can clone and edit.
 */
export function buildDefaultLayout(
  composed: ComposedProfile,
  profileId: string,
): LayoutConfig {
  const groups: LayoutGroup[] = composed.groups.map((g, i) => ({
    id: g.id,
    label: g.label,
    visible: true,
    order: g.order ?? (i + 1) * 100,
  }));

  /* Walk metadata in insertion order — that's the order the overlay
     declared signals. Keep them in that sequence per group by using
     a running counter. */
  const cursor: Record<string, number> = {};
  const signals: Record<string, LayoutSignal> = {};
  for (const meta of composed.metadata.values()) {
    const group = meta.group ?? "";
    cursor[group] = (cursor[group] ?? 0) + 10;
    signals[meta.id] = {
      visible: !meta.hidden,
      widget: meta.widget ?? "value",
      span: 1,
      group,
      order: cursor[group]!,
    };
  }

  return {
    id: "default",
    name: "Default",
    profileId,
    groups,
    signals,
  };
}

/**
 * Build the *render-time* signal list — merge the active layout
 * with the current `ComposedProfile.metadata` to handle:
 *
 *   • Signals added to the overlay after the layout was saved
 *     → fall through with overlay defaults at end of their group.
 *   • Signals removed from the overlay
 *     → silently dropped (layout entry kept in storage but ignored).
 *   • Layout group that doesn't exist anymore
 *     → signals land in the trailing "Other" group.
 */
export function mergedRenderPlan(
  composed: ComposedProfile,
  layout: LayoutConfig,
): { groups: LayoutGroup[]; signals: Map<string, LayoutSignal & { id: string }> } {
  const groupIds = new Set(layout.groups.map((g) => g.id));

  /* Append any overlay groups not in the layout (newly added). */
  const groups: LayoutGroup[] = [...layout.groups];
  let order = layout.groups.reduce((m, g) => Math.max(m, g.order), 0) + 100;
  for (const overlayGroup of composed.groups) {
    if (!groupIds.has(overlayGroup.id)) {
      groups.push({
        id: overlayGroup.id,
        label: overlayGroup.label,
        visible: true,
        order: order++,
      });
    }
  }

  const signals = new Map<string, LayoutSignal & { id: string }>();

  /* Seed with the layout's saved customisations. */
  for (const [id, sig] of Object.entries(layout.signals)) {
    /* Skip signals the overlay no longer knows about. */
    if (!composed.metadata.has(id)) continue;
    signals.set(id, { ...sig, id });
  }

  /* Append any overlay-known signals not in the layout. */
  const cursor: Record<string, number> = {};
  for (const sig of signals.values()) {
    cursor[sig.group] = Math.max(cursor[sig.group] ?? 0, sig.order);
  }
  for (const meta of composed.metadata.values()) {
    if (signals.has(meta.id)) continue;
    const group = meta.group ?? "";
    cursor[group] = (cursor[group] ?? 0) + 10;
    signals.set(meta.id, {
      id: meta.id,
      visible: !meta.hidden,
      widget: meta.widget ?? "value",
      span: 1,
      group,
      order: cursor[group]!,
    });
  }

  return { groups, signals };
}

/* ── Accessors / mutators ──────────────────────────────────────── */

export function getLayouts(profileId: string): LayoutConfig[] {
  return layoutStore.byProfile[profileId] ?? [];
}

export function getActiveLayout(profileId: string): LayoutConfig | null {
  const layouts = getLayouts(profileId);
  if (layouts.length === 0) return null;
  const activeId = layoutStore.activeId[profileId];
  return layouts.find((l) => l.id === activeId) ?? layouts[0] ?? null;
}

/**
 * Make sure at least the "Default" layout exists for this profile.
 * Called when a DBC profile loads. Idempotent.
 */
export function ensureDefaultLayout(
  composed: ComposedProfile,
  profileId: string,
): LayoutConfig {
  const existing = getLayouts(profileId);
  if (existing.length > 0) {
    return getActiveLayout(profileId) ?? existing[0]!;
  }
  const def = buildDefaultLayout(composed, profileId);
  layoutStore.byProfile[profileId] = [def];
  layoutStore.activeId[profileId] = def.id;
  return def;
}

export function setActiveLayout(profileId: string, layoutId: string): void {
  layoutStore.activeId[profileId] = layoutId;
}

/** Save the current active layout under a new name. Returns the
 *  new layout's id. */
export function saveLayoutAs(
  profileId: string,
  name: string,
  source: LayoutConfig,
): string {
  const id = `user-${Date.now().toString(36)}`;
  const layouts = layoutStore.byProfile[profileId] ?? [];
  layouts.push({ ...structuredClone($state.snapshot(source)), id, name });
  layoutStore.byProfile[profileId] = layouts;
  layoutStore.activeId[profileId] = id;
  return id;
}

export function deleteLayout(profileId: string, layoutId: string): void {
  if (layoutId === "default") return; // protect the auto-generated default
  const layouts = layoutStore.byProfile[profileId] ?? [];
  layoutStore.byProfile[profileId] = layouts.filter((l) => l.id !== layoutId);
  if (layoutStore.activeId[profileId] === layoutId) {
    layoutStore.activeId[profileId] = "default";
  }
}

export function renameLayout(profileId: string, layoutId: string, name: string): void {
  const layouts = layoutStore.byProfile[profileId];
  if (!layouts) return;
  const target = layouts.find((l) => l.id === layoutId);
  if (target) target.name = name;
}

/** Rebuild the active layout from scratch (overlay defaults). */
export function resetActiveLayout(
  composed: ComposedProfile,
  profileId: string,
): void {
  const active = getActiveLayout(profileId);
  if (!active) return;
  const fresh = buildDefaultLayout(composed, profileId);
  active.groups = fresh.groups;
  active.signals = fresh.signals;
}

/* ── Single-widget mutators ────────────────────────────────────── */

export function setSignalVisibility(layout: LayoutConfig, signalId: string, visible: boolean): void {
  const s = layout.signals[signalId];
  if (s) s.visible = visible;
}
export function setSignalWidget(layout: LayoutConfig, signalId: string, widget: WidgetKind): void {
  const s = layout.signals[signalId];
  if (s) s.widget = widget;
}
export function setSignalSpan(layout: LayoutConfig, signalId: string, span: WidgetSpan): void {
  const s = layout.signals[signalId];
  if (s) s.span = span;
}

/** Move signal up/down within its group by swapping order with a
 *  neighbour. `dir = -1` moves toward the top, `+1` toward the
 *  bottom. No-op at the edge. */
export function moveSignal(layout: LayoutConfig, signalId: string, dir: -1 | 1): void {
  const self = layout.signals[signalId];
  if (!self) return;
  const siblings = Object.entries(layout.signals)
    .filter(([_id, s]) => s.group === self.group)
    .sort((a, b) => a[1].order - b[1].order);
  const idx = siblings.findIndex(([id]) => id === signalId);
  if (idx < 0) return;
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  const other = siblings[swapIdx]![1];
  const tmp = self.order;
  self.order = other.order;
  other.order = tmp;
}

export function setGroupVisibility(layout: LayoutConfig, groupId: string, visible: boolean): void {
  const g = layout.groups.find((x) => x.id === groupId);
  if (g) g.visible = visible;
}
export function renameGroup(layout: LayoutConfig, groupId: string, label: string): void {
  const g = layout.groups.find((x) => x.id === groupId);
  if (g) g.label = label;
}
export function moveGroup(layout: LayoutConfig, groupId: string, dir: -1 | 1): void {
  const sorted = [...layout.groups].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((g) => g.id === groupId);
  if (idx < 0) return;
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const a = sorted[idx]!;
  const b = sorted[swapIdx]!;
  const tmp = a.order;
  a.order = b.order;
  b.order = tmp;
}

/* ── Bulk reorders, used by drag-and-drop ───────────────────── */

/**
 * Set the order of all signals in a group based on a list of ids.
 * Earlier ids get lower `order` values. Also sets `group` on each
 * signal — useful for cross-group drops where some ids may have
 * been in a different group before.
 */
export function setSignalsOrderInGroup(
  layout: LayoutConfig,
  groupId: string,
  orderedIds: string[],
): void {
  orderedIds.forEach((id, i) => {
    const s = layout.signals[id];
    if (!s) return;
    s.group = groupId;
    s.order = (i + 1) * 10;
  });
}

/** Set the order of all groups based on a list of ids. */
export function setGroupsOrder(
  layout: LayoutConfig,
  orderedIds: string[],
): void {
  orderedIds.forEach((id, i) => {
    const g = layout.groups.find((x) => x.id === id);
    if (g) g.order = (i + 1) * 100;
  });
}
