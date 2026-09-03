---
name: ui-ux-audit
description: Professional UI/UX audit and incremental improvement workflow for Velora's existing interface. Use this whenever the user asks to review, audit, polish, clean up, or improve Velora's UI/UX — including requests that don't say "audit" outright, like "this screen feels off", "make the CRM feel more consistent", "check our accessibility", "the mobile layout is janky", "tidy up the buttons", or "does this page match the rest of the app?". Also use it before any UI work that touches more than one or two files, to ground the change in a real look at the running app first. This is explicitly NOT for greenfield design, picking a new visual direction, or a full reskin — for those, say so and point back at this skill's scope guard instead of proceeding.
---

# Velora UI/UX audit

Velora already has a design system (`.claude/skills/velora-design`) and a real, working
product. The job here is never to replace either — it's to find where the interface
already breaks its own rules or lets users down, fix what's worth fixing now, and leave
a clear record of what wasn't. Read `.claude/skills/velora-design/SKILL.md` before
starting; every finding and every fix in this workflow is checked against it, not
against personal taste.

## The one rule that overrides all others

**This is maintenance, not a redesign.** Every fix stays inside the tokens, type scale,
radius tiers, and motion rules `velora-design` already defines. If a finding can only be
fixed by inventing a new color, a new radius, a new font size, a new visual effect, or by
rethinking a screen's information architecture, that finding goes in the deferred list
with a proposal — it does not get built during an audit.

The failure mode to actively guard against: a request that *sounds* like "make it nicer"
(more shadows, more rounding, a fresher feel, "more native") can pull an audit into
reskinning everything it touches. Two things keep that from happening, both non-negotiable:

1. **Look before you touch.** Every finding is grounded in the actual running app, not
   a read of the JSX. See "Drive the real app" below — this project has already hit a
   case where a screen silently rendering empty turned out to be a genuine backend bug,
   invisible from the code alone and only caught by actually loading the page.
2. **Prioritize, don't sweep.** Findings get triaged before anything is edited. Fix what
   scores high impact / low risk now; everything else — including anything tempting but
   out of scope — gets written down with a reason, not silently done or silently dropped.

## Workflow

### 1. Scope the audit

Confirm with the user (or infer from their request) which screens or flows are in play —
"the CRM", "the trade ticket", "the whole authenticated app", "just mobile". An
unscoped "audit the UI" is still fine, but say so explicitly and work outward from the
screens most likely to matter (whatever the user actually uses, or the newest/least
polished area) rather than trying to open every file in the frontend.

### 2. Drive the real app

Read `references/local-verification.md` for exactly how this repo's local loop works —
starting Postgres, the API, and the Vite preview server, plus two gotchas specific to
this project (a login rate-limiter that needs an API restart between test runs, and a
price feed that goes stale on a long-idle container and needs one SQL nudge before
anything trading-related will work).

For every screen in scope: load it for real, in both themes if the finding could be
theme-sensitive, at a normal desktop width **and** a 390px mobile viewport (this repo
already has a documented mobile breakpoint at 860px — `useIsMobile`). Screenshot what you
see. Click through the real states a user hits: empty (no data yet), loading, one item,
many items, an error. A screen that looks fine with seed data sitting in it can still be
lying about what a first-time user sees.

If something looks wrong, follow it into the code — but the finding is anchored to what
actually rendered, not to what the JSX implies should render. If the audit will change
behavior (not just visuals), check the server-side smoke suite (`server/scripts/smoke.ts`,
run via `npm run smoke`) still passes before and after — a UI symptom can have a backend
root cause, and a passing suite before you touch anything is what tells you a regression
afterward is actually yours.

### 3. Write the findings list — before editing anything

Work through `references/audit-checklist.md` for the in-scope categories, then produce a
plain, prioritized list. Don't fix as you go; a finding written down and triaged is worth
more than a reflexive edit, because it's the triage step that keeps this from turning
into a reskin. For each finding, capture:

- **Severity**: Critical (broken/blocks a task) · High (accessibility failure, or a clear,
  visible violation of an existing house rule) · Medium (real inconsistency or missing
  state, but the screen still works) · Low (polish, likely to be deferred)
- **Category**: one of the six in `references/audit-checklist.md` (consistency,
  accessibility, states, redundancy, responsive, motion)
- **Location**: `file:line` where the fix would land, when it's a code-level issue
- **What's actually wrong** and, in one line, why it matters to someone using the product
  — not "this is inconsistent" but "this button reads as disabled at 3.1:1 contrast, a
  low-vision user can't tell it's clickable"

Show this list to the user (or, in an unattended run, put it at the top of your final
report) before moving to fixes. If the list is long, that's fine — the next step is where
it gets cut down, not this one.

### 4. Triage and fix

Sort by severity, then by how contained the fix is. A rule of thumb: Critical and High
findings almost always get fixed now; Medium findings get fixed when they're cheap and
isolated; Low findings almost always get deferred unless one happens to be a one-line
companion to a fix you're already making. When in doubt about whether a fix stays inside
scope, re-read the one rule above — extending an existing token/pattern to a place that's
missing it is in scope, inventing a new one is not.

Make the fixes. Keep each one to what the finding actually needs — the same discipline
this project's own commit history follows: a shadow token gets *reused*, not
reinvented; a spacing fix moves a value to the nearest step on the existing 4px scale,
not to whatever looks good freehand.

### 5. Verify the same way you found it

Reload the real app — the same screens, same viewports, same states — and confirm each
fixed finding is actually resolved, not just plausible-looking in the diff. Re-run
`npm run typecheck` / `npm run lint` (frontend) and, if server code changed, `npm run
smoke`. Screenshot the after state for anything visual, especially if the before state
was screenshotted too — a reviewer (human or otherwise) should be able to see the
difference, not just be told about it.

### 6. Report

Close with: the full findings list from step 3 (marked fixed / deferred), what changed
and why, screenshots of anything visual, and verification results (typecheck/build/smoke,
and the re-screenshot). Deferred items get a one-line reason each ("out of scope — would
need a new radius tier", "Low severity, isolated to one rarely-used settings row"), so the
next person picking this up isn't starting from zero.
