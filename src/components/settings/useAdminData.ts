"use client";

/**
 * Everything the administration sections are waiting on, asked once.
 *
 * Lifted out of the old `/admin` page so the sections can live inside
 * Settings without each one opening its own connection and arriving at its
 * own moment. Five questions, one render.
 *
 * The refusal rule is carried over unchanged and is the reason this returns
 * `blocked` rather than five separate errors: *the first refusal wins*. Five
 * identical "administration needs a database" panels stacked on top of each
 * other is not five times as informative. What is *not* carried over is
 * where that blanking applies — inside Settings it must stop at the
 * administration group, or a missing database would blank Appearance too.
 */

import { useCallback, useEffect, useState } from "react";
import { useRemoteConfigSettled } from "@/lib/db/use-config";
import {
  fetchAudit,
  fetchMembers,
  myRole,
  previewPurge,
  retentionDays,
  type AdminMember,
  type AuditEntry,
  type PurgeCount,
} from "@/lib/admin";
import type { Role } from "@/lib/team/types";

export interface AdminState {
  role: Role | null;
  members: AdminMember[];
  audit: AuditEntry[];
  retention: number | null;
  doomed: PurgeCount | null;
}

export interface AdminData {
  /** False until the runtime config lookup has answered. */
  settled: boolean;
  state: AdminState | null;
  blocked: { reason: string; setup?: boolean } | null;
  busy: boolean;
  reload: () => Promise<void>;
}

export function useAdminData(): AdminData {
  const settled = useRemoteConfigSettled();
  const [state, setState] = useState<AdminState | null>(null);
  const [blocked, setBlocked] = useState<{ reason: string; setup?: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    const [role, members, audit, retention, doomed] = await Promise.all([
      myRole(),
      fetchMembers(),
      fetchAudit(),
      retentionDays(),
      previewPurge(),
    ]);
    setBusy(false);

    const refused = [role, members, retention].find((r) => !r.ok);
    if (refused && !refused.ok) {
      setBlocked({ reason: refused.reason, setup: refused.setup });
      setState(null);
      return;
    }
    setBlocked(null);
    setState({
      role: role.ok ? role.value : null,
      members: members.ok ? members.value : [],
      // These two can fail on their own and it is not fatal: a member who is
      // not an admin is *refused* the log by the policy, which is the system
      // working. An empty section beats an error that reads like a fault.
      audit: audit.ok ? audit.value : [],
      retention: retention.ok ? retention.value : null,
      doomed: doomed.ok ? doomed.value : null,
    });
  }, []);

  useEffect(() => {
    if (!settled) return;
    // Off the effect body on purpose: `reload` sets state as its first act,
    // and doing that synchronously here is a cascading render the lint rule
    // is right about. A microtask later is the same tick to a person.
    void Promise.resolve().then(reload);
  }, [settled, reload]);

  return { settled, state, blocked, busy, reload };
}
