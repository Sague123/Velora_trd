/**
 * The boot splash lives in index.html as plain HTML/CSS so it paints before
 * the bundle has even downloaded. This takes it down once the app is ready.
 *
 * It stays up for at least MIN_VISIBLE_MS in total (measured from the moment
 * index.html started, not from mount), so a fast load shows a deliberate
 * beat instead of a one-frame flicker. The app renders underneath the whole
 * time; fading the splash out *is* the app's reveal, so nothing in the app
 * ever has to start from opacity 0.
 */
const MIN_VISIBLE_MS = 600;
const FADE_MS = 280;

declare global {
  interface Window {
    __splashStart?: number;
  }
}

let hiding = false;

export function hideSplash() {
  const el = document.getElementById("splash");
  if (!el || hiding) return;
  hiding = true;
  const elapsed = performance.now() - (window.__splashStart ?? 0);
  window.setTimeout(() => {
    // Two frames: let the first real app paint land before the fade starts.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.dataset.state = "out";
        // Reduced motion has no transition, so transitionend never fires —
        // the timeout is the path that always removes the node.
        window.setTimeout(() => el.remove(), FADE_MS + 60);
      }),
    );
  }, Math.max(0, MIN_VISIBLE_MS - elapsed));
}
