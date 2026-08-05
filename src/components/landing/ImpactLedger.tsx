"use client";

/**
 * "Funded so far".
 *
 * Reads the ledger seam and shows whatever is actually there. On day one that
 * is nothing, and it says so — a counter spinning up to an invented number is
 * exactly the move that makes people stop believing environmental claims. When
 * real data arrives the same component animates it.
 */

import { useEffect, useRef, useState } from "react";
import { causeById, compact, euro } from "@/lib/impact/config";
import { getImpactLedger, type Ledger } from "@/lib/impact/ledger";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Icon } from "@/components/ui/Icon";

export function ImpactLedger() {
  const [ledger, setLedger] = useState<Ledger | null>(null);

  useEffect(() => {
    let live = true;
    void getImpactLedger().then((l) => {
      if (live) setLedger(l);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!ledger) return <Frame value="—" label="Funded so far" />;

  if (ledger.status === "pending")
    return (
      <Frame value="—" label="Funded so far" note={ledger.reason}>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-xs border border-line px-2 py-1 text-[11px] text-fg-subtle">
          <Icon name="history" size={10} />
          Reporting has not started
        </span>
      </Frame>
    );

  const cause = causeById(ledger.causeId);
  return (
    <Frame
      value={<Count to={ledger.units} />}
      label={`${cause.unit.many} funded since ${ledger.since}`}
      note={`${euro(ledger.euros)} transferred to partners.`}
    >
      {ledger.reportUrl && (
        <a
          href={ledger.reportUrl}
          className="mt-3 inline-flex items-center gap-1 text-[11.5px] text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Read the report
          <Icon name="chevron-right" size={10} />
        </a>
      )}
    </Frame>
  );
}

function Frame({
  value,
  label,
  note,
  children,
}: {
  value: React.ReactNode;
  label: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="glass-soft rounded-md p-4">
      <p className="font-mono text-[34px] leading-none tracking-[-0.03em] text-fg tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-[12.5px] text-fg-muted">{label}</p>
      {note && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-subtle text-pretty">
          {note}
        </p>
      )}
      {children}
    </div>
  );
}

/** Counts up once, and instantly for anyone who asked for less motion. */
function Count({ to }: { to: number }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    if (reduced) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      // Ease-out cubic — fast first, settling rather than stopping dead.
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [to, reduced]);

  return <>{compact(reduced ? to : n)}</>;
}
