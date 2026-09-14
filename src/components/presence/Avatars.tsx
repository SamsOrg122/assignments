"use client";

import type { PeerState } from "@/lib/types";
import { LOCAL_USER } from "@/lib/realtime";
import { cn } from "@/lib/cn";
import { Who } from "@/components/ui/Who";

export function Avatars({ peers }: { peers: PeerState[] }) {
  const everyone = [
    { user: LOCAL_USER, here: true },
    ...peers.map((p) => ({ user: p.user, here: p.cursor !== null })),
  ];

  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {everyone.map(({ user, here }) => (
          /*
           * You were grey here and everybody else was their own colour, on
           * the theory that your own face needs no finding. The opposite is
           * true in a stack of five: yours is the one you look for to check
           * you are counted, and it is the same face — same colour, same
           * initials — as the one at the foot of the sidebar and the one on
           * every message you have written. One person, one colour, no
           * exceptions.
           *
           * Away is still opacity, which is not a colour and so does not
           * collide with any of this.
           */
          <Who
            key={user.id}
            id={user.id}
            initials={user.initials}
            name={`${user.name}${here ? "" : " · away"}`}
            size={24}
            className={cn(
              "border-2 border-canvas transition-opacity duration-200",
              here ? "opacity-100" : "opacity-40",
            )}
          />
        ))}
      </div>
      <span className="ml-2.5 hidden text-meta text-fg-subtle sm:inline">
        {peers.filter((p) => p.cursor).length + 1} here
      </span>
    </div>
  );
}
