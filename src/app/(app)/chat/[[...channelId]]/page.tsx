import { ChatClient } from "@/components/chat/ChatClient";

/**
 * Chat, as a route.
 *
 * The page itself is four lines because everything it does happens in the
 * reader's browser — the conversation, the rooms rail, the thread panel. What
 * has to live *here* rather than in `ChatClient` is `generateStaticParams`,
 * and a file marked `"use client"` is not allowed to export it. Hence the
 * split, which is the same one `join/[token]` already uses.
 *
 * ── WHY THIS ROUTE WRITES EXACTLY ONE FILE ─────────────────────────────
 * When the app is packed into the desktop browser it is built with
 * `output: export`: a file per path and no server to answer for the rest. The
 * channels live in the reader's own storage, so there is no list of them at
 * build time and there never will be. So the export writes the bare `/chat`
 * as `chat.html`, and `browser/lib/app-schema.js` answers every `/chat/<id>`
 * with that same file — the page reads the id out of the address with
 * `useParams`, exactly as it does on the web.
 *
 * On the website this costs one prerendered shell and changes nothing else:
 * `dynamicParams` stays on, so a real channel still renders on request.
 */
export function generateStaticParams() {
  return [{ channelId: [] as string[] }];
}

export default function ChatPage() {
  return <ChatClient />;
}
