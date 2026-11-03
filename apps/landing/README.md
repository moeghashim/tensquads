# Holding page

This Worker serves 10squads.com until the product launches. It is one file with no build step. It attaches through zone routes, because the moved zone kept its old DNS records.

The text and styles come from `design/Home.dc.html`. "Coming soon" is the only added text.

The zone for 10squads.com is in the project Cloudflare account. To deploy this page, set `CLOUDFLARE_API_TOKEN` to the value of `CLOUDFLARE_WORKERS_API_TOKEN` from `.env`, and run `npx wrangler deploy` from this folder.

Do not use `npm run deploy:cloudflare` here. That command deploys the product.

## Review pages

`/review` holds the build plan and the design for the team. `build-review.mjs` makes them in `public/`, which git ignores. The design files are copied byte for byte. `/review/design` lists them with one thumbnail each. The build renders each thumbnail with Playwright at 1440 px, through a local HTTP server, because the wrapper files load `Main.dc.html` with fetch. Run the build from a checkout that has `node_modules`. `review-src/support.js` is a small runtime for them, because the canvas runtime is not in this repository.

Run `node build-review.mjs <git ref>` before you deploy. The ref names the plan to publish. `review-src/diagrams.mjs` holds the three diagrams, redrawn after the original plan diagrams. Each part of a diagram shows its build status: Built, In progress or Planned. `review-src/status.mjs` reads the status from git. `review-src/questions.mjs` holds the open questions on the review index. A question leaves that list when its answer goes into the decisions table. A task is Built when its branch is merged into the ref. It is In progress when its branch is on origin and not merged. Run `git fetch origin` before the build, so the status is current. To connect a new part of the plan to a task, edit the task lists in `status.mjs`. The pages are public, with no sign-in. Search engines are told to skip them.
