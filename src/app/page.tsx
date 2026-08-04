"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProjects, useHydrated } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { BLOCK_META } from "@/components/shell/CommandPalette";
import { cn } from "@/lib/cn";
import type { Project } from "@/lib/types";

export default function HomePage() {
  const projects = useProjects((s) => s.projects);
  const addProject = useProjects((s) => s.addProject);
  const hydrated = useHydrated();
  const openPalette = useUI((s) => s.openPalette);
  const router = useRouter();

  return (
    <>
      <TopBar
        right={
          <button
            type="button"
            onClick={() => router.push(`/p/${addProject()}`)}
            className="flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            <Icon name="plus" size={13} />
            <span className="hidden sm:inline">New project</span>
          </button>
        }
      >
        <span className="text-[13px] font-medium text-fg">Home</span>
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[980px] px-5 py-10 sm:px-8 sm:py-16">
          <section className="mb-12 sm:mb-16">
            <p className="label-mono mb-3">Everything, in one</p>
            <h1 className="max-w-[22ch] text-[28px] leading-[1.15] font-medium tracking-[-0.03em] text-fg sm:text-[38px]">
              Prose, tables, charts, slides and code
              <span className="text-fg-subtle"> — on one canvas.</span>
            </h1>
            <p className="mt-4 max-w-[58ch] text-[14px] leading-relaxed text-fg-muted">
              A project isn&apos;t a file. It&apos;s a stack of blocks that know
              about each other: point a chart at a table and it stays in sync
              forever.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => router.push(`/p/${addProject()}`)}
                className="rounded-md bg-fg px-3 py-1.5 text-[13px] font-medium text-canvas transition-[filter] duration-150 hover:brightness-90"
              >
                New project
              </button>
              <button
                type="button"
                onClick={() => openPalette()}
                className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                Open command palette
                <kbd className="kbd">⌘K</kbd>
              </button>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="label-mono">Projects</h2>
              <span className="font-mono text-[10px] text-fg-subtle">
                {projects.length}
              </span>
            </div>

            {projects.length === 0 ? (
              <div className="hairline rounded-lg bg-surface px-6 py-14 text-center">
                <p className="text-[13.5px] text-fg-muted">No projects yet.</p>
                <button
                  type="button"
                  onClick={() => router.push(`/p/${addProject()}`)}
                  className="mt-3 text-[13px] text-accent transition-opacity hover:opacity-80"
                >
                  Create your first one
                </button>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((p) => (
                  <li key={p.id}>
                    <ProjectCard project={p} showTime={hydrated} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function ProjectCard({
  project,
  showTime,
}: {
  project: Project;
  showTime: boolean;
}) {
  const kinds = [...new Set(project.blocks.map((b) => b.type))];

  return (
    <Link
      href={`/p/${project.id}`}
      className={cn(
        "group surface-grain flex h-full flex-col rounded-lg border border-line bg-surface p-4",
        "transition-[border-color,background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-px hover:border-line-strong hover:bg-surface-2",
      )}
    >
      <div className="mb-3 flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-[11px] text-fg-muted"
        >
          {project.glyph}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-fg">
            {project.name}
          </span>
          <span className="block font-mono text-[10px] text-fg-subtle">
            {project.blocks.length} block{project.blocks.length === 1 ? "" : "s"}
            {showTime ? ` · ${relativeTime(project.updatedAt)}` : ""}
          </span>
        </span>
        <Icon
          name="arrow-right"
          size={14}
          className="mt-0.5 shrink-0 text-fg-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        />
      </div>

      <div className="mt-auto flex flex-wrap gap-1">
        {kinds.map((k) => (
          <span
            key={k}
            className="flex items-center gap-1 rounded-xs border border-line px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide text-fg-subtle uppercase"
          >
            <Icon name={BLOCK_META[k].icon} size={9} />
            {k}
          </span>
        ))}
      </div>
    </Link>
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
