"use client";

/**
 * ⌘K — the primary way to do anything.
 *
 * Commands are built fresh from the current route and document, so the palette
 * offers "Add chart" only where a chart can go, and lists this project's blocks
 * as jump targets. Ranking is fuzzy (see lib/fuzzy) over title + keywords, and
 * a couple of natural-language shapes ("new project Roadmap") synthesise a
 * command on the fly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { fuzzyMatch, segments } from "@/lib/fuzzy";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/Icon";
import { KINDS, KIND_ORDER } from "@/lib/kinds";
import { exportProject, EXPORT_LABELS, type ExportFormat } from "@/lib/export";
import { PEOPLE, useChat } from "@/lib/chat";
import { LOCAL_USER } from "@/lib/realtime";
import { ACCENTS, useAppearance, type AccentName } from "@/lib/theme-store";
import type { BlockType, ProjectKind } from "@/lib/types";

/**
 * The prompts that only make sense with the whole document in context. They
 * live in the palette so they're discoverable by typing, not buried in a menu.
 */
const WORKSPACE_PROMPTS: Array<[string, string, string, string]> = [
  [
    "outline",
    "Outline my whole document",
    "Outline my whole thesis and tell me where I am",
    "Every section, with word counts against the goal",
  ],
  [
    "terminology",
    "Check terminology consistency",
    "Am I using terms interchangeably?",
    "Finds near-synonyms drifting across sections",
  ],
  [
    "consistency",
    "Find contradictory claims",
    "Is this consistent with what I argued earlier?",
    "Compares every claim against every other",
  ],
  [
    "drift",
    "Where does my argument drift?",
    "My conclusion doesn't line up with my research question — where does it drift?",
    "Scores each section against your research question",
  ],
  [
    "number",
    "Number all headings",
    "Number all the headings",
    "Renumbers every heading in order",
  ],
  [
    "deck",
    "Make a 10-slide deck from this",
    "Make a 10-slide pitch from this document",
    "Creates a Deck project from your headings",
  ],
];

/** Maps a spoken word in "new thesis" onto a project kind. */
function kindFromWord(word: string): ProjectKind | null {
  const w = word.toLowerCase();
  const direct: Record<string, ProjectKind> = {
    thesis: "doc",
    doc: "doc",
    document: "doc",
    essay: "doc",
    paper: "doc",
    dissertation: "doc",
    note: "notes",
    notebook: "notes",
    deck: "deck",
    slide: "deck",
    presentation: "deck",
    pitch: "deck",
    board: "board",
    canvas: "board",
    whiteboard: "board",
    code: "code",
    design: "design",
    project: "doc",
  };
  // Exact match first, then a naive de-pluralisation for "notes"/"slides".
  // Order matters: stripping the "s" first would turn "thesis" into "thesi".
  return direct[w] ?? direct[w.replace(/s$/, "")] ?? null;
}

