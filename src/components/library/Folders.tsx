"use client";

/**
 * Where things live, and what they are about.
 *
 * Two mechanisms, deliberately not one. A project sits in exactly one folder,
 * because "where is this?" should have a single answer; it carries any number
 * of labels, because "everything to do with the thesis" cuts across folders
 * and always will. Trying to serve both with one hierarchy is how a library
 * ends up with `Thesis/2026/Drafts` and `Drafts/Thesis/2026` side by side.
 *
 * Nothing here is required. A workspace with no folders looks exactly as it
 * did before, which matters: the flat list is fine at eight projects, and the
 * structure should appear when somebody asks for it rather than on day one.
 */

import { useMemo, useState } from "react";
import type { Folder, Project } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useMenu } from "@/components/ui/Menu";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { Avatar, AvatarDialog } from "@/components/ui/Avatar";
import { t } from "@/lib/i18n";

/** Every folder id at or under `id`, so a parent shows its whole subtree. */
export function subtree(folders: Folder[], id: string): string[] {
  const out = [id];
  for (const child of folders.filter((f) => f.parentId === id))
    out.push(...subtree(folders, child.id));
  return out;
}

/** Top-to-bottom path, for the breadcrumb. */
export function pathTo(folders: Folder[], id: string | null): Folder[] {
  const out: Folder[] = [];
  let walk = id;
  while (walk) {
    const found = folders.find((f) => f.id === walk);
    if (!found) break;
    out.unshift(found);
    walk = found.parentId;
  }
  return out;
}

export function FolderRail({
  selected,
  onSelect,
  projects,
}: {
  /** null = everything; a folder id = that folder and what's under it. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  projects: Project[];
}) {
  const folders = useProjects((s) => s.folders);
  const addFolder = useProjects((s) => s.addFolder);
  const renameFolder = useProjects((s) => s.renameFolder);
  const removeFolder = useProjects((s) => s.removeFolder);
  const moveFolder = useProjects((s) => s.moveFolder);
  const notify = useUI((s) => s.notify);
  const menu = useMenu();
  const setFolderGlyph = useProjects((s) => s.setFolderGlyph);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [iconFor, setIconFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  /** How many projects are in a folder including everything under it. */
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const folder of folders) {
      const ids = new Set(subtree(folders, folder.id));
      map.set(
        folder.id,
        projects.filter((p) => p.folderId && ids.has(p.folderId)).length,
      );
    }
    return map;
  }, [folders, projects]);

  const unfiled = projects.filter((p) => !p.folderId).length;

  const openMenu = (event: React.MouseEvent, folder: Folder) =>
    menu.open(event, [
      {
        kind: "item",
        label: t("folder.rename"),
        icon: "type",
        onSelect: () => {
          setRenaming(folder.id);
          setDraft(folder.name);
        },
      },
      {
        kind: "item",
        label: t("folder.icon"),
        icon: "sparkle",
        onSelect: () => setIconFor(folder.id),
      },
      {
        kind: "item",
        label: t("folder.newInside"),
        icon: "plus",
        onSelect: () => {
          const id = addFolder("New folder", folder.id);
          setRenaming(id);
          setDraft("New folder");
        },
      },
      {
        kind: "submenu",
        label: t("folder.moveTo"),
        icon: "folder",
        items: [
          {
            kind: "item" as const,
            label: t("folder.topLevel"),
            checked: folder.parentId === null,
            onSelect: () => moveFolder(folder.id, null),
          },
          ...folders
            .filter((f) => f.id !== folder.id)
            .map((f) => ({
              kind: "item" as const,
              label: f.name,
              checked: folder.parentId === f.id,
              onSelect: () => moveFolder(folder.id, f.id),
            })),
        ],
      },
      { kind: "separator" },
      {
        kind: "item",
        label: t("folder.delete"),
        icon: "trash",
        danger: true,
        onSelect: () => {
          removeFolder(folder.id);
          if (selected === folder.id) onSelect(null);
          // Said out loud because it is the one thing somebody would fear:
          // deleting a folder here never deletes what was in it.
          notify(t("folder.deleted"));
        },
      },
    ]);

  const rows = (parentId: string | null, depth: number): React.ReactNode[] =>
    folders
      .filter((f) => f.parentId === parentId)
      .flatMap((folder) => [
        <div key={folder.id} className="flex items-center">
          {renaming === folder.id ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                renameFolder(folder.id, draft);
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRenaming(null);
              }}
              aria-label={t("library.folderName")}
              className="w-full rounded-xs border border-accent bg-surface-2 px-1.5 py-1 text-body text-fg outline-none"
              style={{ marginLeft: depth * 12 }}
            />
          ) : (
            <button
              type="button"
              onClick={() => onSelect(folder.id)}
              onContextMenu={(e) => openMenu(e, folder)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-xs px-1.5 py-1 text-left text-body transition-colors duration-150",
                selected === folder.id
                  ? "bg-surface-3 text-fg"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
              style={{ paddingLeft: 6 + depth * 12 }}
            >
              {folder.glyph ? (
                <Avatar glyph={folder.glyph} size={12} className="text-fg-subtle" />
              ) : (
                <Icon name="folder" size={11} className="shrink-0 text-fg-subtle" />
              )}
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              <span className="shrink-0 font-mono text-[9.5px] text-fg-subtle">
                {counts.get(folder.id) ?? 0}
              </span>
            </button>
          )}
        </div>,
        ...rows(folder.id, depth + 1),
      ]);

  const tree = rows(null, 0);
  // Nothing filed and nothing made: the rail would be a heading over a button.
  if (!tree.length && unfiled === projects.length && projects.length === 0)
    return null;

  const iconFolder = folders.find((f) => f.id === iconFor);

  return (
    <>
      {menu.node}
      {iconFolder && (
        <AvatarDialog
          title={`Icon for “${iconFolder.name}”`}
          value={iconFolder.glyph}
          onPick={(g) => setFolderGlyph(iconFolder.id, g)}
          onClose={() => setIconFor(null)}
        />
      )}
      <div className="flex flex-col gap-0.5">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-meta text-fg-subtle flex-1">{t("library.folders")}</span>
          <button
            type="button"
            onClick={() => {
              const id = addFolder("New folder", null);
              setRenaming(id);
              setDraft("New folder");
            }}
            className="flex items-center gap-1 rounded-xs px-1 py-0.5 text-meta text-fg-subtle transition-colors duration-150 hover:text-fg"
          >
            <Icon name="plus" size={10} />
            {t("library.newFolder")}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "flex items-center gap-1.5 rounded-xs px-1.5 py-1 text-left text-body transition-colors duration-150",
            selected === null
              ? "bg-surface-3 text-fg"
              : "text-fg-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          <Icon name="home" size={11} className="shrink-0 text-fg-subtle" />
          <span className="min-w-0 flex-1 truncate">{t("library.everything")}</span>
          <span className="shrink-0 font-mono text-[9.5px] text-fg-subtle">
            {projects.length}
          </span>
        </button>

        {tree}
      </div>
    </>
  );
}

