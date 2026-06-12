/**
 * Embedded build helpers. When DASHX is hosted by the bimmerz-box
 * (`vite --mode embedded` → `/dashx/` base), the CAN source is
 * locked to the dongle's `/rpc/can/0` endpoint instead of letting
 * the user pick. See `vite.config.ts` for the build-mode contract.
 *
 * One endpoint, at the dongle's HTTP root (sibling of the `/dashx/`
 * SPA prefix):
 *
 *   • `ws://<origin>/rpc/can/0` — JSON-RPC CAN endpoint per the
 *     `@emdzej/bimmerz-rpc-can` contract.
 *
 * `isEmbedded` is a `define` substitution so `if (!isEmbedded)`
 * blocks tree-shake out of the embedded build, and vice versa.
 *
 * Same shape as ediabasx-web / inpax-web / ncsx-web's `embedded.ts`.
 */

export const isEmbedded: boolean = __EMBEDDED__;

export function embeddedEndpoints(): { rpcCanUrl: string } {
  const origin = window.location.origin;
  return {
    /* `replace(/^http/, 'ws')` upgrades both http→ws and https→wss
       (regex anchored on the start so the trailing `s` survives). */
    rpcCanUrl: `${origin.replace(/^http/, "ws")}/rpc/can/0`,
  };
}
