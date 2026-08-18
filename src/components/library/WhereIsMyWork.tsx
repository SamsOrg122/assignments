"use client";

/**
 * "I had work. Where is it?"
 *
 * There are three true answers and they contradict each other, so the version
 * of this that printed one of them regardless was worse than useless: it
 * explained browser storage to somebody whose sidebar said "synced", and sent
 * them looking for a bug that was not there.
 *
 * The one that keeps catching people is the middle case. With a database
 * configured and nobody signed in, the app signs in anonymously — a real
 * account, on a real server, that nothing but this browser at this address can
 * ever reach again. It syncs. It says "synced". And it is every bit as
 * address-bound as browser storage was, because the only key to it is a token
 * in this origin's storage. Clearing site data does not lose a cache; it loses
 * the only way back in.
 */

import Link from "next/link";
import { useAuth } from "@/lib/auth/store";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { whereWorkIs } from "@/lib/db/where-work-is";

export function WhereIsMyWork() {
  const configured = useRemoteConfigured();
  const identity = useAuth((s) => s.identity);
  const home = whereWorkIs(configured, Boolean(identity.email));

  return (
    <p className="mx-auto mt-5 max-w-[54ch] border-t border-line pt-5 text-[12px] leading-relaxed text-fg-subtle">
      {home === "no-database" ? (
        <>
          Expecting to find work here? This deployment has no database, so
          projects are stored per web address — a different link to this app, a
          preview build, a new domain, opens its own empty workspace. Nothing is
          lost: export a backup at the old address and{" "}
          <Restore />.
        </>
      ) : home === "account" ? (
        <>
          Expecting to find work here? Your account holds nothing yet, so it was
          never pushed — work made before you signed in, or at an address where
          saving was failing, stays where it was made. Export a backup there and{" "}
          <Restore />.
        </>
      ) : (
        <>
          Expecting to find work here? You are not signed in. Work still syncs,
          but to an account this browser made for itself — and only this browser,
          at this address, can ever reach it. Another address gets a new one,
          which is why this is empty.{" "}
          <Link
            href="/settings#account"
            className="text-accent underline decoration-accent/40 underline-offset-2 transition-opacity hover:opacity-80"
          >
            Sign in with an email
          </Link>{" "}
          to carry work across addresses, or export a backup at the old address
          and <Restore />.
        </>
      )}
    </p>
  );
}

const Restore = () => (
  <Link
    href="/settings#keeping"
    // Underlined, not just coloured: a link a colour-blind reader can't pick
    // out of a paragraph isn't a link.
    className="text-accent underline decoration-accent/40 underline-offset-2 transition-opacity hover:opacity-80"
  >
    restore it here
  </Link>
);
