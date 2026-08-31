"use client";

/**
 * Managing templates.
 *
 * Two lists, because they answer to different people. The ones you saved are
 * yours to rename and throw away; the ones the workspace publishes are the
 * organisation's, and withdrawing one is an admin's decision — the database
 * refuses it otherwise, and the message you get back is the database's, not a
 * guess made here.
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useUI } from "@/lib/ui-store";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { KINDS } from "@/lib/kinds";
import {
  outlineOf,
  publish,
  pullWorkspaceTemplates,
  useTemplates,
  useTemplatesHydrated,
  withdraw,
  type OrgTemplate,
} from "@/lib/templates/org";

export function TemplatesPanel() {
  useTemplatesHydrated();
  const mine = useTemplates((s) => s.mine);
  const workspace = useTemplates((s) => s.workspace);
  const rename = useTemplates((s) => s.rename);
  const forget = useTemplates((s) => s.forget);
  const notify = useUI((s) => s.notify);
  const configured = useRemoteConfigured();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void pullWorkspaceTemplates();
  }, []);

  const doPublish = async (template: OrgTemplate) => {
    setBusy(template.id);
    const result = await publish(template);
    setBusy(null);
    notify(result.ok ? `Published “${template.name}”` : result.reason);
  };

  const doWithdraw = async (template: OrgTemplate) => {
    setBusy(template.id);
    const result = await withdraw(template);
    setBusy(null);
    notify(result.ok ? `Withdrew “${template.name}”` : result.reason);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-meta text-fg-subtle mb-1.5">Yours</p>
        {mine.length === 0 ? (
          <p className="text-body leading-relaxed text-fg-subtle">
            Nothing saved yet. Right-click any project in the Library and choose
            “Save as template” — the blocks are copied, so the project carries on
            its own way afterwards.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {mine.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-2 py-2">
                <Icon
                  name={KINDS[template.kind].icon}
                  size={12}
                  className="shrink-0 text-fg-subtle"
                />
                <input
                  value={template.name}
                  onChange={(e) => rename(template.id, e.target.value)}
                  aria-label={`Name of ${template.name}`}
                  className="min-w-0 flex-1 rounded-xs border border-transparent bg-transparent px-1 py-0.5 text-body text-fg outline-none hover:border-line focus:border-accent"
                />
                <span className="text-meta text-fg-subtle">
                  {outlineOf(template).length} sections
                </span>
                <button
                  type="button"
                  disabled={!configured || busy === template.id}
                  onClick={() => doPublish(template)}
                  title={
                    configured
                      ? "Publish it to everyone in the workspace"
                      : "Needs a database — there is no shared workspace to publish to"
                  }
                  className="rounded-xs border border-line px-1.5 py-0.5 text-meta text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-45"
                >
                  {busy === template.id ? "…" : "Publish"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    forget(template.id);
                    notify(`Removed “${template.name}”`);
                  }}
                  aria-label={`Delete ${template.name}`}
                  className="rounded-xs px-1 py-0.5 text-fg-subtle transition-colors duration-150 hover:text-danger"
                >
                  <Icon name="trash" size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-meta text-fg-subtle mb-1.5">The workspace&rsquo;s</p>
        {!configured ? (
          <p className="text-body leading-relaxed text-fg-subtle">
            No database is configured, so there is no shared workspace yet.
            Templates you save stay in this browser — which works, and is worth
            knowing before you build one for a team.
          </p>
        ) : workspace.length === 0 ? (
          <p className="text-body leading-relaxed text-fg-subtle">
            Nothing published. An admin can publish one of yours above, and
            everybody in this workspace will find it in the template picker —
            everybody meaning whoever the database counts as a member, since
            there is no way to invite somebody into a workspace from here yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {workspace.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-2 py-2">
                <Icon
                  name={KINDS[template.kind].icon}
                  size={12}
                  className="shrink-0 text-fg-subtle"
                />
                <span className="min-w-0 flex-1 truncate text-body text-fg">
                  {template.name}
                </span>
                <button
                  type="button"
                  disabled={busy === template.id}
                  onClick={() => doWithdraw(template)}
                  className="rounded-xs border border-line px-1.5 py-0.5 text-meta text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-45"
                >
                  {busy === template.id ? "…" : "Withdraw"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
