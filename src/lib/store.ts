"use client";

/**
 * The single source of truth for project content.
 *
 * There is exactly one copy of every block. A chart bound to a table does not
 * hold a snapshot of the table's data — it holds the table's *id* and reads
 * through this store, so editing the table re-renders every dependent view on
 * the next commit. That is the whole "same data in multiple places" trick, and
 * it costs nothing structurally.
 *
 * Persistence is localStorage today. Swapping in a CRDT document (Yjs) later
 * means replacing this file's middleware, not the components: every component
 * reads through selectors and writes through the named actions below.
 */

import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Block,
  BlockType,
  CellValue,
  Column,
  ColumnType,
  Project,
  Row,
  TableBlock,
} from "./types";
import { createBlock, createProject, emptyRow, uid } from "./factories";
import { SEED_PROJECTS } from "./seed";

interface ProjectsState {
  projects: Project[];

  /* Projects */
  addProject: (name?: string) => string;
  renameProject: (projectId: string, name: string) => void;
  deleteProject: (projectId: string) => void;
  duplicateProject: (projectId: string) => string | null;

  /* Blocks */
  addBlock: (projectId: string, type: BlockType, afterBlockId?: string) => string;
  insertBlock: (projectId: string, block: Block, afterBlockId?: string) => string;
  updateBlock: <T extends Block>(
    projectId: string,
    blockId: string,
    patch: Partial<T> | ((block: T) => Partial<T>),
  ) => void;
  removeBlock: (projectId: string, blockId: string) => void;
  duplicateBlock: (projectId: string, blockId: string) => void;
  moveBlock: (projectId: string, from: number, to: number) => void;

  /* Table operations — split out because they're the fiddly ones. */
  setCell: (
    projectId: string,
    blockId: string,
    rowId: string,
    columnId: string,
    value: CellValue,
  ) => void;
  addRow: (projectId: string, blockId: string) => void;
  removeRow: (projectId: string, blockId: string, rowId: string) => void;
  addColumn: (projectId: string, blockId: string, type?: ColumnType) => void;
  updateColumn: (
    projectId: string,
    blockId: string,
    columnId: string,
    patch: Partial<Column>,
  ) => void;
  removeColumn: (projectId: string, blockId: string, columnId: string) => void;
  setSort: (projectId: string, blockId: string, columnId: string) => void;
  /**
   * Add a column whose values are supplied wholesale, optionally appending
   * rows. One action, so an accepted AI suggestion is a single undo-able step
   * rather than a burst of writes every chart subscriber would re-render on.
   */
  addValueColumn: (
    projectId: string,
    blockId: string,
    column: Column,
    values: Record<string, CellValue>,
    appendRows?: Row[],
  ) => void;

  /** Wipe local state back to the shipped seed. Used by ⌘K → Reset workspace. */
  resetWorkspace: () => void;
}

/** Apply a change to one project and stamp `updatedAt` in a single pass. */
function withProject(
  projects: Project[],
  projectId: string,
  fn: (p: Project) => Project,
): Project[] {
  let changed = false;
  const next = projects.map((p) => {
    if (p.id !== projectId) return p;
    changed = true;
    return { ...fn(p), updatedAt: Date.now() };
  });
  return changed ? next : projects;
}

function withBlocks(
  projects: Project[],
  projectId: string,
  fn: (blocks: Block[]) => Block[],
): Project[] {
  return withProject(projects, projectId, (p) => ({ ...p, blocks: fn(p.blocks) }));
}

function mapBlock(
  projects: Project[],
  projectId: string,
  blockId: string,
  fn: (b: Block) => Block,
): Project[] {
  return withBlocks(projects, projectId, (blocks) =>
    blocks.map((b) => (b.id === blockId ? fn(b) : b)),
  );
}

/** Narrow to a table block, or return the block untouched. */
function onTable(b: Block, fn: (t: TableBlock) => TableBlock): Block {
  return b.type === "table" ? fn(b) : b;
}

