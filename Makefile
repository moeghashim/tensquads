verify:
	node scripts/clerk-test-users.mjs
	npm run check
	npm test
	npm run e2e
	npm run design:check
	npm run statechart:check
