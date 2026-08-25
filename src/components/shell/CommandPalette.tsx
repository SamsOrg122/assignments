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
import { fillImageBlock } from "@/lib/image-block";
import { linkVerdict, shareLink } from "@/lib/share";
import { useKit } from "@/lib/kit";
import { insertPiece, kitImage } from "@/lib/kit/insert";
import { createImageBlock } from "@/lib/factories";
import { useProjects } from "@/lib/store";
import { useHasTeam, useScope } from "@/lib/scope";
import { useUI } from "@/lib/ui-store";
import { fuzzyMatch, segments } from "@/lib/fuzzy";
import { searchContent } from "@/lib/global-search";
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
  image: {
    label: "Image",
    icon: "image",
    hint: "Drop, paste or pick a picture",
    keywords: "picture photo figure screenshot jpg png upload drop paste",
  },
  bibliography: {
    label: "Bibliography",
    icon: "quote",
    hint: "Auto-formatted from your sources",
    keywords: "references works cited sources citations apa mla chicago harvard",
  },
  toc: {
    label: "Contents",
    icon: "list",
    hint: "Built from your headings, always current",
    keywords: "table of contents toc outline index headings navigation",
  },
  form: {
    label: "Form",
    icon: "list",
    hint: "Questions, and the answers in a table",
    keywords: "form survey questionnaire poll questions responses collect data",
  },
};

/**
 * The dialog mounts only while open, so "reset on open" is just mount-time
 * state — no effect, no extra render pass.
 */
/** Above anything the fuzzy scorer produces, so a pasted address wins. */
const EXACT_PATH_SCORE = 10_000;

/** How many matches inside the work itself the list will carry. */
const CONTENT_HITS = 15;

/**
 * The ceiling on rows.
 *
 * High on purpose. With an empty query this list is the browsable index of
 * the whole product — every room, every export, everything you can make — and
 * a row cut off the bottom of it is a feature nobody finds. It used to be 40,
 * which fitted until the Navigate group grew to cover every route; after that
 * a workspace with five projects lost Pricing, the voice command, the
 * keyboard sheet and the workspace controls off the end, silently. This is a
 * runaway guard, not a budget.
 */
