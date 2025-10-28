# Task 043 - Color Variable Migration

## Goal
Move all hard-coded color variables from `src/index.css` into `src/styles/tokens.css`, aligning with the documented light and dark palettes.

## Prerequisites
- Task 042 complete (token scaffolding in place).
- Access to color definitions from `docs/user-interface.md`.

## Acceptance Criteria
- [ ] Light mode color tokens (`--surface-*`, `--border-*`, `--text-*`, `--accent`, `--status-success|error|warning`) defined under `:root` in `src/styles/tokens.css`.
- [ ] Dark mode overrides defined under `[data-theme="dark"]` in the same file.
- [ ] `src/index.css` no longer declares color variables directly; it references the new tokens instead.
- [ ] Theme toggle continues to switch palettes correctly.

## Steps
1. Transfer existing color custom properties from `src/index.css` into `src/styles/tokens.css`, renaming them to semantic names that match the design doc.
2. Add any missing variables required by the design spec (e.g., `--surface-muted`, `--text-inverted`).
3. Update `src/index.css` to reference the new semantic variable names where necessary (e.g., `background-color: var(--surface-base)`).
4. Remove redundant color declarations from `src/index.css` after confirming replacements.

## Testing Checklist
- [ ] Run `npm run dev` and switch between light and dark themes.
- [ ] Verify primary screens (instance tabs, session view, prompt input) in both themes for correct colors.
- [ ] Confirm no CSS warnings/errors in the console.

## Dependencies
- Depends on Task 042.
- Blocks Task 044 (typography tokens) and Task 045 (component migration batch 1).

## Estimated Time
0.5 hours

## Notes
- Align hex values with `docs/user-interface.md`; note any intentional deviations in the PR description.
- Provide side-by-side screenshots (light/dark) in the PR for quicker review.
