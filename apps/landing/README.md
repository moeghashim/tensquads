# Holding page

This Worker serves 10squads.com until the product launches. It is one file with no build step.

The text and styles come from `design/Home.dc.html`. "Coming soon" is the only added text.

The zone for 10squads.com is in Moe's personal Cloudflare account. The product Worker is in the project account. To deploy this page, run `npx wrangler deploy` from this folder with Moe's Cloudflare login.

Do not use `npm run deploy:cloudflare` here. That command deploys the product.
