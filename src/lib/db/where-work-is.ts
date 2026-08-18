/**
 * Which of three true sentences applies.
 *
 * Pulled out of the component because it is the part that can be wrong, and a
 * decision buried in JSX is a decision nothing can check. The screenshot that
 * prompted this had a sidebar reading "synced" above a paragraph explaining
 * browser storage — two statements, each true of some situation, neither true
 * of that one.
 */
export type WorkHome =
  /** No database at all: browser storage, which belongs to one web address. */
  | "no-database"
  /** A database, and an account this browser minted for itself on arrival. */
  | "browser-account"
  /** A database and a real, email-backed account. */
  | "account";

export function whereWorkIs(configured: boolean, hasEmail: boolean): WorkHome {
  // Order matters: without a database there is no account of any kind, so
  // "signed in" cannot be true and must not be believed if something claims
  // it. Asking about the database first is what makes the other two safe.
  if (!configured) return "no-database";
  return hasEmail ? "account" : "browser-account";
}

/**
 * Whether work made here can be reached from another web address.
 *
 * The one question behind all of this, and the answer is no for two of the
 * three homes — which is why the middle one keeps catching people. A
 * browser-made account is on a real server and syncs and says so, and the only
 * key to it is a token in this origin's storage.
 */
export const travelsBetweenAddresses = (home: WorkHome): boolean =>
  home === "account";
