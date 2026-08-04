"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function Sidebar() {
  const projects = useProjects((s) => s.projects);
  const addProject = useProjects((s) => s.addProject);
  const params = useParams<{ projectId?: string }>();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen, openPalette } = useUI();

  const activeId = params?.projectId;

  const newProject = () => {
    const id = addProject();
    setSidebarOpen(window.innerWidth >= 1024);
    router.push(`/p/${id}`);
  };

  return (
    <>
      {/* Scrim — mobile only, where the sidebar overlays the canvas. */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/60 transition-opacity duration-200 lg:hidden",
          sidebarOpen
            ? "opacity-100"
            : "pointer-events-none opacity-0",
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[228px] shrink-0 flex-col",
          "border-r border-line bg-canvas",
          "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:hidden",
        )}
        aria-label="Projects"
      >
        <div className="flex h-12 items-center gap-2 px-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-sm px-1 py-1 text-[13px] font-medium tracking-[-0.01em] text-fg"
          >
            <span
              aria-hidden="true"
              className="grid size-5 place-items-center rounded-[5px] bg-fg text-[11px] font-semibold text-canvas"
            >
              A
            </span>
            Assignments
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-sm p-1 text-fg-subtle transition-colors hover:text-fg lg:hidden"
            aria-label="Close sidebar"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="px-2.5 pb-2">
          <button
            type="button"
            onClick={() => openPalette()}
            className={cn(
              "group flex w-full items-center gap-2 rounded-md px-2 py-1.5",
              "border border-line bg-surface text-[12.5px] text-fg-muted",
              "transition-colors duration-150 hover:border-line-strong hover:text-fg",
            )}
          >
            <Icon name="search" size={13} className="text-fg-subtle" />
            <span>Search…</span>
            <kbd className="kbd ml-auto">⌘K</kbd>
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-2.5 pb-3">
          <SideLink href="/" icon="home" label="Home" active={!activeId} />
        </nav>

        <div className="flex items-center justify-between px-4 pb-1.5">
          <span className="label-mono">Projects</span>
          <button
            type="button"
            onClick={newProject}
            className="rounded-xs p-0.5 text-fg-subtle transition-colors duration-150 hover:text-fg"
            aria-label="New project"
            title="New project"
          >
            <Icon name="plus" size={13} />
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-2.5 pb-4">
          {projects.length === 0 ? (
            <p className="px-2 py-2 text-[12px] text-fg-subtle">No projects yet.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/p/${p.id}`}
                    onClick={() => {
                      if (window.innerWidth < 1024) setSidebarOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
                      "transition-colors duration-150",
                      p.id === activeId
                        ? "bg-surface-2 text-fg"
                        : "text-fg-muted hover:bg-surface hover:text-fg",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="w-3 shrink-0 text-center text-[10px] text-fg-subtle"
                    >
                      {p.glyph}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-line px-4 py-3">
          <p className="label-mono mb-1.5">Everything, in one</p>
          <p className="font-mono text-[10px] leading-relaxed text-fg-subtle">
            Press <span className="text-fg-muted">/</span> in the canvas to add a
            block.
          </p>
        </div>
      </aside>
    </>
  );
}

function SideLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: "home";
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors duration-150",
        active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      <Icon name={icon} size={14} className="shrink-0" />
      {label}
    </Link>
  );
}
