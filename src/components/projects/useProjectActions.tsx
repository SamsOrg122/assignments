"use client";

/**
 * One handler set for the project menu, wherever it is opened from.
 *
 * `projectMenu()` in `lib/project-menu` builds the menu from a set of
 * callbacks, and several of them are optional — which meant the two callers
 * passed different sets and the same menu came out different. The Library
 * passed `labels` and `icon`; the sidebar did not, so "Labels…" was a feature
 * you could only reach from one of the two lists that show your projects.
 * Worse, both passed `rename`, but the sidebar pointed it at the settings
 * dialog and the Library at a rename box — one word, two results, depending
 * on where you had right-clicked. The menu builder's own docstring warns
 * about exactly this: a menu that differs by surface is one you have to learn
 * twice.
 *
 * So the callbacks, and the dialogs they open, live here. A caller renders
 * `dialogs` once and hands `actionsFor(project)` to the builder; there is no
 * longer a way to give one surface a smaller menu than another by accident.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import type { Project } from "@/lib/types";
import { AvatarDialog } from "@/components/ui/Avatar";
import { LabelEditor } from "@/components/library/Folders";
import { SaveAsTemplate } from "@/components/library/SaveAsTemplate";
import { ProjectSettings } from "@/components/shell/ProjectSettings";
import { RenameDialog } from "./RenameDialog";

/** Exactly what `projectMenu` accepts, so the two cannot drift. */
export interface ProjectActions {
  open: (id: string) => void;
  settings: () => void;
  rename: () => void;
  icon: () => void;
  labels: () => void;
  saveAsTemplate: () => void;
}

export function useProjectActions(options?: { onNavigate?: () => void }): {
  actionsFor: (project: Project) => ProjectActions;
  dialogs: React.ReactNode;
} {
  const router = useRouter();
  const setGlyph = useProjects((s) => s.setProjectGlyph);
  const projects = useProjects((s) => s.projects);

  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [iconFor, setIconFor] = useState<string | null>(null);
  const [labelling, setLabelling] = useState<string | null>(null);
  const [templatingFrom, setTemplatingFrom] = useState<string | null>(null);

  /*
   * Looked up from the store rather than captured from the row.
   *
   * The row that opened the menu may be gone by the time the dialog closes —
   * renaming can move it out of a filtered list, and the sidebar shows only
   * the first seven. Holding an id and reading the project back means the
   * dialog is never editing a stale copy.
   */
  const find = (id: string | null) =>
    id ? (projects.find((p) => p.id === id) ?? null) : null;

  const settingsProject = find(settingsFor);
  const renamingProject = find(renaming);
  const iconProject = find(iconFor);
  const labellingProject = find(labelling);
  const templateSource = find(templatingFrom);

  const actionsFor = (project: Project): ProjectActions => ({
    open: (id) => {
      options?.onNavigate?.();
      router.push(`/p/${id}`);
    },
    settings: () => setSettingsFor(project.id),
    rename: () => setRenaming(project.id),
    icon: () => setIconFor(project.id),
    labels: () => setLabelling(project.id),
    saveAsTemplate: () => setTemplatingFrom(project.id),
  });

  const dialogs = (
    <>
      {settingsProject && (
        <ProjectSettings
          project={settingsProject}
          onClose={() => setSettingsFor(null)}
        />
      )}
      {renamingProject && (
        <RenameDialog project={renamingProject} onClose={() => setRenaming(null)} />
      )}
      {iconProject && (
        <AvatarDialog
          title={`Icon for “${iconProject.name}”`}
          value={iconProject.glyph}
          onPick={(glyph) => setGlyph(iconProject.id, glyph)}
          onClose={() => setIconFor(null)}
        />
      )}
      {labellingProject && (
        <LabelEditor project={labellingProject} onClose={() => setLabelling(null)} />
      )}
      {templateSource && (
        <SaveAsTemplate
          project={templateSource}
          onClose={() => setTemplatingFrom(null)}
        />
      )}
    </>
  );

  return { actionsFor, dialogs };
}