export const useProjects = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: SEED_PROJECTS,

      addProject: (name) => {
        const project = createProject(name?.trim() || "Untitled project");
        set((s) => ({ projects: [project, ...s.projects] }));
        return project.id;
      },

      renameProject: (projectId, name) =>
        set((s) => ({
          projects: withProject(s.projects, projectId, (p) => ({ ...p, name })),
        })),

      deleteProject: (projectId) =>
        set((s) => ({ projects: s.projects.filter((p) => p.id !== projectId) })),

      duplicateProject: (projectId) => {
        const source = get().projects.find((p) => p.id === projectId);
        if (!source) return null;

        // Blocks get fresh ids, and any chart pointing at a copied table must
        // be repointed at the copy — otherwise the duplicate's chart would
        // silently read from the original's table.
        const idMap = new Map<string, string>();
        const blocks = source.blocks.map((b) => {
          const id = uid();
          idMap.set(b.id, id);
          return { ...b, id } as Block;
        });
        const rebound = blocks.map((b) =>
          b.type === "chart" && b.sourceId
            ? { ...b, sourceId: idMap.get(b.sourceId) ?? null }
            : b,
        );

        const copy: Project = {
          ...source,
          id: uid(),
          name: `${source.name} copy`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          blocks: rebound,
        };
        set((s) => ({ projects: [copy, ...s.projects] }));
        return copy.id;
      },

      addBlock: (projectId, type, afterBlockId) => {
        // A new chart auto-binds to the nearest table above it, so
        // "/chart" right under a table just works.
        const project = get().projects.find((p) => p.id === projectId);
        let source: TableBlock | undefined;
        if (type === "chart" && project) {
          const anchor = afterBlockId
            ? project.blocks.findIndex((b) => b.id === afterBlockId)
            : project.blocks.length - 1;
          for (let i = anchor; i >= 0; i--) {
            const b = project.blocks[i];
            if (b?.type === "table") {
              source = b;
              break;
            }
          }
          source ??= project.blocks.find(
            (b): b is TableBlock => b.type === "table",
          );
        }
        const block = createBlock(type, source);
        return get().insertBlock(projectId, block, afterBlockId);
      },

      insertBlock: (projectId, block, afterBlockId) => {
        set((s) => ({
          projects: withBlocks(s.projects, projectId, (blocks) => {
            const at = afterBlockId
              ? blocks.findIndex((b) => b.id === afterBlockId)
              : -1;
            if (at === -1) return [...blocks, block];
            return [...blocks.slice(0, at + 1), block, ...blocks.slice(at + 1)];
          }),
        }));
        return block.id;
      },

      updateBlock: (projectId, blockId, patch) =>
        set((s) => ({
          projects: mapBlock(s.projects, projectId, blockId, (b) => {
            // Spreading a patch over a union widens `type` past what TS can
            // narrow, so the merge is asserted once, here. Callers name the
            // block type they're addressing; the store never changes `type`.
            const delta =
              typeof patch === "function"
                ? (patch as unknown as (block: Block) => Partial<Block>)(b)
                : patch;
            return { ...b, ...delta } as Block;
          }),
        })),

      removeBlock: (projectId, blockId) =>
        set((s) => ({
          projects: withBlocks(s.projects, projectId, (blocks) =>
            blocks
              .filter((b) => b.id !== blockId)
              // Any chart bound to the removed table becomes unbound rather
              // than dangling — the chart then prompts for a new source.
              .map((b) =>
                b.type === "chart" && b.sourceId === blockId
                  ? { ...b, sourceId: null, xColumnId: null, yColumnIds: [] }
                  : b,
              ),
          ),
        })),

      duplicateBlock: (projectId, blockId) =>
        set((s) => ({
          projects: withBlocks(s.projects, projectId, (blocks) => {
            const at = blocks.findIndex((b) => b.id === blockId);
            if (at === -1) return blocks;
            const copy = { ...blocks[at], id: uid() } as Block;
            return [...blocks.slice(0, at + 1), copy, ...blocks.slice(at + 1)];
          }),
        })),

      moveBlock: (projectId, from, to) =>
        set((s) => ({
          projects: withBlocks(s.projects, projectId, (blocks) => {
            if (
              from === to ||
              from < 0 ||
              to < 0 ||
              from >= blocks.length ||
              to >= blocks.length
            )
              return blocks;
            const next = [...blocks];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
          }),
        })),

      setCell: (projectId, blockId, rowId, columnId, value) =>
        set((s) => ({
          projects: mapBlock(s.projects, projectId, blockId, (b) =>
            onTable(b, (t) => ({
              ...t,
              rows: t.rows.map((r) =>
                r.id === rowId
                  ? { ...r, cells: { ...r.cells, [columnId]: value } }
                  : r,
              ),
            })),
          ),
        })),

      addRow: (projectId, blockId) =>
        set((s) => ({
          projects: mapBlock(s.projects, projectId, blockId, (b) =>
            onTable(b, (t) => ({ ...t, rows: [...t.rows, emptyRow(t.columns)] })),
          ),
        })),

      removeRow: (projectId, blockId, rowId) =>
        set((s) => ({
          projects: mapBlock(s.projects, projectId, blockId, (b) =>
            onTable(b, (t) => ({
              ...t,
              rows: t.rows.filter((r) => r.id !== rowId),
            })),
          ),
        })),

      addColumn: (projectId, blockId, type = "text") =>
        set((s) => ({
          projects: mapBlock(s.projects, projectId, blockId, (b) =>
            onTable(b, (t) => {
              const column: Column = {
                id: uid(),
                name: `Column ${t.columns.length + 1}`,
                type,
                ...(type === "formula" ? { formula: "" } : {}),
              };
              return {
                ...t,
                columns: [...t.columns, column],
                rows:
                  type === "formula"
                    ? t.rows
                    : t.rows.map((r) => ({
                        ...r,
                        cells: { ...r.cells, [column.id]: null },
                      })),
              };
            }),
          ),
        })),

      updateColumn: (projectId, blockId, columnId, patch) =>
        set((s) => ({
          projects: mapBlock(s.projects, projectId, blockId, (b) =>
            onTable(b, (t) => ({
              ...t,
              columns: t.columns.map((c) =>
                c.id === columnId ? { ...c, ...patch } : c,
              ),
            })),
          ),
        })),

      removeColumn: (projectId, blockId, columnId) =>
        set((s) => ({
          projects: withBlocks(s.projects, projectId, (blocks) =>
            blocks.map((b) => {
              if (b.id === blockId)
                return onTable(b, (t) => ({
                  ...t,
                  columns: t.columns.filter((c) => c.id !== columnId),
                  rows: t.rows.map((r) => {
                    const cells = { ...r.cells };
                    delete cells[columnId];
                    return { ...r, cells };
                  }),
                  sort: t.sort?.columnId === columnId ? null : t.sort,
                }));
              // Charts plotting the dropped column must forget it too.
              if (b.type === "chart" && b.sourceId === blockId)
                return {
                  ...b,
                  xColumnId: b.xColumnId === columnId ? null : b.xColumnId,
                  yColumnIds: b.yColumnIds.filter((id) => id !== columnId),
                };
              return b;
            }),
          ),
        })),

      setSort: (projectId, blockId, columnId) =>
        set((s) => ({
          projects: mapBlock(s.projects, projectId, blockId, (b) =>
            onTable(b, (t) => {
              // asc → desc → unsorted
              if (t.sort?.columnId !== columnId)
                return { ...t, sort: { columnId, dir: "asc" } };
              if (t.sort.dir === "asc")
                return { ...t, sort: { columnId, dir: "desc" } };
              return { ...t, sort: null };
            }),
          ),
        })),

      addValueColumn: (projectId, blockId, column, values, appendRows = []) =>
        set((s) => ({
          projects: mapBlock(s.projects, projectId, blockId, (b) =>
            onTable(b, (t) => {
              const rows = [...t.rows, ...appendRows].map((r) => ({
                ...r,
                cells: { ...r.cells, [column.id]: values[r.id] ?? null },
              }));
              return { ...t, columns: [...t.columns, column], rows };
            }),
          ),
        })),

      resetWorkspace: () => set({ projects: SEED_PROJECTS }),
    }),
    {
      name: "assignments:projects:v1",
      storage: createJSONStorage(() => localStorage),
      // Persist content only; actions are re-created on every load.
      partialize: (s) => ({ projects: s.projects }),
      // Rehydrate manually after mount. Reading localStorage during module
      // evaluation would make the first client render disagree with the
      // server-rendered seed, which React reports as a hydration mismatch.
      skipHydration: true,
    },
  ),
);

