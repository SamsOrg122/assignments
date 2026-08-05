"use client";

/**
 * The join screen for a closed channel.
 *
 * Shows the channel's name and purpose *before* asking for the code, so
 * someone can tell whether they're in the right place without getting in
 * first. A gate that reveals nothing is a gate people bang on.
 */

import { useState } from "react";
import { useChat, type Channel } from "@/lib/chat";
import { useUI } from "@/lib/ui-store";
import { Button, fieldClass } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function ChannelGate({ channel }: { channel: Channel }) {
  const unlock = useChat((s) => s.unlockChannel);
  const notify = useUI((s) => s.notify);

  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    const ok = await unlock(channel.id, code.trim());
    setBusy(false);
    if (ok) {
      notify(`Joined #${channel.name}`);
      return;
    }
    setWrong(true);
    setCode("");
  };

  return (
    <div className="grid flex-1 place-items-center px-6">
      <div className="w-full max-w-[380px] text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-10 place-items-center rounded-full border border-line bg-surface-2 text-fg-subtle"
        >
          <Icon name="focus" size={15} />
        </span>

        <h1 className="mt-4 text-[16px] font-medium text-fg">
          #{channel.name} is a closed group
        </h1>
        {channel.description ? (
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted text-pretty">
            {channel.description}
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-fg-muted">
            {channel.topic ?? "Enter the passcode to join."}
          </p>
        )}

        <form
          className="mt-5 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            type="password"
            value={code}
            autoFocus
            placeholder="Passcode"
            aria-label="Channel passcode"
            aria-invalid={wrong || undefined}
            onChange={(e) => {
              setCode(e.target.value);
              setWrong(false);
            }}
            className={cn(fieldClass, "flex-1", wrong && "border-danger")}
          />
          <Button type="submit" variant="primary" disabled={!code.trim() || busy}>
            {busy ? "Checking…" : "Join"}
          </Button>
        </form>

        {wrong && (
          <p className="anim-fade mt-2 text-[12px] text-danger">
            That code doesn&apos;t match. Ask someone already in the group.
          </p>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-fg-subtle text-pretty">
          The code is checked in your browser and the messages aren&apos;t
          encrypted, so this keeps the group out of the way rather than out of
          reach.
        </p>
      </div>
    </div>
  );
}
