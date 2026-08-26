import type { Metadata } from "next";
import { JoinClient } from "@/components/join/JoinClient";

/**
 * Where an invite link lands.
 *
 * The token is a path segment, which is the one thing about this page worth
 * arguing over. Compare `src/app/v`: a shared project is carried in the URL
 * *fragment* precisely because a fragment is never sent to a server, so the
 * document exists only in the two browsers at either end. Here the token is
 * in the request line, and everything that follows from that is true — it is
 * written to the access log of whatever serves this app and of every proxy
 * and CDN in between, it is fetched verbatim by every chat client that
 * unfurls the link, and it would ride along in the `Referer` of anything this
 * page links out to.
 *
 * It is accepted, rather than worked around, because a token in a URL is not
 * by itself permission. Nothing here happens on load: accepting is an
 * explicit press, by somebody signed in with a real account, and the database
 * decides — `accept_workspace_invite` and `accept_connection` check
 * `auth.users` themselves. So a link preview, a mail scanner or a crawler
 * fetching this URL joins nothing and spends no use of the link. And a path
 * survives the round trip a fragment does not: somebody signed out is sent to
 * `/signin?next=…` and comes back to the same address, with the link intact,
 * which is the whole difference between "sign in first" and "lose the invite".
 *
 * What is done about the rest of it: this page is `noindex, nofollow` and
 * sets `referrer: no-referrer`, so the token does not leak sideways out of
 * the browser; the row stores only the token's SHA-256, so the logs and the
 * database never agree on a usable value; and every link carries an expiry
 * and can be revoked the moment it is pressed.
 *
 * What remains true, and should be said plainly rather than designed around:
 * anybody who can read the server's access logs *and* has a real account of
 * their own can follow a link they were never sent, for as long as it lives.
 * That is the price of the path, and it is why link lifetimes are short and
 * why revoking works.
 */
export const metadata: Metadata = {
  title: "Join",
  description: "Follow a link into a team, or a link from a person.",
  // The URL is the secret. Nothing here is worth indexing and an indexed
  // invite is a public one.
  robots: { index: false, follow: false },
  // Kills the `Referer` on the way out — to /signin, to /team, and to
  // anywhere else — so the token stops at this page.
  referrer: "no-referrer",
};

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <JoinClient token={token} />;
}
