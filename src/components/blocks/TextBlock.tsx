"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import type { TextBlock as TextBlockModel, BlockType } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { SlashMenu } from "@/components/canvas/SlashMenu";
import { CitePicker } from "@/components/sources/CitePicker";
import { Citation } from "./citation-extension";
import { Footnote, footnoteBase } from "./footnote-extension";
import { Reference, referenceLabels } from "./reference-extension";
import {
  SuggestDelete,
  SuggestInsert,
  Suggesting,
  suggesting,
} from "./suggestion-extension";
import { LOCAL_USER } from "@/lib/realtime";
import { RefPicker } from "./RefPicker";
import { NotePopover } from "./NotePopover";
import { uid } from "@/lib/factories";
import { imageFrom, prepareImage } from "@/lib/images";
import { fillImageBlock } from "@/lib/image-block";
import { insertPiece } from "@/lib/kit/insert";
import type { KitPiece } from "@/lib/kit";
import { createImageBlock } from "@/lib/factories";
import { countMarkers } from "@/lib/notes";
import { figureLabels } from "@/lib/figures";

interface Props {
  projectId: string;
  block: TextBlockModel;
  /** Carries the writing editor's chosen type face into the prose. */
  proseClassName?: string;
}

/** Where the `/` menu is anchored, plus what's been typed after the slash. */
interface SlashState {
  from: number;
  query: string;
  x: number;
  y: number;
}

