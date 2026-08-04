"use client";

/**
 * Peer cursors, drawn in an overlay above the canvas.
 *
 * Positions arrive as 0..1 fractions at ~20fps and are converted to pixels
 * against the measured overlay. Movement is a composited `translate3d` with a
 * short linear transition, so the browser interpolates between updates instead
 * of us running a 60fps state loop.
 */

import { useEffect, useRef, useState } from "react";
import type { PeerState } from "@/lib/types";

export function Cursors({ peers }: { peers: PeerState[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden print:hidden"
      aria-hidden="true"
    >
      {size.width > 0 &&
        peers.map((peer) =>
          peer.cursor ? (
            <div
              key={peer.user.id}
              className="absolute top-0 left-0 transition-transform duration-150 ease-linear will-change-transform motion-reduce:transition-none"
              style={{
                transform: `translate3d(${peer.cursor.x * size.width}px, ${
                  peer.cursor.y * size.height
                }px, 0)`,
              }}
            >
              <svg width="14" height="18" viewBox="0 0 14 18" fill="none">
                <path
                  d="M1 1l11 7.5-5 .9-2.4 5.1z"
                  fill={peer.user.color}
                  stroke="#0a0a0a"
                  strokeWidth="1"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                className="mt-0.5 ml-2.5 inline-block rounded-xs px-1.5 py-0.5 font-mono text-[9.5px] whitespace-nowrap text-white"
                style={{ background: peer.user.color }}
              >
                {peer.user.name}
              </span>
            </div>
          ) : null,
        )}
    </div>
  );
}
