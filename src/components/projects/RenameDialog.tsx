"use client";

/**
 * Rename on its own, because renaming is the one thing people do to a project
 * far more often than everything else in settings put together.
 *
 * It lived inside the Library page, which is why the sidebar's copy of the
 * same menu sent Rename… to the full settings dialog instead — the same word,
 * two different results, depending on which list you had opened the menu
 * from. Moving it here is what lets both surfaces share one set of handlers.
 */

import { useState } from "react";
import { Button, Dialog, fieldClass } from "@/components/ui/Dialog";
import { useProjects } from "@/lib/store";
import type { Project } from "@/lib/types";

export function RenameDialog({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const rename = useProjects((s) => s.renameProject);
  const [name, setName] = useState(project.name);

  const commit = () => {
    const next = name.trim();
    if (next) rename(project.id, next);
    onClose();
  };

  return (
    <Dialog
      title="Rename project"
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={commit} disabled={!name.trim()}>
            Rename
          </Button>
        </>
      }
    >
      <input
        value={name}
        autoFocus
        aria-label="Project name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className={fieldClass}
      />
    </Dialog>
  );
}
