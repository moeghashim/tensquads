# Agents live validation

The actual TanStack routes, frame loader, agents server function, requireWorkspace, repositories, schema, and React screen ran unchanged. A disposable PostgreSQL 18.6 database listened on 127.0.0.1:5547. A local WebSocket-to-TCP proxy on 5548 served the real Neon driver. Test-only Neon configuration disabled secure WebSockets and password pipelining for these loopback services. A locally generated RSA key and JWT exercised Clerk's configured JWT trust path. No operator account or shared service was used.

The initial configured browser fixture could not run because Clerk keys and TEST_DATABASE_URL were absent. The disposable fixture replaced only account provisioning and sign-in setup. The original agents assertions, 90-second serial configuration, 0.5 px geometry tolerance, macOS-only screenshot guard, and committed pixel baselines remained unchanged. The Node Vite configuration omitted the Cloudflare plugin; no deployment or Cloudflare build claim is made.

## Executed checks

- Baseline supplied by the outer run: `npm ci && npm test` succeeded.
- `node scripts/design-check.mjs`: design matches canvas.
- `npx playwright test --config=.local-test/playwright.config.ts e2e/agents.spec.ts --workers=1 --grep 'the list shows five cards'`: setup blocked by absent credentials.
- Live unauthenticated `/agents` navigation: `/signin`, visible sign-in form, no agent cards. Screenshot: agents-unauthenticated.png.
- Live authenticated request with unreachable disposable database: HTTP 500 and default router error page.
- `node .local-test/local-runner.mjs`: original agents spec assertions executed against the real local product using disposable workspace setup. Seed cards, tasks 142/96/38/24/31, status, autonomy, skills, pending mission, contribution colors, blank host/region/success, zero tasks, empty list, card navigation, inventory occurrence/control identity, keyboard focus, accessibility, width, 1440/390 geometry, unchanged macOS pixels, and visual evidence all passed.
- `node .local-test/edge-runner.mjs`: missing master falls back to Master; no proposal and empty mission retain the pending line; empty skills produce no chips; card has no aria-label or nested controls; all public-table records remain unchanged after visits/reload; no loading UI observed; Inventory sidebar row opens `/agents/inventory` despite two matching accessible button names.
- `node .local-test/read-error-runner.mjs`: temporarily made the skills table unavailable only inside the disposable database. The frame opened, then the actual agents read failed. `/agents` rendered the default router error page. The table was restored. Screenshot: agents-read-error.png.
- `node .local-test/isolation-runner.mjs`: a second account containing PRIVATE OTHER WORKSPACE agents never appeared in the signed-in account's five-card list.
- Visually inspected newly captured side-by-side-1440.png and side-by-side-390.png (design left, running build right), plus sign-in and router error screenshots.

A later unrelated process occupied port 3107. The final isolation check used 39123. The retained local harness uses 39123 for the Node product checks. No unrelated process was stopped.

`make verify`, static analysis, broad regression, push, PR, CI, and deployment were not run in this assigned targeted test phase. The outer executor owns the broader acceptance checks.

Required differences remain: page title Agents, heading Squads; the design sentence says sandbox server. The documented Cloudflare slug is cloudflare/worker; the stated live slug is cloudflare/workers. No plan or design edits were made.

The harness archive retains test setup and assertions, without generated private keys, database files, dependencies, or binaries. The temporary setup and local processes were removed after validation; the project source and baselines were unchanged.
