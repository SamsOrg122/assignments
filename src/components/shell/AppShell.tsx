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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (e.key.toLowerCase() === "b") {
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
      if (e.shiftKey && e.key.toLowerCase() === "v") {
        if (useUI.getState().voiceOpen) return;
        e.preventDefault();
        setVoiceOpen(true);
        return;
      }
      // ⌘⇧S reads the last answer aloud, which means opening voice if it isn't.
      if (e.shiftKey && e.key.toLowerCase() === "s") {
        if (useUI.getState().voiceOpen) return;
        e.preventDefault();
        setVoiceOpen(true);
        return;
      }
      // ⌘J — ask AI about whatever is selected, wherever the caret is.
      if (e.key.toLowerCase() === "j") {
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
      <Toast />
    </div>
  );
}
