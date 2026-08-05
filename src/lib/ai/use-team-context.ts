"use client";

/**
 * The team half of the AI context, assembled once and shared.
 *
 * Lives in a hook so every AI surface — inline popover, dictation, the team
 * channel — is handed exactly the same workspace picture. A component that
 * built its own would drift.
 */

import { useMemo } from "react";
import { useTeam, collaboratorById } from "../team";
import { LOCAL_USER } from "../realtime";
import { buildTeamContext } from "./context";
import type { AIContext } from "./types";

export function useTeamContext(): NonNullable<AIContext["team"]> {
  const workspace = useTeam((s) => s.workspace);
  const knowledge = useTeam((s) => s.knowledge);
  const files = useTeam((s) => s.files);

  return useMemo(
    () =>
      buildTeamContext(
        workspace,
        knowledge,
        files,
        (id) => collaboratorById(id).name,
        LOCAL_USER.id,
      ),
    [workspace, knowledge, files],
  );
}
