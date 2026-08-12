"use client";

/**
 * The Library — sorted, findable, finished work.
 *
 * Rows rather than a card grid: a library is for scanning names quickly, and
 * rows fit far more on screen without shrinking the type. Filtering is
 * client-side over the same fuzzy matcher the palette uses, so search here and
 * search in ⌘K rank identically.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProjects, useHydrated } from "@/lib/store";
import { KINDS, KIND_ORDER } from "@/lib/kinds";
import { useLocale } from "@/lib/i18n";
import {
  FolderRail,
  LabelBar,
  LabelEditor,
  pathTo,
  subtree,
} from "@/components/library/Folders";
import { fuzzyMatch } from "@/lib/fuzzy";
import { TopBar } from "@/components/shell/TopBar";
import { useMenu } from "@/components/ui/Menu";
import { ProjectSettings } from "@/components/shell/ProjectSettings";
import { projectMenu } from "@/lib/project-menu";
import { Button, Dialog, fieldClass } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import type { Project, ProjectKind } from "@/lib/types";
import { projectSummary } from "@/lib/summary";
import { KeepPrompt } from "@/components/account/KeepPrompt";
import { TemplatePicker } from "@/components/library/TemplatePicker";
import { SaveAsTemplate } from "@/components/library/SaveAsTemplate";
import type { Block } from "@/lib/types";

type Sort = "recent" | "name" | "kind";

export default function LibraryPage() {
  const { t } = useLocale();
  const projects = useProjects((s) => s.projects);
  const folders = useProjects((s) => s.folders);
  const addProject = useProjects((s) => s.addProject);
  const hydrated = useHydrated();
  const router = useRouter();

  const menu = useMenu();
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [templating, setTemplating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ProjectKind | "all">("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [folder, setFolder] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelling, setLabelling] = useState<string | null>(null);
  const [templatingFrom, setTemplatingFrom] = useState<string | null>(null);

  const openMenu = (e: React.MouseEvent, project: Project) =>
    menu.open(
      e,
      projectMenu(project, {
        open: (id) => router.push(`/p/${id}`),
        settings: () => setSettingsFor(project.id),
        rename: () => setRenaming(project.id),
        labels: () => setLabelling(project.id),
        saveAsTemplate: () => setTemplatingFrom(project.id),
      }),
    );

  const settingsProject = projects.find((p) => p.id === settingsFor);
  const renamingProject = projects.find((p) => p.id === renaming);
  const labellingProject = projects.find((p) => p.id === labelling);
  const templateSource = projects.find((p) => p.id === templatingFrom);

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
      {settingsProject && (
        <ProjectSettings
          project={settingsProject}
          onClose={() => setSettingsFor(null)}
        />
      )}
      {renamingProject && (
        <RenameDialog
          project={renamingProject}
          onClose={() => setRenaming(null)}
        />
      )}
      {labellingProject && (
        <LabelEditor
          project={labellingProject}
          onClose={() => setLabelling(null)}
        />
      )}

      {templating && (
        <TemplatePicker
          onClose={() => setTemplating(false)}
          onUse={createFrom}
        />
      )}

      {templateSource && (
        <SaveAsTemplate
          project={templateSource}
          onClose={() => setTemplatingFrom(null)}
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
            <p className="label-mono mb-2.5">{t("library.eyebrow")}</p>
            <h1 className="max-w-[20ch] text-[26px] leading-[1.15] font-medium tracking-[-0.03em] text-fg sm:text-[32px]">
              {t("library.title")}
              <span className="text-fg-subtle"> {t("library.subtitle")}</span>
            </h1>
          </div>

          <KeepPrompt />

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
                    The other reason a Library is empty: this is not the
                    address the work was made at. Browser storage belongs to
                    one exact origin, so a new deployment URL — a preview
                    build, a domain change — starts blank however much is
                    saved somewhere else. There is no way to read across that
                    line, so the honest move is to say so and point at the
                    file that does cross it.
                  */}
                  <p className="mx-auto mt-5 max-w-[52ch] border-t border-line pt-5 text-[12px] leading-relaxed text-fg-subtle">
                    Expecting to find work here? Projects are stored per web
                    address, so a different link to this app — a preview build,
                    a new domain — opens its own empty workspace. Nothing is
                    lost: export a backup at the old address and{" "}
                    <Link
                      href="/settings#keeping"
                      // Underlined, not just coloured: a link a colour-blind
                      // reader can't pick out of a paragraph isn't a link.
                      className="text-accent underline decoration-accent/40 underline-offset-2 transition-opacity hover:opacity-80"
                    >
                      restore it here
                    </Link>
                    .
                  </p>
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
    <Link
      href={`/p/${project.id}`}
      prefetch
      onContextMenu={(e) => onMenu(e, project)}
      className={cn(
        "group flex items-center gap-3 border-b border-line bg-surface px-3.5 py-3 last:border-b-0",
        "transition-colors duration-150 hover:bg-surface-2",
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-fg-muted"
      >
        <Icon name={meta.icon} size={13} />
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

/** Rendered only after hydration — `Date.now()` differs between server and client. */
function relativeTime(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Rename on its own, because renaming is the one thing people do to a project
 * far more often than everything else in settings put together.
 */
function RenameDialog({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const rename = useProjects((s) => s.renameProject);
  const [name, setName] = useState(project.name);

  const commit = () => {
    const next = name.trim();
    if (next) rename(project.id, next);
    onClose();
  };

  return (
    <Dialog
      title="Rename project"
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={commit} disabled={!name.trim()}>
            Rename
          </Button>
        </>
      }
    >
      <input
        value={name}
        autoFocus
        aria-label="Project name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className={fieldClass}
      />
    </Dialog>
  );
}
