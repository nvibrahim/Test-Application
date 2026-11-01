# ADR-003: Theme engine adjusts rather than refuses; CSP from the proxy; PWA from Settings

|            |                 |
| ---------- | --------------- |
| **Status** | Accepted        |
| **Date**   | 1 November 2026 |
| **Phase**  | 5               |

## Decisions

1. **A brand colour white text cannot read on is darkened, not refused.** The plan says
   "refused". Refusing sends the owner hunting for a shade that passes; darkening keeps their
   hue, always passes, and the API reports `adjusted: true` so the screen can say what happened.
   The contrast tests cover every preset and a spread of custom colours.
2. **CSP is set by the Next proxy** (`apps/web/src/proxy.ts`) with a per-request nonce handed
   to the root layout through a request header. API responses carry their own strict CSP from
   helmet. Development allows `unsafe-eval` for React Fast Refresh only.
3. **The PWA manifest is a route**, built from Settings -> General and the brand pictures, so a
   client's install icon and name follow their branding without a build.
4. **Pictures are checked by bytes** (`image-check.ts`) and the tab icon is squared in the
   browser with a canvas before upload, so the server never has to resize.