interface Command {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon: IconName;
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

export const BLOCK_META: Record<
  BlockType,
  { label: string; icon: IconName; hint: string; keywords: string }
> = {
  text: {
    label: "Text",
    icon: "text",
    hint: "Prose, headings, lists",
    keywords: "write paragraph heading prose note markdown",
  },
  table: {
    label: "Table",
    icon: "table",
    hint: "Typed columns, sorting, formulas",
    keywords: "grid spreadsheet data rows columns sheet formula",
  },
  chart: {
    label: "Chart",
    icon: "chart",
    hint: "Bound live to a table",
    keywords: "graph plot bar line area pie visualise visualize",
  },
  slides: {
    label: "Slides",
    icon: "slides",
    hint: "A deck inside the canvas",
    keywords: "deck presentation powerpoint keynote present",
  },
  code: {
    label: "Code",
    icon: "code",
    hint: "Multi-file editor with preview",
    keywords: "editor javascript html css program run preview",
  },
  bibliography: {
    label: "Bibliography",
    icon: "quote",
    hint: "Auto-formatted from your sources",
    keywords: "references works cited sources citations apa mla chicago harvard",
  },
};

/**
 * The dialog mounts only while open, so "reset on open" is just mount-time
 * state — no effect, no extra render pass.
 */
export function CommandPalette() {
  const paletteOpen = useUI((s) => s.paletteOpen);
  const paletteSeed = useUI((s) => s.paletteSeed);
  if (!paletteOpen) return null;
  return <PaletteDialog seed={paletteSeed} />;
}

function PaletteDialog({ seed }: { seed: string }) {
  const router = useRouter();
  const params = useParams<{ projectId?: string }>();
  const projectId = params?.projectId ?? null;

  const projects = useProjects((s) => s.projects);
  const addProject = useProjects((s) => s.addProject);
  const addBlock = useProjects((s) => s.addBlock);
  const duplicateProject = useProjects((s) => s.duplicateProject);
  const deleteProject = useProjects((s) => s.deleteProject);
  const resetWorkspace = useProjects((s) => s.resetWorkspace);

  const channels = useChat((s) => s.channels);
  const openDM = useChat((s) => s.openDM);
  const sendMessage = useChat((s) => s.send);
  const appearance = useAppearance();

  const closePalette = useUI((s) => s.closePalette);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const notify = useUI((s) => s.notify);
  const openAI = useUI((s) => s.openAI);

  const [query, setQuery] = useState(seed);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const project = projects.find((p) => p.id === projectId) ?? null;

  useEffect(() => {
    // Focus after paint so the open animation doesn't fight the caret.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];

    if (project) {
      for (const [type, meta] of Object.entries(BLOCK_META) as Array<
        [BlockType, (typeof BLOCK_META)[BlockType]]
      >) {
        list.push({
          id: `block:${type}`,
          title: `Add ${meta.label.toLowerCase()} block`,
          subtitle: meta.hint,
          group: "Insert",
          icon: meta.icon,
          keywords: `${meta.keywords} insert new block create`,
          run: () => {
            const id = addBlock(project.id, type);
            notify(`${meta.label} block added`);
            requestAnimationFrame(() =>
              document
                .getElementById(`block-${id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" }),
            );
          },
        });
      }

      const askWith = (seedPrompt?: string) => () =>
        openAI({
          projectId: project.id,
          blockId: project.blocks[0]?.id ?? project.board[0]?.id ?? "",
          blockType: project.blocks[0]?.type ?? "text",
          selectionText: "",
          anchor: { x: window.innerWidth / 2, y: 140 },
          seedPrompt,
        });

      list.push({
        id: "ai:project",
        title: "Ask AI about this project",
        subtitle: "Reads every block, not just the selection",
        group: "AI",
        icon: "sparkle",
        keywords: "assistant question context whole workspace",
        run: askWith(),
      });

      // The workspace-aware checks — the ones that need the whole document.
      for (const [id, title, prompt, subtitle] of WORKSPACE_PROMPTS) {
        list.push({
          id: `ai:${id}`,
          title,
          subtitle,
          group: "AI",
          icon: "sparkle",
          keywords: `${prompt} whole document thesis check`,
          run: askWith(prompt),
        });
      }

      for (const format of ["pdf", "doc", "html", "markdown"] as ExportFormat[]) {
        list.push({
          id: `export:${format}`,
          title: `Export to ${EXPORT_LABELS[format]}`,
          subtitle:
            format === "doc"
              ? "Word-compatible HTML — opens in Word, keeps formatting"
              : format === "pdf"
                ? "Prints the document, not the app"
                : undefined,
          group: "Export",
          icon: "download",
          // Per-format keywords only: putting "word" on every entry made
          // "export to word" match "Export to Web page" just as well.
          keywords:
            `export save download share ${format} ` +
            (format === "doc"
              ? "word docx microsoft supervisor"
              : format === "pdf"
                ? "print paper submit"
                : format === "html"
                  ? "web page site"
                  : "md plain text"),
          run: () => exportProject(project, format),
        });
      }

      list.push({
        id: "project:duplicate",
        title: "Duplicate this project",
        group: "Project",
        icon: "copy",
        keywords: "copy clone fork",
        run: () => {
          const id = duplicateProject(project.id);
          if (id) router.push(`/p/${id}`);
        },
      });

      list.push({
        id: "project:delete",
        title: "Delete this project",
        group: "Project",
        icon: "trash",
        keywords: "remove destroy trash",
        run: () => {
          deleteProject(project.id);
          notify("Project deleted");
          router.push("/library");
        },
      });

      for (const block of project.blocks) {
        const meta = BLOCK_META[block.type];
        list.push({
          id: `jump:${block.id}`,
          title: block.title ?? `${meta.label} block`,
          subtitle: "Jump to block",
          group: "This project",
          icon: meta.icon,
          keywords: `${meta.keywords} goto scroll`,
          run: () =>
            document
              .getElementById(`block-${block.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        });
      }
    }

    for (const k of KIND_ORDER) {
      const meta = KINDS[k];
      list.push({
        id: `new:${k}`,
        title: `New ${meta.label.toLowerCase()}`,
        subtitle: meta.hint,
        group: "Create",
        icon: meta.icon,
        keywords: `new create start blank ${meta.keywords}`,
        run: () => router.push(`/p/${addProject(k)}`),
      });
    }

    for (const p of projects) {
      if (p.id === projectId) continue;
      list.push({
        id: `open:${p.id}`,
        title: p.name,
        subtitle: `${p.blocks.length} block${p.blocks.length === 1 ? "" : "s"}`,
        group: "Projects",
        icon: "arrow-right",
        keywords: "open go to switch project",
        run: () => router.push(`/p/${p.id}`),
      });
    }

    /* ── Chat ─────────────────────────────────────────── */

    for (const channel of channels) {
      const label =
        channel.kind === "channel" ? `#${channel.name}` : channel.name;
      list.push({
        id: `chat:${channel.id}`,
        title: label,
        subtitle: channel.topic ?? "Direct message",
        group: "Chat",
        icon: channel.kind === "dm" ? "users" : "board",
        keywords: `chat channel message conversation dm ${channel.name}`,
        run: () => router.push(`/chat/${channel.id}`),
      });
    }

    for (const person of PEOPLE) {
      if (person.id === LOCAL_USER.id) continue;
      list.push({
        id: `dm:${person.id}`,
        title: `Message ${person.name}`,
        subtitle: "Open a direct message",
        group: "Chat",
        icon: "users",
        keywords: "dm direct message chat talk write",
        run: () => router.push(`/chat/${openDM(person.id)}`),
      });
    }

    // Sharing the open project into a channel — the bridge from work to
    // conversation, without leaving the keyboard.
    if (project) {
      for (const channel of channels.slice(0, 8)) {
        const label =
          channel.kind === "channel" ? `#${channel.name}` : channel.name;
        list.push({
          id: `share:${channel.id}`,
          title: `Share this project in ${label}`,
          subtitle: "Posts a live card, not a link",
          group: "Chat",
          icon: "arrow-right",
          keywords: `share post send project to channel ${channel.name}`,
          run: () => {
            sendMessage(channel.id, "", {
              attachments: [{ kind: "project", projectId: project.id }],
            });
            notify(`Shared in ${label}`);
            router.push(`/chat/${channel.id}`);
          },
        });
      }
    }

    /* ── Appearance ───────────────────────────────────── */

    list.push({
      id: "theme:toggle",
      title: appearance.mode === "light" ? "Switch to dark" : "Switch to light",
      subtitle: "Theme",
      group: "Appearance",
      icon: "sparkle",
      keywords: "theme dark light mode appearance colour color",
      run: () =>
        appearance.set("mode", appearance.mode === "light" ? "dark" : "light"),
    });

    for (const accent of Object.keys(ACCENTS) as AccentName[]) {
      list.push({
        id: `accent:${accent}`,
        title: `Accent: ${ACCENTS[accent].label}`,
        group: "Appearance",
        icon: "sparkle",
        keywords: `accent colour color theme ${accent}`,
        run: () => appearance.set("accent", accent),
      });
    }

    list.push({
      id: "density:toggle",
      title:
        appearance.density === "compact"
          ? "Comfortable density"
          : "Compact density",
      group: "Appearance",
      icon: "panel-left",
      keywords: "density compact comfortable spacing tighter",
      run: () =>
        appearance.set(
          "density",
          appearance.density === "compact" ? "comfortable" : "compact",
        ),
    });

    list.push(
      {
        id: "nav:settings",
        title: "Open settings",
        group: "Navigate",
        icon: "settings",
        keywords: "preferences appearance theme accent providers",
        run: () => router.push("/settings"),
      },
      {
        id: "nav:chat",
        title: "Go to chat",
        group: "Navigate",
        icon: "users",
        keywords: "messages channels conversations dm",
        run: () => router.push("/chat"),
      },
      {
        id: "nav:home",
        title: "Go to the library",
        group: "Navigate",
        icon: "home",
        keywords: "projects list index dashboard home",
        run: () => router.push("/library"),
      },
      {
        id: "settings:sidebar",
        title: "Toggle sidebar",
        group: "Settings",
        icon: "panel-left",
        shortcut: "⌘B",
        keywords: "hide show navigation panel",
        run: toggleSidebar,
      },
      {
        id: "settings:reset",
        title: "Reset workspace",
        subtitle: "Restore the sample projects — discards local changes",
        group: "Settings",
        icon: "refresh",
        keywords: "clear wipe seed demo restore default",
        run: () => {
          resetWorkspace();
          notify("Workspace reset");
          router.push("/library");
        },
      },
    );

    return list;
  }, [
    project,
    projects,
    projectId,
    addBlock,
    addProject,
    duplicateProject,
    deleteProject,
    resetWorkspace,
    toggleSidebar,
    notify,
    openAI,
    router,
    channels,
    openDM,
    sendMessage,
    appearance,
  ]);

  const results = useMemo(() => {
    const q = query.trim();

    const scored = commands
      .map((c) => {
        const onTitle = fuzzyMatch(q, c.title);
        const onKeywords = q
          ? fuzzyMatch(q, `${c.title} ${c.keywords ?? ""} ${c.subtitle ?? ""}`)
          : null;
        if (!onTitle && !onKeywords) return null;
        // Title hits outrank keyword hits at equal score.
        const score = Math.max(
          onTitle ? onTitle.score + 20 : -Infinity,
          onKeywords ? onKeywords.score : -Infinity,
        );
        return { command: c, score, matches: onTitle?.matches ?? [] };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score);

    // Natural language: "new thesis", "new board Structure", "create a deck".
    const named = /^(?:new|create|start)\s+(?:an?\s+)?([a-z/]+)\s*(.*)$/i.exec(q);
    if (named) {
      const kind = kindFromWord(named[1]);
      const name = named[2].trim();
      if (kind) {
        scored.unshift({
          command: {
            id: "project:new-named",
            title: name
              ? `New ${KINDS[kind].label.toLowerCase()} “${name}”`
              : `New ${KINDS[kind].label.toLowerCase()}`,
            subtitle: KINDS[kind].hint,
            group: "Create",
            icon: KINDS[kind].icon,
            run: () => router.push(`/p/${addProject(kind, name || undefined)}`),
          },
          score: 9999,
          matches: [],
        });
      }
    }

    return scored.slice(0, 40);
  }, [commands, query, addProject, router]);

  // Reset the highlight as the query changes, adjusting during render rather
  // than in an effect so the list never paints with a stale selection.
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setActive(0);
  }

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active, results.length]);

  const run = useCallback(
    (index: number) => {
      const hit = results[index];
      if (!hit) return;
      closePalette();
      // Let the overlay unmount before the command moves focus or navigates.
      requestAnimationFrame(() => hit.command.run());
    },
    [results, closePalette],
  );

  const grouped: Array<{ group: string; items: typeof results }> = [];
  for (const r of results) {
    const last = grouped.at(-1);
    if (last && last.group === r.command.group) last.items.push(r);
    else grouped.push({ group: r.command.group, items: [r] });
  }

  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh] sm:pt-[16vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="anim-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={closePalette}
      />

      <div
        className={cn(
          "anim-pop relative w-full max-w-[560px] overflow-hidden rounded-lg",
          "border border-line-strong bg-surface shadow-[0_24px_80px_-12px_rgba(0,0,0,0.85)]",
        )}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (results.length ? (i + 1) % results.length : 0));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) =>
              results.length ? (i - 1 + results.length) % results.length : 0,
            );
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(active);
          } else if (e.key === "Escape") {
            e.preventDefault();
            closePalette();
          }
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Icon name="search" size={15} className="shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions, blocks, projects…"
            aria-label="Command"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent py-3.5 text-[14px] text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="kbd hidden sm:block">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-fg-subtle">
              Nothing matches “{query}”.
            </p>
          ) : (
            grouped.map(({ group, items }, gi) => (
              // Groups are runs, so the same label can appear twice — index
              // keeps the keys unique.
              <div key={`${group}-${gi}`} className="pb-1">
                <div className="label-mono px-4 pt-2.5 pb-1.5">{group}</div>
                {items.map((r) => {
                  flatIndex++;
                  const index = flatIndex;
                  const isActive = index === active;
                  return (
                    <button
                      key={r.command.id}
                      type="button"
                      data-active={isActive}
                      onMouseMove={() => setActive(index)}
                      onClick={() => run(index)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left",
                        "transition-colors duration-100",
                        isActive ? "bg-surface-2" : "hover:bg-surface-2/60",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-sm border border-line",
                          isActive ? "text-fg" : "text-fg-muted",
                        )}
                      >
                        <Icon name={r.command.icon} size={13} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-fg">
                          {segments(r.command.title, r.matches).map((s, i) => (
                            <span
                              key={i}
                              className={s.hit ? "text-accent" : undefined}
                            >
                              {s.text}
                            </span>
                          ))}
                        </span>
                        {r.command.subtitle && (
                          <span className="block truncate text-[11.5px] text-fg-subtle">
                            {r.command.subtitle}
                          </span>
                        )}
                      </span>
                      {r.command.shortcut && (
                        <kbd className="kbd">{r.command.shortcut}</kbd>
                      )}
                      {isActive && (
                        <Icon
                          name="corner-down-left"
                          size={13}
                          className="shrink-0 text-fg-subtle"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-3.5 py-2">
          <Hint keys="↑↓" label="navigate" />
          <Hint keys="↵" label="run" />
          <Hint keys="esc" label="close" />
          <span className="ml-auto font-mono text-[10px] text-fg-subtle">
            {results.length} result{results.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="kbd">{keys}</kbd>
      <span className="text-[10.5px] text-fg-subtle">{label}</span>
    </span>
  );
}