const ROWS = 200;

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

  const allProjects = useProjects((s) => s.projects);
  const kitAssets = useKit((s) => s.assets);
  // The palette searches the world you are in — a personal thesis should not
  // surface while wearing the team hat, and vice versa. The *active* project
  // is looked up in the full list below, because being inside a document is
  // its own proof you can see it, whichever world the switch is on.
  const chosen = useScope((s) => s.scope);
  const hasTeam = useHasTeam();
  const world = hasTeam ? chosen : "personal";
  const projects = useMemo(
    () => allProjects.filter((p) => (p.scope ?? "personal") === world),
    [allProjects, world],
  );
  const addProject = useProjects((s) => s.addProject);
  const addBlock = useProjects((s) => s.addBlock);
  const duplicateProject = useProjects((s) => s.duplicateProject);
  const deleteProject = useProjects((s) => s.deleteProject);
  const resetWorkspace = useProjects((s) => s.resetWorkspace);
  const loadSamples = useProjects((s) => s.loadSamples);

  const channels = useChat((s) => s.channels);
  const openDM = useChat((s) => s.openDM);
  const sendMessage = useChat((s) => s.send);
  const appearance = useAppearance();

  const closePalette = useUI((s) => s.closePalette);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const notify = useUI((s) => s.notify);
  const openAI = useUI((s) => s.openAI);
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen);
  const setVoiceOpen = useUI((s) => s.setVoiceOpen);

  const [query, setQuery] = useState(seed);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const project = allProjects.find((p) => p.id === projectId) ?? null;

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
            if (type === "image") fillImageBlock(project.id, id, notify);
          },
        });
      }

      /**
       * The kit, offered where everything else is offered.
       *
       * Not a separate "insert from kit" dialog: a saved piece is another
       * thing you can add to a document, and it should rank against the block
       * types by the same fuzzy search as everything else.
       */
      for (const piece of kitAssets) {
        if (piece.kind !== "piece" || piece.of !== "block") continue;
        list.push({
          id: `kit:${piece.id}`,
          title: `Insert ${piece.name}`,
          subtitle: "From your kit — inserted as a copy",
          group: "Insert",
          icon: "group",
          keywords: "kit piece saved reuse component template insert",
          run: () => {
            const id = insertPiece(project.id, piece);
            notify(`${piece.name} inserted`);
            if (id)
              requestAnimationFrame(() =>
                document
                  .getElementById(`block-${id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" }),
              );
          },
        });
      }

      for (const picture of kitAssets) {
        if (picture.kind !== "image") continue;
        list.push({
          id: `kit:${picture.id}`,
          title: `Insert ${picture.name}`,
          subtitle: "A picture from your kit",
          group: "Insert",
          icon: "image",
          keywords: "kit picture image logo saved insert",
          run: () => {
            void kitImage(
              picture.id,
              picture.name,
              picture.width,
              picture.height,
            ).then((image) => {
              if (!image) {
                notify("That picture couldn't be read back.");
                return;
              }
              const block = createImageBlock();
              useProjects.getState().insertBlock(project.id, {
                ...block,
                src: image.src,
                alt: image.name,
                naturalWidth: image.width,
                naturalHeight: image.height,
              });
              notify(`${picture.name} inserted`);
            });
          },
        });
      }

      list.push({
        id: "share:link",
        title: "Copy a view link",
        subtitle: "A read-only link to this project, carried inside the URL",
        group: "Project",
        icon: "link",
        keywords: "share send url public read only viewer copy link",
        run: () => {
          shareLink(project).then(
            async (url) => {
              try {
                await navigator.clipboard.writeText(url);
                notify(`View link copied — ${linkVerdict(url).note}`);
              } catch {
                // Refused on insecure origins and in some embedded browsers.
                // The panel in the top bar can select the text for a manual
                // copy; a palette command has nowhere to put it.
                notify("Couldn't reach the clipboard — use Share in the top bar.");
              }
            },
            () => notify("That project couldn't be turned into a link."),
          );
        },
      });

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

      // Ordered by what somebody should reach for. `.docx` first, because it
      // is the one that carries footnotes, tracked changes and page setup.
      for (const format of [
        "docx",
        "pdf",
        "html",
        "markdown",
        "doc",
      ] as ExportFormat[]) {
        list.push({
          id: `export:${format}`,
          title: `Export to ${EXPORT_LABELS[format]}`,
          subtitle:
            format === "docx"
              ? "Real Word — footnotes, tracked changes, headers and page numbers"
              : format === "doc"
                ? "Word-compatible HTML, for anything that can't open .docx"
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

    /* ── Navigate ──────────────────────────────────────────────────────
     *
     * Every room in the product, in the order /more prints them: your
     * things, then people, then the app, then money. /more is the written
     * index this thing gets explained from, so matching it means there is
     * one shape to learn rather than two. Alphabetical was the alternative
     * and it opens with Assignments and buries Team in the middle — sorted
     * by spelling, which is the one thing nobody arrives knowing.
     *
     * Every route in the product is here — thirteen of them, plus the three
     * settings anchors — because the sidebar is being cut to five rows and a
     * destination that leaves it with no command is a room with no door.
     * "We could show the row again later" and "we deleted it" look identical
     * from a chair. Adding a route to the app means adding it here and to
     * /more in the same change; there is no third list to forget.
     *
     * The path is in the keywords of every row on purpose: "/settings#keeping"
     * is what gets typed into an email or read down a phone, so typing it
     * back into ⌘K has to land somewhere.
     *
     * No row carries a `shortcut`. Nothing in lib/shortcuts.ts binds a key to
     * a route, and a palette that teaches a shortcut which does not exist is
     * worse than one that teaches none.
     */
    list.push(
      /* your things */
      {
        id: "nav:home",
        title: "Go to the library",
        subtitle: "Every document, sheet, deck and drawing you have made",
        group: "Navigate",
        icon: "home",
        keywords:
          "projects list index dashboard home /library files documents folders search",
        run: () => router.push("/library"),
      },
      {
        id: "nav:due",
        title: "Due",
        subtitle: "The deadlines, tasks and cards that want looking at today",
        group: "Navigate",
        icon: "list",
        keywords:
          "/due deadlines today tomorrow next upcoming overdue todo to do tasks inbox what now",
        run: () => router.push("/due"),
      },
      {
        id: "nav:notes",
        title: "Notes",
        subtitle: "The notepad — for what is not a document yet",
        group: "Navigate",
        icon: "sticky",
        keywords: "/notes notepad scratch jot quick capture scribble sticky",
        run: () => router.push("/notes"),
      },
      {
        id: "nav:study",
        title: "Study",
        subtitle: "Cards from your own reading, asked back at you",
        group: "Navigate",
        icon: "copy",
        keywords:
          "/study flashcards cards revision revise memorise memorize spaced repetition quiz test learn",
        run: () => router.push("/study"),
      },
      {
        id: "nav:kit",
        title: "Kit",
        subtitle: "Fonts, pictures and files ready to drop into a document",
        group: "Navigate",
        icon: "group",
        keywords:
          "/kit assets fonts pictures images files logo uploads brand saved pieces",
        run: () => router.push("/kit"),
      },
      {
        id: "nav:agenda",
        title: "Agenda",
        subtitle: "Your week as a timetable — what is on and what repeats",
        group: "Navigate",
        icon: "calendar",
        keywords:
          "/agenda calendar week timetable schedule diary planner events lectures",
        run: () => router.push("/agenda"),
      },
      {
        id: "nav:assignments",
        title: "Assignments",
        subtitle: "A deadline with the document attached, in three columns",
        group: "Navigate",
        icon: "check",
        keywords:
          "/assignments coursework homework hand in handed in submit board to do doing deadlines",
        run: () => router.push("/assignments"),
      },
      {
        id: "nav:community",
        title: "Community",
        subtitle: "Ideas, designs and templates other people here have shared",
        group: "Navigate",
        icon: "map",
        keywords:
          "/community shared templates ideas designs gallery browse explore others public",
        run: () => router.push("/community"),
      },

      /* people */
      {
        id: "nav:chat",
        title: "Go to chat",
        subtitle: "The channels this workspace talks in, and the team assistant",
        group: "Navigate",
        icon: "users",
        keywords: "/chat messages channels conversations dm direct rooms",
        run: () => router.push("/chat"),
      },
      {
        id: "nav:team",
        title: "Team",
        // Not "needs a team first": the sidebar says that on a button it has
        // genuinely disabled, and this row is not disabled. /team without a
        // team is the two doors into getting one, which is exactly what
        // somebody typing "team" is looking for, so the row must not talk
        // them out of pressing it.
        subtitle: "Who is here, what each person may do — or how to start one",
        group: "Navigate",
        icon: "board",
        keywords:
          "/team people members roles permissions who is here invite join workspace knowledge",
        run: () => router.push("/team"),
      },

      /* the app */
      {
        id: "nav:more",
        title: "Everything",
        subtitle: "Every page in here, and the question each one answers",
        group: "Navigate",
        icon: "dots",
        keywords:
          "/more everything index sitemap all pages what is in here where is how do i find",
        run: () => router.push("/more"),
      },
      {
        id: "nav:settings",
        title: "Open settings",
        subtitle: "Everything you can change about the tool, not a document",
        group: "Navigate",
        icon: "settings",
        keywords:
          "/settings preferences appearance theme accent providers shortcuts offline desktop ai model",
        run: () => router.push("/settings"),
      },
      {
        id: "nav:account",
        title: "Account",
        subtitle: "Who you are signed in as, and the two ways of keeping your work",
        group: "Navigate",
        icon: "users",
        keywords:
          "/settings#account sign in sign out signed in email profile identity delete account",
        run: () => router.push("/settings#account"),
      },
      {
        id: "nav:keeping",
        title: "Keeping your work",
        subtitle: "What this browser is holding, and how to take a copy of it",
        group: "Navigate",
        icon: "download",
        keywords:
          "/settings#keeping backup export copy storage browser local sync safe lose data",
        run: () => router.push("/settings#keeping"),
      },
      {
        id: "nav:appearance",
        title: "Appearance",
        subtitle: "Theme, accent, density and typeface",
        group: "Navigate",
        icon: "sparkle",
        keywords:
          "/settings#appearance theme dark light accent colour color density typeface font size",
        run: () => router.push("/settings#appearance"),
      },
      {
        // Administration lost its sidebar link when it became a group inside
        // Settings, so the palette is now how people find it.
        id: "nav:admin",
        title: "Administration",
        subtitle: "Who has signed up here, and what reached the server",
        group: "Navigate",
        icon: "lock",
        keywords:
          "/settings#administration admin members roles audit log retention purge who is here",
        run: () => router.push("/settings#administration"),
      },
      {
        // /more lists this among the settings groups, so it needs a row here
        // for the same reason every other destination does.
        id: "nav:desktop",
        title: "The desktop note",
        subtitle: "The little window that stays on top of everything else",
        group: "Navigate",
        icon: "download",
        keywords:
          "/settings#desktop app download install mac windows menu bar tray sticky always on top",
        run: () => router.push("/settings#desktop"),
      },

      /* money */
      {
        // The only paid door in the app, so the row says what the page is and
        // stops. A palette row that sells is an advert somebody typed four
        // letters to summon by accident.
        id: "nav:pricing",
        title: "Plans and pricing",
        subtitle: "What it costs and what changes when you pay",
        group: "Navigate",
        icon: "tag",
        keywords:
          "/pricing plans price cost pay upgrade subscription billing free team plan create a team",
        run: () => router.push("/pricing"),
      },
      {
        id: "voice:talk",
        title: "Talk to the assistant",
        subtitle: "Speak a question; it can read the answer back",
        group: "AI",
        icon: "mic",
        shortcut: "⌘⇧V",
        keywords: "voice speech microphone dictate say audio speak listen",
        run: () => setVoiceOpen(true),
      },
      {
        id: "settings:shortcuts",
        title: "Keyboard shortcuts",
        subtitle: "Everything bound, grouped by where it works",
        group: "Settings",
        icon: "type",
        shortcut: "⌘/",
        keywords: "keys bindings hotkeys reference cheat sheet help",
        run: () => setShortcutsOpen(true),
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
        id: "settings:samples",
        title: "Load the sample workspace",
        subtitle: "A thesis, a board, a deck and a review — replaces what's here",
        group: "Settings",
        icon: "board",
        keywords: "demo example seed sample content try explore",
        run: () => {
          loadSamples();
          notify("Sample workspace loaded");
          router.push("/library");
        },
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
    kitAssets,
    addBlock,
    addProject,
    duplicateProject,
    deleteProject,
    resetWorkspace,
    loadSamples,
    toggleSidebar,
    notify,
    openAI,
    setShortcutsOpen,
    setVoiceOpen,
    router,
    channels,
    openDM,
    sendMessage,
    appearance,
  ]);

  const results = useMemo(() => {
    const q = query.trim();
    const exactPath = q.startsWith("/") && q.length > 1;

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
          // A typed address is not a fuzzy search, it is a destination. Every
          // Navigate row carries its path as a keyword, and "/settings" is a
          // prefix of "/settings#account" — so without this, pasting the plain
          // address of the settings page lands on whichever anchor row the
          // scorer happened to like. Exact, whitespace-delimited, so
          // "/settings" cannot claim the anchors and they cannot claim it.
          exactPath && ` ${c.keywords ?? ""} `.includes(` ${q} `)
            ? EXACT_PATH_SCORE
            : -Infinity,
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

    // Content hits ride below the command hits: the palette stays an action
    // launcher first, but three typed words reach inside every table cell.
    // Capped separately from the rows above, because this is the half with no
    // natural size — one common word can match a cell on every row of a big
    // table — and an overall cap would let it push the commands off the end.
    let hits = 0;
    for (const hit of searchContent(projects, q)) {
      if (hits >= CONTENT_HITS) break;
      hits += 1;
      scored.push({
        command: {
          id: `content:${hit.projectId}:${hit.blockId}`,
          title: hit.snippet,
          subtitle: `${hit.projectName} · ${hit.where}`,
          group: "In your work",
          icon: "search",
          run: () => router.push(`/p/${hit.projectId}#block-${hit.blockId}`),
        },
        score: -1,
        matches: [],
      });
    }

    return scored.slice(0, ROWS);
  }, [commands, query, addProject, router, projects]);

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
