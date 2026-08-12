"use client";

/**
 * Templates the organisation keeps.
 *
 * The built-in templates in `project-templates.ts` are shapes we guessed at.
 * These are the ones a place actually uses: the departmental report with the
 * approvals table already in it, the lab notebook with the safety section, the
 * deck with the disclaimer slide that legal insists on. Nobody outside that
 * organisation would want them, which is exactly why they cannot ship in the
 * product.
 *
 * Two tiers, and the difference is visible everywhere they appear:
 *
 *   - **Yours.** Saved from any project, kept in this browser. Works with no
 *     account, no database, nothing switched on — and stays on this machine,
 *     which the interface says rather than implying otherwise.
 *   - **The workspace's.** Published to the database, so everyone starts from
 *     the same shape. Needs a database and an admin, because a template every
 *     colleague sees is not something one person should be able to change on a
 *     whim.
 *
 * A template is a document with its identity removed: blocks kept, name and
 * dates and folder dropped. Making one from a project is a copy, so editing
 * the project afterwards leaves the template alone — the opposite would be a
 * nasty surprise the first time somebody rewrote a heading.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useSyncExternalStore } from "react";
import { versioned } from "../persistence/versioned";
import { uid } from "../factories";
import { supabase } from "../db/client";
import { currentWorkspaceId } from "../db/supabase";
import { explainAuthErrorLine } from "../auth/errors";
import { record } from "../admin";
import type { Block, Project, ProjectKind } from "../types";

export interface OrgTemplate {
  id: string;
  name: string;
  kind: ProjectKind;
  /** One line about what it is for. Optional, because most people won't. */
  blurb?: string;
  blocks: Block[];
  createdAt: number;
  updatedAt: number;
  /** Where it came from: this browser, or the workspace everyone shares. */
  scope: "mine" | "workspace";
  /** Who published it, for the workspace ones. */
  createdBy?: string | null;
}

/* ── Making one, and using one ──────────────────────────── */

/**
 * A template from a project.
 *
 * Deep-copied through JSON. Blocks hold nested objects — slides, rows,
 * columns, geometry — and a shallow copy would leave the template sharing
 * those with the live project, so editing the document would silently edit the
 * template. Structured cloning is what makes "a copy" true.
 */
export function templateFromProject(
  project: Project,
  name?: string,
  blurb?: string,
): OrgTemplate {
  const now = Date.now();
  return {
    id: uid(),
    name: (name?.trim() || project.name).slice(0, 120),
    kind: project.kind,
    blurb: blurb?.trim() ? blurb.trim().slice(0, 300) : undefined,
    blocks: JSON.parse(JSON.stringify(project.blocks ?? [])) as Block[],
    createdAt: now,
    updatedAt: now,
    scope: "mine",
  };
}

/**
 * Blocks for a new project, with fresh ids.
 *
 * Same rebinding as duplicating a project: a chart carries the id of the table
 * it reads, and reusing the template's ids would leave two documents pointing
 * at one table — or, worse, at a table that no longer exists.
 */
export function instantiate(template: OrgTemplate): Block[] {
  const idMap = new Map<string, string>();
  const copies = (JSON.parse(JSON.stringify(template.blocks)) as Block[]).map(
    (block) => {
      const id = uid();
      idMap.set(block.id, id);
      return { ...block, id } as Block;
    },
  );
  return copies.map((block) =>
    block.type === "chart" && block.sourceId
      ? { ...block, sourceId: idMap.get(block.sourceId) ?? null }
      : block,
  );
}

/** What the picker shows as a preview: the headings, or the slide titles. */
export function outlineOf(template: OrgTemplate): string[] {
  const out: string[] = [];
  for (const block of template.blocks) {
    if (block.type === "text")
      for (const match of block.html.matchAll(/<h[12][^>]*>(.*?)<\/h[12]>/gi))
        out.push(match[1].replace(/<[^>]+>/g, "").trim());
    else if (block.type === "slides")
      for (const slide of block.slides) out.push(slide.title);
    else if (block.type === "table") out.push(block.title ?? "Table");
  }
  return out.filter(Boolean).slice(0, 6);
}

/* ── The store ──────────────────────────────────────────── */

interface TemplateState {
  /** Saved here, by this person. */
  mine: OrgTemplate[];
  /**
   * Pulled from the workspace. Persisted so they are there offline and on the
   * next load before the fetch answers — a template gallery that is empty for
   * a second every time is one people stop trusting.
   */
  workspace: OrgTemplate[];
  save: (template: OrgTemplate) => void;
  rename: (id: string, name: string) => void;
  forget: (id: string) => void;
  setWorkspace: (templates: OrgTemplate[]) => void;
}

