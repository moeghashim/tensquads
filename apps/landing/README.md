# Holding page

This Worker serves 10squads.com until the product launches. It is one file with no build step. It attaches through zone routes, because the moved zone kept its old DNS records.

The text and styles come from `design/Home.dc.html`. "Coming soon" is the only added text.

The zone for 10squads.com is in the project Cloudflare account. To deploy this page, set `CLOUDFLARE_API_TOKEN` to the value of `CLOUDFLARE_WORKERS_API_TOKEN` from `.env`, and run `npx wrangler deploy` from this folder.

Do not use `npm run deploy:cloudflare` here. That command deploys the product.

## Review pages

`/review` holds the build plan and the design for the team. `build-review.mjs` makes them in `public/`, which git ignores. The design files are copied byte for byte. `/review/design` lists them with one thumbnail each. The build renders each thumbnail with Playwright at 1440 px, through a local HTTP server, because the wrapper files load `Main.dc.html` with fetch. Run the build from a checkout that has `node_modules`. `review-src/support.js` is a small runtime for them, because the canvas runtime is not in this repository.

Run `node build-review.mjs <git ref>` before you deploy. The ref names the plan to publish. `review-src/diagrams.mjs` holds the three diagrams, redrawn after the original plan diagrams. Each part of a diagram shows its build status: Built, In progress or Planned. `review-src/status.mjs` combines git status with external task states supplied by the build. `review-src/questions.mjs` holds the open questions on the review index. `review-src/squadmates.mjs` draws the proposed agent characters, and `review-src/characters.mjs` makes the sheet at `/review/characters`. The product does not use them until Moe approves them. A question leaves that list when its answer goes into the decisions table. The pages are public, with no sign-in. Search engines are told to skip them.

For tasks in this repository, a task is Built when its branch is merged into the ref or its merge appears in the ref's merge history. It is In progress when its branch is on origin and not merged. Otherwise it is Planned. Run `git fetch origin` before the build, so the local status is current.

For tasks listed in `EXTERNAL` in `status.mjs`, the build runs `gh pr list -R <repo> --state merged --limit 1 --json number` once per repository. Install GitHub CLI and authenticate it with access to those private repositories before the build. Any returned merged PR makes the task Built. A successful query with no merged PR makes it In progress, including when no PR exists. A missing repository or a failed query makes it Planned and prints one warning line. These states come from GitHub at build time, independent of the selected git ref. They override local git status. A phase is Built only when all its tasks are Built. It is In progress when any task is Built or In progress. Otherwise it is Planned. To connect a new part of the plan to a task, edit the task lists in `status.mjs`.
