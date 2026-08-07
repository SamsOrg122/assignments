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
import { imageFrom, prepareImage } from "@/lib/images";
import { fillImageBlock } from "@/lib/image-block";
import { createImageBlock } from "@/lib/factories";

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

  const [slash, setSlash] = useState<SlashState | null>(null);
  const [cite, setCite] = useState<{ x: number; y: number } | null>(null);
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Guards the effect that pushes external edits back into the editor.
  const lastSaved = useRef(block.html);

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
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      lastSaved.current = html;
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

  /* Pull in edits made elsewhere (an accepted AI change, say). */
  useEffect(() => {
    if (!editor || block.html === lastSaved.current) return;
    lastSaved.current = block.html;
    editor.commands.setContent(block.html, { emitUpdate: false });
  }, [block.html, editor]);

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

      {slash && (
        <SlashMenu
          query={slash.query}
          x={slash.x}
          y={slash.y}
          onSelect={pickBlock}
          onClose={closeSlash}
        />
      )}
    </div>
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
