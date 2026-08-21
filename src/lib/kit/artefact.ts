"use client";

/**
 * A document the note's assistant made, becoming a real project.
 *
 * The desktop writes it as a file rather than as a project, and that is
 * deliberate. A `projects` row needs a workspace id; the note app has never
 * resolved one and porting that logic to Rust would risk a duplicate
 * workspace per machine — a data-integrity bug with no clean repair. Files
 * need no workspace, the note app already writes them, and the web app
 * already knows how to make a project. So the artefact travels as bytes and
 * becomes a document here, where the workspace logic has always lived.
 *
 * Everything inside is untrusted, exactly like a share link's payload: it
 * was assembled by a model, serialised by another process and carried
 * through a database. It goes through the same validator a shared project
 * does before a single block is adopted.
 */

import { uid } from "../factories";
import { useProjects } from "../store";
import { currentWorld } from "../scope";
import { validateSharedProject } from "../share";
import type { Block } from "../types";
import { accountFileData, type AccountFile } from "./account";

/** What the desktop names a document it made. */
export const ARTEFACT_SUFFIX = ".tougather-doc.json";

/**
 * Whether this file is one.
 *
 * The suffix rather than the mime: a JSON file somebody dropped on the note
 * is also `application/json`, and offering to turn their `package.json` into
 * a presentation would be a nonsense.
 */
export const isArtefact = (file: { name: string; mime: string }): boolean =>
  file.name.endsWith(ARTEFACT_SUFFIX);

/** The title, with the machinery taken off the end. */
export const artefactName = (file: { name: string }): string =>
  file.name.slice(0, -ARTEFACT_SUFFIX.length) || "Untitled";

/**
 * Read the bytes and reduce them to something safe to adopt.
 *
 * Separated from the store work so the rules — which versions are
 * understood, what happens to a block nobody recognises — can be tested
 * without a project store or a network. The blocks are validated by
 * round-tripping them through the share validator: it is the one function in
 * this codebase whose whole job is reducing an untrusted document to
 * something safe, and a second one would mean two sets of rules waiting to
 * disagree.
 */
export function readArtefact(
  raw: string,
  fallbackName: string,
): { name: string; blocks: Block[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That document couldn't be read.");
  }

  const shape = parsed as { v?: unknown; name?: unknown; blocks?: unknown };
  if (shape.v !== 1)
    throw new Error(
      "That document was made by a newer version of the note. Update the app.",
    );

  const name =
    typeof shape.name === "string" && shape.name.trim()
      ? shape.name.trim()
      : fallbackName;

  const safe = validateSharedProject({
    id: uid(),
    name,
    kind: "doc",
    glyph: "◇",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    blocks: Array.isArray(shape.blocks) ? shape.blocks : [],
    board: [],
  });
  if (!safe || safe.blocks.length === 0)
    throw new Error("There was nothing in that document that could be opened.");

  return { name, blocks: safe.blocks as Block[] };
}

/** Turn one into a project, and hand back its id. */
export async function adoptArtefact(file: AccountFile): Promise<string> {
  const data = await accountFileData(file);
  const comma = data.indexOf(",");
  if (comma < 0) throw new Error("That document couldn't be read.");

  let decoded: string;
  try {
    decoded = new TextDecoder().decode(
      Uint8Array.from(atob(data.slice(comma + 1)), (c) => c.charCodeAt(0)),
    );
  } catch {
    throw new Error("That document couldn't be read.");
  }

  const safe = readArtefact(decoded, artefactName(file));
  const name = safe.name;

  const store = useProjects.getState();
  const id = store.addProject("doc", name);

  // A new project ships with a starter block. Insert first and remove after,
  // so the project is never momentarily empty — the same order the editor's
  // own create-project path uses.
  const project = useProjects.getState().projects.find((p) => p.id === id);
  const starters = (project?.blocks ?? []).map((b) => b.id);
  for (const block of safe.blocks as Block[]) store.insertBlock(id, block);
  for (const starter of starters) store.removeBlock(id, starter);

  useProjects.setState((s) => ({
    projects: s.projects.map((p) =>
      p.id === id ? { ...p, scope: currentWorld() } : p,
    ),
  }));

  return id;
}
