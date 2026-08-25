"use client";

/**
 * "Share" — one panel, three ways out.
 *
 * Link, file and chat are three answers to one question: how do I get this to
 * someone else. They used to live in three different places — the link here,
 * the five export formats in a right-click menu and the command palette and
 * nowhere else, posting into a channel only in the palette — so the file half
 * of sharing had no visible control anywhere in the product. Answers to the
 * same question belong behind the same control.
 *
 * **a link** hands somebody a URL: a reader, a commenter, a suggester, or a
 * live session with your pointer on their screen. **a file** hands them
 * something they keep. **in a chat** posts the project into a conversation
 * here, as a card that stays in step with the document.
 *
 * The link is built when the panel opens on that tab, not on mount: encoding a
 * project costs a compression pass and every editor would pay it on every
 * keystroke otherwise. It is rebuilt each time that tab comes up, so it always
 * carries the document as it is now — a stale link is worse than a slow one.
 *
 * Importing a .docx is deliberately not in here. It pulls a Word file *into*
 * the open document; it is not the inverse of Export and this panel is about
 * what leaves.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import {
  EXPIRY_IS_ADVISORY,
  linkVerdict,
  shareLink,
  type LinkVerdict,
  type SharePermission,
} from "@/lib/share";
import { transportReach } from "@/lib/collab/transport";
import { uid } from "@/lib/factories";
import { useShared } from "@/lib/collab/shared";
import { useUI } from "@/lib/ui-store";
import { useScope, useHasTeam } from "@/lib/scope";
import { canOpen, useChat } from "@/lib/chat";
import { EXPORT_LABELS, exportProject, type ExportFormat } from "@/lib/export";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatNumber } from "@/lib/format";
import { EmailDraft } from "./EmailDraft";

const MODES: Array<{
  value: SharePermission;
  label: string;
  blurb: (name: string) => string;
}> = [
  {
    value: "view",
    label: "Can view",
    blurb: (name) => `Opens ${name} as a reader. Nothing to change, nothing to break.`,
  },
  {
    value: "comment",
    label: "Can comment",
    blurb: (name) =>
      `Opens ${name} as a reader who can leave notes in the margin. They can't change a word, and you pick the notes up here.`,
  },
  {
    value: "suggest",
    label: "Can suggest",
    blurb: (name) =>
      `Opens ${name} with suggesting on: what they type is proposed, and you decide what to keep.`,
  },
  {
    value: "edit",
    label: "Can help",
    blurb: (name) =>
      `Opens ${name} in the editor, in a session with you — you'll see each other's pointer.`,
  },
];

type Tab = "link" | "file" | "chat";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "link", label: "a link" },
  { id: "file", label: "a file" },
  { id: "chat", label: "in a chat" },
];

/**
 * The five formats, in the order somebody picks between them: the one most
 * people want, then the two Word ones, then the two plain-text ones. The
 * labels come from `lib/export` so this panel and the palette never disagree
 * about what a format is called.
 */
const FORMATS: Array<{ format: ExportFormat; icon: IconName; blurb: string }> = [
  {
    format: "pdf",
    icon: "file",
    blurb: "Opens a print window holding the document and nothing else.",
  },
  {
    format: "docx",
    icon: "file",
    blurb: "A real Word file: footnotes on the page, tracked changes it can review.",
  },
  {
    format: "doc",
    icon: "file",
    blurb: "The older Word format, for things that open Word files but aren't Word.",
  },
  { format: "html", icon: "code", blurb: "One .html file, figures and all." },
  { format: "markdown", icon: "text", blurb: "Plain text, with the structure kept." },
];

