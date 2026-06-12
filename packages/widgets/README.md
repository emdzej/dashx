# @emdzej/dashx-widgets

Svelte 5 source-only dashboard widgets. Consumer apps' Vite + svelte
plugin compiles these — no pre-build, so HMR + tree-shake work
end-to-end and we don't pin a runtime Svelte version at publish time.

## Widgets

| Component | When to reach for it |
|---|---|
| `GaugeWidget` | Primary readings with a known range (RPM, coolant temp) |
| `BarWidget` | Secondary readings with a range (throttle, battery) |
| `LampWidget` | Boolean indicators (MIL, EML, brake) — `danger`/`warn`/`info` variants |
| `ValueWidget` | Plain numeric readout, no range (speed, steering angle) |
| `FrameLog` | Rolling table of recent CAN frames (debug pane) |

Each widget accepts a small props bag, no stores or global state.
The web app's reactive layer feeds them via `$state`-backed objects.

## Styling

Tailwind classes assume the `@emdzej/bimmerz-theme` token palette is
installed in the consumer app (`bg-surface`, `text-faint`,
`border-divider`, …). The widgets work without it — classes resolve
to nothing — but look unstyled.

## License

[PolyForm Noncommercial 1.0.0](../../LICENSE).
