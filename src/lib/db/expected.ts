/**
 * The shape this code was written against.
 *
 * Kept as data rather than as a paragraph in a README, because a README does
 * not fail. `projects.id` was a `uuid` in a database this app has always
 * written ten-character nanoids to — every save rejected, for weeks, while
 * the Settings check reported the table "there and readable". It was. Reading
 * was never the problem.
 *
 * So the deployed schema is now something the app can ask about and compare,
 * and drift becomes a sentence on a screen rather than a mystery. Postgres'
 * own type names, as `information_schema` spells them.
 */

export interface SchemaReport {
  columns?: Record<string, Record<string, string>>;
  rls?: Record<string, boolean>;
  applied?: Record<string, boolean>;
}

/**
 * Only the columns this app actually writes to.
 *
 * Not every column in the schema: a check that fails because somebody added a
 * column the app has never heard of is a check people learn to ignore, and a
 * check people ignore is worse than none.
 */
const EXPECTED: Record<string, Record<string, string>> = {
  projects: {
    id: "text",
    workspace_id: "uuid",
    owner_id: "uuid",
    name: "text",
    kind: "text",
    content: "jsonb",
    revision: "bigint",
    deleted_at: "timestamp with time zone",
    search_text: "text",
  },
  workspaces: {
    id: "uuid",
    owner_id: "uuid",
    name: "text",
  },
};

/** Tables that must have row level security on. */
const MUST_BE_LOCKED = ["projects", "workspaces", "workspace_members", "profiles"];

export interface Drift {
  /** `projects.id`, for a message somebody can act on. */
  where: string;
  expected: string;
  found: string;
  /** True when this alone stops work being saved. */
  fatal: boolean;
}

/**
 * Compare what is deployed against what this code assumes.
 *
 * A missing column and a wrong type are both fatal — either one means a write
 * that looks fine in the app and is refused by the database. A column the app
 * does not know about is not mentioned at all.
 */
export function driftIn(report: SchemaReport): Drift[] {
  const drift: Drift[] = [];
  const deployed = report.columns ?? {};

  for (const [table, columns] of Object.entries(EXPECTED)) {
    const found = deployed[table];
    if (!found) {
      drift.push({
        where: table,
        expected: "a table",
        found: "nothing",
        fatal: true,
      });
      continue;
    }
    for (const [column, type] of Object.entries(columns)) {
      const actual = found[column];
      if (!actual) {
        drift.push({ where: `${table}.${column}`, expected: type, found: "missing", fatal: true });
      } else if (actual !== type) {
        drift.push({ where: `${table}.${column}`, expected: type, found: actual, fatal: true });
      }
    }
  }

  // Row level security off is the opposite failure to the one above: nothing
  // breaks, everything saves, and every account can read every other
  // account's documents. Worth naming loudly precisely because it is silent.
  for (const table of MUST_BE_LOCKED) {
    const on = report.rls?.[table];
    if (on === false)
      drift.push({
        where: `${table} row level security`,
        expected: "on",
        found: "off",
        fatal: true,
      });
  }

  return drift;
}

/** The migration that fixes a given drift, where one is known. */
export function migrationFor(drift: Drift): string | null {
  if (drift.where === "projects.id" && drift.found === "uuid")
    return "supabase/migrations/0003-ids-the-client-can-actually-make.sql";
  if (drift.where.endsWith("row level security"))
    return "supabase/migrations/0002-work-lands-in-the-account.sql";
  return null;
}
