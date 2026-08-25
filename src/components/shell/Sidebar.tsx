"use client";

/**
 * The sidebar: five doors, and what you had open last.
 *
 * It used to be ten nav rows, two lists and eighteen controls, and eight of
 * the ten rows opened a room that is empty until somebody has a reason for it
 * — while the things people actually do (every project action, all five
 * exports, starting a direct message) were behind a right-click or ⌘K and
 * nowhere else. So the rows people cannot use yet are gone from here and
 * written down on `/more`, which lists every destination in the product with
 * the condition that unlocks it. Cutting a row is only honest because that
 * page exists and because ⌘K reaches all of them; the addresses themselves
 * have not moved.
 *
 * What replaces the two lists is one "recent" list — projects, channels and
 * the notepad mixed by when they were last touched. Two lists that each show
 * seven of one kind of thing is a worse answer to "where was I" than one list
 * of eight things.
 *
 * Chat sits in the same column as the work rather than in a separate app,
 * because that's the claim — one workspace. Unread counts are computed from
 * the same message list the channel renders, so they can't disagree.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { useMenu, type MenuItem } from "@/components/ui/Menu";
import { RowMenuButton } from "@/components/ui/RowMenuButton";
import { useProjectActions } from "@/components/projects/useProjectActions";
import { useChannelActions } from "@/components/chat/useChannelActions";
import { projectMenu } from "@/lib/project-menu";
import { useUI } from "@/lib/ui-store";
import { useAppearance } from "@/lib/theme-store";
import { hydrateScope, settleScope, useHasTeam, useScope } from "@/lib/scope";
import { useTeamHydrated } from "@/lib/team";
import {
  lastActivity,
  personById,
  unreadCount,
  useChat,
  useChatHydrated,
  type Channel,
} from "@/lib/chat";
import { LOCAL_USER } from "@/lib/realtime";
import { useAuth } from "@/lib/auth/store";
import { subscribeSync, syncStatus } from "@/lib/db/sync";
import { listNotes, titleOf, type Note } from "@/lib/db/notes";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { useOffline } from "@/lib/offline";
import { t } from "@/lib/i18n";
import { KeepPromptCompact } from "@/components/account/KeepPrompt";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LogoTile } from "@/components/ui/Logo";
import type { Project } from "@/lib/types";

/** How many recent rows are drawn before, and after, "+N more". */
const RECENT_SHOWN = 8;
const RECENT_MAX = 24;

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

/**
 * One row of the recent list.
 *
 * Kept as data rather than as rendered rows so the sort below can put a
 * project, a channel and a note in one order without caring which is which.
 */
type Recent =
  | { type: "project"; id: string; at: number; unread: 0; project: Project }
  | { type: "channel"; id: string; at: number; unread: number; channel: Channel }
  | { type: "note"; id: string; at: number; unread: 0; title: string };

