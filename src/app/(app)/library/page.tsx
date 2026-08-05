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

type Sort = "recent" | "name" | "kind";

export default function LibraryPage() {
  const projects = useProjects((s) => s.projects);
  const addProject = useProjects((s) => s.addProject);
  const hydrated = useHydrated();
  const router = useRouter();

  const menu = useMenu();
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ProjectKind | "all">("all");
  const [sort, setSort] = useState<Sort>("recent");

  const openMenu = (e: React.MouseEvent, project: Project) =>
    menu.open(
      e,
      projectMenu(project, {
        open: (id) => router.push(`/p/${id}`),
        settings: () => setSettingsFor(project.id),
        rename: () => setRenaming(project.id),
      }),
    );

  const settingsProject = projects.find((p) => p.id === settingsFor);
  const renamingProject = projects.find((p) => p.id === renaming);

  const counts = useMemo(() => {
    const map = new Map<ProjectKind, number>();
    for (const p of projects) map.set(p.kind, (map.get(p.kind) ?? 0) + 1);
    return map;
  }, [projects]);

  const rows = useMemo(() => {
    const filtered = projects
      .filter((p) => kind === "all" || p.kind === kind)
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
  }, [projects, query, kind, sort]);

  const create = (k: ProjectKind) => router.push(`/p/${addProject(k)}`);

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

      <TopBar
        right={
          <NewProjectButton onCreate={create} />
        }
      >
        <span className="text-[13px] font-medium text-fg">Library</span>
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-5 py-8 sm:px-8 sm:py-12">
          <div className="mb-8">
            <p className="label-mono mb-2.5">Everything, in one</p>
            <h1 className="max-w-[20ch] text-[26px] leading-[1.15] font-medium tracking-[-0.03em] text-fg sm:text-[32px]">
              Finished work lives here.
              <span className="text-fg-subtle"> Thinking lives on a Board.</span>
            </h1>
          </div>

          {/* Search + filters */}
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3">
              <Icon name="search" size={14} className="shrink-0 text-fg-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the library…"
                aria-label="Search projects"
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

            <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
              <FilterChip
                active={kind === "all"}
                onClick={() => setKind("all")}
                label="All"
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
              <p className="text-[13.5px] text-fg-muted">
                {query ? `Nothing matches “${query}”.` : "Nothing here yet."}
              </p>
              {!query && (
                <button
                  type="button"
                  onClick={() => create("doc")}
                  className="mt-3 text-[13px] text-accent transition-opacity hover:opacity-80"
                >
                  Start writing
                </button>
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
}: {
  onCreate: (kind: ProjectKind) => void;
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
