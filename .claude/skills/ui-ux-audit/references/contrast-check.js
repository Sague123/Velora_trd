/**
 * Paste this into the DevTools console on any Velora screen to check every
 * visible text node against WCAG AA (4.5:1 under 18px, 3:1 at 18px+).
 * Same script `velora-design` documents — kept here as a standalone file so
 * an audit can run it without retyping it. Non-empty output is a finding.
 * Run it in both themes; a fix that clears AA in dark mode can still fail
 * in light, and vice versa.
 */
(function () {
  const lum = ([r, g, b]) => {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const rat = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const p = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && !c.includes("rgba(0, 0, 0, 0)") && c !== "transparent") return p(c);
      n = n.parentElement;
    }
    return [5, 7, 10];
  };
  const bad = [];
  for (const e of document.querySelectorAll("body *")) {
    if (e.children.length || !e.textContent.trim() || e.offsetParent === null) continue;
    const cs = getComputedStyle(e), size = parseFloat(cs.fontSize), r = rat(p(cs.color), bgOf(e));
    if (r < (size >= 18 ? 3 : 4.5)) bad.push({ r: +r.toFixed(2), size, text: e.textContent.trim().slice(0, 28) });
  }
  console.table(bad);
  return bad.length + " failing";
})();
