/**
 * A stand-in for tougather.com and its Supabase, so the desktop app's sign-in
 * can be driven end to end without a real account.
 *
 * It answers exactly the three things the app asks for, and records what it
 * was sent so the test can check that the code verifier actually arrived —
 * which is the part of PKCE that would silently "work" if it were broken.
 */
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const PORT = Number(process.env.STUB_PORT ?? 4599);
const seen = [];

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const say = (code, payload) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    if (url.pathname === "/api/config")
      return say(200, {
        supabase: { url: `http://localhost:${PORT}`, anonKey: "stub-anon-key" },
        auth: { providers: ["google"], ssoDomains: [] },
      });

    if (url.pathname === "/auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      let sent = {};
      try { sent = JSON.parse(body || "{}"); } catch { /* recorded as empty */ }
      seen.push({ grant, sent, apikey: req.headers.apikey });
      writeFileSync("/tmp/stub-seen.json", JSON.stringify(seen, null, 2));

      if (grant === "pkce") {
        if (!sent.code_verifier)
          return say(400, { error_description: "no code_verifier was sent" });
        if (sent.auth_code !== "the-code-from-the-browser")
          return say(400, { error_description: "wrong authorization code" });
      }
      if (grant === "refresh_token" && sent.refresh_token !== "stub-refresh-token")
        return say(400, { error_description: "unknown refresh token" });

      return say(200, {
        access_token: "stub-access-token",
        refresh_token: "stub-refresh-token",
        expires_in: 3600,
        user: { id: "00000000-0000-0000-0000-000000000001", email: "you@example.com" },
      });
    }

    if (url.pathname === "/auth/v1/logout") return say(204, {});
    say(404, { error: "not a route this stub knows" });
  });
}).listen(PORT, () => console.log("stub on " + PORT));
