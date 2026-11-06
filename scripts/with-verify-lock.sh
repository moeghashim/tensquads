#!/bin/sh
# The same directory protocol as /tmp/ts-e2e-lock.sh.
# TS_E2E_LOCK_DIR sets the lock path in tests.
# The owner is the one process that creates $L/pid with noclobber.
# Ownership also requires the pid read-back and the same directory inode.
# Only that owner removes the directory, and only in cleanup.
# A dead pid is claimed by a rename of the pid file to a private token.
# An empty or non-numeric pid file older than 120 minutes uses the same claim.
# An aged directory with no pid file is claimed by the noclobber create.
# The directory is not moved.
# An ancestor that runs /tmp/ts-e2e-lock.sh or this script keeps the lock.
# The wait between attempts is 5 seconds.
L=${TS_E2E_LOCK_DIR:-/tmp/ts-e2e.lock}
ident=

# True when the string is a positive integer.
is_pid() {
	case "$1" in
	'' | *[!0-9]*) return 1 ;;
	*) [ "$1" -gt 0 ] 2>/dev/null ;;
	esac
}

pid_is_live() {
	is_pid "$1" || return 1
	kill -0 "$1" 2>/dev/null
}

file_is_old() {
	[ -n "$(find "$1" -maxdepth 0 -mmin +120 2>/dev/null)" ]
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

# Noclobber create. A second process cannot replace an existing pid file.
create_pid() {
	lock_pause before-pid-create
	(set -C; echo $$ > "$L/pid") 2>/dev/null
}

# The create succeeded. The pid read-back and the inode must still match.
confirm_owner() {
	lock_pause after-pid-create
	if [ "$(cat "$L/pid" 2>/dev/null)" != "$$" ]; then
		return 1
	fi
	lock_pause after-read-back
	if [ "$(dir_id "$L")" != "$ident" ]; then
		return 1
	fi
	lock_pause after-dir-check
	return 0
}

# A failed create does not remove the directory. The caller waits.
take_lock() {
	if create_pid && confirm_owner; then
		return 0
	fi
	lock_trace lost-pid
	return 1
}

# The pid file was moved aside. Put its bytes back only when the path is empty.
# The write uses noclobber, so it cannot replace a pid another process created.
restore_pid() {
	token=$1
	if [ ! -f "$L/pid" ]; then
		lock_pause before-put-back
		(set -C; cat "$token" > "$L/pid") 2>/dev/null || true
	fi
	rm -f "$token"
}

# One process wins the rename of the pid file. The winner then creates $L/pid.
claim_holder() {
	expected=$1
	token="$L.claim.$$"
	ident=$(dir_id "$L")
	[ -n "$ident" ] || return 1
	mv "$L/pid" "$token" 2>/dev/null || return 1
	lock_pause after-claim-mv
	moved=$(cat "$token" 2>/dev/null || true)
	dead=0
	if [ "$moved" = "$expected" ]; then
		if pid_is_live "$moved"; then
			dead=0
		else
			dead=1
		fi
	fi
	lock_pause after-claim-read
	if [ "$dead" -ne 1 ]; then
		restore_pid "$token"
		return 1
	fi
	rm -f "$token"
	take_lock
}

reclaim() {
	if [ -f "$L/pid" ]; then
		holder=$(cat "$L/pid" 2>/dev/null || true)
		if is_pid "$holder"; then
			if pid_is_live "$holder"; then
				return 1
			fi
			lock_pause after-dead-check
			claim_holder "$holder"
			return $?
		fi
		if ! file_is_old "$L/pid"; then
			return 1
		fi
		lock_pause after-nonnumeric-check
		claim_holder "$holder"
		return $?
	fi
	if [ ! -d "$L" ]; then
		return 1
	fi
	if ! file_is_old "$L"; then
		return 1
	fi
	ident=$(dir_id "$L")
	if [ -z "$ident" ]; then
		return 1
	fi
	lock_pause after-aged-check
	if [ "$(dir_id "$L")" != "$ident" ] || [ -f "$L/pid" ] || ! file_is_old "$L"; then
		return 1
	fi
	lock_pause after-final-check
	take_lock
}

cleanup() {
	# Only the owner removes the directory.
	if [ "$(cat "$L/pid" 2>/dev/null)" = "$$" ]; then
		rm -rf "$L"
	fi
}

if already_held; then
	"$@"
	exit $?
fi

while true; do
	owned=0
	if mkdir "$L" 2>/dev/null; then
		ident=$(dir_id "$L")
		lock_pause after-mkdir
		if [ -n "$ident" ] && [ "$(dir_id "$L")" = "$ident" ]; then
			if take_lock; then
				owned=1
			fi
		else
			# The directory changed before the pid create. Leave it in place.
			lock_trace lost-pid
		fi
	elif [ -n "$ident" ] && [ "$(dir_id "$L")" = "$ident" ] && [ "$(cat "$L/pid" 2>/dev/null)" = "$$" ]; then
		owned=1
	elif reclaim; then
		owned=1
	else
		sleep 5
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
