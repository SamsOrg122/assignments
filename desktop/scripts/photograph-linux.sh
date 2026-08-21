#!/usr/bin/env bash
#
# Photograph the real note window.
#
# Not a test — a way to look at the thing. Design decisions about a window
# 340 pixels wide cannot be made from the stylesheet, and the webview is the
# only renderer that will tell the truth about them. Same harness the proofs
# use: a stand-in for tougather.com, a virtual display, a keychain.
#
#   ./scripts/photograph-linux.sh /tmp/shots
#
set -uo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-/tmp/note-shots}"
STUB_PORT=4599
DISPLAY_NUM=":83"
BIN="./src-tauri/target/debug/tougather-desktop"
STORE="${XDG_DATA_HOME:-$HOME/.local/share}/com.tougather.note/notes.sqlite3"

mkdir -p "$OUT"

FRAMES='[
  {"type":"model","value":"stub/model-1"},
  {"type":"text","value":"Three quarters, growing. "},
  {"type":"text","value":"I have put the detail in a document."},
  {"type":"note","value":{"kind":"append","body":"Q3 was the turn.","label":"Added a summary"}},
  {"type":"artefact","value":{"name":"Revenue analysis","label":"Made an analysis","blocks":[
     {"id":"blk1","type":"text","html":"<p>Revenue grew.</p>"}
  ]}},
  {"type":"done"}
]'

for tool in Xvfb xdotool import node dbus-launch gnome-keyring-daemon; do
  command -v "$tool" > /dev/null || { echo "missing $tool"; exit 1; }
done
[ -x "$BIN" ] || { echo "no debug build — build it first"; exit 1; }

if ! curl -sf --noproxy '*' -o /dev/null http://localhost:1420/; then
  echo "starting the dev server…"
  nohup npm run dev > /tmp/tougather-vite.log 2>&1 &
  for _ in $(seq 1 30); do curl -sf --noproxy '*' -o /dev/null http://localhost:1420/ && break; sleep 1; done
fi

rm -f "$STORE" "$STORE-wal" "$STORE-shm"
STUB_PORT=$STUB_PORT STUB_FRAMES="$FRAMES" \
  nohup node scripts/gotrue-stub.mjs > /tmp/tougather-stub.log 2>&1 &
nohup Xvfb "$DISPLAY_NUM" -screen 0 1280x800x24 > /tmp/tougather-xvfb.log 2>&1 &
sleep 2

rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/keyrings"
mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/keyrings"
eval "$(dbus-launch --sh-syntax)"
printf 'shots\n' | gnome-keyring-daemon --unlock --daemonize --components=secrets > /tmp/kr.env 2>/dev/null
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

# X11 without a compositor keeps no backing store for an obscured window, so
# `import` returns black where anything overlaps it — the deep-link
# invocation leaves a second window around. Raise it first, or the shot has
# holes in it that look like rendering bugs.
shoot() {
  xdotool windowraise "$WIN" 2>/dev/null
  xdotool windowactivate --sync "$WIN" 2>/dev/null
  sleep 1
  import -window "$WIN" "$OUT/$1.png" 2>/dev/null && echo "shot $1"
}

shoot 01-gate

# Sign in so the note itself is reachable.
xdotool mousemove --window "$WIN" 170 277 click 1; sleep 2
timeout 25 "$BIN" "tougather://auth?code=the-code-from-the-browser" > /tmp/tougather-second.log 2>&1
sleep 6
WIN="$(xdotool search --onlyvisible --name Tougather 2>/dev/null | head -1)"
xdotool windowactivate --sync "$WIN" 2>/dev/null; sleep 1

xdotool type --window "$WIN" --delay 24 "Standup moved to Thursday
Ana brings the figures, Pim is away until the 4th."
sleep 2
shoot 02-writing

# A second note, so the list has something to show.
xdotool mousemove --window "$WIN" 289 22 click 1; sleep 2
xdotool type --window "$WIN" --delay 24 "Groceries
milk, bread, coffee"
sleep 2

# The list.
xdotool mousemove --window "$WIN" 36 22 click 1; sleep 2
shoot 03-list
xdotool mousemove --window "$WIN" 36 22 click 1; sleep 1

# The assistant.
xdotool mousemove --window "$WIN" 251 22 click 1; sleep 2
shoot 04-assistant

xdotool type --window "$WIN" --delay 24 "Analyse this"
sleep 1
xdotool key --clearmodifiers Return
sleep 6
shoot 05-answered

echo "written to $OUT"
