/**
 * First-run conversations. Fixed ids and timestamps, same reasoning as the
 * project seed: the server render and the first client render have to agree.
 */

import { LOCAL_USER } from "../realtime";
import type { Collaborator } from "../types";
import type { Channel, Message } from "./types";

const T = 1767225600000; // 2026-01-01T00:00:00Z

export const AI_USER_ID = "u_assistant";

/**
 * The assistant, as a participant. It appears in member lists and avatar
 * stacks like anyone else, so it needs a real entry — without one it falls
 * through to the "Unknown / ??" placeholder in every avatar stack it's in.
 */
export const AI_PERSON: Collaborator = {
  id: AI_USER_ID,
  name: "Team assistant",
  initials: "AI",
  color: "#3d7dff",
};

/**
 * What a new workspace starts with: one channel, and it is the assistant.
 *
 * The colleagues, the threads and the unread badges that used to be here were
 * a demo of what a team looks like, and every one of them was a person who
 * doesn't exist. Nothing in the product needs them — invite someone and the
 * channels fill up on their own.
 */
export const SEED_CHANNELS: Channel[] = [
  {
    id: "c_ai",
    kind: "ai",
    name: "Team assistant",
    topic: "Knows your files and every project",
    memberIds: [LOCAL_USER.id, AI_USER_ID],
    createdAt: T,
  },
];

export const SEED_MESSAGES: Message[] = [];
