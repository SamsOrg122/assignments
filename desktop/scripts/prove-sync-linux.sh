#!/usr/bin/env bash
#
# Does a note written here actually reach the account, and one written there
# reach here?
#
# The merge rules — which of two copies wins, what a tombstone means, what
# happens to a keystroke that lands mid-push — are decided in Rust and tested
# there, thoroughly, because they are where notes get lost. What no unit test
# can answer is whether the wiring around them is real: whether the queue is
# actually drained, whether the timestamps survive the trip through Postgres'
# format and back, whether a note deleted on one machine stays deleted.
#
# So this runs the real app against a stand-in for the account, signs it in,
# and watches both directions.
#
#   ./scripts/prove-sync-linux.sh
#
# Needs the same build as the sign-in proof:
#   TOUGATHER_SITE=http://localhost:4599 cargo build --manifest-path src-tauri/Cargo.toml

set -uo pipefail
cd "$(dirname "$0")/.."

STUB_PORT=4599
DISPLAY_NUM=":79"
BIN="./src-tauri/target/debug/tougather-desktop"
STORE="${XDG_DATA_HOME:-$HOME/.local/share}/com.tougather.note/notes.sqlite3"

pass=0
fail=0
ok()  { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }

up_there() {
  python3 - "$1" <<'PY'
import json, sys, urllib.request
try:
    req = urllib.request.Request("http://localhost:4599/rest/v1/notes",
                                 headers={"Authorization": "Bearer probe"})
    rows = json.load(urllib.request.urlopen(req, timeout=5))
except Exception as e:
    print(f"<{e}>"); raise SystemExit
want = sys.argv[1]
hit = [r for r in rows if r.get("body") == want and not r.get("deleted_at")]
print("yes" if hit else "no")
PY
}

down_here() {
  python3 - "$1" "$STORE" <<'PY'
import sqlite3, sys
try:
    c = sqlite3.connect(sys.argv[2])
    n = c.execute("select count(*) from notes where body = ? and deleted_at is null",
                  (sys.argv[1],)).fetchone()[0]
    print("yes" if n else "no")
except Exception as e:
    print(f"<{e}>")
PY
}

for tool in Xvfb xdotool node python3 dbus-launch gnome-keyring-daemon; do
  command -v "$tool" > /dev/null || { echo "missing $tool"; exit 1; }
done
[ -x "$BIN" ] || { echo "no debug build — see the header"; exit 1; }

echo "starting the stand-in, a display and a keychain…"
rm -f /tmp/stub-seen.json /tmp/stub-notes.json "$STORE" "$STORE-wal" "$STORE-shm"

# One note already in the account, written on some other machine. The app has
# never seen it and must pull it down.
STUB_PORT=$STUB_PORT STUB_NOTES='{"FromTheOther":{"id":"FromTheOther","body":"written on the other machine","updated_at":"2020-01-01T00:00:00.000Z","deleted_at":null}}' \
  nohup node scripts/gotrue-stub.mjs > /tmp/tougather-stub.log 2>&1 &
nohup Xvfb "$DISPLAY_NUM" -screen 0 1280x800x24 > /tmp/tougather-xvfb.log 2>&1 &
sleep 2

rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/keyrings"
mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/keyrings"
eval "$(dbus-launch --sh-syntax)"
printf 'prove\n' | gnome-keyring-daemon --unlock --daemonize --components=secrets > /tmp/kr.env 2>/dev/null
export "$(grep GNOME_KEYRING_CONTROL /tmp/kr.env)"
export DISPLAY="$DISPLAY_NUM"
export NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1"

cleanup() {
  for p in $(ps -eo pid,comm | grep "[t]ougather" | awk '{print $1}'); do kill "$p" 2>/dev/null; done
  for p in $(ps -eo pid,args | grep -e "[g]otrue-stub" -e "[X]vfb $DISPLAY_NUM" | awk '{print $1}'); do
    kill "$p" 2>/dev/null
  done
}
trap cleanup EXIT

nohup "$BIN" > /tmp/tougather-app.log 2>&1 &
sleep 18

