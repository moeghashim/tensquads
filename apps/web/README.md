# @tensquads/web

The tensquads web app. It is a TanStack Start app on one Cloudflare Worker.

`@tanstack/react-start` is pinned at exactly 1.169.4. The Worker uses `nodejs_compat` and the Cloudflare Vite plugin.

The page is blank. The document title is tensquads. Screens come in a later phase.

Run these commands from the repository root:

```sh
npm ci
npm run dev -w @tensquads/web
npm run build:cloudflare
```

The development URL is `http://localhost:3000`. `npm run preview:cloudflare` builds and serves the Worker with Wrangler. `npm run deploy:cloudflare` builds and deploys from a local session with Cloudflare access. CI builds but does not deploy.

`src/design/tokens.css`, `src/design/OVERRIDES.md`, and `src/design/icons/` are generated assets. The blank route does not import them. Tokens are light theme only. See the [foundation guide](../../docs/foundation.md) for regeneration commands and verification limits.
