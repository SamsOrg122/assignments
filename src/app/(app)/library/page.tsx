"use client";

/**
 * The Library — where the work is, and now where the day starts.
 *
 * The address is `/library` and stays `/library` whatever the sidebar calls
 * the row. `public/sw.js` precaches that exact path and hands it back for
 * every navigation it cannot reach the network for; `manifest.ts` uses it for
 * `start_url` and the installed shortcut; the landing page iframes
 * `/library?demo=1`. A rename would take the offline fallback down silently,
 * because `cache.add()` follows the redirect and a redirected response handed
 * to `respondWith` for a navigation is a network error rather than a page.
 *
 * Top to bottom the page is: anything actually wrong, then anything that
 * arrived while you were away, then where you were, then what is due, then
 * the work itself, then the shelf of rooms that are not projects. Each band
 * above the grid hides when it has nothing to say — which is only safe
 * because the shelf at the bottom never does.
 *
 * Rows rather than a card grid for the work itself: a library is for scanning
 * names quickly, and rows fit far more on screen without shrinking the type.
 * The cards are the six-item band at the top, which is a different job.
 * Filtering is client-side over the same fuzzy matcher the palette uses, so
 * search here and search in ⌘K rank identically.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProjects, useHydrated } from "@/lib/store";
import { useHasTeam, useScope } from "@/lib/scope";
import { KINDS, KIND_ORDER } from "@/lib/kinds";
import { t } from "@/lib/i18n";
import {
  FolderRail,
  LabelBar,
  pathTo,
  subtree,
} from "@/components/library/Folders";
import { fuzzyMatch } from "@/lib/fuzzy";
import { TopBar } from "@/components/shell/TopBar";
import { useMenu } from "@/components/ui/Menu";
import { projectMenu } from "@/lib/project-menu";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { RowMenuButton } from "@/components/ui/RowMenuButton";
import { useProjectActions } from "@/components/projects/useProjectActions";
import { cn } from "@/lib/cn";
import type { Project, ProjectKind } from "@/lib/types";
import { projectSummary } from "@/lib/summary";
import { KeepPrompt } from "@/components/account/KeepPrompt";
import { TemplatePicker } from "@/components/library/TemplatePicker";
import type { Block } from "@/lib/types";
import { ImportZone, openImportPicker } from "@/components/library/ImportZone";
import { ReturnedNotes } from "@/components/library/ReturnedNotes";
import { DueSoon } from "@/components/library/DueSoon";
import { SaveWarning } from "@/components/library/SaveWarning";
import { WhereIsMyWork } from "@/components/library/WhereIsMyWork";
import { DesktopNotes } from "@/components/library/DesktopNotes";
import { PickUpWhere, relativeTime } from "@/components/library/PickUpWhere";
import { Shelf } from "@/components/library/Shelf";

type Sort = "recent" | "name" | "kind";

export default function LibraryPage() {
  const allProjects = useProjects((s) => s.projects);
  const folders = useProjects((s) => s.folders);
  const addProject = useProjects((s) => s.addProject);
  const hydrated = useHydrated();
  const router = useRouter();

  // The sidebar's Personal | Team switch changes worlds, and the Library is
  // the world's shelf: team scope lists the team's documents and nothing of
  // yours, personal the reverse. No scope on a project means personal.
  const chosen = useScope((s) => s.scope);
  const hasTeam = useHasTeam();
  const world = hasTeam ? chosen : "personal";
  const projects = useMemo(
    () => allProjects.filter((p) => (p.scope ?? "personal") === world),
    [allProjects, world],
  );

  const menu = useMenu();
  const [templating, setTemplating] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ProjectKind | "all">("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [folder, setFolder] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[]>([]);

  /* The same callbacks and dialogs the sidebar uses. Both lists show your
     projects; both menus should be the same menu. */
  const { actionsFor, dialogs } = useProjectActions();

  const openMenu = (e: React.MouseEvent, project: Project) =>
    menu.open(e, projectMenu(project, actionsFor(project)));

  const counts = useMemo(() => {
    const map = new Map<ProjectKind, number>();
    for (const p of projects) map.set(p.kind, (map.get(p.kind) ?? 0) + 1);
    return map;
  }, [projects]);

  const rows = useMemo(() => {
    // A folder shows everything under it, not just what is directly in it —
    // otherwise a parent looks empty while holding forty projects.
    const inFolder = folder ? new Set(subtree(folders, folder)) : null;

    const filtered = projects
      .filter((p) => kind === "all" || p.kind === kind)
      .filter((p) => !inFolder || (p.folderId ? inFolder.has(p.folderId) : false))
      // Every selected label has to match: two labels means the intersection,
      // which is the only reading that makes a second click useful.
      .filter((p) => labels.every((l) => (p.labels ?? []).includes(l)))
      .map((p) => {
        if (!query.trim()) return { project: p, score: 0 };
        const hit =
          fuzzyMatch(query, p.name) ??
          fuzzyMatch(query, `${p.name} ${KINDS[p.kind].label} ${KINDS[p.kind].keywords}`);
        return hit ? { project: p, score: hit.score } : null;
      })
      .filter((r): r is { project: Project; score: number } => r !== null);

    if (query.trim()) return filtered.sort((a, b) => b.score - a.score);

    return filtered.sort((a, b) => {
      if (sort === "name") return a.project.name.localeCompare(b.project.name);
      if (sort === "kind")
        return (
          KIND_ORDER.indexOf(a.project.kind) - KIND_ORDER.indexOf(b.project.kind) ||
          a.project.name.localeCompare(b.project.name)
        );
      return b.project.updatedAt - a.project.updatedAt;
    });
  }, [projects, folders, query, kind, sort, folder, labels]);

  const create = (k: ProjectKind) => router.push(`/p/${addProject(k)}`);

  const insertBlock = useProjects((s) => s.insertBlock);
  const removeBlock = useProjects((s) => s.removeBlock);

  /**
   * A template replaces the starter block a new project ships with, rather
   * than landing underneath it — otherwise every templated document opens with
   * an orphan heading above the structure you asked for.
   */
  const createFrom = (kind: ProjectKind, name: string, blocks: Block[]) => {
    const id = addProject(kind, name);
    const project = useProjects.getState().projects.find((p) => p.id === id);
    for (const block of project?.blocks ?? []) removeBlock(id, block.id);
    for (const block of blocks) insertBlock(id, block);
    setTemplating(false);
    router.push(`/p/${id}`);
  };

  return (
    <>
      {menu.node}
      {dialogs}

      {templating && (
        <TemplatePicker
          onClose={() => setTemplating(false)}
          onUse={createFrom}
        />
      )}

      <TopBar
        right={
          <NewProjectButton
            onCreate={create}
            onTemplate={() => setTemplating(true)}
          />
        }
      >
        <span className="text-[13px] font-medium text-fg">Library</span>
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-5 py-8 sm:px-8 sm:py-12">
          <div className="mb-8">
            <p className="label-mono mb-2.5">
              {world === "team" ? "The team's, in one" : t("library.eyebrow")}
            </p>
            <h1 className="max-w-[20ch] text-[26px] leading-[1.15] font-medium tracking-[-0.03em] text-fg sm:text-[32px]">
              {t("library.title")}
              <span className="text-fg-subtle"> {t("library.subtitle")}</span>
            </h1>
          </div>

          {chosen === "team" && !hasTeam && (
            /*
             * Team world, no team behind it: the two doors, said before the
             * library rather than instead of it.
             *
             * This panel used to replace the whole page, which was survivable
             * only while the sidebar's Personal | Team switch was always on
             * screen to turn back with. It is not there any more — it renders
             * only once a team exists — so a scope of "team" persisted from
             * before somebody left one would strand them here for good, on an
             * upsell, with every document they own on the other side of a
             * control that no longer exists. `world` already downgrades to
             * personal; the page now agrees with it and shows their work
             * underneath. Both doors keep their words and their addresses.
             */
            <div className="hairline mb-6 rounded-lg bg-surface px-6 py-14 text-center">
              <p className="display text-[19px] text-fg">No team yet.</p>
              <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-fg-muted">
                Team documents live in a team: everyone in it sees this
                library, and everything made here is the team&rsquo;s. Your own
                work stays under Personal.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/pricing"
                  className="rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
                >
                  Create a team
                </Link>
                <Link
                  href="/team#join"
                  className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                >
                  Join a team
                </Link>
              </div>
            </div>
          )}

          <KeepPrompt />

          {/* Work that is not reaching the account, said where the work is. */}
          <SaveWarning />

          {/* Both of these are arrivals, not rooms — a comment somebody left
              on your document, a note the desktop window put here — and an
              arrival that has to be scrolled to is one nobody sees. They sat
              below the grid for a while, which put them several screens down
              on a workspace with forty projects, behind a shelf line that
              reads like the end of the page. Each renders nothing when there
              is nothing. */}
          <ReturnedNotes />
          <DesktopNotes />

          {/* Above the deadlines on purpose: "where was I" is the question
              somebody opens this page with, and the sidebar no longer answers
              it. Renders nothing until there are two projects. */}
          <PickUpWhere
            projects={projects}
            showTime={hydrated}
            onMenu={openMenu}
          />

          {/* Deadlines, on the page people actually land on. Renders nothing
              when nothing is due inside a fortnight. */}
          <DueSoon />

          {/* Listens on the window, so a folder can be dropped anywhere on
              this page rather than onto a target somebody has to find. */}
          <ImportZone />

          {/* Where things live. Hidden entirely until there is something to
              show, so a small workspace keeps the plain list it had. */}
          {(folders.length > 0 || projects.length >= 8) && (
            <div className="mb-4 rounded-md border border-line bg-surface p-2.5">
              <FolderRail
                selected={folder}
                onSelect={setFolder}
                projects={projects}
              />
            </div>
          )}

          {folder && (
            <nav
              aria-label="Folder"
              className="mb-3 flex flex-wrap items-center gap-1 text-[12px] text-fg-subtle"
            >
              <button
                type="button"
                onClick={() => setFolder(null)}
                className="transition-colors hover:text-fg"
              >
                {t("library.everything")}
              </button>
              {pathTo(folders, folder).map((f) => (
                <span key={f.id} className="flex items-center gap-1">
                  <span aria-hidden="true">/</span>
                  <button
                    type="button"
                    onClick={() => setFolder(f.id)}
                    className="transition-colors hover:text-fg"
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </nav>
          )}

          {/* Search + filters */}
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3">
              <Icon name="search" size={14} className="shrink-0 text-fg-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("library.search")}
                aria-label={t("library.searchLabel")}
                spellCheck={false}
                className="w-full bg-transparent py-2.5 text-[13.5px] text-fg outline-none placeholder:text-fg-subtle"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
                >
                  <Icon name="x" size={12} />
                </button>
              )}
              <kbd className="kbd hidden sm:block">⌘K for anything</kbd>
            </div>

            <LabelBar
              projects={projects}
              active={labels}
              onToggle={(label) =>
                setLabels((current) =>
                  current.includes(label)
                    ? current.filter((l) => l !== label)
                    : [...current, label],
                )
              }
            />

            <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
              <FilterChip
                active={kind === "all"}
                onClick={() => setKind("all")}
                label={t("library.all")}
                count={projects.length}
              />
              {KIND_ORDER.map((k) => (
                <FilterChip
                  key={k}
                  active={kind === k}
                  onClick={() => setKind(k)}
                  label={KINDS[k].label}
                  icon={KINDS[k].icon}
                  count={counts.get(k) ?? 0}
                />
              ))}

              <div className="ml-auto hidden shrink-0 items-center gap-1 sm:flex">
                <span className="label-mono">Sort</span>
                {(["recent", "name", "kind"] as Sort[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSort(s)}
                    aria-pressed={sort === s}
                    className={cn(
                      "rounded-xs px-1.5 py-1 font-mono text-[10px] tracking-wide uppercase transition-colors duration-150",
                      sort === s
                        ? "bg-surface-2 text-fg"
                        : "text-fg-subtle hover:text-fg-muted",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Rows */}
          {rows.length === 0 ? (
            <div className="hairline rounded-lg bg-surface px-6 py-14 text-center">
              {query ? (
                <p className="text-[13.5px] text-fg-muted">
                  Nothing matches &ldquo;{query}&rdquo;.
                </p>
              ) : (
                <>
                  {/* A first run is empty on purpose. This is the moment to
                      say what the thing is, since there is nothing else on
                      screen doing it. */}
                  <p className="display text-[19px] text-fg">
                    Nothing here yet.
                  </p>
                  <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-fg-muted">
                    A document, a deck, a spreadsheet and an infinite board are
                    the same project here — start with whichever one you are
                    actually doing.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => create("doc")}
                      className="rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
                    >
                      Start writing
                    </button>
                    <button
                      type="button"
                      onClick={() => create("board")}
                      className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                    >
                      Open a board
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplating(true)}
                      className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                    >
                      From a template
                    </button>
                  </div>
                  <p className="mt-6 font-mono text-[10.5px] text-fg-subtle">
                    ⌘K → &ldquo;sample workspace&rdquo; fills this with an
                    example you can pull apart
                  </p>

                  {/*
                    The other reason a Library is empty: this is not where the
                    work is. Which sentence is true depends on what is holding
                    it, and getting that wrong is worse than saying nothing —
                    the version of this that explained browser storage to
                    somebody whose sidebar said "synced" is what sent them
                    looking for a bug that wasn't there.
                  */}
                  <WhereIsMyWork />
                </>
              )}
            </div>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-line">
              {rows.map(({ project }) => (
                <li key={project.id}>
                  <LibraryRow
                    project={project}
                    showTime={hydrated}
                    onMenu={openMenu}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Never hidden, empty or not — see Shelf's own note. The picker it
              opens is the one the New menu opens. */}
          <Shelf onTemplates={() => setTemplating(true)} />
        </div>
      </main>
    </>
  );
}

function LibraryRow({
  project,
  showTime,
  onMenu,
}: {
  project: Project;
  showTime: boolean;
  onMenu: (e: React.MouseEvent, project: Project) => void;
}) {
  const meta = KINDS[project.kind];
  const summary = projectSummary(project);

  return (
    <div className="group relative border-b border-line last:border-b-0">
    <Link
      href={`/p/${project.id}`}
      prefetch
      onContextMenu={(e) => onMenu(e, project)}
      className={cn(
        "flex items-center gap-3 bg-surface py-3 pr-10 pl-3.5",
        "transition-colors duration-150 hover:bg-surface-2",
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-fg-muted"
      >
        <Avatar glyph={project.glyph} kind={project.kind} size={15} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-fg">
          {project.name}
        </span>
        <span className="block truncate font-mono text-[10px] text-fg-subtle">
          {summary}
        </span>
      </span>

      <span className="hidden shrink-0 rounded-xs border border-line px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide text-fg-subtle uppercase sm:block">
        {meta.label}
      </span>

      <span className="hidden w-[68px] shrink-0 text-right font-mono text-[10px] text-fg-subtle sm:block">
        {showTime ? relativeTime(project.updatedAt) : ""}
      </span>

      <Icon
        name="arrow-right"
        size={13}
        className="shrink-0 text-fg-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      />
    </Link>
      <RowMenuButton
        label={`More for ${project.name}`}
        onOpen={(event: React.MouseEvent) => onMenu(event, project)}
        className="right-2"
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ComponentProps<typeof Icon>["name"];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-[11.5px] transition-colors duration-150",
        active
          ? "border-line-strong bg-surface-2 text-fg"
          : "border-line text-fg-subtle hover:text-fg-muted",
      )}
    >
      {icon && <Icon name={icon} size={11} />}
      {label}
      <span className="font-mono text-[9.5px] opacity-60">{count}</span>
    </button>
  );
}

function NewProjectButton({
  onCreate,
  onTemplate,
}: {
  onCreate: (kind: ProjectKind) => void;
  onTemplate: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
      >
        <Icon name="plus" size={13} />
        <span className="hidden sm:inline">New</span>
        <Icon name="chevron-down" size={11} className="opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute top-full right-0 z-20 mt-1.5 w-[212px] rounded-md border border-line-strong bg-surface p-1 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)]">
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreate(k);
                }}
                className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-xs border border-line text-fg-muted">
                  <Icon name={KINDS[k].icon} size={12} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-fg">
                    {KINDS[k].label}
                  </span>
                  <span className="block truncate text-[11px] text-fg-subtle">
                    {KINDS[k].hint}
                  </span>
                </span>
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            {/* The way in for somebody arriving from Office. Two entries
                rather than one: dragging a folder is the natural gesture, but
                a picker is the only way to do it without a second window
                open, and "choose a folder" needs its own input to exist. */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openImportPicker("files");
              }}
              className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-xs border border-line text-fg-muted">
                <Icon name="download" size={12} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] text-fg">
                  Files from your computer…
                </span>
                <span className="block truncate text-[11px] text-fg-subtle">
                  Word, PowerPoint, Excel, CSV, text
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openImportPicker("folder");
              }}
              className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-xs border border-line text-fg-muted">
                <Icon name="folder" size={12} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] text-fg">
                  A whole folder…
                </span>
                <span className="block truncate text-[11px] text-fg-subtle">
                  Its folders come with it
                </span>
              </span>
            </button>
            <div className="my-1 h-px bg-line" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onTemplate();
              }}
              className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-xs border border-line text-fg-muted">
                <Icon name="board" size={12} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] text-fg">
                  From a template…
                </span>
                <span className="block truncate text-[11px] text-fg-subtle">
                  Thesis chapter, report, pitch, meeting notes
                </span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