/**
 * True once persisted state has been merged in. Components that would flash
 * wrong content (a project that only exists locally, say) wait on this.
 */
let rehydrateRequested = false;

export function useHydrated(): boolean {
  // The persist middleware is an external store, so subscribe to it directly
  // rather than mirroring its state into React. The server snapshot is `false`,
  // which is also the first client render — so the two agree.
  const hydrated = useSyncExternalStore(
    (onChange) => useProjects.persist.onFinishHydration(onChange),
    () => useProjects.persist.hasHydrated(),
    () => false,
  );

  useEffect(() => {
    if (rehydrateRequested) return;
    rehydrateRequested = true;
    void useProjects.persist.rehydrate();
  }, []);

  return hydrated;
}

/* ── Selectors ──────────────────────────────────────────── */

export const selectProject = (projectId: string) => (s: ProjectsState) =>
  s.projects.find((p) => p.id === projectId);

export const selectBlock =
  (projectId: string, blockId: string) => (s: ProjectsState) =>
    s.projects.find((p) => p.id === projectId)?.blocks.find((b) => b.id === blockId);

/** Tables in a project, for the chart block's source picker. */
export const selectTables = (projectId: string) => (s: ProjectsState) =>
  (s.projects.find((p) => p.id === projectId)?.blocks ?? []).filter(
    (b): b is TableBlock => b.type === "table",
  );
