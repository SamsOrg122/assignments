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
 * is the form that survives being pasted, bookmarked and reached with the
 * back button, which a fragment does not.
 *
 * What is done about the rest of it. This page is `noindex, nofollow` and
 * sets `referrer: no-referrer`, so nothing this page links to is told the
 * address it was reached from. The row stores only the token's SHA-256, so
 * the logs and the database never agree on a usable value. Every link carries
 * an expiry and can be revoked the moment it is pressed.
 *
 * And the token does not travel through sign-in. It used to: the client sent
 * somebody to `/signin?next=/join/t_…`, and `next` is not a private value —
 * it ends up inside the OAuth `redirect_to` handed to Google or Microsoft, so
 * the invite left this deployment entirely. It is now held in that tab's
 * `sessionStorage`, sign-in is sent to a bare `/join`, and the resume page
 * next to this one hands it back. The token is in the request line of this
 * one address and nowhere else.
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
  // anywhere else — so no link this page offers carries the token in its
  // request. Nothing else on the way out carries it either: see the note
  // above on the sign-in round trip.
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
