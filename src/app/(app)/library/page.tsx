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
 * arrived while you were away, then what is due, then the work itself — which
 * is also where you were, because the default order is most recent first —
 * then the shelf of rooms that are not projects. Each band above the grid
 * hides when it has nothing to say, which is only safe because the shelf at
 * the bottom never does.
 *
 * "Where was I" used to be a second band of six cards above the grid. It
 * rendered the same five projects, in the same order, at the same addresses,
 * in a different card shape — the work competing with itself, and the eye
 * unable to tell which of the two lists was the real one. It is now a label
 * on the grid, shown while the grid is still in the order that makes the
 * label true; see PickUpWhere.
 *
 * Cards rather than rows for the work itself: a row that spans 1400 pixels
 * puts the name at one end and the date at the other, and the eye has to
 * travel the width of a monitor to pair them up. Filtering is client-side
 * over the same fuzzy matcher the palette uses, so search here and search in
 * ⌘K rank identically.
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
import { formatNumber } from "@/lib/format";
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

/**
 * Every secondary door on this page — the team panel's two, the empty state's
 * three — wears this one shape: an underlined word in the sentence that
 * explains it.
 *
 * They were filled and outlined buttons, which put three button shapes and two
 * filled accents on a screen whose one filled accent is New document. Nothing
 * moved and nothing lost its words; they stopped shouting over the answer.
 */
const DOOR =
  "underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-fg";

