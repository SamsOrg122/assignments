"use client";

import type { PeerState } from "@/lib/types";
import { LOCAL_USER } from "@/lib/realtime";
import { cn } from "@/lib/cn";

export function Avatars({ peers }: { peers: PeerState[] }) {
  const everyone = [
    { user: LOCAL_USER, here: true },
    ...peers.map((p) => ({ user: p.user, here: p.cursor !== null })),
  ];

  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {everyone.map(({ user, here }) => (
          <span
            key={user.id}
            title={`${user.name}${here ? "" : " · away"}`}
            className={cn(
              "grid size-6 place-items-center rounded-full border-2 border-canvas",
              "font-mono text-[9px] font-medium transition-opacity duration-200",
              here ? "opacity-100" : "opacity-40",
            )}
            style={{
              background: user.id === LOCAL_USER.id ? "#232323" : `${user.color}22`,
              color: user.id === LOCAL_USER.id ? "#8a8a8a" : user.color,
              boxShadow: `inset 0 0 0 1px ${user.color}55`,
            }}
          >
            {user.initials}
          </span>
        ))}
      </div>
      <span className="ml-2.5 hidden font-mono text-[10px] text-fg-subtle sm:inline">
        {peers.filter((p) => p.cursor).length + 1} here
      </span>
    </div>
  );
}
