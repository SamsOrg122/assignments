/**
 * First-run workspace. Fixed ids and timestamps, same reasoning as elsewhere:
 * the server render and the first client render must agree.
 */

import { LOCAL_USER } from "../realtime";
import { PEERS } from "../realtime/mock";
import type { KnowledgeEntry, TeamFile, Workspace } from "./types";

const T = 1767225600000; // 2026-01-01T00:00:00Z
const [mira, dev, ana] = PEERS;

export const SEED_WORKSPACE: Workspace = {
  id: "w_hci",
  name: "HCI — Interface Density",
  kind: "school",
  context: {
    organisation: "TU Delft",
    unit: "MSc Human–Computer Interaction",
    subject: "Thesis project: attention and interface density",
    notes:
      "Supervisor meetings are fortnightly on Tuesdays. Final submission is 12 June. The department requires APA 7.",
  },
  members: [
    {
      id: LOCAL_USER.id,
      role: "owner",
      joinedAt: T,
      title: "MSc candidate",
      email: "you@student.tudelft.nl",
      about: "Writing the thesis; runs the studies and the analysis.",
    },
    {
      id: mira.id,
      role: "admin",
      joinedAt: T,
      title: "Supervisor",
      email: "m.chen@tudelft.nl",
      about:
        "First supervisor. Decides scope and sign-off. Prefers claims narrowed to the sampled population.",
    },
    {
      id: dev.id,
      role: "editor",
      joinedAt: T,
      title: "Second reader",
      email: "d.raman@tudelft.nl",
      about: "Reviews method and statistics. Handles the ethics submission.",
    },
    {
      id: ana.id,
      role: "commenter",
      joinedAt: T,
      title: "Design lead",
      email: "a.silva@tudelft.nl",
      about: "Advises on the prototype and the deck. Not an author.",
    },
  ],
  invites: [
    {
      id: "inv_1",
      email: "j.okafor@tudelft.nl",
      role: "commenter",
      invitedBy: LOCAL_USER.id,
      createdAt: T,
      status: "pending",
      token: "inv_seed_okafor",
    },
  ],
};

export const SEED_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "k_apa",
    kind: "convention",
    subject: "Citation style",
    body: "The department requires APA 7. Headings use sentence case, not title case.",
    source: "manual",
    createdAt: T,
    confirmed: true,
    addedBy: LOCAL_USER.id,
  },
  {
    id: "k_term",
    kind: "term",
    subject: "participant",
    body: "Use 'participant' throughout, never 'respondent' or 'subject'. Mira flagged this in the first draft.",
    source: "manual",
    createdAt: T,
    confirmed: true,
    addedBy: mira.id,
  },
  {
    id: "k_deadline",
    kind: "deadline",
    subject: "Final submission",
    body: "12 June. Full draft to Mira two weeks earlier, so 29 May.",
    source: "manual",
    createdAt: T,
    confirmed: true,
    addedBy: LOCAL_USER.id,
  },
  {
    id: "k_scope",
    kind: "convention",
    subject: "Claim scope",
    body: "Conclusions stay within the sampled population — two graduate programmes. Do not generalise to all product categories.",
    source: "chat",
    sourceRef: "m3",
    createdAt: T,
    confirmed: true,
    addedBy: dev.id,
  },
];

export const SEED_FILES: TeamFile[] = [
  {
    id: "f_brief",
    name: "thesis-brief.md",
    mime: "text/markdown",
    size: 742,
    status: "ready",
    uploadedBy: mira.id,
    at: T,
    text: `# Thesis brief — Attention & Interface Density

Research question: does reducing visible interface density increase sustained
attention during long-form writing?

Scope: within-subjects, 24 participants drawn from two graduate programmes.
Counterbalance the order of conditions.

Deliverables: thesis (max 15,000 words), a defence deck, and the prototype.
Assessment weights writing 60%, method 25%, defence 15%.

Supervisor: Mira Chen. Second reader: Dev Raman.`,
  },
];
