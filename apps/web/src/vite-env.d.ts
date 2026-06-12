/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
/**
 * `true` when the SPA was built with `vite --mode embedded` (the
 * dongle scenario — SPA served at `/dashx/`, talks back to the same
 * origin's `/rpc/can/0`). `false` for the browser build. Vite's
 * `define` replaces this at build time so dead code under
 * `if (!__EMBEDDED__)` tree-shakes out.
 */
declare const __EMBEDDED__: boolean;
