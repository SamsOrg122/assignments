"use client";

/**
 * Words you have said are deliberate.
 *
 * Honest about its reach, on the screen and not just in a comment: there is no
 * web API that adds a word to the browser's own dictionary, so nothing here
 * removes a red underline. What it does is stop the assistant offering to
 * "correct" a surname, a variable name or a Dutch term in an English document,
 * which is the actual complaint behind wanting one.
 */

import { useState } from "react";
import { useDictionary, useDictionaryHydrated } from "@/lib/dictionary";
import { Icon } from "@/components/ui/Icon";

export function Dictionary() {
  const hydrated = useDictionaryHydrated();
  const words = useDictionary((s) => s.words);
  const add = useDictionary((s) => s.add);
  const remove = useDictionary((s) => s.remove);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const clean = draft.trim();
    if (!clean) return;
    add(clean);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="A word the checker keeps flagging"
          aria-label="Add a word"
          className="min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-body text-fg outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={commit}
          disabled={!draft.trim()}
          className="rounded-sm border border-line px-2.5 py-1.5 text-body text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {hydrated && words.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {words.map((word) => (
            <li key={word}>
              <span className="flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2 py-1 text-body text-fg-muted">
                {word}
                <button
                  type="button"
                  onClick={() => remove(word)}
                  aria-label={`Remove ${word}`}
                  className="rounded-xs text-fg-subtle transition-colors hover:text-danger"
                >
                  <Icon name="x" size={9} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-body leading-relaxed text-fg-subtle">
        These reach the assistant, not the browser. No web API can add a word to
        the browser&rsquo;s own spellchecker, so the red underline stays — use
        the browser&rsquo;s &ldquo;add to dictionary&rdquo; for that. The
        language a document is written in is set per document, under Page.
      </p>
    </div>
  );
}
