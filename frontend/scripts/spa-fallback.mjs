// Copies the built index.html to 404.html.
//
// A static host can only serve a deep link like /terminal if it's told to fall
// back to index.html for unknown paths. That's normally the host's rewrite rule
// (render.yaml `routes:`), but those are applied at service-creation time, so a
// service can end up running without one — and then a page refresh on any route
// other than "/" returns the host's bare "Not Found".
//
// Most static hosts serve 404.html for unmatched paths, so this makes the app
// boot regardless. It's a safety net, not the fix: served this way the response
// still carries HTTP 404, so the host-level rewrite is what you actually want.
import { copyFileSync, existsSync } from "node:fs";

const src = "dist/index.html";
if (!existsSync(src)) {
  console.error(`[spa-fallback] ${src} missing — did vite build run?`);
  process.exit(1);
}
copyFileSync(src, "dist/404.html");
console.log("[spa-fallback] dist/404.html written");
