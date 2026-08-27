"use client";

import { Suspense, useEffect } from "react";
import { useParams } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { StorageAlarm } from "./StorageAlarm";
import { CommandPalette } from "./CommandPalette";
import { Toast } from "@/components/ui/Toast";
import { InlineAI } from "@/components/ai/InlineAI";
import { ShortcutSheet } from "./ShortcutSheet";
import { VoiceDock } from "@/components/voice/VoiceDock";
import { Recorder, isCapturing } from "@/components/transcript/Recorder";
import { hydrateTranscript, useTranscript } from "@/lib/transcript";
import { DemoBootstrap } from "./DemoBootstrap";
import { surfaceFor } from "@/lib/shortcuts";
import { useUI } from "@/lib/ui-store";
import { useProjects } from "@/lib/store";
import { useAppearanceSync } from "@/lib/theme-store";
import { useAuthHydrated } from "@/lib/auth/store";
import { useAccountSession } from "@/lib/auth/session";
import { useOfflineReady } from "@/lib/offline";
import { hydrateShared } from "@/lib/collab/shared";
import { connectAI } from "@/lib/ai";
import { useSync } from "@/lib/db/sync";
import { useKitFonts } from "@/lib/kit/use-kit-fonts";
import type { BlockType } from "@/lib/types";

/**
 * The chords that stay live inside a text editor.
 *
 * Everything else in the global listener stands down there — see the guard in
 * `onKeyDown`. These are in because no editing surface binds them and they are
 * how you get *out* of a document: the palette, this sheet, the assistant on
 * the selection, and voice.
 */
const LIVE_WHILE_EDITING = new Set(["k", "/", "j", "v"]);

/**
 * The thing that edits text under `target`, if there is one.
 *
 * Walks up instead of testing the target alone: a caret in ProseMirror puts
 * the event on the contenteditable host, but a press on one of its atoms — a
 * note marker, an equation — lands on a child marked `contenteditable=false`,
 * and only the walk finds the editor above it. A read-only or disabled field
 * is not editing anything, so it doesn't count.
 */
/** The input types that hold text. A checkbox, a slider and a file button are
 *  all `<input>`, none of them is editing anything, and `readOnly` is
 *  meaningless on all three — so testing the tag alone would stand the global
 *  shortcuts down over a tickbox. */
const TEXTUAL_INPUT = new Set([
  "text", "search", "email", "url", "tel", "password", "number", "", 
]);

