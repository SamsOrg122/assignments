"use client";

/**
 * Choosing a shape to start from.
 *
 * Three sources, in the order somebody would want them: what the organisation
 * standardised on, what this person saved for themselves, and what the app
 * guessed. Ours is last on purpose — once a place has its own report layout,
 * our idea of a report layout is a distraction.
 *
 * Each group says where it came from in a line of small type, because "why is
 * this here and can I change it?" is the first question about a template
 * somebody didn't make.
 */

import { useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { KINDS } from "@/lib/kinds";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "@/lib/project-templates";
import {
  instantiate,
  outlineOf,
  pullWorkspaceTemplates,
  useTemplates,
  useTemplatesHydrated,
  type OrgTemplate,
} from "@/lib/templates/org";
import type { Block, ProjectKind } from "@/lib/types";

export function TemplatePicker({
  onClose,
  onUse,
}: {
  onClose: () => void;
  /** Hands back everything a new project needs; the caller creates it. */
  onUse: (kind: ProjectKind, name: string, blocks: Block[]) => void;
}) {
  useTemplatesHydrated();
  const mine = useTemplates((s) => s.mine);
  const workspace = useTemplates((s) => s.workspace);

  // Checked every time the picker opens rather than on a timer: this is the
  // one moment the answer matters, and an admin publishing a template expects
  // the next person who looks to see it.
  useEffect(() => {
    void pullWorkspaceTemplates();
  }, []);

  const startFromSaved = (template: OrgTemplate) =>
    onUse(template.kind, template.name, instantiate(template));

  const startFromBuiltIn = (template: ProjectTemplate) =>
    onUse(template.kind, template.name, template.build(template.name));

  return (
    <Dialog
      title="Start from a template"
      description="Each one is a shape with prompts in it. Replace the italics as you go."
      width={720}
      onClose={onClose}
    >
      {workspace.length > 0 && (
        <Group
          title="From your organisation"
          note="Published to this workspace. Everyone here starts from the same one."
        >
          {workspace.map((template) => (
            <SavedCard
              key={template.id}
              template={template}
              onSelect={() => startFromSaved(template)}
            />
          ))}
        </Group>
      )}

      {mine.length > 0 && (
        <Group
          title="Yours"
          note="Saved from your own projects, kept in this browser."
        >
          {mine.map((template) => (
            <SavedCard
              key={template.id}
              template={template}
              onSelect={() => startFromSaved(template)}
            />
          ))}
        </Group>
      )}

      <Group
        title={workspace.length || mine.length ? "Built in" : ""}
        note={
          workspace.length || mine.length
            ? "Ours. Any project can become one of your own — right-click it in the Library."
            : ""
        }
      >
        {PROJECT_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => startFromBuiltIn(template)}
            className="rounded-md border border-line bg-surface p-3 text-left transition-colors duration-150 hover:border-line-strong"
          >
            <Head kind={template.kind} name={template.name} />
            <span className="mt-1 block text-meta leading-snug text-fg-subtle">
              {template.blurb}
            </span>
            <Outline sections={template.outline} />
          </button>
        ))}
      </Group>
    </Dialog>
  );
}

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 last:mb-0">
      {title && (
        <>
          <p className="text-meta text-fg-subtle mb-1">{title}</p>
          <p className="mb-2 text-meta leading-snug text-fg-subtle">{note}</p>
        </>
      )}
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function SavedCard({
  template,
  onSelect,
}: {
  template: OrgTemplate;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-md border border-line bg-surface p-3 text-left transition-colors duration-150 hover:border-line-strong"
    >
      <Head kind={template.kind} name={template.name} />
      {template.blurb && (
        <span className="mt-1 block text-meta leading-snug text-fg-subtle">
          {template.blurb}
        </span>
      )}
      <Outline sections={outlineOf(template)} />
    </button>
  );
}

const Head = ({ kind, name }: { kind: ProjectKind; name: string }) => (
  <span className="flex items-center gap-2">
    <Icon name={KINDS[kind].icon} size={12} className="text-fg-subtle" />
    <span className="text-body font-medium text-fg">{name}</span>
    <span className="ml-auto font-mono text-[10px] text-fg-subtle">
      {KINDS[kind].label}
    </span>
  </span>
);

const Outline = ({ sections }: { sections: string[] }) =>
  sections.length ? (
    <span className="mt-2 flex flex-wrap gap-1">
      {sections.map((section, i) => (
        <span
          key={`${section}-${i}`}
          className="rounded-xs border border-line px-1.5 py-0.5 text-[10px] text-fg-muted"
        >
          {section}
        </span>
      ))}
    </span>
  ) : null;
