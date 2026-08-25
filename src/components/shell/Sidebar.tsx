"use client";

/**
 * The sidebar: navigation, projects, and conversations.
 *
 * Chat sits *below* the work rather than in a separate app, because that's the
 * claim — one workspace. Unread counts are computed from the same message list
 * the channel renders, so they can't disagree.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { useMenu, type MenuItem } from "@/components/ui/Menu";
import { ProjectSettings } from "./ProjectSettings";
import { SaveAsTemplate } from "@/components/library/SaveAsTemplate";
import { ChannelSettings } from "@/components/chat/ChannelSettings";
import { projectMenu } from "@/lib/project-menu";
import { useUI } from "@/lib/ui-store";
import { useAppearance } from "@/lib/theme-store";
import { hydrateScope, useHasTeam, useScope } from "@/lib/scope";
import { hydrateTeam } from "@/lib/team";
import {
  lastActivity,
  personById,
  unreadCount,
  useChat,
  useChatHydrated,
} from "@/lib/chat";
import { LOCAL_USER } from "@/lib/realtime";
import { useAuth } from "@/lib/auth/store";
import { subscribeSync, syncStatus } from "@/lib/db/sync";
import { useOffline } from "@/lib/offline";
import { t } from "@/lib/i18n";
import { KeepPromptCompact } from "@/components/account/KeepPrompt";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LogoTile } from "@/components/ui/Logo";

/**
 * What the identity row says on the right.
 *
 * "synced" is a claim, and it has to stop being made the moment it stops being
 * true — a sync that has stalled or paused is exactly when somebody needs to
 * know, and the settings page they'd have to open to find out is the one place
 * they aren't looking.
 */
function useSyncBadge(): { label: string; wrong: boolean } {
  const identity = useAuth((a) => a.identity);
  const status = useSyncExternalStore(
    subscribeSync,
    syncStatus,
    () => ({ state: "off" }) as ReturnType<typeof syncStatus>,
  );
  const offline = useOffline();
  // "Sync failed" on a train is alarming and wrong: nothing failed, there is
  // no network. The distinction is the difference between a bug and a tunnel.
  if (offline) return { label: t("state.offline"), wrong: false };
  if (status.state === "error") return { label: t("state.syncFailed"), wrong: true };
  if (status.state === "paused") return { label: t("state.syncPaused"), wrong: true };
  if (status.state === "off") return { label: t("state.thisDevice"), wrong: false };
  if (status.state === "working" && !status.at)
    return { label: t("state.syncing"), wrong: false };
  /*
   * The distinction the word "synced" was hiding.
   *
   * With a database and nobody signed in, the app signs in anonymously — a
   * real account, on a real server, that nothing but this browser at this
   * address can ever reach again. Clearing site data does not just lose a
   * cache, it loses the only key to it. Calling that "synced" is true about
   * the round trip and false about everything a person means by the word.
   */
  if (!identity.email) return { label: t("state.noAccount"), wrong: false };
  return { label: t("state.synced"), wrong: false };
}