export function ShareMenu({ project }: { project: Project }) {
  const notify = useUI((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("link");
  const [mode, setMode] = useState<SharePermission>("view");
  const [link, setLink] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<LinkVerdict | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailing, setEmailing] = useState(false);
  /** Days until the link stops opening. 0 means no date at all. */
  const [days, setDays] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const shared = useShared((s) => s.ids.includes(project.id));
  const startSharing = useShared((s) => s.startSharing);
  const stopSharing = useShared((s) => s.stopSharing);
  const expectNotes = useShared((s) => s.expectNotes);

  const channels = useChat((s) => s.channels);
  const unlocked = useChat((s) => s.unlocked);
  const sendToChannel = useChat((s) => s.send);
  const scope = useScope((s) => s.scope);
  const hasTeam = useHasTeam();

  /*
   * The channels of the world you are currently in, by the same rule the
   * sidebar and /chat use: rooms belong to a scope, direct messages and the
   * assistant belong to you. Archived rooms are left out because they are out
   * of the sidebar too, and a locked room is left out because posting into a
   * conversation this browser cannot open would put the card somewhere you
   * can't go and read it.
   */
  const world = hasTeam ? scope : "personal";
  const rooms = useMemo(
    () =>
      channels.filter(
        (c) =>
          !c.archived &&
          (c.kind !== "channel" || (c.scope ?? "personal") === world) &&
          canOpen(c, unlocked),
      ),
    [channels, world, unlocked],
  );

  const build = useCallback(
    /**
     * `forDays` overrides the current expiry.
     *
     * Every caller but one passes nothing and gets the state, which is what
     * you want. `setExpiry` is the exception: it has just called `setDays`
     * and the new value is not in state yet, so it hands the number over
     * rather than reading a stale one back out.
     */
    (permission: SharePermission, forDays?: number) => {
      setLink(null);
      // Choosing "can help" is what opens the room. Building the link and
      // opening the session are the same intent, so they are the same action —
      // otherwise the first person to follow the link finds nobody there.
      const secret = permission === "view" ? undefined : uid() + uid();
      if (permission === "edit" || permission === "suggest")
        startSharing(project.id, secret);
      /*
       * A comment link opens no room — the reader is not in a session — so
       * this is the only record that somebody is out there with it, and the
       * only reason the Library knows to go looking for notes afterwards.
       *
       * The key is a fresh secret per link, and it is what the notes room is
       * named after. The project's own id was the obvious choice and the wrong
       * one: every view link carries that too, so read access was write access,
       * permanently, for anybody ever sent one.
       */
      if (permission === "comment") expectNotes(project.id, secret);
      const chosen = forDays ?? days;
      const until = chosen ? Date.now() + chosen * 86_400_000 : undefined;
      shareLink(project, permission, until, secret).then(
        (url) => {
          setLink(url);
          setVerdict(linkVerdict(url));
        },
        () => notify("That project couldn't be turned into a link."),
      );
    },
    [project, notify, startSharing, expectNotes, days],
  );

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Built here rather than in an effect: opening the panel is the event that
    // should produce a link, and doing it in an effect would be a second
    // render pass for something the click already knew. Only when the link tab
    // is the one coming up — reopening on "a file" should not quietly compress
    // the document and open a live session nobody asked for.
    setOpen(true);
    if (tab === "link") build(mode);
  };

  const selectTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    // Same reason as opening: the document travels inside the link, so the one
    // made two minutes and forty edits ago is the wrong one to hand over.
    if (next === "link") build(mode);
  };

  const onTabKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const from = TABS.findIndex((t) => t.id === tab);
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? TABS.length - 1
          : (from + step + TABS.length) % TABS.length;
    selectTab(TABS[to].id);
    /*
     * Focus follows selection. Read out of the event's own element rather than
     * held in a ref array: the tabs are the only `role="tab"` children this
     * element will ever have, and a ref per tab is a lot of bookkeeping for one
     * `.focus()`.
     */
    e.currentTarget
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [to]?.focus();
  };

  const choose = (next: SharePermission) => {
    setMode(next);
    setCopied(false);
    build(next);
  };

  const setExpiry = (next: number) => {
    setDays(next);
    setCopied(false);
    /*
     * Rebuilt rather than patched: the date is inside the payload, so a link
     * already copied keeps whatever it was made with. That is the honest
     * behaviour and the reason the note below says what it says.
     *
     * The new number is passed in rather than read from state. This used to
     * be `setTimeout(() => build(mode), 0)`, and that closure captured the
     * `build` from the render *before* `setDays` landed — so pressing
     * "Tomorrow" from the default flipped the chip on and produced a link
     * with no expiry at all. A share link that says it dies tomorrow and
     * does not is the worst kind of wrong this panel can be.
     */
    build(mode, next);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard access is refused on insecure origins and in some embedded
      // browsers. Selecting the text is a copy the user can finish themselves,
      // which beats a button that silently does nothing.
      inputRef.current?.select();
      notify("Press ⌘C to copy — the link is selected.");
      return;
    }
    setCopied(true);
    notify(mode === "edit" ? "Edit link copied" : "View link copied");
    setTimeout(() => setCopied(false), 1600);
  };

  const save = (format: ExportFormat) => {
    exportProject(project, format);
    // PDF opens a print window you can see; the other four hand the browser a
    // file that lands in a folder nothing on screen mentions, so this is the
    // only sign anything happened.
    if (format !== "pdf") notify(`${EXPORT_LABELS[format]} — saved to your downloads`);
  };

  const post = (channelId: string, label: string) => {
    sendToChannel(channelId, "", {
      attachments: [{ kind: "project", projectId: project.id }],
    });
    /*
     * The palette's version of this row opens the channel afterwards, because
     * the palette is how you go places. This panel isn't: you are standing in
     * the document, and being thrown into a conversation for posting a card
     * would cost you your place in it. The toast is the receipt instead.
     */
    notify(`Shared in ${label}`);
    setOpen(false);
  };

  const reach = transportReach();
  const active = MODES.find((m) => m.value === mode)!;

  return (
    <span className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11.5px] transition-colors duration-150",
          open
            ? "border-line-strong bg-surface-2 text-fg"
            : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
        )}
      >
        <Icon name="link" size={11} />
        Share
      </button>

      {open && (
        <div
          ref={panelRef}
          className="anim-pop absolute top-full right-0 z-50 mt-1.5 w-[340px] rounded-md border border-line-strong bg-surface p-3 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)]"
        >
          <div
            role="tablist"
            aria-label="How to send this"
            onKeyDown={onTabKeys}
            className="flex gap-1 rounded-sm border border-line p-0.5"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`share-tab-${t.id}`}
                aria-selected={tab === t.id}
                /* Only on the selected tab: the other two panels are not
                   rendered, and pointing aria-controls at an id that is not
                   in the document leaves a screen reader's "go to the
                   controlled region" command doing nothing. The ARIA practices
                   allow omitting it for a panel that is not there. */
                aria-controls={tab === t.id ? `share-panel-${t.id}` : undefined}
                // One stop on the way in: arrow keys move between the tabs
                // once you are on them, which is what a tablist is for.
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => selectTab(t.id)}
                className={cn(
                  "flex-1 rounded-xs px-2 py-1 text-[11.5px] transition-colors duration-150",
                  tab === t.id
                    ? "bg-surface-3 text-fg"
                    : "text-fg-subtle hover:text-fg-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "link" && (
            <div
              role="tabpanel"
              id="share-panel-link"
              aria-labelledby="share-tab-link"
            >
              <div
                role="radiogroup"
                aria-label="What the link allows"
                className="mt-2.5 flex gap-1 rounded-sm border border-line p-0.5"
              >
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.value}
                    onClick={() => choose(m.value)}
                    className={cn(
                      "flex-1 rounded-xs px-2 py-1 text-[11.5px] transition-colors duration-150",
                      mode === m.value
                        ? "bg-surface-3 text-fg"
                        : "text-fg-subtle hover:text-fg-muted",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">
                {active.blurb(project.name)}
              </p>

              <div className="mt-2.5 flex gap-1.5">
                <input
                  ref={inputRef}
                  readOnly
                  value={link ?? "Building the link…"}
                  aria-label={
                    mode === "edit"
                      ? "Edit link"
                      : mode === "suggest"
                        ? "Suggest link"
                        : "View link"
                  }
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-sm border border-line bg-canvas px-2 py-1.5 font-mono text-[10.5px] text-fg-muted outline-none focus:border-line-strong"
                />
                <button
                  type="button"
                  onClick={copy}
                  disabled={!link}
                  className="shrink-0 rounded-sm bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              {verdict && (
                <p
                  className={cn(
                    "mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed",
                    verdict.level === "fine" ? "text-fg-subtle" : "text-[#d8a33c]",
                  )}
                >
                  <Icon
                    name={verdict.level === "fine" ? "check" : "minus"}
                    size={10}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    {formatNumber(verdict.characters)} characters. {verdict.note}
                  </span>
                </p>
              )}

              {/* Sending it to somebody is the other half of sharing it, and the
                  link is what an email would carry — so the composer opens from
                  here, with the link already in the body. */}
              <button
                type="button"
                onClick={() => setEmailing(true)}
                className="mt-2 flex w-full items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name="file" size={11} />
                Make an email out of this
              </button>

              <div className="mt-2.5 space-y-1.5 border-t border-line pt-2.5 text-[11px] leading-relaxed text-fg-subtle">
                {/*
                  The one thing a person needs to know before they paste this
                  somewhere: where the document actually goes. It goes in the link.
                  Saying so is also the reason the link is long.
                */}
                <p>
                  The whole document travels inside the link, after the{" "}
                  <code className="font-mono text-fg-muted">#</code>. Browsers never
                  send that part to a server, so nothing is uploaded — and anyone
                  who has the link has the document.
                </p>

                {mode === "view" ? (
                  // Not a lock, and it would be dishonest to draw one. Said plainly
                  // so nobody sends a view link believing it withholds something.
                  <p>
                    &ldquo;Can view&rdquo; picks which door the link opens, not what
                    the recipient is able to read — they hold the document either
                    way.
                  </p>
                ) : (
                  <p>
                    {reach
                      ? `Live changes and pointers travel to ${reach}.`
                      : "This browser can't open a live session, so the link opens an editable copy instead."}{" "}
                    What they write arrives in your document and is saved with it.
                    The session lasts while you both have it open — nothing is
                    stored between visits until there&apos;s an account.
                  </p>
                )}
              </div>

              {/* Expiry. Offered because people ask for it, and annotated because
                  what it actually does is narrower than the word suggests. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11.5px] text-fg-subtle">Stops working</span>
                {[
                  { days: 0, label: "Never" },
                  { days: 1, label: "Tomorrow" },
                  { days: 7, label: "In a week" },
                  { days: 30, label: "In a month" },
                ].map((option) => (
                  <button
                    key={option.days}
                    type="button"
                    aria-pressed={days === option.days}
                    onClick={() => setExpiry(option.days)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-150",
                      days === option.days
                        ? "border-accent/50 bg-accent-soft text-accent"
                        : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {days > 0 && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
                  {EXPIRY_IS_ADVISORY}
                </p>
              )}

              <div className="mt-2.5 flex items-center gap-3">
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11.5px] text-accent transition-opacity hover:opacity-80"
                  >
                    <Icon name="play" size={10} />
                    {mode === "edit" ? "Open a second window" : "Open the view"}
                  </a>
                )}

                {/* The room stays open while the project is on screen, so there
                    has to be a way to close it that isn't "guess". */}
                {shared && (
                  <button
                    type="button"
                    onClick={() => {
                      stopSharing(project.id);
                      notify("Live session closed — old edit links go quiet.");
                    }}
                    className="ml-auto flex items-center gap-1.5 text-[11.5px] text-fg-subtle transition-colors hover:text-danger"
                  >
                    <Icon name="stop" size={10} />
                    Stop sharing
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "file" && (
            <div
              role="tabpanel"
              id="share-panel-file"
              aria-labelledby="share-tab-file"
            >
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-fg-subtle">
                A copy of {project.name} they keep, in whichever format the person
                on the other end can open.
              </p>

              <div className="mt-2 space-y-1">
                {FORMATS.map((f) => (
                  <button
                    key={f.format}
                    type="button"
                    onClick={() => save(f.format)}
                    className="flex w-full items-start gap-2 rounded-sm border border-line px-2 py-1.5 text-left transition-colors duration-150 hover:border-line-strong"
                  >
                    <Icon
                      name={f.icon}
                      size={11}
                      className="mt-0.5 shrink-0 text-fg-subtle"
                    />
                    <span className="min-w-0">
                      <span className="block text-[11.5px] text-fg">
                        {EXPORT_LABELS[f.format]}
                      </span>
                      <span className="block text-[11px] leading-relaxed text-fg-subtle">
                        {f.blurb}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <p className="mt-2.5 border-t border-line pt-2.5 text-[11px] leading-relaxed text-fg-subtle">
                Every format is written from the document itself, not from what
                is on screen, so panels, cursors and open menus never end up in
                the file.
              </p>
            </div>
          )}

          {tab === "chat" && (
            <div
              role="tabpanel"
              id="share-panel-chat"
              aria-labelledby="share-tab-chat"
            >
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-fg-subtle">
                Posts a card, not a link. The card follows the project, so what
                the channel sees stays in step with what you write.
              </p>

              {rooms.length ? (
                <div className="mt-2 max-h-[240px] space-y-1 overflow-y-auto">
                  {rooms.map((c) => {
                    const label = c.kind === "channel" ? `#${c.name}` : c.name;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => post(c.id, label)}
                        className="flex w-full items-center gap-2 rounded-sm border border-line px-2 py-1.5 text-left transition-colors duration-150 hover:border-line-strong"
                      >
                        <Icon
                          name={c.kind === "channel" ? "board" : "users"}
                          size={11}
                          className="shrink-0 text-fg-subtle"
                        />
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg">
                          {label}
                        </span>
                        {c.topic && (
                          <span className="min-w-0 max-w-[45%] truncate text-[11px] text-fg-subtle">
                            {c.topic}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
                  No conversations here yet. Start one in Chat and it shows up in
                  this list.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {emailing && (
        <EmailDraft
          project={project}
          link={link}
          onClose={() => setEmailing(false)}
        />
      )}
    </span>
  );
}
