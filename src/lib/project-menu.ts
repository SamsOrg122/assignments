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
import type { MenuItem } from "@/components/ui/Menu";
import type { Project } from "./types";

const EXPORTS = Object.keys(EXPORT_LABELS) as ExportFormat[];

export function projectMenu(
  project: Project,
  actions: {
    open: (id: string) => void;
    settings: () => void;
    rename: () => void;
  },
): MenuItem[] {
  const store = useProjects.getState();
  const notify = useUI.getState().notify;

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
      },
    },
  ];
}
