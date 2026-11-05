#!/bin/sh
# Same protocol as /tmp/ts-e2e-lock.sh. TS_E2E_LOCK_DIR overrides the path in tests.
# A holder that has exited is broken with kill -0. A lock with no pid file
# breaks after 120 minutes. When that script already holds the directory, its
# pid is an ancestor of this process, so the command runs and the lock stays.
# The bypass needs a lock script in the ancestor's command line. A pid alone
# can be stale, reused, or an unrelated ancestor.
L=${TS_E2E_LOCK_DIR:-/tmp/ts-e2e.lock}

already_held() {
	[ -f "$L/pid" ] || return 1
	holder=$(cat "$L/pid" 2>/dev/null) || return 1
	current=$$
	while [ -n "$current" ] && [ "$current" -gt 1 ]; do
		if [ "$current" = "$holder" ]; then
			cmd=$(ps -o command= -p "$holder" 2>/dev/null) || return 1
			case "$cmd" in
			*"/tmp/ts-e2e-lock.sh"* | *"scripts/with-verify-lock.sh"*) return 0 ;;
			*) return 1 ;;
			esac
		fi
		current=$(ps -o ppid= -p "$current" 2>/dev/null | tr -d ' ')
	done
	return 1
}

# Move the stale directory aside first. Only the mover removes it, so two
# reclaimers cannot remove a fresh lock that took its place.
reclaim_stale() {
	stale="$L.stale.$$"
	rm -rf "$stale"
	mv "$L" "$stale" 2>/dev/null || return 0
	if [ -n "$1" ]; then
		moved=$(cat "$stale/pid" 2>/dev/null)
		if [ "$moved" != "$1" ]; then
			# We moved a fresh lock, not the stale one. Put it back.
			if [ ! -e "$L" ]; then mv "$stale" "$L" 2>/dev/null || rm -rf "$stale"; else rm -rf "$stale"; fi
			return 0
		fi
	elif [ -f "$stale/pid" ]; then
		if [ ! -e "$L" ]; then mv "$stale" "$L" 2>/dev/null || rm -rf "$stale"; else rm -rf "$stale"; fi
		return 0
	fi
	rm -rf "$stale"
}

cleanup() {
	# Remove the lock only when it is still ours. Another holder may have
	# replaced the pid file while our command ran.
	if [ "$(cat "$L/pid" 2>/dev/null)" = "$$" ]; then
		rm -rf "$L"
	fi
}

if already_held; then
	"$@"
	exit $?
fi

while ! mkdir "$L" 2>/dev/null; do
	if [ -f "$L/pid" ]; then
		holder=$(cat "$L/pid" 2>/dev/null)
		if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then reclaim_stale "$holder"; fi
	elif [ -n "$(find "$L" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
		reclaim_stale ""
	fi
	sleep 5
done
echo $$ > "$L/pid"
trap cleanup EXIT INT TERM
"$@"
