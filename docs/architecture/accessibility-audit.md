# Accessibility record

Target: WCAG 2.2 AA. Two kinds of evidence: automated checks that run on every change, and a
manual pass over the things automation cannot see.

## Automated, on every run

`apps/web/e2e/a11y.ts` runs axe-core (tags `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) and
fails the test on any serious or critical violation. It is called on every screen that a
browser journey reaches, at three widths (phone, tablet, desktop):

| Journey               | Screens checked                                                                       |
| --------------------- | ------------------------------------------------------------------------------------- |
| `auth.spec.ts`        | sign-in, forgot and reset password, change password, setup wizard, dashboard, profile |
| `two-factor.spec.ts`  | setup dialog, recovery codes, verify, trusted devices, users list                     |
| `access.spec.ts`      | invite, accept invitation, roles matrix, user detail                                  |
| `settings.spec.ts`    | settings sections, organization, locations, notifications                             |
| `appearance.spec.ts`  | landing, privacy, contact, appearance settings with brand pictures                    |
| `backups.spec.ts`     | backups screen with status cards and table, dashboard health                          |
| `operations.spec.ts`  | jobs, scheduled jobs, audit log with filters and drawer, feature switches             |
| `screenshots.spec.ts` | the screen gallery in `docs/architecture/screens/`                                    |

Result on 1 November 2026: 19 journeys, 0 serious or critical violations.

Colour contrast is also proven at the token level: the theme engine's tests check every
foreground and background pair for AA across the six presets, every sidebar and top-bar style
and sixteen custom brand colours in both light and dark (`packages/shared/src/theme`).

## Manual pass (1 November 2026)

- Keyboard only: every screen reachable from the sidebar, dialogs trap and return focus
  (Radix), Escape closes, the step-up dialog returns focus to the control that opened it.
- Visible focus ring on every control (token `--ring`).
- Labels: every input has a `<label>`; icon-only buttons carry `aria-label`; tables have
  header cells and screen-reader-only action headers; the phone card lists carry the same text.
- Live regions: saved and error messages use the Alert component (`role="alert"`).
- Motion: no animation longer than 200 ms; nothing auto-plays.
- Zoom: layouts hold at 200 % on desktop (the phone layout takes over).
- Language: `<html lang="en">`; dates rendered in en-GB.

## Not yet done

- Lighthouse (mobile profile, landing page ≥ 95 in the plan) could not run in the build
  container; run it from the operations host and record the score here.
- A screen-reader session with a real user; book it for the first client pilot.
