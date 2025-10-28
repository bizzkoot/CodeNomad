# Task 041 - Tailwind Theme Hooks

## Goal
Establish the base Tailwind configuration needed for theming work without changing current visuals.

## Prerequisites
- Installed project dependencies (`npm install`).
- Ability to run the renderer locally (`npm run dev`).

## Acceptance Criteria
- [ ] `tailwind.config.js` uses `darkMode: ["class", '[data-theme="dark"]']`.
- [ ] `theme.extend` contains empty objects for upcoming tokens: `colors`, `spacing`, `fontSize`, `borderRadius`, and `boxShadow`.
- [ ] No other configuration changes are introduced.
- [ ] App builds and renders exactly as before (no visual diffs expected).

## Steps
1. Update `tailwind.config.js` with the new `darkMode` array value.
2. Add empty extension objects for `colors`, `spacing`, `fontSize`, `borderRadius`, and `boxShadow` under `theme.extend`.
3. Double-check that all other keys remain untouched.
4. Save the file.

## Testing Checklist
- [ ] Run `npm run dev` and ensure the renderer starts successfully.
- [ ] Smoke test the UI in light and dark mode to confirm no visual regressions.

## Dependencies
- None.

## Estimated Time
0.25 hours

## Notes
- Create a branch (e.g., `feature/task-041-tailwind-theme-hooks`).
- Commit message suggestion: `chore: prep tailwind for theming`.
- Include before/after screenshots only if an unexpected visual change occurs.
