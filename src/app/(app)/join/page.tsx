import type { Metadata } from "next";
import { JoinClient } from "@/components/join/JoinClient";

/**
 * Where sign-in comes back to, carrying nothing.
 *
 * This address exists because the alternative was carrying the invite token
 * through the round trip in `?next=/join/t_…`. That `next` does not stay in
 * this app: `AccountForm` hands it to `SingleSignOn`, which hands it to
 * `signInWithProvider`, which puts it in `callbackUrl` and gives the result to
 * Supabase as the OAuth `redirect_to` — so the token was typed into a URL sent
 * to Google or Microsoft, and written to their logs and ours. A path segment
 * in the deployment's own access log is a bounded cost that was argued for
 * (see `[token]/page.tsx`); a token handed to a third party is not the same
 * thing at all.
 *
 * So the token stays in `sessionStorage` — this tab, this origin, gone with
 * the tab — sign-in is sent to `/join` with nothing on it, and `JoinClient`
 * reads the token back out here. `token={null}` is how it is told there is no
 * path segment to prefer, and it is the only place that stash is ever read.
 *
 * It also means `/join` is an address rather than a 404. The sign-in return
 * fell back to bare `/join` whenever the token could not be read, which sent
 * somebody who had just signed in, at the app's request, to a missing page.
 */
export const metadata: Metadata = {
  title: "Join",
  description: "Follow a link into a team, or a link from a person.",
  // Nothing here is worth indexing, and a crawler that landed on it would
  // find nothing anyway — the stash belongs to one tab.
  robots: { index: false, follow: false },
  // The same policy as the link's own page, so the two behave alike on the
  // way out.
  referrer: "no-referrer",
};

export default function JoinResumePage() {
  return <JoinClient token={null} />;
}
