# Audit checklist

Six categories are in scope for this audit. Each is something Velora's own design
system or product history already made a rule about — the audit's job is to find where a
screen drifted from that rule, not to invent new rules. If a problem doesn't fit one of
these six, it's very likely out of scope (see SKILL.md's one rule) — flag it in the
report as a proposal rather than fixing it.

## 1. Consistency (spacing, radii, shadows, type)

`velora-design` defines closed scales for all of these — nothing here should be a value
that isn't already one of the documented steps.

- **Radii**: `rounded` (4px, dense terminal controls) / `rounded-lg` (8px, panels & cards)
  / `rounded-xl` (12px, modals & large surfaces) / `rounded-full` (pills, badges, primary
  CTAs). A finding here is a control sitting at the wrong tier for its role — e.g. a card
  still on `rounded` outside the dense terminal, or a badge that isn't a pill.
- **Spacing**: the 4px scale (`1`/`2`/`3`/`4`/`6` = 4/8/12/16/24px). A finding is a
  one-off pixel value or an inconsistent gap between visually similar elements, not "this
  could be roomier" (that's a proposal, not a finding, unless it's actively cramped —
  see Accessibility below).
- **Shadows**: `shadow-btn` (control at rest) → `shadow-float` (CRM/Admin/Overview cards
  on hover) → `shadow-lift` (one primary action per page, or a modal). Never inside the
  dense trading terminal (order book, ticket, chart), which stays flat/bordered on
  purpose — a shadow appearing there is itself the finding, not a gap to fill.
- **Type**: the fixed scale in `velora-design` (`text-2xs` through `text-3xl`). A finding
  is an arbitrary font-size or a weight outside the four documented (400/500/600/700).

## 2. Accessibility

- **Contrast**: run `references/contrast-check.js` in the DevTools console on every
  screen you screenshot (paste it in, read the table it prints). Non-empty output is a
  finding, full stop — not a judgment call. Check both themes; a fix that clears AA in
  dark mode can still fail in light.
- **Touch targets**: `.tap` (44px) / `.tap-sm` (38px) exist for `pointer: coarse` and
  should be on anything interactive that a phone can reach. A finding is a real,
  clickable control on a screen a phone can reach that isn't wearing one.
- **Focus states**: tab through the screen with a keyboard. A finding is an interactive
  element with no visible focus ring, or a focus order that skips around illogically.
- **Honesty in the interface**: per `velora-design`, a missing value must render `—`, and
  a synthetic/modelled value must be labeled as such at the point of display. A finding
  is any spot where this project's own honesty rule doesn't hold — a fabricated-looking
  placeholder, a demo balance that doesn't read as demo, or a silent gap in real data.

## 3. States (loading / empty / error)

For each meaningfully distinct piece of async UI (a table, a card's data, a form
submission): does it have a real loading state (not just a layout jump), a real empty
state that explains *why* it's empty rather than looking broken, and a real error state
with a way to retry? A finding is any of the three missing, or a loading state that's a
bare spinner where the rest of the app already uses a skeleton (or vice versa —
inconsistency between screens counts here too, not just absence).

## 4. Redundancy / drift

This project has hit real "two consoles managing the same data through different code"
drift before (Admin's old Users tab duplicating the CRM's client view). A finding here is:
two screens that show or edit overlapping data through separate code paths that can
silently diverge, a control that duplicates another control's job, or a piece of UI that
no longer has a live purpose because the flow that fed it moved elsewhere. This is often
the highest-leverage category — a duplication removed is simpler than two duplications
each polished separately — but it's also the easiest to over-scope: only flag it when the
overlap is real and current, not "these two screens are both about users" in the abstract.

## 5. Responsive / mobile

Check at the 390px viewport specifically (this repo's convention), not just "does it
reflow":

- Nothing forces horizontal scroll on the page body itself (a wide table or chart
  scrolling *inside its own container* is fine and is this app's existing pattern; the
  outer page scrolling sideways is not).
- A modal or drawer fits inside the viewport and its close affordance is reachable.
  Filter bars and multi-field forms wrap into a usable stack rather than clipping.
- If a swipe or touch gesture exists nearby (this app has a tab-switch swipe on mobile),
  confirm a new addition doesn't fight it — a horizontally-scrollable element you add
  needs to actually claim the gesture from the page-level swipe, not just visually
  overlap it.
- Nothing depends on hover-only affordances to be usable (a coarse pointer has no hover).

## 6. Motion

Per `velora-design`: transform-only, 160–420ms, ease-out. A finding is anything that
animates opacity from 0 (this project's own postmortem: an entrance animation that fails
to resolve can leave content invisible — this has actually happened here), anything
slower than the ceiling, or motion that fires somewhere the rest of the app is
deliberately still (e.g. a glow/gradient effect leaking from a public marketing page into
the terminal — `hero-glow`/`gradient-text`/`.section-glow`/`.neon-strip` are scoped by
design, not by accident).

---

## Output template

Use this shape for the findings list (step 3 of SKILL.md) and carry the same rows into
the final report with a status added.

```
[SEVERITY] Category — one-line summary
  Where: path/to/File.tsx:123 (or "screen: /crm, mobile viewport" if not code-level)
  What a user actually experiences: ...
  Proposed fix (if in scope) / Why it's deferred (if not):
```

Order the list Critical → High → Medium → Low. Within a severity, group by screen or
component so related findings (and their fixes) stay together.
