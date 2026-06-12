# Agent guidelines for DASHX

Operating notes for AI agents (and future contributors) working in this
repo. Same shape as ncsx / inpax / ediabasx.

## What this project is

Live CAN dashboard. Pure listen / cycle messages — decodes broadcast
frames into named signals + renders widgets. **No diagnostic protocols
here.** If you find yourself reaching for DS2 / KWP / UDS / EDIABAS,
you're in the wrong repo — see [ediabasx](https://github.com/emdzej/ediabasx)
or [inpax](https://github.com/emdzej/inpax).

## Verification rules

- **CAN ID decoders must cite a source.** Community-documented BMW IDs
  go in `docs/bmw-<chassis>-can-ids.md` with a URL or quoted excerpt
  from the source. Don't invent decoders — if you can't find a citation,
  add a `// TODO(citation): …` and skip the signal.
- **Decoder tests are fixture-driven.** Each signal ships with at least
  one `expect(decode(frame)).toBe(value)` test using a real-world byte
  pattern. No "spot-check by hand" — the byte arithmetic is too easy to
  get wrong silently.
- **Endianness is explicit.** BMW PT-CAN is little-endian for multi-byte
  scalars; some IDs interleave LE and BE within one frame. Helpers in
  `@emdzej/dashx-can-decoder` (`leU16`, `beU16`, …) are the only way
  bytes get assembled — direct shifts/masks are a smell.

## Transport contract

`CanTransport` is the only surface between the UI and a bus. New
transports implement it; no transport-specific code leaks into the
decoder layer or widgets.

`CanFrame` carries `{ id, ext, rtr, data }`. Timestamps are added by
the source (`{...frame, ts}`) so subscribers can compute rate / staleness
without trusting the wall clock.

## Embedded mode

`pnpm web:build:embedded` produces `apps/web/dist-embedded/` for the
dongle. Compile-time `__EMBEDDED__` flag forces `source: "rpc"` and
the dongle's `${origin}/rpc/can/0`. Same pattern as ncsx / inpax /
ediabasx — see those repos' `lib/embedded.ts` for the canonical shape.

## Commit etiquette

- Don't run destructive git ops (`reset --hard`, `push --force`, branch
  delete) without explicit instruction.
- One concern per commit. Bumping deps is a separate commit from
  feature work.
- Lint before commit: `pnpm lint`.

## License header

Source files don't need a license header — the repo-level `LICENSE`
covers everything. The package manifests use `"license": "SEE LICENSE
IN LICENSE"` to point reviewers at the PolyForm Noncommercial 1.0.0
text.
