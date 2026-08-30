---
name: velora-design
description: Velora's design system — colour tokens, type scale, spacing, radii, touch targets and the accessibility floor every screen must clear. Use whenever building or restyling any Velora UI (pages, panels, modals, tables, charts), picking a colour or font size, or reviewing a screen for visual/accessibility problems.
---

# Velora design system

Velora is a **trading terminal first**. Dense, quiet, professional — closer to
Bloomberg than to a SaaS landing page. Data is the interface; chrome should
recede. Colour carries meaning (up/down/warning), never decoration.

Three rules override personal taste:

1. **Never hand-pick a hex value.** Use a token (below). A raw hex in a
   component is a bug — it breaks theming and skips the contrast floor.
2. **Never invent a font size.** Use the scale (below).
3. **Every screen must pass the contrast floor.** It is measurable; measure it.

---

## Colour tokens

Defined in `frontend/src/styles/globals.css` as space-separated RGB channels,
consumed through Tailwind as `bg-bg-1`, `text-txt-2`, `border-line`, etc.
(`tailwind.config.js` wires them via `rgb(var(--x) / <alpha-value>)`, so
opacity modifiers like `bg-buy/20` work.)

### Surfaces — `bg-0` … `bg-4`
Ascending elevation. `bg-0` is the page, `bg-1` panels/cards, `bg-2` insets and
hover, `bg-3`/`bg-4` controls and raised chips. Separate surfaces with
`border-line` (or `border-line-soft` for internal dividers), not shadows —
Velora is a flat, bordered UI.

### Text — `txt-0` … `txt-3`
A four-step ramp, brightest to dimmest:

| Token | Use |
|---|---|
| `txt-0` | Primary values — prices, balances, headings |
| `txt-1` | Standard body text, table cell values |
| `txt-2` | Secondary/supporting text, inactive nav |
| `txt-3` | Captions, column headers, hints — **the dimmest allowed for real text** |

Nothing dimmer than `txt-3` may carry information. If text needs to recede
further than `txt-3`, it is either not needed on the screen or belongs in a
tooltip.

### Semantic
`accent` (Velora blue — interactive/brand), `buy` (green — long/up/positive),
`sell` (red — short/down/negative), `warn` (amber — caution, fees, degraded
state). Each has `-dim` (hover/pressed) and `-soft` (tinted background) forms.

**Never** use `buy`/`sell` for anything but market direction or P&L sign. A
green "Save" button is wrong here — it reads as "long".

### Categorical — `cat-gold`, `cat-teal`, `cat-indigo`, `cat-violet`, `cat-magenta`, `cat-rose`
Scoped to exactly one use: colour-coding the CRM lead pipeline's ten funnel
statuses (`frontend/src/components/crm/leadLabels.ts`), where the four
semantic tones can't stretch far enough without borrowing buy's green or
sell's red for a meaning that has nothing to do with money. Each hue is
measured to sit clearly outside both buy's and sell's hue range and clears
4.5:1 as text on `bg-1`, on `bg-3`, and on its own `-soft` tint (same rule as
everything else on this page). **Do not use these in the trading terminal** —
they exist to solve "ten CRM statuses need to be told apart," not as a general
extra accent palette.

---

## The accessibility floor (non-negotiable)

Every text/background pair must meet **WCAG AA**:

- **4.5:1** for text under 18px
- **3:1** for text 18px and above, and for icons//UI boundaries that carry meaning

Both themes must pass — light mode is not an afterthought. The token ramp is
tuned so that *any* `txt-*` on *any* `bg-*` clears this; you only need to
re-check when introducing a new colour or putting text on a tinted/`-soft`
background.

Verify by measurement, not by eye. Paste into DevTools on the page under review:

