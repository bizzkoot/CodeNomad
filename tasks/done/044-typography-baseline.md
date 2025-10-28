# Task 044 - Typography Baseline

## Goal
Define the shared typography tokens and map them into Tailwind so text sizing stays consistent with the UI spec.

## Prerequisites
- Task 043 complete (color variables migrated).

## Acceptance Criteria
- [ ] `src/styles/tokens.css` includes typography variables (font families, weights, line heights, size scale).
- [ ] `tailwind.config.js` `theme.extend.fontFamily` and `theme.extend.fontSize` reference the new variables.
- [ ] `src/index.css` applies body font and default text color using the new variables.
- [ ] No existing components lose readability or spacing.

## Steps
1. Add typography variables to `src/styles/tokens.css`, e.g., `--font-family-sans`, `--font-size-body`, `--line-height-body`.
2. Extend Tailwind font families and sizes to match the variable names (`font-body`, `font-heading`, `text-body`, `text-label`).
3. Update `src/index.css` body rules to use `var(--font-family-sans)` and the appropriate default sizes.
4. Spot-check components for any stray font-size declarations that should use utilities instead.

## Testing Checklist
- [ ] Run `npm run dev` and verify the app renders without layout shifts.
- [ ] Inspect headings, labels, and body text to make sure sizes align with the design doc.

## Dependencies
- Depends on Task 043.
- Blocks Task 045 (component migration batch 1).

## Estimated Time
0.5 hours

## Notes
- Keep variable names semantic; record any design clarifications in the Notes section of the PR.
- Use browser dev tools to confirm computed font values match expectations (14px body, 16px headers, etc.).
