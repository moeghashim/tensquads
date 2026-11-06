#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
node scripts/clerk-test-users.mjs
npm run check
npm test
npm run e2e
npm run design:check
npm run statechart:check
