# Holding page

This Worker serves 10squads.com until the product launches. It is one file with no build step. It attaches through zone routes, because the moved zone kept its old DNS records.

The text and styles come from `design/Home.dc.html`. "Coming soon" is the only added text.

The zone for 10squads.com is in the project Cloudflare account. To deploy this page, set `CLOUDFLARE_API_TOKEN` to the value of `CLOUDFLARE_WORKERS_API_TOKEN` from `.env`, and run `npx wrangler deploy` from this folder.

Do not use `npm run deploy:cloudflare` here. That command deploys the product.

## Review pages

`/review` holds the build plan and the design for the team. `build-review.mjs` makes them in `public/`, which git ignores. The design files are copied byte for byte. `review-src/support.js` is a small runtime for them, because the canvas runtime is not in this repository.

Run `node build-review.mjs <git ref>` before you deploy. The ref names the plan to publish. The pages are public, with no sign-in. Search engines are told to skip them.
