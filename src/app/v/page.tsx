import type { Metadata } from "next";
import { ViewerClient } from "./ViewerClient";

/**
 * A shared project.
 *
 * Outside both route groups on purpose: a link opened from a chat message
 * should show the document, not the recipient's own sidebar and library. The
 * payload lives in the URL fragment, which never reaches a server — so this
 * page is static, and everything real happens on the client.
 */
export const metadata: Metadata = {
  title: "Shared view",
  description: "A project shared from Tougather, read-only.",
  // Nothing to index: the page is empty without the fragment it was sent with.
  robots: { index: false, follow: false },
};

export default function ViewPage() {
  return <ViewerClient />;
}
