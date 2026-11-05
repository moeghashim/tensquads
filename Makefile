.PHONY: verify help

verify:
	@if [ "$(TS_VERIFY_PARALLEL)" = "1" ]; then \
		sh scripts/verify.sh; \
	else \
		sh scripts/with-verify-lock.sh sh scripts/verify.sh; \
	fi

help:
	@printf '%s\n' \
		'make verify' \
		'  Run the Clerk test-user sweep, check, unit tests, Playwright, the design check, and the statechart check.' \
		'  Takes /tmp/ts-e2e.lock, so two worktrees take turns.' \
		'TS_E2E_PORT' \
		'  Port for the Playwright server. Unset in CI uses 3000.' \
		'  Unset on a laptop uses a free port derived from the worktree path.' \
		'  A port is free when both 127.0.0.1 and ::1 can take it.' \
		'TS_VERIFY_PARALLEL=1' \
		'  Run make verify without that lock. Each worktree still uses its own port.' \
		'sh scripts/with-verify-lock.sh <command>' \
		'  Runs one other command at a time on /tmp/ts-e2e.lock.'
