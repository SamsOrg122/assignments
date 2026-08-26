/**
 * Friends: the shapes, apart from the calls that fetch them.
 *
 * A connection is a *pair*, not a follow. The row is stored pair-ordered —
 * one row for the two of you, whichever way round it was made — so there is
 * no such thing as half a friendship, no "pending" state to leak who was
 * asked and refused, and nothing to reconcile when both people press at once.
 * What comes back here is therefore always the other person, never a
 * direction.
 *
 * No `"use client"`: this file is types only and is erased at compile time,
 * so it can be imported from anywhere without dragging a client boundary
 * along with it.
 */

import type { LinkStatus } from "../team/invites";

/** Live, expired, revoked, used up — see `linkStatus` for the ordering. A
 *  friend link and a team invite die in exactly the same four ways, so they
 *  share the word for it rather than each having their own. */
export type { LinkStatus };

export interface Friend {
  /** The other person's account id. Also what `removeFriend` takes. */
  userId: string;
  /** Null when they have never set one — draw the id's initials, not "null". */
  displayName: string | null;
  /**
   * They are signed in without an account. Shown plainly rather than hidden:
   * this connection disappears with their browser and there is nothing either
   * of you can do to get it back.
   */
  anonymous: boolean;
  /** When the pair row was written, ms. */
  since: number;
}

export interface FriendLink {
  id: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  uses: number;
  /** Null means no limit — bounded by the expiry and by revoking it. */
  maxUses: number | null;
  status: LinkStatus;
}
