"use client";

/**
 * Who somebody is when they arrived through a link.
 *
 * They have no account and no seat in anybody's team, and asking them to make
 * one before they can say "this paragraph contradicts chapter two" is how a
 * comment never gets written. So: a name they type once, kept in their own
 * browser, and an id that stays the same across visits so their notes group
 * together rather than arriving from four different strangers.
 *
 * Nothing here identifies a person to us. It is a label on a note.
 */

const NAME = "assignments:guest-name:v1";
const ID = "assignments:guest-id:v1";

export function guestName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NAME) ?? "";
  } catch {
    return "";
  }
}

export function setGuestName(name: string) {
  try {
    window.localStorage.setItem(NAME, name.trim().slice(0, 80));
  } catch {
    // A browser refusing storage still lets them comment; the name just
    // won't be there next time.
  }
}

/** Stable per browser. Generated on first use, never sent anywhere else. */
export function guestId(): string {
  if (typeof window === "undefined") return "guest";
  try {
    const existing = window.localStorage.getItem(ID);
    if (existing) return existing;
    const made = `guest-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(ID, made);
    return made;
  } catch {
    return "guest";
  }
}
