"use client";

/**
 * Answering somebody's form.
 *
 * The questions come out of the link, so this page needs no account, no
 * database read and no round trip before it can render — which matters,
 * because the person opening it is a stranger doing somebody else a favour and
 * every second of spinner costs a response.
 *
 * Two rules run through it. Nothing is sent until every answer passes, because
 * a respondent who has closed the tab cannot be asked again. And if sending
 * fails, the answers stay on screen with the reason — a form that clears
 * itself on an error has taken ten minutes of somebody's life and given
 * nothing back.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FormField } from "@/lib/types";
import {
  checkResponse,
  decodeForm,
  sendResponse,
  type Answer,
  type FormLink,
} from "@/lib/forms";
import { useRemoteConfigSettled } from "@/lib/db/use-config";
import { LogoTile } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";

type State =
  | { kind: "reading" }
  | { kind: "ready"; form: FormLink }
  | { kind: "sent"; form: FormLink }
  | { kind: "broken" };

export function FillClient() {
  const settled = useRemoteConfigSettled();
  const [state, setState] = useState<State>({ kind: "reading" });
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // Off the effect body: reading the fragment is synchronous, and setting
    // state here directly would cascade a render for no reason.
    void Promise.resolve()
      .then(() => decodeForm(window.location.hash.slice(1)))
      .then((form) => {
        if (!live) return;
        setState(form ? { kind: "ready", form } : { kind: "broken" });
      });
    return () => {
      live = false;
    };
  }, []);

  const set = (id: string, value: Answer) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    setProblems((p) => {
      if (!p[id]) return p;
      const next = { ...p };
      delete next[id];
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state.kind !== "ready") return;

    const found = checkResponse(
      { ...state.form, id: state.form.formId, type: "form" },
      answers,
    );
    setProblems(found);
    if (Object.keys(found).length) {
      // Straight to the first thing that needs fixing, which on a long form is
      // otherwise a scroll hunt.
      document
        .getElementById(`q-${Object.keys(found)[0]}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSending(true);
    const result = await sendResponse(state.form, answers);
    setSending(false);
    if (result.ok) setState({ kind: "sent", form: state.form });
    else setFailure(result.reason);
  };

  if (state.kind === "reading" || !settled)
    return <Shell><p className="text-[13px] text-fg-muted">Opening…</p></Shell>;

  if (state.kind === "broken")
    return (
      <Shell>
        <h1 className="mb-2 text-[20px] font-medium tracking-[-0.02em] text-fg">
          That link didn&apos;t open
        </h1>
        <p className="text-[13px] leading-relaxed text-fg-muted">
          The form inside it couldn&apos;t be read. Links get cut short by some
          chat apps — ask whoever sent it for the whole thing.
        </p>
      </Shell>
    );

  if (state.kind === "sent")
    return (
      <Shell>
        <h1 className="mb-2 text-[20px] font-medium tracking-[-0.02em] text-fg">
          Sent
        </h1>
        <p className="text-[13px] leading-relaxed text-fg-muted">
          Your answers have gone to whoever made this form. You can close this
          page.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-[12.5px] text-accent transition-opacity hover:opacity-80"
        >
          What is Tougather?
        </Link>
      </Shell>
    );

  const { form } = state;

  return (
    <Shell>
      <h1 className="mb-1.5 text-[22px] leading-tight font-medium tracking-[-0.02em] text-fg">
        {form.title}
      </h1>
      {form.intro && (
        <p className="mb-5 text-[13px] leading-relaxed whitespace-pre-line text-fg-muted">
          {form.intro}
        </p>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {form.fields.map((field, index) => (
          <Question
            key={field.id}
            field={field}
            index={index}
            value={answers[field.id] ?? null}
            problem={problems[field.id]}
            onChange={(v) => set(field.id, v)}
          />
        ))}

        {failure && (
          <p
            role="alert"
            className="rounded-sm border border-danger/35 bg-danger/[0.07] p-2.5 text-[12.5px] leading-relaxed text-danger"
          >
            {failure}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={sending}
            className="rounded-sm bg-accent px-3 py-1.5 text-[13px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send"}
          </button>
          <span className="text-[11.5px] text-fg-subtle">
            Your answers go to whoever made this form.
          </span>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[560px] px-5 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-[13px] font-medium text-fg">
        <LogoTile size={20} />
        Tougather
      </Link>
      {children}
    </main>
  );
}

const INPUT =
  "w-full rounded-sm border border-line bg-surface px-2.5 py-2 text-[13.5px] text-fg outline-none focus:border-accent";

function Question({
  field,
  index,
  value,
  problem,
  onChange,
}: {
  field: FormField;
  index: number;
  value: Answer;
  problem?: string;
  onChange: (value: Answer) => void;
}) {
  const described = field.help ? `help-${field.id}` : undefined;
  const invalid = Boolean(problem);
  const picked = Array.isArray(value) ? value : [];
  const inputId = `in-${field.id}`;

  /**
   * A group of options is a `fieldset` named by its `legend`; a single input
   * is a `label` tied to that input. The distinction is not cosmetic — a
   * legend names the *group*, so a lone text box inside one is announced with
   * no name at all, which is a question a screen reader user cannot answer.
   */
  const grouped =
    field.kind === "choice" || field.kind === "checkboxes" || field.kind === "scale";
  const Frame = grouped ? "fieldset" : "div";
  const Title = grouped ? "legend" : "label";

  return (
    <Frame id={`q-${field.id}`} className="min-w-0">
      <Title
        {...(grouped ? {} : { htmlFor: inputId })}
        className="mb-1.5 flex items-baseline gap-1.5 text-[13.5px] text-fg"
      >
        <span className="font-mono text-[10px] text-fg-subtle">{index + 1}</span>
        {field.label}
        {field.required && (
          <span aria-hidden="true" className="text-danger">
            *
          </span>
        )}
      </Title>
      {field.help && (
        <p id={described} className="mb-1.5 text-[12px] leading-relaxed text-fg-subtle">
          {field.help}
        </p>
      )}

      {field.kind === "long" ? (
        <textarea
          id={inputId}
          rows={4}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={described}
          aria-invalid={invalid || undefined}
          className={cn(INPUT, "resize-y", invalid && "border-danger")}
        />
      ) : field.kind === "choice" ? (
        <div className="flex flex-col gap-1">
          {(field.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-[13px] text-fg-muted">
              <input
                type="radio"
                name={field.id}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              {option}
            </label>
          ))}
        </div>
      ) : field.kind === "checkboxes" ? (
        <div className="flex flex-col gap-1">
          {(field.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-[13px] text-fg-muted">
              <input
                type="checkbox"
                checked={picked.includes(option)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...picked, option]
                      : picked.filter((p) => p !== option),
                  )
                }
              />
              {option}
            </label>
          ))}
        </div>
      ) : field.kind === "scale" ? (
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={value === n}
              onClick={() => onChange(n)}
              className={cn(
                "size-9 rounded-sm border text-[13px] transition-colors duration-150",
                value === n
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      ) : (
        <input
          id={inputId}
          type={
            field.kind === "number"
              ? "number"
              : field.kind === "date"
                ? "date"
                : field.kind === "email"
                  ? "email"
                  : "text"
          }
          value={String(value ?? "")}
          onChange={(e) =>
            onChange(
              field.kind === "number" && e.target.value !== ""
                ? Number(e.target.value)
                : e.target.value,
            )
          }
          aria-describedby={described}
          aria-invalid={invalid || undefined}
          className={cn(INPUT, invalid && "border-danger")}
        />
      )}

      {problem && (
        <p role="alert" className="mt-1 text-[12px] text-danger">
          {problem}
        </p>
      )}
    </Frame>
  );
}
