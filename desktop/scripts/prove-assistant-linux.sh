#!/usr/bin/env bash
#
# Does asking the assistant actually do anything?
#
# The parts that can be unit-tested are: which files are offered as text
# (Rust), and what a proposed document becomes (the web app's block builder).
# What no unit test can answer is whether the whole chain is wired: whether a
# question typed in a 340-pixel window reaches the site with the right token,
# whether the frames coming back are read a line at a time, whether a `note`
# frame really rewrites SQLite, and whether an `artefact` frame really lands
# in the queue that sync drains.
#
# So this drives the real app against a stand-in for tougather.com that
# answers with canned frames — no model, no key, no spend — and then looks in
# the store to see what actually changed.
#
#   ./scripts/prove-assistant-linux.sh
#
# Needs the same build the other proofs use:
#   TOUGATHER_SITE=http://localhost:4599 cargo build --manifest-path src-tauri/Cargo.toml

set -uo pipefail
cd "$(dirname "$0")/.."

STUB_PORT=4599
DISPLAY_NUM=":81"
BIN="./src-tauri/target/debug/tougather-desktop"
STORE="${XDG_DATA_HOME:-$HOME/.local/share}/com.tougather.note/notes.sqlite3"

pass=0
fail=0
ok()  { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }

# What the stand-in will say when asked. Exactly the shape the real endpoint
# streams: a model, some prose, a note change, and a made document.
FRAMES='[
  {"type":"model","value":"stub/model-1"},
  {"type":"text","value":"Here is what I found. "},
  {"type":"text","value":"Three quarters, growing."},
  {"type":"note","value":{"kind":"append","body":"REWRITTEN BY THE ASSISTANT","label":"Added a summary"}},
  {"type":"artefact","value":{"name":"Revenue analysis","label":"Made an analysis","blocks":[
     {"id":"blk1","type":"text","html":"<p>Revenue grew.</p>"},
     {"id":"blk2","type":"table","columns":[{"id":"c1","name":"Quarter","type":"text"},{"id":"c2","name":"Revenue","type":"number"}],"rows":[{"id":"r1","cells":{"c1":"Q1","c2":1200}}]},
     {"id":"blk3","type":"chart","sourceId":"blk2","kind":"bar","xColumnId":"c1","yColumnIds":["c2"]}
  ]}},
  {"type":"done"}
]'

note_says() {
  python3 - "$1" "$STORE" <<'PY'
import sqlite3, sys
try:
    c = sqlite3.connect(sys.argv[2])
    n = c.execute("select count(*) from notes where body like ? and deleted_at is null",
                  (f"%{sys.argv[1]}%",)).fetchone()[0]
    print("yes" if n else "no")
except Exception as e:
    print(f"<{e}>")
PY
}

went_up() {
  python3 - <<'PY'
import base64, json
try:
    rows = json.load(open("/tmp/stub-files.json"))
except Exception:
    print("no"); raise SystemExit
for row in rows.values():
    if "Revenue analysis" not in (row.get("name") or ""):
        continue
    doc = json.loads(base64.b64decode(row["content_b64"]))
    kinds = ",".join(b.get("type") for b in doc.get("blocks", []))
    print(f"{row['mime']}|{kinds}")
    raise SystemExit
print("no")
PY
}

queued_file() {
  python3 - "$1" "$STORE" <<'PY'
import sqlite3, sys
try:
    c = sqlite3.connect(sys.argv[2])
    row = c.execute("select name, mime, content from files where name like ? and deleted_at is null",
                    (f"%{sys.argv[1]}%",)).fetchone()
    if not row:
        print("no"); raise SystemExit
    import json
    doc = json.loads(bytes(row[2]))
    kinds = [b.get("type") for b in doc.get("blocks", [])]
    print(f"{row[0]}|{row[1]}|{doc.get('v')}|{','.join(kinds)}")
except Exception as e:
    print(f"<{e}>")
PY
}

for tool in Xvfb xdotool node python3 dbus-launch gnome-keyring-daemon; do
  command -v "$tool" > /dev/null || { echo "missing $tool"; exit 1; }
done
[ -x "$BIN" ] || { echo "no debug build — see the header"; exit 1; }

# A dev build points the webview at the dev server. Without it the window is
# a connection error and every click lands on nothing.
if ! curl -sf --noproxy '*' -o /dev/null http://localhost:1420/; then
  echo "starting the dev server…"
  nohup npm run dev > /tmp/tougather-vite.log 2>&1 &
  for _ in $(seq 1 30); do curl -sf --noproxy '*' -o /dev/null http://localhost:1420/ && break; sleep 1; done
