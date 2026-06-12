import "./app.css";
import App from "./App.svelte";
import { mount } from "svelte";
import { isEmbedded } from "./lib/embedded";

const target = document.getElementById("app");
if (!target) throw new Error("Missing #app mount point");

mount(App, { target });

/* Service worker — skipped in the embedded build (no internet on
   the dongle, no offline-cache benefit, autoUpdate is noise). The
   gate is compile-time so the dynamic import tree-shakes out. */
if (!isEmbedded) {
  void import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      onRegisteredSW(swUrl) {
        if (typeof console !== "undefined") {
          console.info(`[pwa] service worker registered at ${swUrl}`);
        }
      },
      onOfflineReady() {
        if (typeof console !== "undefined") {
          console.info("[pwa] offline-ready — bundle is cached, app works without network");
        }
      },
    });
  });
}
