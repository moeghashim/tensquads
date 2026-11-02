Focused test phase for 053a90c against 293d049.

The supplied baseline npm ci && npm test had already passed. It was not repeated.
No linter, formatter, full suite, pipeline, push, PR, deployment, or CI phase was run.

The local HTTP harness mounts the real WorkspaceProvider and WorkspaceShell (including Sidebar and Dock), with TanStack Router and the same six blank workspace paths. Its HTTP transport calls the real Kernel, repositories, and Neon driver against a disposable PostgreSQL 18.6 database. It supplies one local owner scope instead of Clerk authentication. This validates the running workspace slice; it does not validate Clerk sign-in, TanStack Start server-function transport, or Cloudflare deployment.

PostgreSQL was installed only inside .phase-test. No shared service, real account, operator data, or credentials were used. Native initdb lacked postgres, and Docker had no daemon. A workspace-local embedded-postgres package solved this. A local WebSocket-to-TCP bridge carried Neon queries. All database files and downloaded binaries were removed after shutdown.

Delays were injected around the real database driver's query calls. The database, transaction commits, rollback, deadlines, Date, components, kernel replies, and repositories were real. No clock was mocked in the live drivers. Retry checks used PostgreSQL-generated SQLSTATE exceptions against the real workspaceTransaction. Policy checks executed public repository interfaces against a second disposable PostgreSQL database.

The first navigation attempt used an exact Inventory accessible name, which omitted the Paused status included in its accessible name. Correcting the driver locator passed. The first finish-expiry attempt delayed before reading the Task; it correctly returned ignored because the Task was already expired. Moving the delay until just after the Task read exercised the intended rollback and passed. live-results.json contains the final corrected outcomes; earlier logs retain the diagnostic attempts.

Visual evidence uses the real root stylesheet and repository-pinned fonts. The reference renderer executes the design script, removes All companies per the task decision, and clears main because the screen tasks are separate. All four frame/reference pairs have identical dimensions and zero differing pixels. Comparison images place design left and build right. Working/replied screenshots show the actual dock.

Existing focused checks run: late-lock.test.ts and reset-lock.test.ts against local PostgreSQL; send-deadline.test.ts, mandate.test.ts, and inbound.test.ts with their existing test setups. Their logs are supporting checks, not substitutes for the live product evidence.

The Cloudflare catalog naming difference remains: docs use cloudflare/worker; the stated live slug is cloudflare/workers. No protected file was edited in this phase.