/* ── Labels ─────────────────────────────────────────────── */

export function LabelBar({
  projects,
  active,
  onToggle,
}: {
  projects: Project[];
  active: string[];
  onToggle: (label: string) => void;
}) {
  const labels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects)
      for (const label of p.labels ?? [])
        counts.set(label, (counts.get(label) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [projects]);

  if (!labels.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Icon name="tag" size={11} className="shrink-0 text-fg-subtle" />
      {labels.map(([label, count]) => {
        const on = active.includes(label);
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(label)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-meta transition-colors duration-150",
              on
                ? "border-accent/50 bg-accent-soft text-accent"
                : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {label}
            <span className="ml-1 font-mono text-[9.5px] text-fg-subtle">{count}</span>
          </button>
        );
      })}
      {active.length > 0 && (
        <button
          type="button"
          onClick={() => active.forEach(onToggle)}
          className="text-meta text-fg-subtle underline decoration-line-strong underline-offset-2 hover:text-fg"
        >
          {t("library.clear")}
        </button>
      )}
    </div>
  );
}

/** Editing one project's labels. Comma-separated, because that is how people
 *  type a list when nobody is watching. */
export function LabelEditor({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const setLabels = useProjects((s) => s.setLabels);
  const projects = useProjects((s) => s.projects);
  const [draft, setDraft] = useState((project.labels ?? []).join(", "));

  const suggestions = useMemo(() => {
    const all = new Set<string>();
    for (const p of projects) for (const l of p.labels ?? []) all.add(l);
    for (const l of project.labels ?? []) all.delete(l);
    return [...all].sort((a, b) => a.localeCompare(b)).slice(0, 12);
  }, [projects, project.labels]);

  const save = () => {
    setLabels(project.id, draft.split(",").map((s) => s.trim()));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`Labels for ${project.name}`}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative w-full max-w-[380px] rounded-lg border border-line bg-surface p-4">
        <p className="text-[14px] font-medium text-fg">{t("labels.title")}</p>
        <p className="mt-1 text-body leading-relaxed text-fg-muted">
          {t("labels.help")}
        </p>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          aria-label="Labels, separated by commas"
          placeholder={t("labels.placeholder")}
          className="mt-3 w-full rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-body text-fg outline-none focus:border-accent"
        />

        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() =>
                  setDraft((d) => (d.trim() ? `${d.replace(/,\s*$/, "")}, ${label}` : label))
                }
                className="rounded-full border border-line px-2 py-0.5 text-meta text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                + {label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            className="rounded-sm bg-accent px-2.5 py-1.5 text-body font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
          >
            {t("labels.save")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-line px-2.5 py-1.5 text-body text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            {t("labels.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