export function Sidebar() {
  const identity = useAuth((s) => s.identity);
  const badge = useSyncBadge();
  const projects = useProjects((s) => s.projects);
  const params = useParams<{ projectId?: string; channelId?: string[] }>();
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen, openPalette } = useUI();
  const setAppearance = useAppearance((s) => s.set);

  useChatHydrated();
  useEffect(() => {
    hydrateScope();
  }, []);
  // `settleScope` asks the team store whether there is a team, so it must not
  // be asked before that store has loaded — asked too early it reads the seed
  // workspace, answers "no team", and resets the scope of everybody who has
  // one. This is the store's own hydrated flag rather than "the line after
  // rehydrate()", which only works while that call happens to be synchronous.
  const teamReady = useTeamHydrated();
  useEffect(() => {
    if (teamReady) settleScope();
  }, [teamReady]);
  const scope = useScope((s) => s.scope);
  const setScope = useScope((s) => s.setScope);
  const hasTeam = useHasTeam();
  const channels = useChat((s) => s.channels);
  const messages = useChat((s) => s.messages);
  const readAt = useChat((s) => s.readAt);

  const [expanded, setExpanded] = useState(false);
  const menu = useMenu();

  /* The project menu's callbacks and the dialogs they open, shared with the
     Library so the same menu cannot come out different in two places. The
     drawer closes behind a menu that navigates, the same as a row tap does —
     `closeOnMobile` is declared below, so this reads it at call time. */
  const { actionsFor, dialogs } = useProjectActions({
    onNavigate: () => closeOnMobile(),
  });
  /* The channel and DM menus, which used to be a closure in this file. They
     live in `chat/useChannelActions` now because the rooms rail on /chat is
     the other place a room is listed and it needs the same six actions. */
  const rooms = useChannelActions({ onNavigate: () => closeOnMobile() });

  /*
   * The notepad, read once, so it can take a row in the list.
   *
   * Notes are a table on the server rather than part of the local project
   * store, so this is a real query — guarded on the deployment having a
   * database at all, which is the common case where it does nothing. Only the
   * newest note gets a row: a note has no address of its own (the notepad
   * keeps its selection in component state), so every note row would be the
   * same link, and `/notes` opens the newest one. One row that does what it
   * says beats five that all land in the same place.
   */
  const remote = useRemoteConfigured();
  const [notes, setNotes] = useState<Note[]>([]);
  // Re-asked on the way into and out of the notepad, because the sidebar sits
  // in the layout and never unmounts: fetched once, this row would go on
  // naming a note that has since been renamed, or deleted, or is no longer
  // the newest — which is the whole basis on which it claims /notes opens it.
  const onNotes = pathname?.startsWith("/notes") ?? false;
  useEffect(() => {
    if (!remote) return;
    let alive = true;
    void listNotes()
      .then((all) => {
        if (alive) setNotes(all);
      })
      // A deployment without the notes table is not an error here, it is a
      // feature nobody switched on. The row simply never appears.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [remote, onNotes]);

  const activeProject = params?.projectId;
  const activeChannel = params?.channelId?.[0];
  const onChat = pathname?.startsWith("/chat") ?? false;

  /*
   * The switch changes worlds, and everything comes with it. With no team
   * there is only one world, so `world` — not `scope` — is what every list
   * and every count below reads: the stored preference can say "team" from a
   * session before somebody left one, and a badge counting rooms that have no
   * row underneath them is worse than no badge.
   */
  const world = hasTeam ? scope : "personal";

  const totalUnread = useMemo(
    () =>
      channels
        .filter(
          (c) =>
            !c.archived &&
            (c.kind !== "channel" || (c.scope ?? "personal") === world),
        )
        .reduce((n, c) => n + unreadCount(messages, c.id, readAt[c.id]), 0),
    [channels, messages, readAt, world],
  );

  /*
   * What you had open, in one list.
   *
   * Ordered: the last project first, then anything unread, then the rest by
   * recency. The last project is pinned because it is the single most likely
   * answer to "where was I", and letting a chatty channel push it off the top
   * is how a sidebar stops being a way back to your work.
   *
   * "Last touched" is what the stores actually record — `updatedAt` on a
   * project, the newest message in a channel. It is not quite "last opened",
   * and it is close enough to be useful in every case except reading a
   * document without typing in it.
   */
  const recent = useMemo<Recent[]>(() => {
    const items: Recent[] = [];

    for (const p of projects) {
      if ((p.scope ?? "personal") !== world) continue;
      items.push({ type: "project", id: p.id, at: p.updatedAt, unread: 0, project: p });
    }

    for (const c of channels) {
      // Archived rooms keep their history but leave this list; you find them
      // again through ⌘K, or by restoring one from its menu.
      if (c.archived) continue;
      if (c.kind === "channel" && (c.scope ?? "personal") !== world) continue;
      items.push({
        type: "channel",
        id: c.id,
        // A room nobody has written in yet still deserves its place in the
        // order rather than falling to the bottom on a zero.
        at: lastActivity(messages, c.id) || c.createdAt,
        unread: unreadCount(messages, c.id, readAt[c.id]),
        channel: c,
      });
    }

    const newestNote = notes[0];
    if (newestNote)
      items.push({
        type: "note",
        id: newestNote.id,
        at: newestNote.updatedAt,
        unread: 0,
        title: titleOf(newestNote) || "Empty note",
      });

    const byRecency = (a: Recent, b: Recent) => b.at - a.at;
    const sorted = [...items].sort(byRecency);

    const top = sorted.find((i) => i.type === "project");
    const placed = new Set<Recent>(top ? [top] : []);
    const unread = sorted.filter((i) => !placed.has(i) && i.unread > 0);
    for (const i of unread) placed.add(i);

    return [
      ...(top ? [top] : []),
      ...unread,
      ...sorted.filter((i) => !placed.has(i)),
    ];
  }, [projects, channels, messages, readAt, notes, world]);

  const shown = recent.slice(0, expanded ? RECENT_MAX : RECENT_SHOWN);
  // Counted against what expanding actually reveals, not against everything
  // there is: with forty recent things, "+32 more" over a button that shows
  // sixteen of them is the label lying about the control it sits on. What
  // falls past RECENT_MAX has its own full list — projects on /library, rooms
  // on the /chat rail — which is what the line below the count says.
  const hidden = Math.min(recent.length, RECENT_MAX) - RECENT_SHOWN;
  const beyond = Math.max(0, recent.length - RECENT_MAX);

  const closeOnMobile = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  /** The two things a note can be pointed at from here. */
  const noteMenu = (title: string): MenuItem[] => [
    {
      kind: "item",
      label: "Open",
      icon: "arrow-right",
      onSelect: () => {
        closeOnMobile();
        router.push("/notes");
      },
    },
    {
      kind: "item",
      label: "Copy title",
      icon: "copy",
      onSelect: () => {
        void navigator.clipboard?.writeText(title);
        useUI.getState().notify("Copied");
      },
    },
  ];

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
      {dialogs}
      {rooms.dialogs}

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

        {/*
          * Whose things you are looking at. One switch, obeyed by the agenda
          * and by the rooms in the list below — the same answer everywhere at
          * once, because a calendar in team mode next to chats in personal
          * mode is how the wrong thing lands in the wrong place.
          *
          * It does not exist without a team, because there is nothing to
          * switch between. Its second position used to produce two upsell
          * panels and quietly disable both "+" buttons while their tooltips
          * still offered what they no longer did — a two-position control
          * where one position is an advert.
          */}
        {hasTeam && (
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
        )}

        {/*
          * Five rows, and every one of them is somewhere a new person has a
          * reason to go on the first day. The addresses are unchanged — only
          * the words on them — so a bookmark, a link in an email and ⌘K all
          * still land where they did.
          */}
        <nav className="flex shrink-0 flex-col gap-0.5 px-2.5 pb-3">
          <NavLink
            href="/library"
            icon="home"
            label="Work"
            active={pathname === "/library"}
            onNavigate={closeOnMobile}
          />
          {/* Agenda and Assignments are the two permanent doors inside this
              one; they had a row each here and answered the same question. */}
          <NavLink
            href="/due"
            icon="calendar"
            label="Due"
            active={pathname === "/due"}
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
          {/* The one conditional row. With nobody else here the page is two
              upsell doors, and a permanent row for those is an advert in the
              furniture; /more still lists it, and says what brings it back. */}
          {hasTeam && (
            <NavLink
              href="/team"
              icon="group"
              label="People"
              active={pathname === "/team"}
              onNavigate={closeOnMobile}
            />
          )}
          {/* The contract that lets the other five rows go: every page in the
              product, its purpose, and what unlocks it. */}
          <NavLink
            href="/more"
            icon="list"
            label="Everything"
            active={pathname === "/more"}
            onNavigate={closeOnMobile}
          />
        </nav>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-3">
          <div className="mb-1 px-4">
            <span className="label-mono">recent</span>
          </div>

          {recent.length === 0 ? (
            <p className="mx-2.5 rounded-md border border-dashed border-line px-3 py-2 text-[11.5px] leading-relaxed text-fg-subtle">
              Nothing open yet. Documents, chats and notes appear here as you
              use them — start in Work or Chat above.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 px-2.5">
              {shown.map((item) => {
                if (item.type === "project") {
                  const p = item.project;
                  return (
                    <li key={`p:${p.id}`}>
                      <RecentRow
                        href={`/p/${p.id}`}
                        label={p.name}
                        active={p.id === activeProject}
                        unread={0}
                        menuLabel={`More for ${p.name}`}
                        onOpenMenu={(e) =>
                          menu.open(e, projectMenu(p, actionsFor(p)))
                        }
                        onNavigate={closeOnMobile}
                        leading={
                          <Avatar
                            glyph={p.glyph}
                            kind={p.kind}
                            size={13}
                            className="shrink-0 text-fg-subtle"
                          />
                        }
                      />
                    </li>
                  );
                }

                if (item.type === "note") {
                  return (
                    <li key={`n:${item.id}`}>
                      <RecentRow
                        href="/notes"
                        label={item.title}
                        active={pathname === "/notes"}
                        unread={0}
                        menuLabel={`More for ${item.title}`}
                        onOpenMenu={(e) => menu.open(e, noteMenu(item.title))}
                        onNavigate={closeOnMobile}
                        leading={
                          <Icon
                            name="sticky"
                            size={13}
                            className="shrink-0 text-fg-subtle"
                          />
                        }
                      />
                    </li>
                  );
                }

                const c = item.channel;
                const other =
                  c.kind === "dm"
                    ? c.memberIds.find((id) => id !== LOCAL_USER.id)
                    : undefined;
                const person = other ? personById(other) : null;
                return (
                  <li key={`c:${c.id}`}>
                    <RecentRow
                      href={`/chat/${c.id}`}
                      label={c.kind === "channel" ? `# ${c.name}` : c.name}
                      active={c.id === activeChannel}
                      unread={item.unread}
                      dot={person?.color}
                      locked={
                        c.access === "closed" && Boolean(c.passcodeHash)
                      }
                      menuLabel={
                        c.kind === "channel"
                          ? `More for #${c.name}`
                          : `More for ${c.name}`
                      }
                      onOpenMenu={(e) => menu.open(e, rooms.actionsFor(c.id))}
                      onNavigate={closeOnMobile}
                      leading={
                        c.kind === "ai" ? (
                          <Icon
                            name="sparkle"
                            size={13}
                            className="shrink-0 text-fg-subtle"
                          />
                        ) : null
                      }
                    />
                  </li>
                );
              })}

              {hidden > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="w-full px-2 py-1 text-left font-mono text-[10px] text-fg-subtle transition-colors hover:text-fg-muted"
                  >
                    {expanded ? "show less" : `+${hidden} more`}
                  </button>
                </li>
              )}

              {expanded && beyond > 0 && (
                <li className="px-2 py-1 text-[10.5px] leading-relaxed text-fg-subtle">
                  {beyond} older {beyond === 1 ? "thing" : "things"} are on{" "}
                  <Link href="/library" className="underline hover:text-fg">
                    work
                  </Link>{" "}
                  and{" "}
                  <Link href="/chat" className="underline hover:text-fg">
                    chat
                  </Link>
                  .
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Asked once, in the column rather than over the canvas — someone
            deep in a document should still get the question. */}
        <div className="shrink-0">
          <KeepPromptCompact />
        </div>

        <div className="shrink-0 border-t border-line px-2.5 py-2">
          {/*
            * Who you are, where the work is kept, and the way into Settings.
            *
            * The gear is a sibling of the identity link rather than anything
            * inside it, and it is not decoration: signed out, this row points
            * at /signin, so without the gear there would be no pointer route
            * at all to Appearance, the language line, terms, privacy or the
            * offline door.
            */}
          <div className="flex items-center gap-0.5">
            <Link
              // Signed in, this is where the account is managed; signed out, it
              // is the way in. Sending someone who wants to sign in to a settings
              // page and asking them to find the right section is a maze.
              href={identity.kept === "account" ? "/settings#account" : "/signin"}
              onClick={closeOnMobile}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 transition-colors duration-150",
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

            <Link
              href="/settings"
              onClick={closeOnMobile}
              aria-label={t("nav.settings")}
              title={t("nav.settings")}
              aria-current={
                pathname?.startsWith("/settings") ? "page" : undefined
              }
              className={cn(
                // Small on purpose: it shares a row with a name that has to
                // truncate against the sync badge at the narrowest width the
                // resize handle allows.
                "shrink-0 rounded-md p-1 transition-colors duration-150",
                pathname?.startsWith("/settings")
                  ? "bg-surface-2 text-fg"
                  : "text-fg-subtle hover:bg-surface hover:text-fg",
              )}
            >
              <Icon name="settings" size={14} />
            </Link>
          </div>
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
      /* The highlight had no programmatic twin, so which page you were on was
         information available only to people who could see the shade. */
      aria-current={active ? "page" : undefined}
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

/**
 * One row of the recent list, whatever kind of thing it is.
 *
 * Every row has a menu, and the button that opens it is a **sibling** of the
 * link, never a child: a button inside an anchor is markup browsers disagree
 * about, and the two activations fight. The wrapper supplies `group relative`
 * and the link leaves room on the right for the button to sit in.
 */
function RecentRow({
  href,
  label,
  active,
  unread,
  dot,
  locked,
  leading,
  menuLabel,
  onOpenMenu,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  unread: number;
  dot?: string;
  locked?: boolean;
  leading?: React.ReactNode;
  menuLabel: string;
  onOpenMenu: (e: React.MouseEvent) => void;
  onNavigate?: () => void;
}) {
  return (
    <span className="group relative block">
      <Link
        href={href}
        onClick={onNavigate}
        onContextMenu={onOpenMenu}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-md pr-7 pl-2 text-[13px] transition-colors duration-150",
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
        {leading}
        <span className={cn("truncate", unread > 0 && "font-medium")}>
          {label}
        </span>
        {unread > 0 && (
          <span className="ml-auto grid min-w-[16px] shrink-0 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-on-accent">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <RowMenuButton label={menuLabel} onOpen={onOpenMenu} />
    </span>
  );
}
