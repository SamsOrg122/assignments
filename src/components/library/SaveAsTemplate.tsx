"use client";

/**
 * Turning a project into a template.
 *
 * The publish switch is the part worth reading. Keeping it to yourself needs
 * nothing — no account, no database — and that is the default. Sharing it with
 * the workspace needs both, and the checkbox says which of those is missing
 * rather than failing after the fact. Somebody who has spent an afternoon on a
 * report layout should find out *before* they press Save that it will only
 * live on this laptop.
 */

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useUI } from "@/lib/ui-store";
import { useRemoteConfigured } from "@/lib/db/use-config";
import {
  publish,
  templateFromProject,
  useTemplates,
} from "@/lib/templates/org";
import type { Project } from "@/lib/types";

export function SaveAsTemplate({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const save = useTemplates((s) => s.save);
  const notify = useUI((s) => s.notify);
  const configured = useRemoteConfigured();

  const [name, setName] = useState(project.name);
  const [blurb, setBlurb] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async () => {
    const template = templateFromProject(project, name, blurb);
    save(template);
    if (!share) {
      notify(`Saved “${template.name}” as a template`);
      onClose();
      return;
    }

    setBusy(true);
    const result = await publish(template);
    setBusy(false);
    if (!result.ok) {
      // The local copy is already saved, so this is a partial success and is
      // said as one. Reporting a flat failure would send somebody back to redo
      // work that is sitting there done.
      setProblem(result.reason);
      return;
    }
    notify(`Published “${template.name}” to the workspace`);
    onClose();
  };

  return (
    <Dialog
      title="Save as a template"
      description="The blocks are copied. Editing this project afterwards leaves the template as it is."
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="rounded-sm bg-accent px-2.5 py-1.5 text-body font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Publishing…" : "Save it"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-line px-2.5 py-1.5 text-body text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            Cancel
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-meta text-fg-subtle">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-body text-fg outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-meta text-fg-subtle">
            What it is for — one line, shown in the picker
          </span>
          <input
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="Monthly report, with the approvals table"
            className="rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-body text-fg outline-none focus:border-accent"
          />
        </label>

        <label className="mt-1 flex items-start gap-2">
          <input
            type="checkbox"
            checked={share}
            disabled={!configured}
            onChange={(e) => setShare(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-body leading-relaxed text-fg-muted">
            Share it with everyone in the workspace
            <span className="mt-0.5 block text-meta text-fg-subtle">
              {configured
                ? "Needs an admin — the database refuses it otherwise, and will say so. Everyone means everyone the database counts as a member of this workspace; the app has no way to invite somebody into one yet, so today that is whoever was added there directly."
                : "Not available: no database is configured, so there is no shared workspace to publish to. It will be saved in this browser."}
            </span>
          </span>
        </label>

        {problem && (
          <p
            className="rounded-sm border border-warn/35 bg-warn/[0.07] p-2.5 text-body leading-relaxed text-fg-muted"
            role="alert"
          >
            Saved here, but not published: {problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}
