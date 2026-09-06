Velora

Project

Velora is a professional trading platform.
Priority: correctness, usability, performance and a clean professional UI.

General Rules

- Keep reasoning concise.
- Inspect only files relevant to the current task.
- Do not scan or reread the whole repository unnecessarily.
- Find the root cause before patching.
- Make the smallest correct change.
- Do not refactor unrelated code.
- Do not add dependencies unless necessary.
- Preserve existing architecture and patterns.
- Do not modify unrelated pages/components.

UI / UX

- Velora should look professional, clean and trustworthy.
- Avoid excessive gradients, neon effects, decorative elements and empty space.
- Maintain strong visual hierarchy and consistent spacing.
- Reuse existing design tokens/components.
- Mobile is first-class: prevent unwanted horizontal page scrolling and keep controls touch-friendly.
- Do not redesign unrelated UI unless explicitly requested.

Financial Logic

- Financial calculations must be correct before being made visually appealing.
- Never fix incorrect financial data with a UI-only workaround.
- Pay attention to timestamps, chronological ordering and recalculation.
- Treat multi-leg ledger operations as one logical operation when appropriate.
- Preserve the distinction between balance, equity, margin, realized PnL and unrealized PnL.

Debugging

1. Reproduce the issue when possible.
2. Identify the actual incorrect state/data.
3. Trace it to the root cause.
4. Fix the root cause.
5. Reproduce the original scenario again.

If a fix does not work, inspect the actual runtime state instead of making speculative patches.

Testing

- Run only relevant tests/checks.
- For financial changes, test the affected scenario and important edge cases.

Communication

Keep final responses concise:

- Changed
- Tested
- Remaining issues