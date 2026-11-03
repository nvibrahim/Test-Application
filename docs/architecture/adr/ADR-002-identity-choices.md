# ADR-002: Identity choices made in Phase 1

|            |                 |
| ---------- | --------------- |
| **Status** | Accepted        |
| **Date**   | 1 November 2026 |
| **Phase**  | 1, Identity     |

## Decisions

1. **Cookie names depend on `COOKIE_SECURE`.** Browsers refuse a `__Host-` cookie without
   `Secure`, and local development runs over plain http. Outside local dev the cookies are
   `__Host-inspower_session` and `__Host-inspower_csrf`; locally they are `inspower_session` and
   `inspower_csrf`. The production startup check refuses `COOKIE_SECURE=false`.
2. **CSRF is enforced by the access guard, before the session.** Double-submit (cookie plus
   `x-csrf-token` header) and an Origin or Referer check against `WEB_ORIGIN` on every POST,
   PUT, PATCH and DELETE. The browser client fetches a token from `GET /auth/csrf` when it has
   none, because a server-rendered page cannot hand the browser a cookie set on an internal
   fetch. `@SkipCsrf()` exists for machine clients; nothing uses it yet.
3. **Fail closed.** Any Redis failure during sign-in or a reset request answers
   `temporarily_unavailable` (503). The database lock (`users.locked_until`) is the authority;
   Redis only holds the short-lived counters.
4. **Email templates are plain functions for now** (`platform/mail/templates.ts`, text and
   HTML, escaped). Phase 4 moves them to React Email with the brand from Settings; the template
   names and parameters stay the same. Every message has an `email_log` row written before the
   job is queued, and the worker records the outcome on that row.
5. **The e2e suite runs the production builds** against `inspower_e2e` and Redis database 2 on
   the default ports, with the API in `NODE_ENV=test`. The web build fixes the API address at
   build time, so a second build for other ports would defeat the one-image rule.
6. **Two-factor stage is already wired.** The stage machine sends a user with confirmed TOTP to
   `/two-factor`; Phase 2 fills the screen and the verify endpoint.
7. **Permissions are enforced now**, though the registry holds one key. The guard resolves
   the union of the user's role permissions; the Super Admin bypasses the check. Phase 3 adds
   the registry, the built-in roles and the matrix.
8. **Theme preference is applied server-side** with a `dark` class and a tiny inline script for
   "system". Phase 5 replaces this with the full theme engine.
