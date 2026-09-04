#!/usr/bin/env bash
#
# Drive the real app and check what actually reaches the disk.
#
# The unit tests cover the store and the autosave's ordering, and the config
# test covers the window flags. None of them can answer the question that
# matters: does a keystroke in the real window, in the real webview, over the
# real IPC, end up in the real SQLite file. This does, by running the app on a
# virtual display and typing into it.
#
# Linux only — it needs Xvfb and xdotool. That is not a limitation worth
# fixing: what is being tested here is the wiring, and the wiring is the same
# on all three platforms. The platform-specific part is the macOS window
# behaviour, which needs a Mac and a pair of eyes.
#
#   ./scripts/prove-linux.sh
#
# Requires a debug build (cargo build) and the dev server, both of which it
# starts if they are not already running.

set -uo pipefail

cd "$(dirname "$0")/.."
DISPLAY_NUM="${TOUGATHER_DISPLAY:-:77}"
STORE="${XDG_DATA_HOME:-$HOME/.local/share}/com.tougather.note/notes.sqlite3"
BIN="./src-tauri/target/debug/tougather-desktop"

pass=0
fail=0
ok()  { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }

rows() {
  python3 - "$STORE" "$1" <<'PY'
import sqlite3, sys
try:
    c = sqlite3.connect(sys.argv[1])
    print(c.execute(sys.argv[2]).fetchone()[0])
except Exception as e:
    print(f"<{e}>")
PY
}

cleanup() {
  # -x matches the process name, never this script's own command line.
  pkill -x tougather-desktop 2>/dev/null
  pkill -x Xvfb 2>/dev/null
}
trap cleanup EXIT

[ -x "$BIN" ] || { echo "no debug build — run: cargo build --manifest-path src-tauri/Cargo.toml"; exit 1; }

# A dev build points the webview at the dev server, so it has to be up.
if ! curl -sf -o /dev/null http://localhost:1420/; then
  echo "starting the dev server…"
  nohup npm run dev > /tmp/tougather-vite.log 2>&1 &
  for _ in $(seq 1 30); do curl -sf -o /dev/null http://localhost:1420/ && break; sleep 1; done
fi

echo "starting on a virtual display…"
rm -f "$STORE" "$STORE-wal" "$STORE-shm"
nohup Xvfb "$DISPLAY_NUM" -screen 0 1280x800x24 > /tmp/tougather-xvfb.log 2>&1 &
sleep 2

# A session bus, even though nothing in step 2 needs one.
#
# The app does now: the tray, the deep-link plugin and the keychain all reach
# for D-Bus, and on a machine without it the global shortcut never fires here
# — the app runs and the note saves, but the hotkey is dead. A developer
# machine always has a bus; this container does not, and a test harness that
# differs from every real machine in a way that fails is worse than no
# harness. If `dbus-launch` is missing the script carries on and says so,
# because the note checks below are still worth running.
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && command -v dbus-launch > /dev/null; then
  eval "$(dbus-launch --sh-syntax)"
  export DBUS_SESSION_BUS_ADDRESS