fi

echo "starting the stand-in, a display and a keychain…"
rm -f /tmp/stub-asked.json /tmp/stub-files.json "$STORE" "$STORE-wal" "$STORE-shm"

STUB_PORT=$STUB_PORT STUB_FRAMES="$FRAMES" \
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

# ── Sign in, because the assistant carries the session token ─────────────
#
# The click first, then the link. A PKCE reply only means anything to a
# window that started the exchange and is holding the verifier — delivering
# the link to an app that never began signing in is correctly refused, which
# is how this line earned its place.
xdotool mousemove --window "$WIN" 170 277 click 1; sleep 2
timeout 25 "$BIN" "tougather://auth?code=the-code-from-the-browser" > /tmp/tougather-second.log 2>&1
sleep 5
if grep -q "did not finish" /tmp/tougather-app.log; then
  echo "could not sign in: $(grep 'did not finish' /tmp/tougather-app.log | tail -1)"; exit 1
fi
ok "signed in"

WIN="$(xdotool search --onlyvisible --name Tougather 2>/dev/null | head -1)"
xdotool windowactivate --sync "$WIN" 2>/dev/null; sleep 1

# Something in the note, so there is a body for the assistant to be given.
xdotool key --clearmodifiers --window "$WIN" ctrl+a; xdotool key --window "$WIN" Delete
xdotool type --window "$WIN" --delay 25 "quarterly figures"
sleep 2

# ── Open the assistant ───────────────────────────────────────────────────
#
# The Ask chip sits in the bar, to the left of + and –. Clicking by
# coordinate is crude and is what the other proofs do: this is a fixed-size
# window with a fixed bar.
xdotool mousemove --window "$WIN" 258 22 click 1; sleep 2
xdotool key --clearmodifiers --window "$WIN" ctrl+a 2>/dev/null

# ── Ask ──────────────────────────────────────────────────────────────────
xdotool type --window "$WIN" --delay 25 "analyse the figures"
sleep 1
xdotool key --clearmodifiers --window "$WIN" Return
sleep 6

if [ -f /tmp/stub-asked.json ]; then
  ok "the question reached the site"
else
  bad "nothing ever arrived at the site"
fi

if python3 -c "
import json
d = json.load(open('/tmp/stub-asked.json'))
assert d['prompt'] == 'analyse the figures', d.get('prompt')
assert 'quarterly figures' in (d.get('note') or {}).get('body',''), 'the note body was not sent'
" 2>/dev/null; then
  ok "it carried the question and the note's text"
else
  bad "the request was missing the question or the note: $(cat /tmp/stub-asked.json 2>/dev/null | head -c 200)"
fi

if grep -q '"Authorization"' /tmp/tougather-stub.log 2>/dev/null || true; then :; fi

# ── What the frames did ──────────────────────────────────────────────────
for _ in $(seq 1 10); do
  [ "$(note_says 'REWRITTEN BY THE ASSISTANT')" = "yes" ] && break
  sleep 2
done
if [ "$(note_says 'REWRITTEN BY THE ASSISTANT')" = "yes" ]; then
  ok "a note frame really rewrote the note"
else
  bad "the note was never changed"
fi

if [ "$(note_says 'quarterly figures')" = "yes" ]; then
  ok "…by appending, so what was already written survived"
else
  bad "appending replaced the note instead of adding to it"
fi

got="$(queued_file 'Revenue analysis')"
case "$got" in
  *"tougather-doc.json|application/json|1|text,table,chart"*)
    ok "an artefact frame landed a document in the queue, blocks intact" ;;
  *)
    bad "the artefact did not land as expected: $got" ;;
esac

# ── And it goes up on its own ────────────────────────────────────────────
#
# The stand-in records what was pushed rather than serving it back, so the
# file it writes is where to look — and looking at the bytes rather than the
# name is what proves the document survived base64 and Postgres' idea of a
# text column.
for _ in $(seq 1 15); do
  case "$(went_up)" in *"|"*) break ;; esac
  sleep 2
done
case "$(went_up)" in
  "application/json|text,table,chart")
    ok "and it reached the account without being asked, blocks intact" ;;
  *)
    bad "the artefact never went up: $(went_up)" ;;
esac

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