xdotool key --clearmodifiers ctrl+shift+n; sleep 3
WIN="$(xdotool search --onlyvisible --name Tougather 2>/dev/null | head -1)"
[ -n "$WIN" ] || { echo "the window never appeared"; exit 1; }
xdotool windowactivate --sync "$WIN" 2>/dev/null; sleep 1

# ── Write one before signing in ──────────────────────────────────────────
#
# It has to be queued, not lost. Somebody installs the app, writes something,
# and signs in afterwards — that note belongs in their account too.
xdotool mousemove --window "$WIN" 170 105 click 1; sleep 2
# The gate is up, so the note goes in after signing in. Sign in first.
timeout 25 "$BIN" "tougather://auth?code=the-code-from-the-browser" > /tmp/tougather-second.log 2>&1
sleep 5

if grep -q "did not finish" /tmp/tougather-app.log; then
  echo "could not sign in: $(grep 'did not finish' /tmp/tougather-app.log | tail -1)"; exit 1
fi
ok "signed in"

# ── Down: what the account already had ───────────────────────────────────
for _ in $(seq 1 12); do
  [ "$(down_here 'written on the other machine')" = "yes" ] && break
  sleep 2
done
if [ "$(down_here 'written on the other machine')" = "yes" ]; then
  ok "a note from another machine arrives here"
else
  bad "the note already in the account never came down"
fi

# ── Up: what is typed here ───────────────────────────────────────────────
WIN="$(xdotool search --onlyvisible --name Tougather 2>/dev/null | head -1)"
xdotool windowactivate --sync "$WIN" 2>/dev/null; sleep 1
xdotool key --clearmodifiers --window "$WIN" ctrl+a; xdotool key --window "$WIN" Delete
sleep 1
xdotool type --window "$WIN" --delay 30 "typed on this machine"
sleep 2

if [ "$(down_here 'typed on this machine')" = "yes" ]; then
  ok "it is on this disk straight away"
else
  bad "the autosave did not run"
fi

for _ in $(seq 1 15); do
  [ "$(up_there 'typed on this machine')" = "yes" ] && break
  sleep 2
done
if [ "$(up_there 'typed on this machine')" = "yes" ]; then
  ok "and it reaches the account without being asked"
else
  bad "the note never went up"
fi

# ── The timestamps survived the round trip ───────────────────────────────
#
# Postgres writes as many fractional digits as it has and none when it has
# none. A note whose time comes back wrong loses every comparison after it.
stamped="$(python3 - <<'PY'
import json
try:
    notes = json.load(open("/tmp/stub-notes.json"))
    print("yes" if all("T" in n["updated_at"] and n["updated_at"].endswith("Z")
                       for n in notes.values()) else "no")
except Exception:
    print("no")
PY
)"
if [ "$stamped" = "yes" ]; then
  ok "the times went up in the shape the database wants"
else
  bad "a timestamp went up malformed"
fi

# ── A deletion travels ───────────────────────────────────────────────────
#
# A tombstone, not a hole: a row that is simply gone cannot be told from one
# the other machine has never seen, and it would come straight back.
# Coordinates, because there is no way to ask a WebKit window for an element.
# Measured from a screenshot rather than guessed: the header is 40px, the
# first row runs from there to about 92, and the bin sits at the right edge.
# An earlier version used y=60, which looked reasonable and hit nothing.
WIN="$(xdotool search --onlyvisible --name Tougather 2>/dev/null | head -1)"
xdotool mousemove --window "$WIN" 40 20 click 1; sleep 2    # open the list
xdotool mousemove --window "$WIN" 324 68 click 1; sleep 3   # bin on the first row
for _ in $(seq 1 15); do
  [ "$(up_there 'typed on this machine')" = "no" ] && break
  sleep 2
done
if [ "$(up_there 'typed on this machine')" = "no" ]; then
  ok "deleting it here deletes it in the account"
else
  bad "the deletion never travelled — it would come back at the next sync"
fi

echo
if [ "$fail" -gt 0 ]; then echo "$fail failed, $pass passed"; exit 1; fi
echo "all $pass passed"
