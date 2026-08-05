/**
 * First-run conversations. Fixed ids and timestamps, same reasoning as the
 * project seed: the server render and the first client render have to agree.
 */

import { LOCAL_USER } from "../realtime";
import { PEERS } from "../realtime/mock";
import type { Channel, Message } from "./types";

const T = 1767225600000; // 2026-01-01T00:00:00Z
const min = 60_000;

const [mira, dev, ana] = PEERS;

export const AI_USER_ID = "u_assistant";

export const SEED_CHANNELS: Channel[] = [
  {
    id: "c_ai",
    kind: "ai",
    name: "Team assistant",
    topic: "Knows the team, the files and every project",
    memberIds: [LOCAL_USER.id, AI_USER_ID],
    createdAt: T,
  },
  {
    id: "c_general",
    kind: "channel",
    name: "general",
    topic: "Everything that doesn't have a home yet",
    memberIds: [LOCAL_USER.id, mira.id, dev.id, ana.id],
    createdAt: T,
  },
  {
    id: "c_thesis",
    kind: "channel",
    name: "thesis",
    topic: "Attention & Interface Density — writing, method, results",
    memberIds: [LOCAL_USER.id, mira.id, dev.id],
    createdAt: T,
  },
  {
    id: "c_design",
    kind: "channel",
    name: "design",
    topic: "Type, layout, the board",
    memberIds: [LOCAL_USER.id, ana.id],
    createdAt: T,
  },
  {
    id: "dm_mira",
    kind: "dm",
    name: mira.name,
    memberIds: [LOCAL_USER.id, mira.id],
    createdAt: T,
  },
  {
    id: "dm_dev",
    kind: "dm",
    name: dev.name,
    memberIds: [LOCAL_USER.id, dev.id],
    createdAt: T,
  },
];

export const SEED_MESSAGES: Message[] = [
  {
    id: "m_ai_1",
    channelId: "c_ai",
    authorId: AI_USER_ID,
    body: "Ask me about the team, the deadlines, anything in the files, or any project. Say \u201cremember that\u2026\u201d and I will keep it for everyone.",
    at: T - 200 * min,
  },
  {
    id: "m1",
    channelId: "c_thesis",
    authorId: mira.id,
    body: "Pulled the Q3 numbers into the thesis draft. The within-subjects framing holds up.",
    at: T - 180 * min,
  },
  {
    id: "m2",
    channelId: "c_thesis",
    authorId: LOCAL_USER.id,
    body: "Here's where it stands — the conclusion still overreaches the research question.",
    at: T - 174 * min,
    attachments: [{ kind: "project", projectId: "p_thesis" }],
  },
  {
    id: "m3",
    channelId: "c_thesis",
    authorId: dev.id,
    body: "Agreed. Section 4 argues for every product category off two graduate programmes.",
    at: T - 170 * min,
    reactions: { "👍": [mira.id, LOCAL_USER.id] },
  },
  {
    id: "m4",
    channelId: "c_thesis",
    authorId: mira.id,
    body: "Want me to take a pass at narrowing it?",
    at: T - 168 * min,
    parentId: "m3",
  },
  {
    id: "m5",
    channelId: "c_thesis",
    authorId: dev.id,
    body: "Please — keep the finding, drop the generalisation.",
    at: T - 166 * min,
    parentId: "m3",
  },
  {
    id: "m6",
    channelId: "c_design",
    authorId: ana.id,
    body: "The board is where this finally clicked for me. Everything unsorted, then promote what survives.",
    at: T - 90 * min,
    attachments: [{ kind: "project", projectId: "p_board" }],
    reactions: { "🔥": [LOCAL_USER.id] },
  },
  {
    id: "m7",
    channelId: "c_design",
    authorId: LOCAL_USER.id,
    body: "That's the bit no other tool does. Chat, docs and the canvas are the same workspace.",
    at: T - 86 * min,
  },
  {
    id: "m8",
    channelId: "c_general",
    authorId: dev.id,
    body: "Deck for Thursday is drafted.",
    at: T - 40 * min,
    attachments: [{ kind: "project", projectId: "p_pitch" }],
  },
  {
    id: "m9",
    channelId: "c_general",
    authorId: ana.id,
    body: "Nice. I'll take the type pass tomorrow morning.",
    at: T - 36 * min,
  },
  {
    id: "m10",
    channelId: "dm_mira",
    authorId: mira.id,
    body: "Do you want the terminology check run before or after the supervisor meeting?",
    at: T - 20 * min,
  },
  {
    id: "m11",
    channelId: "dm_dev",
    authorId: dev.id,
    body: "Exported the Word version for your supervisor — formatting survived intact.",
    at: T - 12 * min,
  },
];
