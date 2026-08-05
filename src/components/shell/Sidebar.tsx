"use client";

/**
 * The sidebar: navigation, projects, and conversations.
 *
 * Chat sits *below* the work rather than in a separate app, because that's the
 * claim — one workspace. Unread counts are computed from the same message list
 * the channel renders, so they can't disagree.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useAppearance } from "@/lib/theme-store";
import {
  lastActivity,
  personById,
  unreadCount,
  useChat,
  useChatHydrated,
} from "@/lib/chat";
import { LOCAL_USER } from "@/lib/realtime";
import { KINDS } from "@/lib/kinds";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/Icon";

export function Sidebar() {
  const projects = useProjects((s) => s.projects);
  const addProject = useProjects((s) => s.addProject);
  const params = useParams<{ projectId?: string; channelId?: string[] }>();
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen, openPalette } = useUI();
  const setAppearance = useAppearance((s) => s.set);

  useChatHydrated();
  const channels = useChat((s) => s.channels);
  const messages = useChat((s) => s.messages);
  const readAt = useChat((s) => s.readAt);
  const createChannel = useChat((s) => s.createChannel);

  const [newChannel, setNewChannel] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [showAllProjects, setShowAllProjects] = useState(false);

  const activeProject = params?.projectId;
  const activeChannel = params?.channelId?.[0];
  const onChat = pathname?.startsWith("/chat") ?? false;

  const { assistant, rooms, dms, totalUnread } = useMemo(() => {
    const withMeta = channels.map((c) => ({
      channel: c,
      unread: unreadCount(messages, c.id, readAt[c.id]),
      at: lastActivity(messages, c.id),
    }));
    const byRecency = (a: { at: number }, b: { at: number }) => b.at - a.at;
    return {
      assistant: withMeta.find((c) => c.channel.kind === "ai"),
      rooms: withMeta.filter((c) => c.channel.kind === "channel").sort(byRecency),
      dms: withMeta.filter((c) => c.channel.kind === "dm").sort(byRecency),
      totalUnread: withMeta.reduce((n, c) => n + c.unread, 0),
    };
  }, [channels, messages, readAt]);

  const visibleProjects = showAllProjects ? projects : projects.slice(0, 7);

  const closeOnMobile = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  /** Drag the trailing edge to resize; the width persists as a preference. */
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) =>
      setAppearance("sidebarWidth", Math.min(340, Math.max(180, ev.clientX)));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/60 transition-opacity duration-200 lg:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        style={{ width: "var(--sidebar-w)" }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col",
          "border-r border-line bg-canvas",
          "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:hidden",
        )}
        aria-label="Sidebar"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 px-3">
          <Link
            href="/library"
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

        <div className="shrink-0 px-2.5 pb-2">
          <button
            type="button"
            onClick={() => openPalette()}
            className="flex w-full items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            <Icon name="search" size={13} className="text-fg-subtle" />
            <span>Search…</span>
            <kbd className="kbd ml-auto">⌘K</kbd>
          </button>
        </div>

        <nav className="flex shrink-0 flex-col gap-0.5 px-2.5 pb-3">
          <NavLink
            href="/library"
            icon="home"
            label="Library"
            active={!activeProject && !onChat && pathname === "/"}
            onNavigate={closeOnMobile}
          />
          <NavLink
            href="/chat"
            icon="users"
            label="Chat"
            active={onChat}
            badge={totalUnread}
            onNavigate={closeOnMobile}
          />
          <NavLink
            href="/team"
            icon="board"
            label="Team"
            active={pathname === "/team"}
            onNavigate={closeOnMobile}
          />
          {assistant && (
            <NavLink
              href={`/chat/${assistant.channel.id}`}
              icon="sparkle"
              label="Team assistant"
              active={assistant.channel.id === activeChannel}
              onNavigate={closeOnMobile}
            />
          )}
        </nav>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-3">
          {/* Projects */}
          <div className="mb-1 flex items-center justify-between px-4">
            <span className="label-mono">Projects</span>
            <button
              type="button"
              onClick={() => {
                closeOnMobile();
                router.push(`/p/${addProject("doc")}`);
              }}
              className="rounded-xs p-0.5 text-fg-subtle transition-colors duration-150 hover:text-fg"
              aria-label="New project"
              title="New project"
            >
              <Icon name="plus" size={13} />
            </button>
          </div>

          <ul className="flex flex-col gap-0.5 px-2.5">
            {visibleProjects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/p/${p.id}`}
                  onClick={closeOnMobile}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-150",
                    "py-[var(--ui-row-y)]",
                    p.id === activeProject
                      ? "bg-surface-2 text-fg"
                      : "text-fg-muted hover:bg-surface hover:text-fg",
                  )}
                >
                  <Icon
                    name={KINDS[p.kind].icon}
                    size={12}
                    className="shrink-0 text-fg-subtle"
                  />
                  <span className="truncate">{p.name}</span>
                </Link>
              </li>
            ))}
            {projects.length > 7 && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAllProjects((v) => !v)}
                  className="w-full px-2 py-1 text-left font-mono text-[10px] text-fg-subtle transition-colors hover:text-fg-muted"
                >
                  {showAllProjects
                    ? "show less"
                    : `+${projects.length - 7} more`}
                </button>
              </li>
            )}
          </ul>

          {/* Channels */}
          <div className="mt-4 mb-1 flex items-center justify-between px-4">
            <span className="label-mono">Channels</span>
            <button
              type="button"
              onClick={() => setNewChannel(true)}
              className="rounded-xs p-0.5 text-fg-subtle transition-colors duration-150 hover:text-fg"
              aria-label="New channel"
              title="New channel"
            >
              <Icon name="plus" size={13} />
            </button>
          </div>

          <ul className="flex flex-col gap-0.5 px-2.5">
            {rooms.map(({ channel, unread }) => (
              <li key={channel.id}>
                <ChannelLink
                  href={`/chat/${channel.id}`}
                  label={`# ${channel.name}`}
                  active={channel.id === activeChannel}
                  unread={unread}
                  onNavigate={closeOnMobile}
                />
              </li>
            ))}
            {newChannel && (
              <li className="px-2 py-1">
                <input
                  autoFocus
                  value={channelName}
                  placeholder="channel-name"
                  onChange={(e) => setChannelName(e.target.value)}
                  onBlur={() => {
                    setNewChannel(false);
                    setChannelName("");
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && channelName.trim()) {
                      const id = await createChannel(channelName);
                      setNewChannel(false);
                      setChannelName("");
                      router.push(`/chat/${id}`);
                    } else if (e.key === "Escape") {
                      setNewChannel(false);
                      setChannelName("");
                    }
                  }}
                  className="w-full rounded-sm border border-accent bg-surface-2 px-2 py-1 text-[12.5px] text-fg outline-none"
                />
              </li>
            )}
          </ul>

          {/* Direct messages */}
          <div className="mt-4 mb-1 px-4">
            <span className="label-mono">Direct messages</span>
          </div>
          <ul className="flex flex-col gap-0.5 px-2.5">
            {dms.map(({ channel, unread }) => {
              const other = channel.memberIds.find((id) => id !== LOCAL_USER.id);
              const person = other ? personById(other) : null;
              return (
                <li key={channel.id}>
                  <ChannelLink
                    href={`/chat/${channel.id}`}
                    label={channel.name}
                    dot={person?.color}
                    active={channel.id === activeChannel}
                    unread={unread}
                    onNavigate={closeOnMobile}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        <div className="shrink-0 border-t border-line px-2.5 py-2">
          <NavLink
            href="/settings"
            icon="settings"
            label="Settings"
            active={pathname === "/settings"}
            onNavigate={closeOnMobile}
          />
        </div>

        {/* Resize handle — desktop only, where the sidebar is in flow. */}
        <div
          onPointerDown={startResize}
          className="absolute inset-y-0 -right-1 hidden w-2 cursor-col-resize lg:block"
          aria-hidden="true"
        />
      </aside>
    </>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
  badge,
  onNavigate,
}: {
  href: string;
  icon: IconName;
  label: string;
  active: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-150",
        "py-[var(--ui-row-y)]",
        active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      <Icon name={icon} size={14} className="shrink-0" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto grid min-w-[16px] place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function ChannelLink({
  href,
  label,
  active,
  unread,
  dot,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  unread: number;
  dot?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-150",
        "py-[var(--ui-row-y)]",
        active
          ? "bg-surface-2 text-fg"
          : unread > 0
            ? "text-fg hover:bg-surface"
            : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: dot }}
        />
      )}
      <span className={cn("truncate", unread > 0 && "font-medium")}>{label}</span>
      {unread > 0 && (
        <span className="ml-auto grid min-w-[16px] shrink-0 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