export const useTemplates = create<TemplateState>()(
  persist(
    (set) => ({
      mine: [],
      workspace: [],

      save: (template) =>
        set((s) => ({ mine: [template, ...s.mine.filter((t) => t.id !== template.id)] })),

      rename: (id, name) =>
        set((s) => ({
          mine: s.mine.map((t) =>
            t.id === id
              ? { ...t, name: name.trim().slice(0, 120) || t.name, updatedAt: Date.now() }
              : t,
          ),
        })),

      forget: (id) => set((s) => ({ mine: s.mine.filter((t) => t.id !== id) })),

      setWorkspace: (templates) => set({ workspace: templates }),
    }),
    {
      ...versioned<TemplateState>("assignments:templates:v1", []),
      partialize: (s) => ({ mine: s.mine, workspace: s.workspace }),
      skipHydration: true,
    },
  ),
);

let rehydrateRequested = false;

export function useTemplatesHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (cb) => useTemplates.persist.onFinishHydration(cb),
    () => useTemplates.persist.hasHydrated(),
    () => false,
  );
  useEffect(() => {
    if (rehydrateRequested) return;
    rehydrateRequested = true;
    void useTemplates.persist.rehydrate();
  }, []);
  return hydrated;
}

/* ── Publishing ─────────────────────────────────────────── */

export type PublishResult =
  | { ok: true }
  | { ok: false; reason: string; setup?: boolean };

const NO_DATABASE: PublishResult = {
  ok: false,
  setup: true,
  reason:
    "Sharing a template with everyone needs a database — there is no shared workspace to put it in yet. It stays saved in this browser.",
};

interface TemplateRow {
  id: string;
  name: string;
  kind: ProjectKind;
  blurb: string | null;
  blocks: Block[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const rowToTemplate = (row: TemplateRow): OrgTemplate => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  blurb: row.blurb ?? undefined,
  blocks: Array.isArray(row.blocks) ? row.blocks : [],
  createdAt: Date.parse(row.created_at) || 0,
  updatedAt: Date.parse(row.updated_at) || 0,
  scope: "workspace",
  createdBy: row.created_by,
});

/** Everyone in the workspace gets this one. Admins only — the policy says so. */
export async function publish(template: OrgTemplate): Promise<PublishResult> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const workspace = await currentWorkspaceId();
    if (!workspace) return NO_DATABASE;
    const { data: session } = await client.auth.getSession();
    const { error } = await client.from("workspace_templates").insert({
      workspace_id: workspace,
      created_by: session.session?.user.id ?? null,
      name: template.name,
      kind: template.kind,
      blurb: template.blurb ?? null,
      blocks: template.blocks,
    });
    if (error) return { ok: false, reason: explainAuthErrorLine(error.message) };
    await record("template.published", template.name, { kind: template.kind });
    await pullWorkspaceTemplates();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: explainAuthErrorLine(error) };
  }
}

export async function withdraw(template: OrgTemplate): Promise<PublishResult> {
  const client = supabase();
  if (!client) return NO_DATABASE;
  try {
    const { error } = await client
      .from("workspace_templates")
      .delete()
      .eq("id", template.id);
    if (error) return { ok: false, reason: explainAuthErrorLine(error.message) };
    await record("template.withdrawn", template.name);
    await pullWorkspaceTemplates();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: explainAuthErrorLine(error) };
  }
}

/**
 * Refresh the workspace list.
 *
 * Failure leaves whatever was already there. A network blip must not empty the
 * gallery — the previously pulled templates are still the right answer, and
 * "we could not check" is not the same as "there are none".
 */
export async function pullWorkspaceTemplates(): Promise<void> {
  const client = supabase();
  if (!client) return;
  try {
    const workspace = await currentWorkspaceId();
    if (!workspace) return;
    const { data, error } = await client
      .from("workspace_templates")
      .select("id, name, kind, blurb, blocks, created_by, created_at, updated_at")
      .eq("workspace_id", workspace)
      .order("updated_at", { ascending: false });
    if (error || !data) return;
    useTemplates
      .getState()
      .setWorkspace((data as unknown as TemplateRow[]).map(rowToTemplate));
  } catch {
    // Same reason: keep what we have.
  }
}
