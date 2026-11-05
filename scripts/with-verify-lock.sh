#!/bin/sh
# Same protocol as /tmp/ts-e2e-lock.sh. TS_E2E_LOCK_DIR overrides the path in tests.
# A holder that has exited is broken with kill -0. A lock with no pid file
# breaks after 120 minutes. When that script already holds the directory, its
# pid is an ancestor of this process, so the command runs and the lock stays.
L=${TS_E2E_LOCK_DIR:-/tmp/ts-e2e.lock}

already_held() {
	[ -f "$L/pid" ] || return 1
	holder=$(cat "$L/pid" 2>/dev/null) || return 1
	current=$$
	while [ -n "$current" ] && [ "$current" -gt 1 ]; do
		if [ "$current" = "$holder" ]; then
			return 0
		fi
		current=$(ps -o ppid= -p "$current" 2>/dev/null | tr -d ' ')
	done
	return 1
}

if already_held; then
	"$@"
	exit $?
fi

while ! mkdir "$L" 2>/dev/null; do
	if [ -f "$L/pid" ]; then
		if ! kill -0 "$(cat "$L/pid" 2>/dev/null)" 2>/dev/null; then rm -rf "$L"; fi
	elif [ -n "$(find "$L" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
		rm -rf "$L"
	fi
	sleep 5
done
echo $$ > "$L/pid"
trap 'rm -rf "$L"' EXIT INT TERM
"$@"
