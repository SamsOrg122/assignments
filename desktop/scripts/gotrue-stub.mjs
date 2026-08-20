/**
 * A stand-in for tougather.com and its Supabase, so the desktop app's sign-in
 * can be driven end to end without a real account.
 *
 * It answers the things the app asks for, and records what it was sent so the
 * test can check that the code verifier actually arrived — which is the part
 * of PKCE that would silently "work" if it were broken.
 *
 * It also holds notes, in memory, the way PostgREST would: an upsert on POST,
 * a list on GET. Enough to prove the sync round trip without a database, and
 * deliberately not more — the merge rules are decided on the app's side and
 * are tested there.
 */
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const PORT = Number(process.env.STUB_PORT ?? 4599);
const seen = [];
/** Notes, as the account would hold them. Seeded by the test if it likes. */
const kitFiles = {};
const notes = (() => {
  try { return JSON.parse(process.env.STUB_NOTES ?? "{}"); } catch { return {}; }
})();

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

    if (url.pathname === "/rest/v1/kit_files") {
      if (!req.headers.authorization?.startsWith("Bearer "))
        return say(401, { message: "no token was sent" });
      if (req.method === "POST") {
        let sent = {};
        try { sent = JSON.parse(body || "{}"); } catch { return say(400, { message: "unreadable" }); }
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(sent.id ?? ""))
          return say(400, { message: `an id the column would refuse: ${sent.id}` });
        if ((sent.content_b64 ?? "").length > 12000000)
          return say(400, { message: "over the size cap" });
        kitFiles[sent.id] = sent;
        writeFileSync("/tmp/stub-files.json", JSON.stringify(kitFiles, null, 2));
        return say(201, {});
      }
      return say(405, { message: "not a method this stub knows" });
    }

    if (url.pathname === "/rest/v1/notes") {
      if (!req.headers.authorization?.startsWith("Bearer "))
        return say(401, { message: "no token was sent" });

      if (req.method === "GET")
        return say(200, Object.values(notes));

      if (req.method === "POST") {
        let sent = [];
        try { sent = JSON.parse(body || "[]"); } catch { return say(400, { message: "unreadable" }); }
        if (!Array.isArray(sent)) sent = [sent];
        for (const note of sent) {
          if (!/^[A-Za-z0-9_-]{8,64}$/.test(note.id ?? ""))
            return say(400, { message: `an id the column would refuse: ${note.id}` });
          notes[note.id] = {
            id: note.id,
            body: note.body ?? "",
            updated_at: note.updated_at,
            deleted_at: note.deleted_at ?? null,
          };
        }
        writeFileSync("/tmp/stub-notes.json", JSON.stringify(notes, null, 2));
        return say(201, {});
      }
      return say(405, { message: "not a method this stub knows" });
    }
    say(404, { error: "not a route this stub knows" });
  });
}).listen(PORT, () => console.log("stub on " + PORT));
