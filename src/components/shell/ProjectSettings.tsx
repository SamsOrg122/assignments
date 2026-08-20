"use client";

/**
 * Per-project settings.
 *
 * The things that belong to *this* project rather than to the app: what it is
 * called, what kind of thing it is, what it's aiming at, how its citations are
 * set. Kept out of the global Settings page on purpose — a preference that
 * differs per project is not a preference, it's a property.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { KINDS, KIND_ORDER } from "@/lib/kinds";
import { useUI } from "@/lib/ui-store";
import type { CitationStyle, Project, ProjectKind } from "@/lib/types";
import { Button, Dialog, Row, fieldClass } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { AvatarPicker } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

const CITATION_STYLES: Array<[CitationStyle, string]> = [
  ["apa", "APA"],
  ["mla", "MLA"],
  ["chicago", "Chicago"],
  ["harvard", "Harvard"],
];


export function ProjectSettings({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const rename = useProjects((s) => s.renameProject);
  const setKind = useProjects((s) => s.setProjectKind);
  const setGlyph = useProjects((s) => s.setProjectGlyph);
  const setWordGoal = useProjects((s) => s.setWordGoal);
  const setCitationStyle = useProjects((s) => s.setCitationStyle);
  const duplicate = useProjects((s) => s.duplicateProject);
  const remove = useProjects((s) => s.deleteProject);
  const notify = useUI((s) => s.notify);
  const router = useRouter();

  const [name, setName] = useState(project.name);
  const [goal, setGoal] = useState(project.wordGoal ? String(project.wordGoal) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const commitName = () => {
    const next = name.trim();
    if (next && next !== project.name) rename(project.id, next);
  };

  const commitGoal = () => {
    const n = Number(goal.replace(/[^\d]/g, ""));
    setWordGoal(project.id, Number.isFinite(n) && n > 0 ? n : undefined);
  };

  return (
    <Dialog
      title="Project settings"
      description={`Applies to “${project.name}” only.`}
      onClose={onClose}
      footer={
        <>
          <Button
            onClick={() => {
              const id = duplicate(project.id);
              onClose();
              if (id) {
                notify(`Duplicated “${project.name}”`);
                router.push(`/p/${id}`);
              }
            }}
          >
            Duplicate
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <Row label="Name">
        <input
          value={name}
          aria-label="Project name"
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={fieldClass}
        />
      </Row>

      <Row
        label="Type"
        hint="Changes which editor opens. Your content is untouched — a deck opened as a doc is the same blocks, shown differently."
      >
        <div className="grid grid-cols-3 gap-1.5">
          {KIND_ORDER.map((k: ProjectKind) => (
            <button
              key={k}
              type="button"
              aria-pressed={project.kind === k}
              onClick={() => setKind(project.id, k)}
              className={cn(
                "flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-[12px] transition-colors duration-150",
                project.kind === k
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
              )}
            >
              <Icon name={KINDS[k].icon} size={11} className="shrink-0" />
              <span className="truncate">{KINDS[k].label}</span>
            </button>
          ))}
        </div>
      </Row>

      <Row
        label="Icon"
        hint="Shown in the sidebar and on Library rows, so this project is findable at a glance."
      >
        <AvatarPicker
          value={project.glyph}
          onPick={(g) => setGlyph(project.id, g)}
        />
      </Row>

      <Row
        label="Word target"
        hint="Drives the progress bar in the editor and the per-section targets in the outline. Leave empty for none."
      >
        <input
          value={goal}
          inputMode="numeric"
          placeholder="e.g. 8000"
          aria-label="Word target"
          onChange={(e) => setGoal(e.target.value)}
          onBlur={commitGoal}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={fieldClass}
        />
      </Row>

      <Row label="Citation style">
        <div className="inline-flex gap-0.5 rounded-sm border border-line p-0.5">
          {CITATION_STYLES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={(project.citationStyle ?? "apa") === id}
              onClick={() => setCitationStyle(project.id, id)}
              className={cn(
                "rounded-xs px-2.5 py-1 text-[12px] transition-colors duration-150",
                (project.citationStyle ?? "apa") === id
                  ? "bg-surface-3 text-fg"
                  : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Row>

      <div className="mt-6 rounded-md border border-danger/25 bg-danger/5 p-3.5">
        <p className="text-[12.5px] font-medium text-fg">Delete this project</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">
          Everything in it goes: blocks, sources, history. There is no undo.
        </p>
        <div className="mt-2.5">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  remove(project.id);
                  onClose();
                  notify(`Deleted “${project.name}”`);
                  router.push("/library");
                }}
              >
                Yes, delete it
              </Button>
              <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