/** Sentence case, sans, in the page's own voice — these were mono capitals. */
const SORT_LABEL: Record<Sort, string> = {
  recent: "Recent",
  name: "Name",
  kind: "Kind",
};

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

  /*
   * True while the grid is still the answer to "where was I": default order,
   * nothing typed, nothing filtered. The moment any of those moves the grid
   * stops being a recency list and the label above it stops being true — so
   * the label goes and the grid is just the grid.
   */
  const arrival =
    sort === "recent" &&
    !query.trim() &&
    kind === "all" &&
    folder === null &&
    labels.length === 0;

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

      <TopBar>
        <span className="text-body font-medium text-fg">Library</span>
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        {/* 1400 rather than 880. On a 1900-pixel screen the old cap left two
              empty gutters of 430 pixels each around a column of work — the
              screen was being used to display margin. Still capped, because a
              row of text that runs the full width of a wide monitor is a line
              nobody can track back to the start of; what the extra width buys
              is COLUMNS, which is what the grids below spend it on. */}
          <div className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8 sm:py-10">
          {/*
            * The one place a document is made, and it looks like it.
            *
            * It used to be a 12.5px outline button in the corner of the top
            * bar, the same weight as the sidebar toggle beside it — the most
            * frequent act on the page drawn as the least important thing on
            * it. Here it sits at the end of the title line, where the eye
            * already is on arrival, at the size of the decision it is.
            *
            * One, not two: a second copy pinned to the top bar for when this
            * one scrolls away would be the same question asked twice on one
            * screen, which is what the keep-prompt had to stop doing. Scrolled
            * down, ⌘K makes anything in one keystroke.
            */}
          <div className="mb-(--space-6) flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            {/*
              * A heading, not a headline.
              *
              * This used to be "Finished work lives here. Thinking lives on a
              * Board." — a good sentence, on the wrong screen. It is the
              * product explaining itself, in 28px across two lines, at the top
              * of the page somebody opens twenty times a day to find a
              * document. It still says exactly that on the storefront, which
              * is where somebody is deciding whether to use this at all. Here
              * the useful thing is what is in the room and how much of it.
              */}
            <div className="min-w-0">
              {/* One `text-title` per screen, and the clamp is why there is no
                  `sm:` variant any more: 24px on a phone, 30px on a monitor,
                  from one class. */}
              <h1 className="text-title text-fg">
                {world === "team" ? "The team's work" : "Your work"}
              </h1>
              {/* Only when there is something to count. With an empty
                  library the panel below already says "Nothing here yet." and
                  says it where somebody can act on it; a subtitle repeating
                  it under the title is the same sentence twice on one
                  screen. */}
              {projects.length > 0 && (
                <p className="mt-(--space-1) text-body text-fg-muted">
                  {`${formatNumber(projects.length)} ${projects.length === 1 ? "thing" : "things"}, newest first.`}
                </p>
              )}
            </div>
            <NewProjectButton
              onCreate={create}
              onTemplate={() => setTemplating(true)}
            />
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
            /* No card and no fill. This is a region, not an object you can
               pick up, and `.display` is the storefront's serif — the one
               place the app was importing a face that belongs to the page
               where somebody is still deciding whether to use this at all.
               Both doors keep their words and their addresses; they are text
               links because the filled control on this screen is New
               document, and it is on screen from here. */
            <div className="mb-(--space-6) max-w-[52ch]">
              <p className="text-object text-fg">No team yet.</p>
              <p className="mt-(--space-1) max-w-[46ch] text-body text-fg-muted">
                Team documents live in a team: everyone in it sees this
                library, and everything made here is the team&rsquo;s. Your own
                work stays under Personal.
              </p>
              <p className="mt-(--space-3) text-body text-fg-muted">
                <Link href="/pricing" className={DOOR}>
                  Create a team
                </Link>
                {", or "}
                <Link href="/team#join" className={DOOR}>
                  Join a team
                </Link>
                .
              </p>
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

          {/* Deadlines, on the page people actually land on. Renders nothing
              when nothing is due inside a fortnight. */}
          <DueSoon />

          {/* Listens on the window, so a folder can be dropped anywhere on
              this page rather than onto a target somebody has to find. */}
          <ImportZone />

          {/* Where things live. Hidden entirely until there is something to
              show, so a small workspace keeps the plain list it had. */}
          {(folders.length > 0 || projects.length >= 8) && (
            /* A label and air, not a tray. A rail of folders is a region —
               you cannot type into it, pick it up or float it over anything —
               so under the container rule it gets a heading and space
               instead of four lines claiming it is separate. */
            <div className="mb-(--space-5)">
              <p className="text-meta text-fg-subtle mb-(--space-3)">folders</p>
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
              className="mb-(--space-3) flex flex-wrap items-center gap-1 text-body text-fg-subtle"
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

          {/*
            * One cluster, one baseline, one weight.
            *
            * This was three stacked rows — a full-width bordered field, a
            * scrolling row of bordered chips, and a sort group in mono caps —
            * three different treatments for one idea, "narrow the list", each
            * announcing itself as a separate region. Together they were 130
            * pixels of chrome standing between the page title and any work.
            *
            * Now: field, then the kinds, then the sort, on one line, all at
            * `text-body`, wrapping below 640. The field keeps its border
            * because it is the one thing here you type into — the border IS
            * the affordance. Everything else is a word that gets heavier and
            * brighter when it is on, which is what `aria-pressed` has been
            * saying to a screen reader all along and what the boxes were
            * never saying to an eye.
            */}
          <div className="my-(--space-3) flex flex-col gap-(--space-2)">
            <div className="flex flex-wrap items-center gap-x-(--space-2) gap-y-(--space-2)">
              <div className="flex min-w-[220px] flex-1 items-center gap-2.5 rounded-sm border border-line px-3 sm:max-w-[420px]">
                <Icon name="search" size={14} className="shrink-0 text-fg-subtle" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("library.search")}
                  aria-label={t("library.searchLabel")}
                  spellCheck={false}
                  className="w-full bg-transparent py-2 text-body text-fg outline-none placeholder:text-fg-subtle"
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
                {/* A hint, not a control. As a bordered keycap it was a
                    bordered thing inside a bordered thing; moved out of the
                    field it read as a third button in a row of buttons. Plain
                    quiet text at the end of the field is what a hint is, and
                    the container rule has nothing to say about it. */}
                <span className="hidden shrink-0 text-meta text-fg-subtle sm:block">
                  ⌘K for anything
                </span>
              </div>

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

              <div className="ml-auto hidden shrink-0 items-center gap-(--space-1) sm:flex">
                <span className="text-meta text-fg-subtle">Sort</span>
                {(["recent", "name", "kind"] as Sort[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSort(s)}
                    aria-pressed={sort === s}
                    className={cn(
                      "rounded-xs px-1 py-0.5 text-body transition-colors duration-150",
                      // Weight and ink, never a fill: `bg-surface-2` is
                      // 1.24:1 on canvas in dark and 1.08:1 in light, so a
                      // chip alone cannot say which of three words is on.
                      sort === s
                        ? "text-fg font-medium"
                        : "text-fg-subtle hover:text-fg",
                    )}
                  >
                    {SORT_LABEL[s]}
                  </button>
                ))}
              </div>
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
          </div>

          {/* Rows */}
          {rows.length === 0 ? (
            /* No card. An empty state is a region, and a box drawn round two
               sentences and three doors is the page apologising in a frame.
               `.display` is the storefront's serif and has no business in the
               app; it was the one place the two type systems leaked. */
            <div className="max-w-[52ch]">
              {query ? (
                <p className="text-body text-fg-muted">
                  Nothing matches &ldquo;{query}&rdquo;.
                </p>
              ) : (
                <>
                  {/* A first run is empty on purpose. This is the moment to
                      say what the thing is, since there is nothing else on
                      screen doing it. */}
                  <p className="text-object text-fg">Nothing here yet.</p>
                  <p className="mt-(--space-1) max-w-[46ch] text-body text-fg-muted">
                    A document, a deck, a spreadsheet and an infinite board are
                    the same project here — start with whichever one you are
                    actually doing.
                  </p>
                  <p className="mt-(--space-3) text-body text-fg-muted">
                    <button type="button" onClick={() => create("doc")} className={DOOR}>
                      Start writing
                    </button>
                    {", "}
                    <button type="button" onClick={() => create("board")} className={DOOR}>
                      Open a board
                    </button>
                    {", or start "}
                    <button type="button" onClick={() => setTemplating(true)} className={DOOR}>
                      from a template
                    </button>
                    .
                  </p>
                  {/* Sans, not mono: a sentence about a command is language,
                      and only the keycap itself is not. */}
                  <p className="mt-(--space-4) text-meta text-fg-subtle">
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
            /*
             * A grid, not a list, above 1024 pixels.
             *
             * A row that spans 1400 pixels puts the name at one end and the
             * date at the other with nothing in between, and the eye has to
             * travel the whole width to pair them up. Three cards across put
             * the same four facts inside one glance each — and a wide screen
             * then shows three times as much work, which is the point of
             * having one. Below 1024 it is one column, which is a list.
             */
            <>
              {/* Where you were — as a label on this list, not as a second
                  copy of it. See PickUpWhere's own note. */}
              <PickUpWhere projects={projects} arrival={arrival} />
              <ul className="grid gap-(--space-2) lg:grid-cols-2 2xl:grid-cols-3">
                {rows.map(({ project }) => (
                  <li key={project.id}>
                    <LibraryCard
                      project={project}
                      showTime={hydrated}
                      onMenu={openMenu}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Never hidden, empty or not — see Shelf's own note. The picker it
              opens is the one the New menu opens. */}
          <Shelf onTemplates={() => setTemplating(true)} />
        </div>
      </main>
    </>
  );
}

/**
 * One thing you have made, as a card.
 *
 * The four facts are the same and in the same order — what you called it,
 * what is in it, what kind it is, when you last touched it — but they are now
 * two lines at two sizes instead of four facts at four sizes inside four
 * boxes. Name at `text-object`, the rest at `text-meta` on one line, because
 * kind, size and age are all the same rank of thing: facts about the object
 * whose name is above them.
 *
 * The card keeps its border. This is the one place the container rule makes a
 * concession, and it is deliberate: in a three-column grid horizontal
 * neighbours share no rule and no baseline, so without an edge you cannot
 * tell whether "Chapter map" and "2 items" and the name to their right are
 * one card or two. It loses its fill — the canvas shows through, and
 * `bg-surface` on hover becomes feedback rather than a permanent state. If
 * this grid ever goes to one column the border should go with it; /due runs
 * 22 rows with none.
 *
 * The kind pill is gone as a pill, not as a fact — "Thesis / Doc" is the
 * first word of the meta line. It was a bordered, filled, uppercase mono
 * badge inside a bordered, filled card, which is a box inside a box saying
 * something a word says.
 *
 * `group relative` and an absolutely positioned menu button, because a button
 * inside an anchor is markup a browser is entitled to rearrange — the reason
 * `RowMenuButton` exists at all.
 */
function LibraryCard({
  project,
  showTime,
  onMenu,
}: {
  project: Project;
  showTime: boolean;
  onMenu: (e: React.MouseEvent, project: Project) => void;
}) {
  const meta = KINDS[project.kind];
  // Built from the parts that exist rather than joined blind: `showTime` is
  // false until the store has rehydrated, and a fixed template would leave a
  // dangling separator on the server-rendered pass.
  const facts = [
    meta.label,
    projectSummary(project),
    showTime ? relativeTime(project.updatedAt) : "",
  ].filter(Boolean);

  return (
    <div className="group relative h-full">
      <Link
        href={`/p/${project.id}`}
        prefetch
        onContextMenu={(e) => onMenu(e, project)}
        className={cn(
          "flex h-full flex-col rounded-lg border border-line p-3.5 pr-10",
          "transition-colors duration-150 hover:border-line-strong hover:bg-surface",
        )}
      >
        <span className="flex min-w-0 items-start gap-(--space-2)">
          {/* No tile: an icon does not need a box drawn round it to be an
              icon, and this one was the page's only third level of nesting. */}
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center text-fg-muted"
          >
            <Avatar glyph={project.glyph} kind={project.kind} size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-object text-fg">
              {project.name}
            </span>
            <span className="mt-(--space-1) block truncate text-meta text-fg-subtle">
              {facts.join(" · ")}
            </span>
          </span>
        </span>
      </Link>
      <RowMenuButton
        label={`More for ${project.name}`}
        onOpen={(event: React.MouseEvent) => onMenu(event, project)}
        className="top-3 right-2"
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
        // A word, not a chip. Seven bordered boxes said "seven controls" much
        // louder than they said which one was on; weight and ink say the
        // second thing, and `aria-pressed` — untouched, on all seven — has
        // been saying it correctly all along, which is what makes dropping
        // the boxes safe rather than merely quieter.
        "flex shrink-0 items-center gap-1.5 rounded-xs px-1 py-0.5 text-body transition-colors duration-150",
        active ? "text-fg font-medium" : "text-fg-subtle hover:text-fg",
      )}
    >
      {icon && <Icon name={icon} size={11} />}
      {label}
      <span className="text-meta">{count}</span>
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
      {/* Filled, not outlined, and the only filled control on the page — so
          "what do I press to start something" has exactly one answer. The
          label says what it makes rather than "New", which on a page holding
          documents, decks, boards, notes and code is a question rather than
          an instruction. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 rounded-md bg-accent px-4 text-body font-medium text-on-accent",
          "h-10 shrink-0 transition-[filter] duration-150 hover:brightness-110",
        )}
      >
        <Icon name="plus" size={15} />
        <span>New document</span>
        <Icon name="chevron-down" size={12} className="opacity-70" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute top-full right-0 z-20 mt-2 w-[248px] rounded-lg border border-line-strong bg-surface p-1.5 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)]">
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
                <span className="grid size-6 shrink-0 place-items-center text-fg-muted">
                  <Icon name={KINDS[k].icon} size={12} />
                </span>
                <span className="min-w-0">
                  <span className="block text-body text-fg">
                    {KINDS[k].label}
                  </span>
                  <span className="block truncate text-meta text-fg-subtle">
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
              <span className="grid size-6 shrink-0 place-items-center text-fg-muted">
                <Icon name="download" size={12} />
              </span>
              <span className="min-w-0">
                <span className="block text-body text-fg">
                  Files from your computer…
                </span>
                <span className="block truncate text-meta text-fg-subtle">
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
              <span className="grid size-6 shrink-0 place-items-center text-fg-muted">
                <Icon name="folder" size={12} />
              </span>
              <span className="min-w-0">
                <span className="block text-body text-fg">
                  A whole folder…
                </span>
                <span className="block truncate text-meta text-fg-subtle">
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
              <span className="grid size-6 shrink-0 place-items-center text-fg-muted">
                <Icon name="board" size={12} />
              </span>
              <span className="min-w-0">
                <span className="block text-body text-fg">
                  From a template…
                </span>
                <span className="block truncate text-meta text-fg-subtle">
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