```js
(function(){
  const lum=([r,g,b])=>{const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
  const rat=(a,b)=>{const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)};
  const p=s=>(s.match(/\d+(\.\d+)?/g)||[]).slice(0,3).map(Number);
  const bgOf=el=>{let n=el;while(n&&n!==document.documentElement){const c=getComputedStyle(n).backgroundColor;
    if(c&&!c.includes('rgba(0, 0, 0, 0)')&&c!=='transparent')return p(c);n=n.parentElement}return [5,7,10]};
  const bad=[];
  for(const e of document.querySelectorAll('body *')){
    if(e.children.length||!e.textContent.trim()||e.offsetParent===null)continue;
    const cs=getComputedStyle(e),size=parseFloat(cs.fontSize),r=rat(p(cs.color),bgOf(e));
    if(r < (size>=18?3:4.5)) bad.push({r:+r.toFixed(2),size,text:e.textContent.trim().slice(0,28)});
  }
  console.table(bad); return bad.length+' failing';
})();
```

A non-zero result is a defect, not a preference.

---

## Type

Base is **12.5px** — deliberately small, because the terminal shows a lot at
once. Use the scale; do not compute sizes.

| Class | px | Use |
|---|---|---|
| `text-2xs` | 10.5 | Captions, column headers, badges, dense table meta |
| `text-xs` | 12 | Default UI text, table cells, controls |
| `text-sm` | 14 | Panel titles, emphasised values |
| `text-base` | 16 | Section headings |
| `text-lg` / `text-xl` | 18 / 20 | Page headings |
| `text-2xl` / `text-3xl` | 24 / 30 | Marketing headlines (public pages only) |

**9px is the hard floor.** Nothing renders smaller — including anything
derived arithmetically (`size * 0.32` and similar must be clamped with
`Math.max(9, …)`).

Weights: `400` body, `500` labels/nav, `600` values and panel titles, `700`
headlines. Four weights, no more.

Numbers: put `tabular` on any column of figures so digits align and prices
don't jitter as they tick. `mono` for addresses, hashes and IDs.

---

## Spacing, radii, borders

**Spacing** is a 4px scale: `1` (4px), `2` (8px), `3` (12px), `4` (16px),
`6` (24px). Prefer `gap-*` on a flex/grid parent over per-child margins.
Panel padding is `p-3` on desktop, `p-4` on public pages.

**Radii** scale with the size of the surface — four tiers, no others:
- `rounded` (4px) — dense controls inside the terminal
- `rounded-lg` (8px) — panels, cards, table containers
- `rounded-xl` (12px) — large surfaces: modals, the public hero, wallet tiles
- `rounded-full` — pills, badges, avatars, primary CTAs

Adjacent surfaces of the same weight must share a radius; don't put a
`rounded` card beside a `rounded-lg` one.

**Borders** carry the structure: `border-line` between distinct regions,
`border-line-soft` for rows and internal dividers.

---

## Touch targets

`globals.css` provides `tap` (44px) and `tap-sm` (38px). Both apply **only**
under `@media (pointer: coarse)`, so the dense desktop layout is untouched.

Any control reachable on a phone gets `tap-sm`; primary actions get `tap`.
Tab strips use `flex-1 basis-0` so tabs share one width instead of each sizing
to its own label.

---

## Motion

Entrance animations (`anim-rise`, `anim-rise-1/2/3`, `page-transition`) animate
**transform only, never opacity**. An opacity-from-0 entrance that fails to
resolve leaves content permanently invisible — this has bitten this project
before. Motion is 160–420ms, ease-out. Respect that ceiling; nothing slower.

`hero-glow` and `gradient-text` are reserved for public marketing pages. They
never appear inside the terminal.

---

## Layout

- The authenticated shell is `.app-shell` — `100dvh` (**not** `100vh`; `vh`
  measures as though the mobile address bar were always hidden, which pushes
  the header off-screen and buries the bottom row) with `overflow: hidden`,
  and panes scroll inside it.
- Public pages scroll the document normally. Never reintroduce a global
  `body { overflow: hidden }` — it silently makes public pages unscrollable.
- Avoid nested scroll containers on mobile: an inner scroll box swallows the
  page swipe. Cap heights at `lg:` and above only.

---

## Honesty in the interface

This is a financial product, and it carries into the visual language:

- Never render a number the platform cannot substantiate. Missing data shows
  `—`, never a plausible-looking placeholder.
- Modelled or synthetic values must be labelled as such at the point of
  display (see the `SYNTHETIC` source badge on instruments).
- An empty state states the real reason ("Инструментов с котировкой в USDC
  пока нет"), never a fabricated row to fill space.
- Never dress a demo/virtual balance as real funds.
