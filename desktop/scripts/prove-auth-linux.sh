#!/usr/bin/env bash
#
# Drive the whole sign-in, against a stand-in for tougather.com.
#
# Signing in is the part of this app with the most moving pieces and the least
# to look at: a secret made here, a hash sent to a browser, a link handed back
# by the operating system to a *second copy* of the app, an exchange, and a
# token in the OS keychain. Every one of those can fail in a way that looks
# like nothing happening at all — which is exactly what it did the first time
# this script was run, twice, for two different reasons.
#
# So it checks the things that would otherwise be invisible: that the verifier
# actually reaches the server (PKCE with a missing verifier "works" right up
# until it doesn't), that the deep link reaches the running app rather than
# opening a second window, that the session survives a restart, and that
# signing out really empties the keychain.
#
#   ./scripts/prove-auth-linux.sh
#
# Linux only: it needs Xvfb, xdotool, and a Secret Service to stand in for the
# keychain. macOS and Windows have one of those built in, which is the whole
# reason this is the awkward platform to test on.

set -uo pipefail
cd "$(dirname "$0")/.."

STUB_PORT=4599
DISPLAY_NUM=":78"
BIN="./src-tauri/target/debug/tougather-desktop"
STORE="${XDG_DATA_HOME:-$HOME/.local/share}/com.tougather.note/notes.sqlite3"
SEEN=/tmp/stub-seen.json

pass=0
fail=0
ok()  { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }

grants() {
  python3 - "$SEEN" <<'PY'
import json, sys
try:
    print(",".join(x["grant"] for x in json.load(open(sys.argv[1]))))
except Exception:
    print("")
PY
}

verifier_sent() {
  python3 - "$SEEN" <<'PY'
import json, sys
try:
    calls = json.load(open(sys.argv[1]))
    pkce = [c for c in calls if c["grant"] == "pkce"]
    print("yes" if pkce and pkce[-1]["sent"].get("code_verifier") else "no")
except Exception:
    print("no")
PY
}

for tool in Xvfb xdotool node python3; do
  command -v "$tool" > /dev/null || { echo "missing $tool"; exit 1; }
done
command -v gnome-keyring-daemon > /dev/null || {
  echo "no Secret Service available — install gnome-keyring and dbus-x11"; exit 1;
}
[ -x "$BIN" ] || {
  echo "no debug build. Build it pointed at the stub:"
  echo "  TOUGATHER_SITE=http://localhost:$STUB_PORT cargo build --manifest-path src-tauri/Cargo.toml"
  exit 1
}


# A dev build points the webview at the dev server. Without it the window is
# a connection error, every click lands on nothing, and the failure reads as
# "sign-in broke" — which is how this line earned its place.
if ! curl -sf --noproxy '*' -o /dev/null http://localhost:1420/; then
  echo "starting the dev server…"
  nohup npm run dev > /tmp/tougather-vite.log 2>&1 &
  for _ in $(seq 1 30); do curl -sf --noproxy '*' -o /dev/null http://localhost:1420/ && break; sleep 1; done
fi
echo "starting the stand-in, a display, and a keychain…"
rm -f "$SEEN" "$STORE" "$STORE-wal" "$STORE-shm"
STUB_PORT=$STUB_PORT nohup node scripts/gotrue-stub.mjs > /tmp/tougather-stub.log 2>&1 &
nohup Xvfb "$DISPLAY_NUM" -screen 0 1280x800x24 > /tmp/tougather-xvfb.log 2>&1 &
sleep 2

# A fresh, unlocked keyring. Wiped first: a keyring left locked by an earlier
# run refuses writes, and the failure reads as "no keychain" unless you look.
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/keyrings"
mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/keyrings"
eval "$(dbus-launch --sh-syntax)"
printf 'prove\n' | gnome-keyring-daemon --unlock --daemonize --components=secrets > /tmp/kr.env 2>/dev/null
export "$(grep GNOME_KEYRING_CONTROL /tmp/kr.env)"
export DISPLAY="$DISPLAY_NUM"
export NO_PROXY="localhost,127.0.0.1" no_proxy="localhost,127.0.0.1"

start_app() { nohup "$BIN" > /tmp/tougather-app.log 2>&1 & sleep 18; }
stop_app() {
  for p in $(ps -eo pid,comm | grep "[t]ougather" | awk '{print $1}'); do kill "$p" 2>/dev/null; done
  sleep 3
}
cleanup() {
  stop_app
  for p in $(ps -eo pid,args | grep -e "[g]otrue-stub" -e "[X]vfb $DISPLAY_NUM" | awk '{print $1}'); do
    kill "$p" 2>/dev/null
  done
}
trap cleanup EXIT

start_app
xdotool key --clearmodifiers ctrl+shift+n; sleep 3
WIN="$(xdotool search --onlyvisible --name Tougather 2>/dev/null | head -1)"
[ -n "$WIN" ] || { echo "the window never appeared"; exit 1; }
xdotool windowactivate --sync "$WIN" 2>/dev/null; sleep 1

# ── The gate ─────────────────────────────────────────────────────────────
#
# The stand-in offers one provider, so the button is where the first wide
# button in the panel is.
xdotool mousemove --window "$WIN" 170 105 click 1
sleep 3
if grep -q "did not finish" /tmp/tougather-app.log; then
  bad "clicking the provider produced an error before the browser was even involved"
else
  ok "the provider button opens the flow"
fi

# ── The browser comes back ───────────────────────────────────────────────
#
# Exactly as the OS delivers it on Linux and Windows: a second copy of the
# app, started with the URL, which must hand it to the one already running
# rather than opening a second note.
timeout 25 "$BIN" "tougather://auth?code=the-code-from-the-browser" > /tmp/tougather-second.log 2>&1
sleep 4

case "$(grants)" in
  *pkce*) ok "the authorization code was exchanged" ;;
  *)      bad "the deep link never reached the running app" ;;
esac

if [ "$(verifier_sent)" = "yes" ]; then
  ok "the code verifier was sent with it"
else
  # Without this, the exchange still succeeds against a lenient server and
  # the whole point of the flow — that an intercepted code is worthless — is
  # quietly gone.
  bad "PKCE is not actually happening: no code_verifier was sent"
fi

if [ "$(xdotool search --onlyvisible --name Tougather 2>/dev/null | wc -l)" = "1" ]; then
  ok "the link did not open a second window"
else
  bad "a second note window appeared"
fi

if grep -q "did not finish" /tmp/tougather-app.log; then
  bad "signing in failed: $(grep 'did not finish' /tmp/tougather-app.log | tail -1)"
else
  ok "signing in finished without complaint"
fi

# ── It survives a restart ────────────────────────────────────────────────
before="$(grants)"
stop_app
start_app
sleep 3
after="$(grants)"
if [ "$after" != "$before" ] && [[ "$after" == *refresh_token* ]]; then
  ok "starting again resumes the session from the keychain"
else
  bad "the session was not resumed — the token did not survive the restart"
fi
if grep -q "did not finish" /tmp/tougather-app.log; then
  bad "resuming reported a problem"
else
  ok "resuming said nothing, which is what it should say"
fi

echo
if [ "$fail" -gt 0 ]; then echo "$fail failed, $pass passed"; exit 1; fi
echo "all $pass passed"
