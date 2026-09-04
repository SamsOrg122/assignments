/**
 * Keep: the clipboard, on purpose and only on purpose.
 *
 * The sheet shows what was captured rather than saying "kept". That is the
 * whole difference between a clipboard tool people trust and one they
 * uninstall: a copied password, a private address, a half-finished message to
 * somebody — any of those can be on a clipboard, and somebody who pressed this
 * by accident has to be able to see it and undo it in the same second.
 *
 * Nothing here polls. The clipboard is read by Rust when the button is pressed
 * and at no other time; see `commands::keep_clipboard`.
 */

import { useState } from "react";
import { deleteNote, keepClipboard, previewOf, titleOf, type Note } from "./notes";

export function KeepSheet({ onKept }: { onKept: () => void }) {
  const [kept, setKept] = useState<Note | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const take = async () => {
    setProblem(null);
    try {
      const note = await keepClipboard();
      setKept(note);
      onKept();
    } catch (error) {
      setKept(null);
      setProblem(String(error));
    }
  };

  return (
    <div className="sheet">
      {kept ? (
        <>
          <h2>Kept</h2>
          {/* The words themselves, because "kept 1 item" is not something
              anybody can check. */}
          <p className="caught">{titleOf(kept) || previewOf(kept) || "(empty)"}</p>
          <p className="quiet">
            It is a note now, in your library with everything else.
          </p>
          <div className="ends">
            <button type="button" className="go" onClick={() => void take()}>
              Keep another
            </button>
            <button
              type="button"
              className="link"
              onClick={async () => {
                // Tombstoned rather than hidden: `store/notes.rs` keeps the row
                // so the deletion syncs, and empties the body. Somebody
                // deleting a password wants the words gone, not the row.
                await deleteNote(kept.id);
                setKept(null);
                onKept();
              }}
            >
              That was a mistake — delete it
            </button>
          </div>
        </>
      ) : (
        <>
          <h2>Keep the clipboard</h2>
          <p>
            Whatever you copied last — a paragraph out of a PDF, a link, an
            address from an email — kept as a note without opening a browser.
          </p>
          <p className="quiet">
            Read only when you press this. Nothing here watches your clipboard,
            and nothing keeps a history of it.
          </p>
          {problem ? <p className="bad">{problem}</p> : null}
          <button type="button" className="go" onClick={() => void take()}>
            Keep what I copied
          </button>
        </>
      )}
    </div>
  );
}
