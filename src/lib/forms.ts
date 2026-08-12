"use client";

/**
 * Forms, and where the answers go.
 *
 * A student collecting data for a thesis is running the same loop as a company
 * running a survey: write the questions, send a link, watch the answers arrive
 * in a spreadsheet. This app already had the spreadsheet and already had links
 * that carry a document; what was missing was the direction of travel — a link
 * that sends something *back*.
 *
 * Two halves, deliberately separate:
 *
 *   - **The questions** travel inside the link, exactly like a share link.
 *     Nothing about the form itself is stored on a server, so a form works the
 *     moment it is written and needs no account to open.
 *   - **The answers** need somewhere to land, and that is the one thing a
 *     browser cannot provide for somebody else's browser. They go to the
 *     configured database. Without one, the form still opens and still
 *     validates — and says plainly that nothing can be collected yet, rather
 *     than swallowing an answer somebody took ten minutes to write.
 */

import { supabase } from "./db/client";
import { isRemoteConfigured } from "./db";
import { explainAuthErrorLine } from "./auth/errors";
import { t } from "./i18n";
import type { FormBlock, FormField, FormFieldKind } from "./types";

export const FIELD_LABELS: Record<FormFieldKind, string> = {
  short: "Short answer",
  long: "Paragraph",
  number: "Number",
  date: "Date",
  choice: "Choose one",
  checkboxes: "Choose any",
  scale: "Scale of 1–5",
  email: "Email address",
};

export const FIELD_ORDER: FormFieldKind[] = [
  "short",
  "long",
  "number",
  "date",
  "choice",
  "checkboxes",
  "scale",
  "email",
];

/** One answer, as it is stored. Lists stay lists so a table can split them. */
export type Answer = string | number | string[] | null;

export interface Response {
  id: string;
  submittedAt: number;
  /** Keyed by field id. Unknown ids are kept: a form may have been edited. */
  answers: Record<string, Answer>;
}

/* ── Validating an answer ───────────────────────────────── */

/**
 * What is wrong with this answer, or null.
 *
 * Runs on the respondent's screen *and* is the shape the owner's table trusts.
 * It refuses to submit rather than marking, which is the opposite of the rule
 * on a spreadsheet cell — and the difference is who is looking: the owner can
 * see and fix a marked cell, a respondent who has closed the tab cannot.
 */
export function checkAnswer(field: FormField, answer: Answer): string | null {
  const empty =
    answer === null ||
    answer === undefined ||
    answer === "" ||
    (Array.isArray(answer) && answer.length === 0);

  if (empty) return field.required ? t("form.required") : null;

  switch (field.kind) {
    case "number":
    case "scale": {
      const n = Number(answer);
      if (!Number.isFinite(n)) return t("form.badNumber");
      if (field.min !== undefined && n < field.min)
        return `Has to be at least ${field.min}.`;
      if (field.max !== undefined && n > field.max)
        return `Has to be at most ${field.max}.`;
      return null;
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(answer))
        ? null
        : t("form.badEmail");
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(String(answer))
        ? null
        : t("form.badDate");
    case "choice":
      return (field.options ?? []).includes(String(answer))
        ? null
        : t("form.pickOne");
    case "checkboxes": {
      const picked = Array.isArray(answer) ? answer : [String(answer)];
      const known = new Set(field.options ?? []);
      if (picked.some((p) => !known.has(p))) return "Pick from the options.";
      if (field.min !== undefined && picked.length < field.min)
        return `Pick at least ${field.min}.`;
      return null;
    }
    default: {
      const text = String(answer);
      if (field.max !== undefined && text.length > field.max)
        return `Keep it under ${field.max} characters.`;
      return null;
    }
  }
}

/** Every problem with a whole response, keyed by field id. */
export function checkResponse(
  form: FormBlock,
  answers: Record<string, Answer>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of form.fields) {
    const problem = checkAnswer(field, answers[field.id] ?? null);
    if (problem) out[field.id] = problem;
  }
  return out;
}

/* ── The link ───────────────────────────────────────────── */

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const through = async (stream: ReadableStream<Uint8Array>) =>
  new Uint8Array(await new Response(stream).arrayBuffer());

/**
 * What a respondent receives.
 *
 * The owner id travels with it because the answers have to be filed against
 * somebody, and the respondent has no account to file them under.
 */
export interface FormLink {
  formId: string;
  title: string;
  intro?: string;
  fields: FormField[];
  ownerId: string | null;
}

