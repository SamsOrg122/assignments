"use client";

/**
 * The team half of the AI context, assembled once and shared.
 *
 * Lives in a hook so every AI surface — inline popover, dictation, the team
 * channel — is handed exactly the same workspace picture. A component that
 * built its own would drift.
 *
 * WHY THE PEOPLE STORE IS A DEPENDENCY. `buildTeamContext` prefers the
 * database roster and falls back to the local workspace — one row, you — when
 * there isn't one. It reads that roster with `realRoster()`, and the names
 * under it with `collaboratorById`: plain store reads, invisible to a memo.
 * The roster arrives over the network some time after mount, so a memo keyed
 * on the local store alone was built from the fallback and then never rebuilt.
 * `TeamAssistant` mounts with /chat and stays mounted, so "catch me up on this
 * team" went on answering "one member" for the rest of the session however
 * many people had really joined. `usePeople()` subscribes to that store — and
 * starts the read, which is idempotent per account — so the answer landing
 * invalidates the context that was built without it.
 */

import { useMemo } from "react";
import { useTeam, usePeople, collaboratorById } from "../team";
import { LOCAL_USER } from "../realtime";
import { buildTeamContext } from "./context";
import type { AIContext } from "./types";

export function useTeamContext(): NonNullable<AIContext["team"]> {
  const workspace = useTeam((s) => s.workspace);
  const knowledge = useTeam((s) => s.knowledge);
  const files = useTeam((s) => s.files);
  const people = usePeople();

  return useMemo(() => {
    // The subscription, spent. What this hook needs from `people` is not a
    // value but the invalidation: `buildTeamContext` goes to that same store
    // for the roster, and `collaboratorById` for the names, so the snapshot
    // changing is the signal that the picture built without them is stale.
    void people;
    return buildTeamContext(
      workspace,
      knowledge,
      files,
      (id) => collaboratorById(id).name,
      LOCAL_USER.id,
    );
  }, [workspace, knowledge, files, people]);
}