function editingHost(target: EventTarget | null): HTMLElement | null {
  for (
    let el: Element | null = target instanceof Element ? target : null;
    el;
    el = el.parentElement
  ) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.isContentEditable) return el;
    if (el instanceof HTMLTextAreaElement && !el.readOnly && !el.disabled)
      return el;
    if (
      el instanceof HTMLInputElement &&
      TEXTUAL_INPUT.has(el.type) &&
      !el.readOnly &&
      !el.disabled
    )
      return el;
  }
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  // Keeps <html data-*> in step with stored preferences.
  useAppearanceSync();
  // The identity store persists with `skipHydration`, like every other one —
  // without this call it silently starts from defaults on every load, and the
  // account choice would be asked again after each reload.
  useAuthHydrated();
  // …and then asks the server who that actually is. The stored identity is a
  // cache: it can outlive an expired session, and it can miss a sign-in that
  // happened in another tab when a confirmation link was clicked.
  useAccountSession();
  // Which projects are live-shared is persisted too, and has the same
  // skipHydration contract as everything else.
  useEffect(hydrateShared, []);
  // Recordings are persisted as they are heard, with the same skipHydration
  // contract. This also closes off a recording the tab died in the middle of,
  // which is what makes an interrupted meeting findable instead of lost.
  useEffect(hydrateTranscript, []);
  // Asks the server once whether a model is configured. Until it answers — and
  // for good if it says no — the local assistant is what runs.
  useEffect(connectAI, []);
  // Pushes work to the account and pulls other machines' changes down. A no-op
  // with no database configured, which is the normal case.
  useSync();
  useKitFonts();
  // Stores the app itself, so it opens without a network. Work already
  // survived offline; the app — the only way to reach it — did not.
  useOfflineReady();

  const { togglePalette, toggleSidebar, setSidebarOpen, openAI, closeAI, closePalette } =
    useUI();
  const params = useParams<{ projectId?: string }>();
  const projectId = params?.projectId ?? null;
  const shortcuts = useUI((s) => s.shortcutsOpen);
  const setShortcuts = useUI((s) => s.setShortcutsOpen);
  const setVoiceOpen = useUI((s) => s.setVoiceOpen);

  // The sidebar overlays the canvas below `lg`, so it starts closed there.
  useEffect(() => {
    setSidebarOpen(window.matchMedia("(min-width: 1024px)").matches);
  }, [setSidebarOpen]);

  // One microphone at a time, enforced in the one file that mounts both — the
  // ⌘⇧V guard below only covers the keyboard, and voice mode can also be
  // opened from the palette and from the notepad, which are other files.
  const capturing = useTranscript((s) => s.status !== "idle");
  useEffect(() => {
    if (!capturing || !useUI.getState().voiceOpen) return;
    void Promise.resolve().then(() => useUI.getState().setVoiceOpen(false));
  }, [capturing]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      // One test for every binding below, not just for the one that clashed.
      // A chord typed into something that edits text belongs to that thing
      // first: ⌘B is bold in a document, ProseMirror preventDefaults it, and
      // this listener firing as well collapsed the sidebar behind the writer's
      // back on every bold word.
      if (!LIVE_WHILE_EDITING.has(key) && editingHost(e.target)) return;

      if (key === "k") {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (key === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setShortcuts(!useUI.getState().shortcutsOpen);
        return;
      }
      // ⌘⇧V opens voice mode from anywhere. Once it's open the dock owns the
      // key, so the same press stops talking rather than reopening.
      if (e.shiftKey && key === "v") {
        if (useUI.getState().voiceOpen) return;
        e.preventDefault();
        // Voice mode holds a recogniser and a microphone of its own, and a
        // browser only grants one recogniser at a time. Opening it mid-meeting
        // would take the device off the transcriber and leave a bar that looks
        // like it is recording an hour it is no longer hearing.
        if (isCapturing()) {
          useUI.getState().notify("The transcriber is recording. Stop it first.");
          return;
        }
        setVoiceOpen(true);
        return;
      }
      // ⌘⇧S is deliberately NOT handled here. It reads the last answer aloud,
      // and the dock is the only thing that has an answer — so the dock binds
      // it. This used to open voice instead, which meant a key advertised as
      // "read the answer aloud" switched on the microphone and recorded, with
      // nothing to read.
      // ⌘J — ask AI about whatever is selected, wherever the caret is.
      if (key === "j") {
        if (!projectId) return;
        e.preventDefault();
        const selection = window.getSelection();
        const text = selection?.toString().trim() ?? "";
        const node = selection?.anchorNode;
        const element =
          node instanceof Element ? node : (node?.parentElement ?? null);
        const host = element?.closest<HTMLElement>("[data-block-id]");
        const blocks = useProjects
          .getState()
          .projects.find((p) => p.id === projectId)?.blocks;
        const blockId = host?.dataset.blockId ?? blocks?.[0]?.id;
        if (!blockId) return;

        const rect =
          (selection?.rangeCount
            ? selection.getRangeAt(0).getBoundingClientRect()
            : null) ??
          host?.getBoundingClientRect() ??
          null;

        openAI({
          projectId,
          blockId,
          blockType:
            (host?.dataset.blockType as BlockType | undefined) ??
            blocks?.find((b) => b.id === blockId)?.type ??
            "text",
          selectionText: text,
          anchor: {
            x: rect && rect.width ? rect.left + rect.width / 2 : window.innerWidth / 2,
            y: rect && rect.height ? rect.bottom + 8 : 140,
          },
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePalette, toggleSidebar, openAI, projectId, setShortcuts, setVoiceOpen]);

  // Route changes should never leave a modal behind.
  useEffect(() => {
    closeAI();
    closePalette();
  }, [projectId, closeAI, closePalette]);

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Above everything, because it means the app has stopped keeping
            what is below it. */}
        <StorageAlarm />
        {children}
      </div>
      {/* Reads ?demo=1, so it needs a Suspense boundary of its own. */}
      <Suspense fallback={null}>
        <DemoBootstrap />
      </Suspense>
      <CommandPalette />
      <InlineAI />
      {shortcuts && (
        <ShortcutSheet
          surface={surfaceFor(
            useProjects.getState().projects.find((p) => p.id === projectId)?.kind,
          )}
          onClose={() => setShortcuts(false)}
        />
      )}
      <VoiceDock />
      {/* Mounted here, not in a page, so a recording survives navigation: you
          start it in the notepad, walk to the library, and it is still
          running. */}
      <Recorder />
      <Toast />
    </div>
  );
}
