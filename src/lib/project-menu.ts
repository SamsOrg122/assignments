"use client";

/**
 * The actions a project has, as menu items.
 *
 * One builder, used by the Library row's right-click menu, the sidebar's, and
 * anywhere else a project can be pointed at — so the same object offers the
 * same actions wherever you meet it. A menu that differs by surface is a menu
 * you have to learn twice.
 */

import { KINDS, KIND_ORDER } from "./kinds";
import { useProjects } from "./store";
import { useUI } from "./ui-store";
import { EXPORT_LABELS, exportProject, type ExportFormat } from "./export";
import { record } from "./admin";
import type { MenuItem } from "@/components/ui/Menu";
import type { Project } from "./types";

const EXPORTS = Object.keys(EXPORT_LABELS) as ExportFormat[];

export function projectMenu(
  project: Project,
  actions: {
    open: (id: string) => void;
    settings: () => void;
    rename: () => void;
    /** Opens the avatar picker. Surfaces without one route to settings. */
    icon?: () => void;
    /** Only the Library offers these; elsewhere the entries are left out. */
    labels?: () => void;
    saveAsTemplate?: () => void;
  },
): MenuItem[] {
  const store = useProjects.getState();
  const notify = useUI.getState().notify;

  /** The folder tree as a flat list, indented, for the "Move to" submenu. */
  const folderItems = (): MenuItem[] => {
    const out: MenuItem[] = [
      {
        kind: "item",
        label: "Top level",
        checked: !project.folderId,
        onSelect: () => {
          store.moveProject(project.id, null);
          notify("Moved to the top level");
        },
      },
    ];
    const walk = (parentId: string | null, depth: number) => {
      for (const folder of store.folders.filter((f) => f.parentId === parentId)) {
        out.push({
          kind: "item",
          // Indented with figure spaces: a submenu has no room for a tree, and
          // two folders called "Drafts" in different places are otherwise the
          // same entry twice.
          label: `${"  ".repeat(depth)}${folder.name}`,
          checked: project.folderId === folder.id,
          onSelect: () => {
            store.moveProject(project.id, folder.id);
            notify(`Moved to ${folder.name}`);
          },
        });
        walk(folder.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  };

  return [
    {
      kind: "item",
      label: "Open",
      icon: "arrow-right",
      onSelect: () => actions.open(project.id),
    },
    {
      kind: "item",
      label: "Rename…",
      icon: "type",
      onSelect: actions.rename,
    },
    {
      kind: "item",
      label: "Icon…",
      icon: "sparkle",
      // Every surface can change the icon: without a dedicated dialog the
      // settings sheet holds the same picker.
      onSelect: actions.icon ?? actions.settings,
    },
    {
      kind: "item",
      label: "Duplicate",
      icon: "copy",
      shortcut: "⌘D",
      onSelect: () => {
        const id = store.duplicateProject(project.id);
        if (id) notify(`Duplicated “${project.name}”`);
      },
    },
    { kind: "separator" },
    {
      kind: "submenu",
      label: "Change type",
      icon: "grip",
      items: KIND_ORDER.map((k) => ({
        kind: "item" as const,
        label: KINDS[k].label,
        icon: KINDS[k].icon,
        checked: project.kind === k,
        onSelect: () => {
          store.setProjectKind(project.id, k);
          notify(`Opens as ${KINDS[k].label.toLowerCase()} now`);
        },
      })),
    },
    {
      kind: "submenu",
      label: "Move to",
      icon: "folder",
      items: folderItems(),
    },
    ...(actions.labels
      ? [
          {
            kind: "item" as const,
            label: "Labels…",
            icon: "tag" as const,
            onSelect: actions.labels,
          },
        ]
      : []),
    ...(actions.saveAsTemplate
      ? [
          {
            kind: "item" as const,
            label: "Save as template…",
            icon: "copy" as const,
            onSelect: actions.saveAsTemplate,
          },
        ]
      : []),
    {
      kind: "submenu",
      label: "Export",
      icon: "download",
      items: EXPORTS.map((format) => ({
        kind: "item" as const,
        label: EXPORT_LABELS[format],
        onSelect: () => exportProject(project, format),
      })),
    },
    {
      kind: "item",
      label: "Settings…",
      icon: "settings",
      onSelect: actions.settings,
    },
    { kind: "separator" },
    {
      kind: "item",
      label: "Delete",
      icon: "trash",
      danger: true,
      onSelect: () => {
        store.deleteProject(project.id);
        notify(`Deleted “${project.name}”`);
        // Best effort and deliberately not awaited: the deletion is what was
        // asked for, and a workspace with no database has nowhere to record it.
        void record("project.deleted", project.name, { kind: project.kind });
      },
    },
  ];
}
