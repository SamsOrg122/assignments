"use client";

/**
 * "Put this in…" — the step between a file on the shelf and a file in the
 * work.
 *
 * Offers the documents of whichever world you are in, because a picture
 * dropped into a team document while you thought you were in your own is
 * exactly the mistake the two worlds exist to prevent. A board is offered
 * too but a file cannot land on one yet, so it is left out rather than
 * listed and refused.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { currentWorld } from "@/lib/scope";
import { KINDS } from "@/lib/kinds";
import { insertKitFile } from "@/lib/kit/insert";
import type { KitFile, KitImage } from "@/lib/kit";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function InsertMenu({
  asset,
  onClose,
}: {
  asset: KitFile | KitImage;
  onClose: () => void;
}) {
  const projects = useProjects((s) => s.projects);
  const addProject = useProjects((s) => s.addProject);
  const notify = useUI((s) => s.notify);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const world = currentWorld();
  const mine = projects.filter(
    (p) => (p.scope ?? "personal") === world && p.kind !== "board",
  );

  const put = async (projectId: string, name: string) => {
    if (busy) return;
    setBusy(true);
    const blockId = await insertKitFile(projectId, asset);
    setBusy(false);
    onClose();
    if (!blockId) {
      notify("That file's data is missing from this browser.");
      return;
    }
    notify(`${asset.name} is in “${name}”`);
    router.push(`/p/${projectId}`);
  };

  return (
    <div
      className="absolute top-full right-0 z-40 mt-1 max-h-[280px] w-[240px] overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-xl"
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => void put(addProject("doc"), "New document")}
        className="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[12.5px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
      >
        <Icon name="plus" size={12} className="shrink-0" />
        A new document
      </button>

      {mine.length > 0 && <span className="my-1 block h-px bg-line" />}

      {mine.map((project) => (
        <button
          key={project.id}
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => void put(project.id, project.name)}
          className={cn(
            "flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[12.5px] text-fg-muted transition-colors",
            "hover:bg-surface-2 hover:text-fg disabled:opacity-50",
          )}
        >
          <Icon
            name={KINDS[project.kind].icon}
            size={12}
            className="shrink-0 text-fg-subtle"
          />
          <span className="truncate">{project.name}</span>
        </button>
      ))}
    </div>
  );
}