export async function encodeForm(payload: FormLink): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === "undefined") return `p.${toBase64Url(bytes)}`;
  const packed = await through(
    new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip")),
  );
  return `z.${toBase64Url(packed)}`;
}

/** Hostile input, the whole way: every field is read individually and coerced. */
export async function decodeForm(payload: string): Promise<FormLink | null> {
  const dot = payload.indexOf(".");
  if (dot < 0) return null;
  const format = payload.slice(0, dot);
  try {
    let bytes = fromBase64Url(payload.slice(dot + 1));
    if (format === "z") {
      if (typeof DecompressionStream === "undefined") return null;
      bytes = await through(
        new Blob([bytes as BlobPart])
          .stream()
          .pipeThrough(new DecompressionStream("gzip")),
      );
    } else if (format !== "p") return null;

    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Partial<FormLink>;
    if (typeof raw.formId !== "string" || !Array.isArray(raw.fields)) return null;

    const fields: FormField[] = raw.fields
      .filter((f): f is FormField => Boolean(f) && typeof f === "object")
      .map((f) => ({
        id: String(f.id ?? "").slice(0, 64),
        label: String(f.label ?? "Question").slice(0, 300),
        kind: FIELD_ORDER.includes(f.kind) ? f.kind : "short",
        help: f.help ? String(f.help).slice(0, 300) : undefined,
        required: Boolean(f.required),
        options: Array.isArray(f.options)
          ? f.options.map((o) => String(o).slice(0, 120)).slice(0, 40)
          : undefined,
        min: typeof f.min === "number" ? f.min : undefined,
        max: typeof f.max === "number" ? f.max : undefined,
      }))
      .filter((f) => f.id)
      .slice(0, 60);

    if (!fields.length) return null;

    return {
      formId: raw.formId.slice(0, 64),
      title: String(raw.title ?? "Form").slice(0, 200),
      intro: raw.intro ? String(raw.intro).slice(0, 2000) : undefined,
      fields,
      ownerId: typeof raw.ownerId === "string" ? raw.ownerId.slice(0, 64) : null,
    };
  } catch {
    return null;
  }
}

export async function formLink(block: FormBlock): Promise<string> {
  const client = supabase();
  const owner = client ? (await client.auth.getSession()).data.session?.user.id : null;
  const payload = await encodeForm({
    formId: block.id,
    title: block.title ?? "Form",
    intro: block.intro,
    fields: block.fields,
    ownerId: owner ?? null,
  });
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/f#${payload}`;
}

/* ── Sending and reading answers ────────────────────────── */

export type SendResult =
  | { ok: true }
  | { ok: false; reason: string; setup?: boolean };

/** Whether answers have anywhere to land on this deployment. */
export const collecting = (): boolean => isRemoteConfigured();

export async function sendResponse(
  link: FormLink,
  answers: Record<string, Answer>,
): Promise<SendResult> {
  const client = supabase();
  if (!client)
    return {
      ok: false,
      setup: true,
      reason:
        "This copy of Tougather has no database, so there is nowhere for answers to go. Nothing was sent — copy your answers somewhere before closing this.",
    };

  try {
    // An anonymous session, so the row has an author. The insert policy allows
    // anybody to answer a form; only the owner can read the answers back.
    const existing = (await client.auth.getSession()).data.session;
    if (!existing) {
      const made = await client.auth.signInAnonymously();
      if (made.error) return { ok: false, reason: explainAuthErrorLine(made.error) };
    }

    const { error } = await client.from("form_responses").insert({
      form_id: link.formId,
      owner_id: link.ownerId,
      answers,
    });
    if (error) return { ok: false, reason: explainAuthErrorLine(error.message) };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: explainAuthErrorLine(error) };
  }
}

export async function fetchResponses(formId: string): Promise<Response[]> {
  const client = supabase();
  if (!client) return [];
  const { data, error } = await client
    .from("form_responses")
    .select("id, answers, submitted_at")
    .eq("form_id", formId)
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(explainAuthErrorLine(error.message));
  return (data ?? []).map((row) => ({
    id: String(row.id),
    submittedAt: Date.parse(row.submitted_at as string) || Date.now(),
    answers: (row.answers ?? {}) as Record<string, Answer>,
  }));
}

/** One answer as a cell. Lists join, because a table cell holds one value. */
export const answerToCell = (answer: Answer): string | number | null => {
  if (answer === null || answer === undefined) return null;
  if (Array.isArray(answer)) return answer.join(", ");
  return answer;
};