export function TextBlock({ projectId, block, proseClassName }: Props) {
  const updateBlock = useProjects((s) => s.updateBlock);
  const addBlock = useProjects((s) => s.addBlock);
  const insertBlock = useProjects((s) => s.insertBlock);
  const openAI = useUI((s) => s.openAI);
  const setVoiceSample = useUI((s) => s.setVoiceSample);
  const voiceSample = useUI((s) => s.voiceSample);
  const notify = useUI((s) => s.notify);
  const suggestMode = useUI((s) => s.suggestMode);

  const [slash, setSlash] = useState<SlashState | null>(null);
  const [cite, setCite] = useState<{ x: number; y: number } | null>(null);
  /** `pos` is null for a note being written for the first time. */
  const [note, setNote] = useState<{
    x: number;
    y: number;
    text: string;
    pos: number | null;
  } | null>(null);
  const [ref, setRef] = useState<{ x: number; y: number } | null>(null);
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);

  /**
   * How many notes stand in front of this block.
   *
   * Each block is its own editor, so none of them can see the others' notes.
   * This is the one number that has to cross the boundary for the sequence to
   * read as one document.
   */
  const noteBase = useProjects((s) => {
    const project = s.projects.find((p) => p.id === projectId);
    if (!project) return 0;
    let n = 0;
    for (const b of project.blocks) {
      if (b.id === block.id) break;
      if (b.type === "text") n += countMarkers(b.html);
    }
    return n;
  });
  /**
   * What every figure in the project is called right now.
   *
   * Serialised to a string in the selector: zustand compares snapshots by
   * identity, and a fresh object each render would re-render this block on
   * every keystroke anywhere in the document.
   */
  const labelsJson = useProjects((s) => {
    const project = s.projects.find((p) => p.id === projectId);
    return JSON.stringify(figureLabels(project?.blocks ?? []));
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Guards the effect that pushes external edits back into the editor.
  const lastSaved = useRef(block.html);
  /** A collaborator's version, waiting for the caret to leave. */
  const held = useRef<{ html: string; at: number } | null>(null);
  /** When the local user last typed, so a stale held version can be dropped. */
  const typedAt = useRef(0);

  /**
   * Declared above the editor because `editorProps` is captured once, at
   * creation — a handler defined later would be captured as `undefined`.
   */
  const pasteImage = useCallback(
    async (file: File) => {
      try {
        const image = await prepareImage(file);
        const fresh = createImageBlock();
        insertBlock(
          projectId,
          {
            ...fresh,
            src: image.src,
            alt: image.name.replace(/\.[a-z0-9]+$/i, ""),
            naturalWidth: image.width,
            naturalHeight: image.height,
            bytes: image.bytes,
          },
          block.id,
        );
        requestAnimationFrame(() =>
          document
            .getElementById(`block-${fresh.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        );
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "That picture couldn't be read.",
        );
      }
    },
    [insertBlock, projectId, block.id, notify],
  );

  const editor = useEditor({
    // The editor can't render on the server; Next would flag the mismatch.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
      Placeholder.configure({
        placeholder: "Write something, or press / for a block",
      }),
      Citation,
      Footnote,
      Reference,
      SuggestInsert,
      SuggestDelete,
      Suggesting,
    ],
    content: block.html,
    editorProps: {
      attributes: {
        class: `prose-canvas min-h-[1.75em] focus:outline-none ${proseClassName ?? ""}`,
      },
      /**
       * A pasted screenshot becomes an image block right after this one.
       *
       * ProseMirror would otherwise drop the file on the floor — nothing in
       * the schema accepts it — and the paste would appear to do nothing at
       * all, which is the single most confusing failure a paste can have.
       */
      handlePaste: (_view, event) => {
        const file = imageFrom(event.clipboardData);
        if (!file) return false;
        event.preventDefault();
        void pasteImage(file);
        return true;
      },
      /**
       * Clicking a note number opens the note. The alternative — select the
       * marker, find a menu — is how footnotes become write-only.
       */
      handleClickOn: (_view, _pos, node, nodePos, event) => {
        if (node.type.name !== "footnote") return false;
        event.preventDefault();
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        setNote({
          x: rect.left,
          y: rect.bottom + 6,
          text: String(node.attrs.text ?? ""),
          pos: nodePos,
        });
        return true;
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      lastSaved.current = html;
      typedAt.current = Date.now();
      // Typing shouldn't write through to the store on every keystroke —
      // every bound chart would re-render on each character.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateBlock<TextBlockModel>(projectId, block.id, { html });
      }, 250);
    },
  });

  /* Flush pending edits when the block unmounts or the user leaves. */
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        updateBlock<TextBlockModel>(projectId, block.id, {
          html: lastSaved.current,
        });
      }
    },
    [projectId, block.id, updateBlock],
  );

  /* Pull in edits made elsewhere (an accepted AI change, or a collaborator). */
  useEffect(() => {
    if (!editor || block.html === lastSaved.current) return;

    /**
     * Never while the caret is in here.
     *
     * `setContent` rebuilds the document from scratch, so any position held
     * across it is meaningless the moment the incoming text is a different
     * length — restore the old offset and the next keystroke lands inside an
     * old word, which is how two people helping each other produce
     * "A reply from the sender.tten by the sender".
     *
     * There is no honest way around that without a CRDT, so the rule is the
     * predictable one instead: the block you are typing in is yours until you
     * leave it. Changes to every *other* block land immediately, and pointers
     * never wait — which is almost all of what watching someone work looks
     * like.
     */
    if (editor.isFocused) {
      held.current = { html: block.html, at: Date.now() };
      return;
    }

    lastSaved.current = block.html;
    held.current = null;
    replaceContent(editor, block.html, suggestMode);
  }, [block.html, editor, suggestMode]);

  /* A note added in an earlier block renumbers this one's. The count goes in
     as a transaction, so the numbering decorations recompute themselves. */
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr
        .setMeta(footnoteBase, noteBase)
        .setMeta("addToHistory", false),
    );
  }, [editor, noteBase]);

  /* Figure numbers change when a picture is added anywhere above; the labels
     ride in the same way, so every reference re-renders with the new number. */
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr
        .setMeta(referenceLabels, JSON.parse(labelsJson))
        .setMeta("addToHistory", false),
    );
  }, [editor, labelsJson]);

  /* Suggesting is a mode of the editor, carried in as a transaction so undo
     and the keymap both see the same one source. */
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr
        .setMeta(suggesting, { on: suggestMode, by: LOCAL_USER.id })
        .setMeta("addToHistory", false),
    );
  }, [editor, suggestMode]);

  /* Apply what waited, when the caret leaves. */
  useEffect(() => {
    if (!editor) return;
    const onBlur = () => {
      const waiting = held.current;
      held.current = null;
      if (!waiting) return;
      // If I typed after their version arrived, mine is newer and has already
      // been published — applying theirs now would delete what I just wrote.
      if (typedAt.current > waiting.at) return;
      lastSaved.current = waiting.html;
      replaceContent(editor, waiting.html, suggestMode);
    };
    editor.on("blur", onBlur);
    return () => {
      editor.off("blur", onBlur);
    };
  }, [editor, suggestMode]);

  /* Track the slash query and the selection toolbar off editor transactions. */
  useEffect(() => {
    if (!editor) return;

    const onTransaction = () => {
      const { state, view } = editor;
      const { from, to, empty } = state.selection;

      // Selection toolbar — only for a real, non-collapsed range.
      if (!empty && view.hasFocus()) {
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        setToolbar({
          x: (start.left + end.right) / 2,
          y: Math.min(start.top, end.top) - 8,
        });
      } else {
        setToolbar(null);
      }

      setSlash((current) => {
        if (!current) return null;
        if (from < current.from) return null;
        const typed = state.doc.textBetween(current.from, from, "\n", "\n");
        if (!typed.startsWith("/") || typed.includes("\n") || typed.length > 24)
          return null;
        return { ...current, query: typed.slice(1) };
      });
    };

    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor]);

  /**
   * `from` is the position *before* the slash was typed, so the tracked text
   * always reads "/query". Anchoring after the slash instead would make the
   * very first keystroke fail the `startsWith("/")` check and close the menu.
   */
  const openSlash = useCallback((editorInstance: Editor, from: number) => {
    const { view } = editorInstance;
    const coords = view.coordsAtPos(view.state.selection.from);
    setSlash({ from, query: "", x: coords.left, y: coords.bottom + 6 });
  }, []);

  const closeSlash = useCallback(() => setSlash(null), []);

  /** A saved piece, dropped in right after this block. */
  const pickPiece = useCallback(
    (piece: KitPiece) => {
      if (!editor || !slash) return;
      editor
        .chain()
        .focus()
        .deleteRange({ from: slash.from, to: editor.state.selection.from })
        .run();
      setSlash(null);
      const id = insertPiece(projectId, piece, block.id);
      notify(`${piece.name} inserted`);
      if (id)
        requestAnimationFrame(() =>
          document
            .getElementById(`block-${id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        );
    },
    [editor, slash, projectId, block.id, notify],
  );

  const pickBlock = useCallback(
    (type: BlockType) => {
      if (!editor || !slash) return;
      // Remove the "/query" text before inserting the block.
      editor
        .chain()
        .focus()
        .deleteRange({ from: slash.from, to: editor.state.selection.from })
        .run();
      setSlash(null);

      if (type === "text") {
        editor.chain().focus().insertContent("<p></p>").run();
        return;
      }
      const id = addBlock(projectId, type, block.id);
      requestAnimationFrame(() =>
        document
          .getElementById(`block-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );

      // "/image" goes straight to the file picker. The whole point of the
      // block is two clicks, and making someone click the empty frame they
      // just asked for would be a third.
      if (type === "image") fillImageBlock(projectId, id, notify);
    },
    [editor, slash, addBlock, notify, projectId, block.id],
  );

  /** Mark the selection as the voice to match, or match it to the mark. */
  const useAsVoice = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, " ");
    setVoiceSample({ text, projectId });
    notify("Voice sample set — now select the passage to bring into line");
    setToolbar(null);
  }, [editor, setVoiceSample, projectId, notify]);

  const matchVoice = useCallback(() => {
    if (!editor || !voiceSample) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, " ");
    openAI({
      projectId,
      blockId: block.id,
      blockType: "text",
      selectionText: text,
      anchor: { x: toolbar?.x ?? 400, y: (toolbar?.y ?? 200) + 28 },
      seedPrompt: `__tone__ ${voiceSample.text} __endtone__`,
    });
    setToolbar(null);
  }, [editor, voiceSample, openAI, projectId, block.id, toolbar]);

  const askAboutSelection = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, " ");
    const rect = containerRef.current?.getBoundingClientRect();
    openAI({
      projectId,
      blockId: block.id,
      blockType: "text",
      selectionText: text,
      anchor: {
        x: toolbar?.x ?? (rect ? rect.left + rect.width / 2 : 400),
        y: (toolbar?.y ?? 200) + 28,
      },
    });
    setToolbar(null);
  }, [editor, openAI, projectId, block.id, toolbar]);

  if (!editor) {
    // Matches the editor's resting height so the canvas doesn't jump.
    return <div className="min-h-[1.75em] px-1 py-1" aria-hidden="true" />;
  }

  return (
    <div ref={containerRef} className="relative px-1">
      <EditorContent
        editor={editor}
        onKeyDown={(e) => {
          if (slash) {
            // While the menu is open it owns the arrows and Enter.
            if (["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(e.key))
              e.preventDefault();
            if (e.key === "Escape") {
              e.preventDefault();
              closeSlash();
            }
            return;
          }
          // ⌘⇧C — cite at the caret.
          if (e.key.toLowerCase() === "c" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            const coords = editor.view.coordsAtPos(editor.state.selection.from);
            setCite({ x: coords.left, y: coords.bottom + 6 });
            return;
          }
          // ⌘⇧R — refer to a figure or table.
          if (e.key.toLowerCase() === "r" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            const coords = editor.view.coordsAtPos(editor.state.selection.from);
            setRef({ x: coords.left, y: coords.bottom + 6 });
            return;
          }
          // ⌘⇧N — a note at the caret.
          if (e.key.toLowerCase() === "n" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            const coords = editor.view.coordsAtPos(editor.state.selection.from);
            setNote({ x: coords.left, y: coords.bottom + 6, text: "", pos: null });
            return;
          }
          if (e.key === "/") {
            const { $from, empty, from } = editor.state.selection;
            // Only at the start of an empty block — mid-sentence slashes are
            // just slashes. The caret position is read now, before the slash
            // lands; coordinates are read on the next frame, after it does.
            if (empty && $from.parent.textContent === "")
              requestAnimationFrame(() => openSlash(editor, from));
          }
        }}
      />

      {toolbar && (
        <SelectionToolbar
          editor={editor}
          x={toolbar.x}
          y={toolbar.y}
          onAskAI={askAboutSelection}
          onUseAsVoice={useAsVoice}
          onMatchVoice={voiceSample ? matchVoice : undefined}
        />
      )}

      {cite && (
        <CitePicker
          projectId={projectId}
          x={cite.x}
          y={cite.y}
          onClose={() => setCite(null)}
          onInsert={(source, label) => {
            setCite(null);
            editor
              .chain()
              .focus()
              .insertContent({
                type: "citation",
                attrs: { sourceId: source.id, label },
              })
              // A citation is nearly always followed by more prose.
              .insertContent(" ")
              .run();
          }}
        />
      )}

      {ref && (
        <RefPicker
          projectId={projectId}
          x={ref.x}
          y={ref.y}
          onClose={() => setRef(null)}
          onInsert={(figure) => {
            setRef(null);
            editor
              .chain()
              .focus()
              .insertContent({
                type: "reference",
                attrs: { targetId: figure.blockId, label: figure.label },
              })
              .insertContent(" ")
              .run();
          }}
        />
      )}

      {note && (
        <NotePopover
          x={note.x}
          y={note.y}
          initial={note.text}
          onClose={() => setNote(null)}
          onSave={(text) => {
            setNote(null);
            if (note.pos === null) {
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "footnote",
                  attrs: { noteId: uid(), text },
                })
                .run();
              return;
            }
            const at = note.pos;
            editor
              .chain()
              .focus()
              .command(({ tr }) => {
                const existing = tr.doc.nodeAt(at);
                if (!existing) return false;
                tr.setNodeMarkup(at, undefined, { ...existing.attrs, text });
                return true;
              })
              .run();
          }}
          onRemove={
            note.pos === null
              ? undefined
              : () => {
                  const at = note.pos!;
                  setNote(null);
                  editor
                    .chain()
                    .focus()
                    // An atom is one position wide, marker and note together.
                    .command(({ tr }) => {
                      tr.delete(at, at + 1);
                      return true;
                    })
                    .run();
                }
          }
        />
      )}

      {slash && (
        <SlashMenu
          query={slash.query}
          x={slash.x}
          y={slash.y}
          onSelect={pickBlock}
          onSelectPiece={pickPiece}
          onClose={closeSlash}
        />
      )}
    </div>
  );
}

/**
 * Swap the whole document in without it counting as somebody typing.
 *
 * `setContent` is one enormous insertion as far as ProseMirror is concerned,
 * and the suggesting plugin marks insertions — so applying a collaborator's
 * version, or the result of accepting a proposal, would mark the *entire
 * block* as a new suggestion. Pausing the mode across the swap is the only
 * honest way to tell the two apart: one is a person writing, the other is the
 * document being replaced.
 */
function replaceContent(editor: Editor, html: string, suggestMode: boolean) {
  const by = LOCAL_USER.id;
  editor.view.dispatch(
    editor.state.tr.setMeta(suggesting, { on: false, by }).setMeta("addToHistory", false),
  );
  editor.commands.setContent(html, { emitUpdate: false });
  editor.view.dispatch(
    editor.state.tr
      .setMeta(suggesting, { on: suggestMode, by })
      .setMeta("addToHistory", false),
  );
}

/* ── Selection toolbar ──────────────────────────────────── */

function SelectionToolbar({
  editor,
  x,
  y,
  onAskAI,
  onUseAsVoice,
  onMatchVoice,
}: {
  editor: Editor;
  x: number;
  y: number;
  onAskAI: () => void;
  onUseAsVoice: () => void;
  /** Absent until a voice sample has been captured. */
  onMatchVoice?: () => void;
}) {
  const items = [
    {
      key: "bold",
      label: "Bold",
      text: "B",
      className: "font-semibold",
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      label: "Italic",
      text: "I",
      className: "italic font-serif",
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: "code",
      label: "Code",
      text: "‹›",
      className: "font-mono",
      active: editor.isActive("code"),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      key: "h2",
      label: "Heading",
      text: "H2",
      className: "font-mono text-[10px]",
      active: editor.isActive("heading", { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: "quote",
      label: "Quote",
      text: "❝",
      className: "",
      active: editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      key: "list",
      label: "Bulleted list",
      text: "•",
      className: "",
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
  ];

  return (
    <div
      className="anim-pop fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-md border border-line-strong bg-surface-2 p-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] print:hidden"
      style={{ left: x, top: y }}
      // Keep the editor selection alive when a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-pressed={item.active}
          onClick={item.run}
          className={cn(
            "grid size-6 place-items-center rounded-xs text-[12px] transition-colors duration-100",
            item.className,
            item.active
              ? "bg-white/10 text-fg"
              : "text-fg-muted hover:bg-white/5 hover:text-fg",
          )}
        >
          {item.text}
        </button>
      ))}

      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />

      <button
        type="button"
        onClick={onAskAI}
        className="flex items-center gap-1.5 rounded-xs px-1.5 py-1 text-[11.5px] text-accent transition-colors duration-100 hover:bg-accent-soft"
      >
        <Icon name="sparkle" size={11} />
        Ask AI
        <kbd className="kbd !px-1 !py-0.5">⌘J</kbd>
      </button>

      <button
        type="button"
        onClick={onUseAsVoice}
        title="Use this passage as the voice to match"
        className="rounded-xs px-1.5 py-1 text-[11.5px] text-fg-muted transition-colors duration-100 hover:bg-white/5 hover:text-fg"
      >
        Voice
      </button>

      {onMatchVoice && (
        <button
          type="button"
          onClick={onMatchVoice}
          title="Rewrite this in the sampled voice"
          className="rounded-xs px-1.5 py-1 text-[11.5px] text-fg-muted transition-colors duration-100 hover:bg-white/5 hover:text-fg"
        >
          Match
        </button>
      )}
    </div>
  );
}
