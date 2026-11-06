#!/bin/sh
# Same protocol as /tmp/ts-e2e-lock.sh. TS_E2E_LOCK_DIR overrides the path in tests.
# A holder that has exited is broken with kill -0.
# A lock with no pid file breaks after 120 minutes.
# An empty or non-numeric pid file is the same as no pid file.
# The age of that file decides the 120 minute break.
# When that script already holds the directory, its pid is an ancestor of this
# process, so the command runs and the lock stays.
# The bypass needs a lock script in the ancestor's command line. A pid alone
# can be stale, reused, or an unrelated ancestor.
L=${TS_E2E_LOCK_DIR:-/tmp/ts-e2e.lock}

# True when the string is a positive integer.
is_pid() {
	case "$1" in
	'' | *[!0-9]*) return 1 ;;
	*) [ "$1" -gt 0 ] 2>/dev/null ;;
	esac
}

already_held() {
	[ -f "$L/pid" ] || return 1
	holder=$(cat "$L/pid" 2>/dev/null) || return 1
	is_pid "$holder" || return 1
	current=$$
	while is_pid "$current" && [ "$current" -gt 1 ]; do
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

# Test-only rendezvous. Production leaves TS_E2E_LOCK_PAUSE_DIR unset.
# A point pauses when $TS_E2E_LOCK_PAUSE_DIR/$point.on exists.
# The test releases one pid by creating $point.$pid.go.
lock_pause() {
	point=$1
	[ -n "$TS_E2E_LOCK_PAUSE_DIR" ] || return 0
	[ -e "$TS_E2E_LOCK_PAUSE_DIR/$point.on" ] || return 0
	echo $$ > "$TS_E2E_LOCK_PAUSE_DIR/$point.$$.ready"
	while [ ! -f "$TS_E2E_LOCK_PAUSE_DIR/$point.$$.go" ]; do
		sleep 0.05
	done
}

lock_trace() {
	[ -n "$TS_E2E_LOCK_PAUSE_DIR" ] || return 0
	echo "$1 $$" >> "$TS_E2E_LOCK_PAUSE_DIR/trace"
}

# GNU stat, then BSD stat. Empty when the path is gone.
dir_id() {
	id=$(stat -c %i "$1" 2>/dev/null) || id=$(stat -f %i "$1" 2>/dev/null) || id=
	printf '%s' "$id"
}

# Put a moved directory back only when the lock path is still empty.
# Never delete a directory whose pid names a live process.
restore_dir() {
	moved=$1
	if [ ! -e "$L" ]; then
		mv "$moved" "$L" 2>/dev/null || return 0
		return 0
	fi
	moved_pid=$(cat "$moved/pid" 2>/dev/null || true)
	if is_pid "$moved_pid" && kill -0 "$moved_pid" 2>/dev/null; then
		return 0
	fi
	rm -rf "$moved"
}

# True when the directory has no numeric pid and the aged mark is past 120 minutes.
# A numeric pid is a holder, live or dead. An empty or other pid is not a holder.
# The mark is the pid file when that file exists. Otherwise it is the directory.
is_aged_without_pid() {
	dir=$1
	if [ -f "$dir/pid" ]; then
		pid_val=$(cat "$dir/pid" 2>/dev/null || true)
		if is_pid "$pid_val"; then
			return 1
		fi
		[ -n "$(find "$dir/pid" -maxdepth 0 -mmin +120 2>/dev/null)" ]
		return $?
	fi
	[ -n "$(find "$dir" -maxdepth 0 -mmin +120 2>/dev/null)" ]
}

# A dead holder is claimed by moving the pid file. A fresh directory has no
# pid file yet, so this leaves it in place. An aged directory is removed only
# when the moved copy still has no numeric pid and is older than 120 minutes.
reclaim_stale() {
	if [ -n "$1" ]; then
		token="$L.reclaim.$$"
		rm -f "$token"
		mv "$L/pid" "$token" 2>/dev/null || return 0
		moved=$(cat "$token" 2>/dev/null || true)
		if [ "$moved" != "$1" ] || kill -0 "$moved" 2>/dev/null; then
			lock_pause after-steal
			if [ ! -f "$L/pid" ]; then
				mv "$token" "$L/pid" 2>/dev/null || return 0
			fi
			if [ -f "$L/pid" ] || ! kill -0 "$moved" 2>/dev/null; then
				rm -f "$token"
			fi
			return 0
		fi
		rm -f "$token"
		if [ -f "$L/pid" ]; then
			return 0
		fi
		rm -rf "$L"
		return 0
	fi

	stale="$L.stale.$$"
	rm -rf "$stale"
	aged_id=$(dir_id "$L")
	if [ -z "$aged_id" ] || ! is_aged_without_pid "$L"; then
		return 0
	fi
	lock_pause before-aged-mv
	if [ "$(dir_id "$L")" != "$aged_id" ] || ! is_aged_without_pid "$L"; then
		return 0
	fi
	mv "$L" "$stale" 2>/dev/null || return 0
	# Second check, on the renamed copy. A pause here lets a test change that copy.
	lock_pause before-aged-judge
	if [ "$(dir_id "$stale")" != "$aged_id" ] || ! is_aged_without_pid "$stale"; then
		restore_dir "$stale"
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

# mkdir wins the directory. The command runs only when that same directory
# still contains this pid. A failed write goes back to the wait loop.
ident=
while true; do
	owned=0
	if [ -n "$ident" ] && [ "$(dir_id "$L")" = "$ident" ] && [ "$(cat "$L/pid" 2>/dev/null)" = "$$" ]; then
		owned=1
	elif mkdir "$L" 2>/dev/null; then
		ident=$(dir_id "$L")
		lock_pause after-mkdir
		if [ -n "$ident" ] && [ "$(dir_id "$L")" = "$ident" ] \
			&& echo $$ > "$L/pid" 2>/dev/null \
			&& lock_pause after-pid-write \
			&& [ "$(cat "$L/pid" 2>/dev/null)" = "$$" ] \
			&& lock_pause after-read-back \
			&& [ "$(dir_id "$L")" = "$ident" ] \
			&& lock_pause after-dir-check; then
			owned=1
		else
			lock_trace lost-pid
		fi
	else
		holder=$(cat "$L/pid" 2>/dev/null || true)
		if [ -n "$ident" ] && [ "$(dir_id "$L")" = "$ident" ] && [ "$holder" = "$$" ]; then
			owned=1
		elif is_pid "$holder"; then
			if ! kill -0 "$holder" 2>/dev/null; then
				lock_pause saw-dead
				reclaim_stale "$holder"
				lock_trace reclaim-done
			fi
		elif is_aged_without_pid "$L"; then
			reclaim_stale ""
			lock_trace reclaim-done
		fi
		if [ "$owned" -ne 1 ]; then
			sleep 5
		fi
	fi
	if [ "$owned" -eq 1 ]; then
		trap cleanup EXIT INT TERM
		if [ -n "$ident" ] && [ "$(dir_id "$L")" = "$ident" ] && [ "$(cat "$L/pid" 2>/dev/null)" = "$$" ]; then
			break
		fi
		trap - EXIT INT TERM
		lock_trace lost-pid
	fi
done
"$@"