elif [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
  echo "note: no dbus-launch, so the hotkey check may fail for that reason alone"
fi
DISPLAY="$DISPLAY_NUM" nohup "$BIN" > /tmp/tougather-app.log 2>&1 &
export DISPLAY="$DISPLAY_NUM"
sleep 18

# ── It starts ON screen, and this assertion is inverted on purpose ───────
#
# It used to check the opposite: that nothing was visible before the hotkey.
# That was right while the app was a note you summon, and it is exactly wrong
# now that it is a bar. `docs/desktop.md` warns that leaving it as it was would
# be worse than deleting it — it would keep passing, for the wrong reason,
# forever, and this is the one test in the repository that has ever caught a
# real bug in the real window.
#
# What it is guarding: `visible: true` in tauri.conf.json and nothing in
# setup() hiding it again. Before, `visible` was false and setup() never called
# show(), so installing the app put nothing on screen at all unless somebody
# found the tray icon unaided.
if [ -n "$(xdotool search --onlyvisible --name Tougather 2>/dev/null)" ]; then
  ok "the bar is on screen the moment it starts, with no hotkey pressed"
else
  bad "nothing is visible after launch — the bar is the app, and it is missing"
fi

# 44 pixels tall, not a note-sized rectangle. Checked in pixels because the
# whole point of the redesign is how much screen this occupies all day.
BAR="$(xdotool search --onlyvisible --name Tougather 2>/dev/null | head -1)"
if [ -n "$BAR" ]; then
  H="$(xdotool getwindowgeometry "$BAR" | awk -F'x' '/Geometry/ {print $2}')"
  if [ "${H:-0}" -le 60 ]; then
    ok "it rests as a bar (${H}px tall), not as a window"
  else
    bad "it is ${H}px tall at rest — that is a window, not a bar"
  fi
fi

# ── The store exists and has the note the app made for itself ────────────
if [ "$(rows "select count(*) from notes")" = "1" ]; then
  ok "the first launch leaves a note ready to write in"
else
  bad "no note was created — the window never reached Rust"
fi

# The id has to be one the server will take, or this note syncs once in
# step 4 and never again. Same constraint as `projects.id`.
if [ "$(rows "select count(*) from notes where id glob '[A-Za-z0-9_-]*' and length(id) between 8 and 64")" = "1" ]; then
  ok "the note's id is one the account would accept"
else
  bad "an id the server's constraint would refuse"
fi

# ── The hotkey ───────────────────────────────────────────────────────────
xdotool key --clearmodifiers ctrl+shift+n; sleep 3
WIN="$(xdotool search --onlyvisible --name Tougather 2>/dev/null | head -1)"
if [ -n "$WIN" ]; then ok "the hotkey brings it up"; else bad "the hotkey did nothing"; fi

xdotool key --clearmodifiers ctrl+shift+n; sleep 3
if [ -z "$(xdotool search --onlyvisible --name Tougather 2>/dev/null)" ]; then
  ok "the hotkey puts it away again"
else
  bad "it stayed up after a second press"
fi

xdotool key --clearmodifiers ctrl+shift+n; sleep 3
WIN="$(xdotool search --onlyvisible --name Tougather 2>/dev/null | head -1)"
[ -n "$WIN" ] || { echo "cannot continue without a window"; exit 1; }
xdotool windowactivate --sync "$WIN" 2>/dev/null || xdotool windowfocus "$WIN"
sleep 1

# ── Typing reaches the disk, but not on every keystroke ──────────────────
xdotool type --window "$WIN" --delay 40 "Milk, bread, and a plan for Thursday"
if [ "$(rows "select count(*) from notes where body != ''")" = "0" ]; then
  ok "it does not write on every keystroke"
else
  bad "the debounce is not debouncing"
fi

sleep 2
if [ "$(rows "select count(*) from notes where body = 'Milk, bread, and a plan for Thursday'")" = "1" ]; then
  ok "what was typed is on disk a moment later"
else
  bad "the typing never reached SQLite"
fi

# ── Hiding mid-write must not cost a sentence ────────────────────────────
#
# The hotkey's hide path is in Rust and deliberately does not flush, on the
# reasoning that hiding does not destroy the webview so the timer still fires.
# This is that reasoning, checked.
xdotool key --clearmodifiers --window "$WIN" ctrl+a
xdotool key --window "$WIN" Delete
sleep 2
xdotool type --window "$WIN" --delay 30 "typed then hidden immediately"
xdotool key --clearmodifiers ctrl+shift+n     # hidden inside the debounce
sleep 3
if [ "$(rows "select count(*) from notes where body = 'typed then hidden immediately'")" = "1" ]; then
  ok "hiding while a write is pending still saves it"
else
  bad "putting the note away lost what was in it"
fi

echo
if [ "$fail" -gt 0 ]; then echo "$fail failed, $pass passed"; exit 1; fi
echo "all $pass passed"