export function Sidebar() {
  const identity = useAuth((s) => s.identity);
  const badge = useSyncBadge();
  const projects = useProjects((s) => s.projects);
  const addProject = useProjects((s) => s.addProject);
  const params = useParams<{ projectId?: string; channelId?: string[] }>();
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen, openPalette } = useUI();
  const setAppearance = useAppearance((s) => s.set);

  useChatHydrated();
  useEffect(() => {
    hydrateScope();
    // The switch's "is there a team?" answer lives in the team store; without
    // this it reads the seed until somebody visits /team.
    hydrateTeam();
  }, []);
  const scope = useScope((s) => s.scope);
  const setScope = useScope((s) => s.setScope);
  const hasTeam = useHasTeam();
  const channels = useChat((s) => s.channels);
  const messages = useChat((s) => s.messages);
  const readAt = useChat((s) => s.readAt);
  const createChannel = useChat((s) => s.createChannel);

  const [newChannel, setNewChannel] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [showAllProjects, setShowAllProjects] = useState(false);
  const notify = useUI.getState().notify;
  const menu = useMenu();
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [channelSettingsFor, setChannelSettingsFor] = useState<string | null>(null);
  const [templatingFrom, setTemplatingFrom] = useState<string | null>(null);
  const settingsProject = projects.find((p) => p.id === settingsFor);
  const settingsChannel = channels.find((c) => c.id === channelSettingsFor);
  const templateSource = projects.find((p) => p.id === templatingFrom);

  const channelMenu = (channelId: string): MenuItem[] => {
    const chat = useChat.getState();
    const channel = chat.channels.find((c) => c.id === channelId);
    if (!channel) return [];
    const closed = channel.access === "closed" && Boolean(channel.passcodeHash);
    return [
      {
        kind: "item",
        label: "Open",
        icon: "arrow-right",
        onSelect: () => router.push(`/chat/${channelId}`),
      },
      {
        kind: "item",
        label: "Mark as read",
        icon: "check",
        onSelect: () => chat.markRead(channelId),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Settings…",
        icon: "settings",
        onSelect: () => setChannelSettingsFor(channelId),
      },
      {
        kind: "item",
        label: closed ? "Copy invite link" : "Create invite link",
        icon: "copy",
        onSelect: () => {
          const token =
            channel.invite?.token ?? chat.rotateInvite(channelId);
          void navigator.clipboard?.writeText(
            `${window.location.origin}/chat/${channelId}?join=${token}`,
          );
          notify("Invite link copied");
        },
      },
      { kind: "separator" },
      {
        kind: "item",
        label: channel.archived ? "Restore" : "Archive",
        icon: "history",
        onSelect: () => chat.setArchived(channelId, !channel.archived),
      },
      {
        kind: "item",
        label: "Leave",
        icon: "x",
        danger: true,
        onSelect: () => {
          chat.leaveChannel(channelId);
          notify(`You left #${channel.name}`);
        },
      },
    ];
  };

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
      // Archived channels keep their history but leave the sidebar; you find
      // them again through ⌘K or by restoring them.
      rooms: withMeta
        .filter(
          (c) =>
            c.channel.kind === "channel" &&
            !c.channel.archived &&
            (c.channel.scope ?? "personal") === scope,
        )
        .sort(byRecency),
      dms: withMeta.filter((c) => c.channel.kind === "dm").sort(byRecency),
      totalUnread: withMeta
        .filter((c) => !c.channel.archived)
        .reduce((n, c) => n + c.unread, 0),
    };
  }, [channels, messages, readAt, scope]);

  // The switch changes worlds, and the documents come with it: team scope
  // lists the team's projects, personal lists yours. Projects from before
  // worlds existed have no scope and count as personal.
  const world = hasTeam ? scope : "personal";
  const worldProjects = projects.filter((p) => (p.scope ?? "personal") === world);
  const visibleProjects = showAllProjects
    ? worldProjects
    : worldProjects.slice(0, 7);

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
      {menu.node}
      {settingsProject && (
        <ProjectSettings
          project={settingsProject}
          onClose={() => setSettingsFor(null)}
        />
      )}
      {templateSource && (
        <SaveAsTemplate
          project={templateSource}
          onClose={() => setTemplatingFrom(null)}
        />
      )}
      {settingsChannel && (
        <ChannelSettings
          channel={settingsChannel}
          onClose={() => setChannelSettingsFor(null)}
        />
      )}

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
            <LogoTile size={20} className="rounded-[5px]" />
            Tougather
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
            <span>{t("nav.search")}</span>
            <kbd className="kbd ml-auto">⌘K</kbd>
          </button>
        </div>

        {/* Whose things you are looking at. One switch, obeyed by the agenda
            and by the channel list below — the same answer everywhere at
            once, because a calendar in team mode next to chats in personal
            mode is how the wrong thing lands in the wrong place. */}
        <div className="shrink-0 px-2.5 pb-2">
          <div
            className="flex rounded-md border border-line bg-surface p-0.5"
            role="tablist"
            aria-label="Personal or team"
          >
            {(["personal", "team"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={scope === option}
                onClick={() => setScope(option)}
                className={cn(
                  "flex-1 rounded-sm px-2 py-1 text-[11.5px] capitalize transition-colors",
                  scope === option
                    ? "bg-surface-3 font-medium text-fg"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <nav className="flex shrink-0 flex-col gap-0.5 px-2.5 pb-3">
          <NavLink
            href="/library"
            icon="home"
            label={t("nav.library")}
            active={!activeProject && !onChat && pathname === "/"}
            onNavigate={closeOnMobile}
          />
          <NavLink
            href="/chat"
            icon="users"
            label={t("nav.chat")}
            active={onChat}
            badge={totalUnread}
            onNavigate={closeOnMobile}
          />
          {/* Notes were only ever visible as a strip inside the Library, and
              only when there were some — so anybody without the desktop app
              saw nothing and had no way to learn the thing existed. */}
          <NavLink
            href="/agenda"
            icon="calendar"
            label={t("nav.agenda")}
            active={pathname === "/agenda"}
            onNavigate={closeOnMobile}
          />
          {/* Above Notes on purpose: what is due is the first question
              somebody opens the app with, and the notepad is the second. */}
          <NavLink
            href="/assignments"
            icon="check"
            label={t("nav.assignments")}
            active={pathname === "/assignments"}
            onNavigate={closeOnMobile}
          />
          <NavLink
            href="/notes"
            icon="sticky"
            label={t("nav.notes")}
            active={pathname === "/notes"}
            onNavigate={closeOnMobile}
          />
          {/* Two stacked rectangles — a deck of cards. Not the sparkle, which
              is already the team assistant two rows down. */}
          <NavLink
            href="/study"
            icon="copy"
            label={t("nav.study")}
            active={pathname === "/study"}
            onNavigate={closeOnMobile}
          />
          <NavLink
            href="/kit"
            icon="group"
            label={t("nav.kit")}
            active={pathname === "/kit"}
            onNavigate={closeOnMobile}
          />
          <NavLink
            href="/team"
            icon="board"
            label={t("nav.team")}
            active={pathname === "/team"}
            onNavigate={closeOnMobile}
          />
          <NavLink
            href="/community"
            icon="map"
            label={t("nav.community")}
            active={pathname === "/community"}
            onNavigate={closeOnMobile}
          />
          {/* Administration is a group inside Settings now. The rule that
              used to hide this link when there was no database says the same
              thing about the link itself: a permanent item for a screen most
              people open once teaches everybody to skip that part of the nav.
              ⌘K still finds it, and /admin still resolves. */}
          {assistant && (
            <NavLink
              href={`/chat/${assistant.channel.id}`}
              icon="sparkle"
              label={t("nav.assistant")}
              active={assistant.channel.id === activeChannel}
              onNavigate={closeOnMobile}
            />
          )}
        </nav>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-3">
          {/* Projects */}
          <div className="mb-1 flex items-center justify-between px-4">
            <span className="label-mono">{t("nav.projects")}</span>
            <button
              type="button"
              disabled={scope === "team" && !hasTeam}
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

          {scope === "team" && !hasTeam ? (
            /* Team world, no team: the documents live behind the same two
               doors the channels point at below — one hint here, not a second
               pair of buttons. */
            <p className="mx-2.5 rounded-md border border-dashed border-line px-3 py-2 text-[11.5px] leading-relaxed text-fg-subtle">
              No team yet. Team documents appear here once you create or join
              one.
            </p>
          ) : (
          <ul className="flex flex-col gap-0.5 px-2.5">
            {visibleProjects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/p/${p.id}`}
                  onClick={closeOnMobile}
                  onContextMenu={(e) =>
                    menu.open(
                      e,
                      projectMenu(p, {
                        open: (id) => router.push(`/p/${id}`),
                        settings: () => setSettingsFor(p.id),
                        rename: () => setSettingsFor(p.id),
                        saveAsTemplate: () => setTemplatingFrom(p.id),
                      }),
                    )
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-150",
                    "py-[var(--ui-row-y)]",
                    p.id === activeProject
                      ? "bg-surface-2 text-fg"
                      : "text-fg-muted hover:bg-surface hover:text-fg",
                  )}
                >
                  <Avatar
                    glyph={p.glyph}
                    kind={p.kind}
                    size={13}
                    className="shrink-0 text-fg-subtle"
                  />
                  <span className="truncate">{p.name}</span>
                </Link>
              </li>
            ))}
            {worldProjects.length > 7 && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAllProjects((v) => !v)}
                  className="w-full px-2 py-1 text-left font-mono text-[10px] text-fg-subtle transition-colors hover:text-fg-muted"
                >
                  {showAllProjects
                    ? "show less"
                    : `+${worldProjects.length - 7} more`}
                </button>
              </li>
            )}
          </ul>
          )}

          {/* Channels — the team's rooms, or your own chats, by the switch
              above. Same list machinery, different shelf. */}
          <div className="mt-4 mb-1 flex items-center justify-between px-4">
            <span className="label-mono">
              {scope === "team" ? t("nav.channels") : t("nav.chats")}
            </span>
            <button
              type="button"
              disabled={scope === "team" && !hasTeam}
              onClick={() => setNewChannel(true)}
              className="rounded-xs p-0.5 text-fg-subtle transition-colors duration-150 hover:text-fg"
              aria-label="New channel"
              title="New channel"
            >
              <Icon name="plus" size={13} />
            </button>
          </div>

          {scope === "team" && !hasTeam ? (
            /* No team, so no team channels — and not an empty list that looks
               broken, but the two doors. Creating a team is the paid plan;
               joining takes a link from someone who has one. */
            <div className="mx-2.5 rounded-md border border-dashed border-line px-3 py-2.5">
              <p className="text-[11.5px] leading-relaxed text-fg-subtle">
                No team yet. Channels live in a team.
              </p>
              <div className="mt-2 flex flex-col gap-1">
                <Link
                  href="/pricing"
                  className="rounded-sm bg-accent px-2 py-1 text-center text-[11.5px] font-medium text-on-accent transition-[filter] hover:brightness-110"
                >
                  Create a team
                </Link>
                <Link
                  href="/team#join"
                  className="rounded-sm border border-line px-2 py-1 text-center text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  Join a team
                </Link>
              </div>
            </div>
          ) : (
          <ul className="flex flex-col gap-0.5 px-2.5">
            {rooms.map(({ channel, unread }) => (
              <li key={channel.id}>
                <ChannelLink
                  href={`/chat/${channel.id}`}
                  label={`# ${channel.name}`}
                  active={channel.id === activeChannel}
                  unread={unread}
                  locked={
                    channel.access === "closed" && Boolean(channel.passcodeHash)
                  }
                  onNavigate={closeOnMobile}
                  onContextMenu={(e) =>
                    menu.open(e, channelMenu(channel.id))
                  }
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
                      const id = await createChannel(channelName, undefined, {
                        scope,
                      });
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
            {scope === "personal" && rooms.length === 0 && !newChannel ? (
              <li className="px-2 py-1 text-[11px] leading-relaxed text-fg-subtle">
                Chats with friends or classmates. Make one with +, then share
                its invite link from the channel&apos;s settings.
              </li>
            ) : null}
          </ul>
          )}

          {/* Direct messages */}
          <div className="mt-4 mb-1 px-4">
            <span className="label-mono">{t("nav.dms")}</span>
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

        {/* Asked once, in the column rather than over the canvas — someone
            deep in a document should still get the question. */}
        <div className="shrink-0">
          <KeepPromptCompact />
        </div>

        <div className="shrink-0 border-t border-line px-2.5 py-2">
          {/* Who you are, and where the work is kept. Its own row rather than
              a line in Settings: "am I signed in" is a question people ask of
              the chrome, not of a settings page. */}
          <Link
            // Signed in, this is where the account is managed; signed out, it
            // is the way in. Sending someone who wants to sign in to a settings
            // page and asking them to find the right section is a maze.
            href={identity.kept === "account" ? "/settings#account" : "/signin"}
            onClick={closeOnMobile}
            className={cn(
              "mb-1 flex items-center gap-2 rounded-md px-2 transition-colors duration-150",
              "py-[var(--ui-row-y)]",
              "text-fg-muted hover:bg-surface hover:text-fg",
            )}
          >
            <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-surface-3 font-mono text-[8.5px] text-fg">
              {identity.initials}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {identity.name}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-[9.5px]",
                badge.wrong ? "text-danger" : "text-fg-subtle",
              )}
            >
              {badge.label}
            </span>
          </Link>

          <NavLink
            href="/settings"
            icon="settings"
            label={t("nav.settings")}
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
        <span className="ml-auto grid min-w-[16px] place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-on-accent">
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
  locked,
  onNavigate,
  onContextMenu,
}: {
  href: string;
  label: string;
  active: boolean;
  unread: number;
  dot?: string;
  locked?: boolean;
  onNavigate?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      onContextMenu={onContextMenu}
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
      {locked && (
        <Icon
          name="focus"
          size={10}
          aria-label="Closed group"
          className="shrink-0 text-fg-subtle"
        />
      )}
      {dot && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: dot }}
        />
      )}
      <span className={cn("truncate", unread > 0 && "font-medium")}>{label}</span>
      {unread > 0 && (
        <span className="ml-auto grid min-w-[16px] shrink-0 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-on-accent">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
