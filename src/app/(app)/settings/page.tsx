"use client";

/**
 * Settings.
 *
 * Appearance first, because that's the one people reach for. Every control
 * writes a CSS custom property, so the preview *is* the app — there's no
 * separate sample to disagree with what you get.
 *
 * Administration used to be its own console with its own place in the
 * sidebar. It is a group here now, for the reason that kept it out of the
 * nav when there was no database: a permanent item for a screen most people
 * open once teaches everybody to ignore that part of the nav. What it needs
 * that the rest of this page does not — a server — is the only thing that
 * gates it, and the gate stops at its own group rather than blanking
 * Appearance along with it.
 *
 * A page this long needs a way to get around, so there is a rail. It is
 * plain anchors rather than tabs: the browser's find-in-page, a bookmark to
 * `#connection`, and a link from somewhere else all keep working, which
 * tabs would break.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ACCENTS,
  useAppearance,
  type AccentName,
  type DensityName,
  type MotionName,
  type RadiusName,
  type ThemeMode,
  type UIFont,
} from "@/lib/theme-store";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { getAIProviderName, subscribeAIProvider } from "@/lib/ai";
import { backendName } from "@/lib/db";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { subscribeSync, syncStatus } from "@/lib/db/sync";
import { getRealtimeProviderName } from "@/lib/realtime";
import { speechProviderName } from "@/lib/speech";
import { sourceResolverName } from "@/lib/sources";
import { chatProviderName } from "@/lib/chat";
import { clearOffline, offlineSupported, useInstalled, useOffline } from "@/lib/offline";
import { SHORTCUTS } from "@/lib/shortcuts";
import { DESKTOP_VERSION, DOWNLOADS, RELEASES_URL } from "@/lib/db/notes";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { EraseAccount } from "@/components/settings/EraseAccount";
import { SafeKeeping } from "@/components/settings/SafeKeeping";
import { WorkIsSafe } from "@/components/settings/WorkIsSafe";
import { YourPlan } from "@/components/settings/YourPlan";
import { Dictionary } from "@/components/settings/Dictionary";
import { AccountPanel } from "@/components/account/AccountPanel";
import { ConnectionPanel } from "@/components/account/ConnectionPanel";
import { TemplatesPanel } from "@/components/settings/TemplatesPanel";
import {
  Loose,
  ProviderRow,
  Row,
  Section,
  Segmented,
} from "@/components/settings/Section";
import { Administration, SignInMethods } from "@/components/settings/AdminSections";
import { useAdminData } from "@/components/settings/useAdminData";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";

/**
 * True only in the browser. Some provider names depend on browser capability
 * (Web Speech exists or it doesn't), so rendering them during SSR guarantees a
 * mismatch. Cached literals, so this can't loop.
 */
const useIsClient = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

/**
 * The AI provider is the one row here that changes after first paint: the app
 * asks the server whether a model is configured, and the answer arrives a beat
 * later. Reading it once would leave this permanently saying "local".
 */
const useAIProviderName = () =>
  useSyncExternalStore(subscribeAIProvider, getAIProviderName, () => "…");

/**
 * Which models the server will actually try, in the order it tries them.
 *
 * Only the server can answer — the key is server-only and so is the
 * rotation. Worth showing: "the AI is slow" and "the first three models in
 * the rotation are rate-limited" look identical from a chair, and this is
 * the difference.
 */
function useAIModels(): { configured: boolean; models: string[] } | null {
  const [answer, setAnswer] = useState<{
    configured: boolean;
    models: string[];
  } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai", { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!alive || !body) return;
        setAnswer({
          configured: body.configured === true,
          models: Array.isArray(body.models) ? body.models.map(String) : [],
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return answer;
}

/** Whether work is actually reaching the account, in one line. */
function useSyncLine(): string {
  const status = useSyncExternalStore(
    subscribeSync,
    syncStatus,
    () => ({ state: "off" }) as ReturnType<typeof syncStatus>,
  );
  if (status.state === "off") return "this browser only — no database configured";
  if (status.state === "working") return status.at ? "syncing…" : "connecting…";
  if (status.state === "paused") return `paused: ${status.problem}`;
  if (status.state === "error") return `stopped: ${status.problem}`;
  return status.at ? `last synced ${formatTime(status.at)}` : "connected";
}

/**
 * Which section you are actually looking at.
 *
 * Twenty anchors that all look the same, on 5,853px of page, and nothing on
 * the screen said where you were — which is the one question somebody who
 * has scrolled this far actually has. It is what sixty-two borders were
 * failing to answer.
 *
 * Additive on purpose. With JavaScript off the rail is exactly the plain
 * anchors it has always been, so find-in-page, a bookmarked `#connection`
 * and a link from somewhere else all still work; that is the whole reason
 * the rail is anchors and not tabs, and an indicator must not cost it.
 *
 * `-70%` at the bottom shrinks the observed band to the top 30% of the
 * viewport, so a section becomes a candidate when its heading crosses that
 * line rather than when it happens to be the tallest thing on screen. Of the
 * candidates we take the LAST, not the first: two sections share the band
 * whenever one ends inside it, and the one you have just arrived at is the
 * lower of the two. Taking the first instead lags a whole section behind —
 * measured, scrolling to Shortcuts left the rail reading Appearance.
 *
 * The bottom fallback is not a nicety: the last four administration sections
 * are short enough that the scroller runs out before any of them reaches
 * that band, so without it they could never be current however far you
 * scrolled.
 */
function useCurrentSection(configured: boolean): string | null {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const ids = RAIL.filter((item) => !item.admin || configured).map((i) => i.id);
    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!nodes.length) return;

    // The page scrolls inside <main>, not inside the window, so the bottom
    // test has to ask that element rather than the document.
    const scroller = nodes[0].closest("main");
    const inBand = new Set<string>();

    const settle = () => {
      const atBottom =
        scroller !== null &&
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8;
      const next = atBottom
        ? ids[ids.length - 1]
        : (ids.findLast((id) => inBand.has(id)) ?? null);
      // Hold the last answer rather than blanking between two sections: a
      // rail that flickers off is worse than one that is a beat behind.
      setCurrent((prev) => next ?? prev);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id);
          else inBand.delete(entry.target.id);
        }
        settle();
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const node of nodes) observer.observe(node);
    scroller?.addEventListener("scroll", settle, { passive: true });

    return () => {
      observer.disconnect();
      scroller?.removeEventListener("scroll", settle);
    };
  }, [configured]);

  return current;
}

/**
 * A group label names a region; it does not title content. So it is the
 * smallest thing on the page while the section headings under it are the
 * largest — which looks like a mistake and is not. The sidebar already
 * proves it works ("recent" at 11px above 13px rows), and it is why this
 * page needs no fifth type size for its second heading level.
 *
 * The hairline under it is gone. 72px above and 24px below says "a new
 * region begins" more plainly than a rule does, and a gap that large plus a
 * rule is two signals doing one job.
 */
function GroupHeading({
  label,
  note,
  first,
}: {
  label: string;
  note: string;
  /** The first one sits directly under the h1, which already spaced it. */
  first?: boolean;
}) {
  return (
    <h2
      className={cn(
        "mb-(--space-4) text-meta text-fg-muted",
        first ? "mt-0" : "mt-(--space-6)",
      )}
    >
      {label}
      <span className="mt-(--space-1) block text-meta text-fg-subtle">
        {note}
      </span>
    </h2>
  );
}

/**
 * The rail, in the order the page is now in.
 *
 * Every label matches the heading it scrolls to, word for word. Four of them
 * used not to — "Is it in your account?" pointed at a section called "Is your
 * work in your account?", "Account" at "Your account", "Shortcuts" at
 * "Keyboard" — which defeats the whole argument for anchors, since the thing
 * you read here is the thing you are meant to find below.
 *
 * The three administration sections with actual controls in them — who is
 * here, how long things are kept, what has been done — were missing
 * entirely, so every route into administration (this rail, ⌘K, and /admin's
 * redirect) landed on the one section that holds nothing but a headcount.
 */
const RAIL: Array<{ id: string; label: string; group?: string; admin?: boolean }> = [
  { id: "account", label: "Your account", group: "you" },
  { id: "signin-methods", label: "How people sign in" },

  /*
   * Money gets its own group, second, and neither half of that is obvious.
   *
   * Its own group, rather than a row under "you", because the rail is the map
   * of this page and somebody hunting for what they pay scans it for the word.
   * Filed under "who you are" it would be findable only by people who already
   * knew where to look, which is the exact failure this section exists to fix
   * — and `/more` already keeps Pricing under a heading called "money", so
   * that is the word this product uses for it.
   *
   * Second, because a plan is an attribute of the account directly above it:
   * whether there is an account at all decides whether there is a plan to
   * read. Below "how the app behaves" it would sit under seven sections about
   * fonts and shortcuts, which is a long way to scroll to find out whether
   * your payment landed.
   */
  { id: "plan", label: "Your plan", group: "money" },

  { id: "safe", label: "Is your work in your account?", group: "where your work is kept" },
  { id: "connection", label: "Connection" },
  { id: "keeping", label: "Keeping your work" },
  { id: "offline", label: "Offline" },
  { id: "workspace", label: "This browser's copy" },
  { id: "erase", label: "Delete your account" },

  { id: "appearance", label: "Appearance", group: "how the app behaves" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "words", label: "Your words" },
  { id: "ai", label: "AI" },
  { id: "providers", label: "Providers" },
  { id: "templates", label: "Templates" },
  { id: "desktop", label: "The desktop note" },

  { id: "administration", label: "Administration", group: "the shared workspace", admin: true },
  { id: "members", label: "Roles the database enforces", admin: true },
  { id: "retention", label: "How long things are kept", admin: true },
  { id: "audit", label: "What has been done", admin: true },
];

export default function SettingsPage() {
  const a = useAppearance();
  const isClient = useIsClient();
  const aiProvider = useAIProviderName();
  const ai = useAIModels();
  const sync = useSyncLine();
  const configured = useRemoteConfigured();
  const offline = useOffline();
  const installed = useInstalled();
  const admin = useAdminData();
  const resetWorkspace = useProjects((s) => s.resetWorkspace);
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen);
  const notify = useUI((s) => s.notify);
  const router = useRouter();

  const anywhere = SHORTCUTS.find((g) => g.where === "global");
  const current = useCurrentSection(configured);
  const rail = RAIL.filter((item) => !item.admin || configured);
  const strip = useRef<HTMLElement>(null);

  /*
   * Keep the current word inside the sideways rail. Twenty labels come to
   * about 1,500px on a 390px phone, so without this the indicator is real,
   * correct and three screens off to the right — which is an indicator that
   * does not indicate.
   *
   * It moves the strip's own scrollLeft and nothing else. scrollIntoView()
   * would also scroll the page, and a thing that says where you are must
   * never move where you are.
   */
  useEffect(() => {
    const nav = strip.current;
    // offsetParent is null while the strip is display:none — above lg the
    // column rail is showing and there is nothing to slide.
    if (!nav || !current || nav.offsetParent === null) return;
    const link = nav.querySelector<HTMLElement>(`a[href="#${CSS.escape(current)}"]`);
    if (!link) return;
    nav.scrollTo({
      left: Math.max(0, link.offsetLeft - nav.clientWidth / 2 + link.clientWidth / 2),
      behavior:
        document.documentElement.dataset.motion === "reduced"
          ? "auto"
          : "smooth",
    });
  }, [current]);

  return (
    <>
      <TopBar>
        <span className="text-body font-medium text-fg">
          {t("settings.title")}
        </span>
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1000px] px-5 py-10 sm:px-8">
          {/* The page had twenty-five h2s and no h1, so the largest text on
              the longest screen in the product was a 15px section heading.
              It spans both columns because it names the whole page, not the
              content column. */}
          <h1 className="mb-(--space-6) text-title text-fg">
            {t("settings.title")}
          </h1>

          <div className="flex gap-(--space-5)">
            {/*
              * Plain anchors, so find-in-page and a bookmarked #connection both
              * still work.
              *
              * It used to be `hidden … xl:flex`, on the argument that 172px
              * costs more width than it saves scrolling. True — but the result
              * was that the only map of a page with a hundred controls on it
              * disappeared below 1280px, which is most laptops. So it changes
              * SHAPE instead of disappearing: a column beside the content where
              * there is room, and a scrolling row above it where there is not.
              *
              * `lg` and not `xl`, because below xl the content column was
              * capped at 760px inside a 936px space and simply left 176px of
              * nothing on the right — the rail was being hidden to buy width
              * that was never spent. 200px so that "Is your work in your
              * account?" stops wrapping to three lines.
              *
              * Twenty links and five group labels come to roughly 600px, which
              * runs off the bottom of a 900px laptop, so it scrolls. The
              * scrollport is <main>, which sits under a 48px bar: 48 + 16 top
              * + 16 bottom is the 5rem below.
              */}
            <nav
              aria-label="Settings sections"
              className="no-scrollbar sticky top-4 hidden h-fit max-h-[calc(100vh-5rem)] w-[200px] shrink-0 flex-col gap-0.5 overflow-y-auto lg:flex"
            >
              {rail.map((item, i) => (
                <span key={item.id} className="contents">
                  {item.group && (
                    <span
                      className={cn(
                        "px-2 py-1 text-meta text-fg-subtle",
                        i > 0 && "mt-(--space-3)",
                      )}
                    >
                      {item.group}
                    </span>
                  )}
                  {/* No pill, no fill, no border — the current section is
                      carried by ink and weight, the same way every other
                      state on this page now is. aria-current says it out
                      loud for anybody not reading the weight. */}
                  <a
                    href={`#${item.id}`}
                    aria-current={current === item.id ? "true" : undefined}
                    className={cn(
                      "rounded-xs px-2 py-1 text-body transition-colors duration-150",
                      current === item.id
                        ? "font-medium text-fg"
                        : "text-fg-subtle hover:text-fg",
                    )}
                  >
                    {item.label}
                  </a>
                </span>
              ))}
            </nav>

            <div className="min-w-0 flex-1">
            {/* The same rail, laid on its side, for every width below lg —
                and it now renders the five group labels the column rail has
                always rendered. Dropping them here turned a list that knows
                it has five parts into twenty identical pills, which is the
                codebase disagreeing with itself at two widths over data that
                was already in RAIL. */}
            <nav
              ref={strip}
              aria-label="Settings sections"
              className="no-scrollbar -mx-5 mb-(--space-5) flex items-baseline gap-(--space-3) overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:hidden"
            >
              {rail.map((item, i) => (
                <span key={item.id} className="contents">
                  {item.group && (
                    <span
                      className={cn(
                        "shrink-0 text-meta whitespace-nowrap text-fg-subtle",
                        i > 0 && "ml-(--space-2)",
                      )}
                    >
                      {item.group}
                    </span>
                  )}
                  {/* The underline is on every link and transparent on all
                      but one, so the words do not shift by a pixel when the
                      current section changes under a scrolling thumb. */}
                  <a
                    href={`#${item.id}`}
                    aria-current={current === item.id ? "true" : undefined}
                    className={cn(
                      "shrink-0 border-b pb-0.5 text-body whitespace-nowrap transition-colors duration-150",
                      current === item.id
                        ? "border-accent font-medium text-fg"
                        : "border-transparent text-fg-subtle hover:text-fg",
                    )}
                  >
                    {item.label}
                  </a>
                </span>
              ))}
            </nav>

            <GroupHeading first label="you" note="who you are" />

            <Section
              id="account"
              title={t("settings.account")}
              hint="Two ways to keep your work, and you pick. Neither one is a trial version of the other."
            >
              <AccountPanel />
            </Section>


            {/* Needs no database: it reads what the deployment has switched
                on. It used to disappear whenever administration was blocked,
                which is precisely when somebody is trying to find out why. */}
            <SignInMethods />

            <GroupHeading label="money" note="what you pay, if anything" />

            <Section
              id="plan"
              title="Your plan"
              hint="Read from the subscription your workspace actually has, not from what a checkout once said. No row means the free plan, and being unable to ask says so rather than answering Free."
            >
              <YourPlan />
            </Section>

            <GroupHeading
              label="where your work is kept"
              note="and whether it is anywhere but this browser"
            />

            <Section
              id="safe"
              title="Is your work in your account?"
              hint="Counted, not claimed. Every project either has a version the server agreed to or it does not, and the ones that do not are named."
            >
              <WorkIsSafe />
            </Section>

            <Section
              id="connection"
              title="Connection"
              hint="Whether accounts and sync actually work on this deployment — asked of the project itself, not guessed from a variable."
            >
              <ConnectionPanel />
            </Section>

            <Section
              id="keeping"
              title="Keeping your work"
              hint="What this browser is holding, and how safe that is on its own."
            >
              <SafeKeeping />
            </Section>

            <Section
              id="offline"
              title="Offline"
              hint="The app keeps working with no network. What it cannot do is reach your account, and it says so rather than pretending the last thing you typed went somewhere."
            >
              <Row label="Right now">
                <span className="text-body text-fg-muted">
                  {!isClient
                    ? "…"
                    : offline
                      ? "No network. Everything you write is kept here and goes up when it returns."
                      : "Online."}
                </span>
              </Row>
              <Row label="Installed">
                <span className="text-body text-fg-muted">
                  {!isClient
                    ? "…"
                    : installed
                      ? "Running as an installed app."
                      : "Running in a browser tab. Your browser's install button puts it in the dock."}
                </span>
              </Row>
              {isClient && offlineSupported() && (
                /* An action that writes gets a shape; an action that
                   navigates gets a word. This one writes. The shape is a
                   fill rather than an outline because nothing on this page
                   is bordered any more except the things you type into. */
                <Loose>
                  <button
                    type="button"
                    onClick={() => {
                      void clearOffline().then(() =>
                        notify("Offline cache cleared — reload to fetch fresh"),
                      );
                    }}
                    className="flex w-fit items-center gap-2 rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-fg transition-colors duration-150 hover:bg-surface-3"
                  >
                    <Icon name="refresh" size={12} />
                    Clear the offline cache
                  </button>
                </Loose>
              )}
            </Section>

            {/* Called "Workspace" until now, which is also what the shared
                server workspace is called two groups down — one word for two
                unrelated things on one page. */}
            <Section
              id="workspace"
              title="This browser's copy"
              hint="Everything lives in this browser."
            >
              <Loose>
                <button
                  type="button"
                  onClick={() => {
                    resetWorkspace();
                    notify("Workspace reset to the samples");
                    router.push("/library");
                  }}
                  className="flex w-fit items-center gap-2 rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-danger transition-colors duration-150 hover:bg-surface-3"
                >
                  <Icon name="refresh" size={12} />
                  Reset projects to the samples
                </button>
              </Loose>
              {/* Sans, and at reading size. This is a sentence about what
                  happens to your work; it was set in 10px monospace, which
                  is the face for things you paste, not for prose. */}
              <Loose>
                <p className="max-w-[58ch] text-body text-fg-muted">
                  Discards local project changes. Chat history and appearance
                  are kept separately and survive this.
                </p>
              </Loose>
            </Section>

            <Section
              id="erase"
              title="Delete your account"
              hint="The one thing in here that cannot be undone, kept where somebody looking for it would look."
            >
              <EraseAccount />
            </Section>

            <GroupHeading
              label="how the app behaves"
              note="preferences for the tool, not for any document"
            />

            <Section
              id="appearance"
              title="Appearance"
              hint="Applies instantly and follows you across projects."
            >
              <Row label="Theme">
                <Segmented<ThemeMode>
                  value={a.mode}
                  options={[
                    ["dark", "Dark"],
                    ["light", "Light"],
                    ["system", "System"],
                  ]}
                  onChange={(v) => a.set("mode", v)}
                />
              </Row>

              <Row label="Accent" hint="Used for focus, cursors and the active state.">
                {/* The one place in the product where colour is the subject
                    rather than a signal, so here the colour gets to be the
                    control: a 20px square with its name under it. The ring
                    is inset and in --color-fg, which is not a container —
                    it is the only way to say "this one" about a colour, and
                    it is drawn on the square rather than around the button
                    so it reads on all six swatches in both themes. */}
                <div className="flex flex-wrap gap-(--space-3)">
                  {(Object.keys(ACCENTS) as AccentName[]).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => a.set("accent", name)}
                      aria-pressed={a.accent === name}
                      title={ACCENTS[name].label}
                      className="flex flex-col items-start gap-(--space-1)"
                    >
                      <span
                        aria-hidden="true"
                        className="size-5 rounded-xs"
                        style={{
                          background: ACCENTS[name].swatch,
                          // The unselected hairline is the sample's own
                          // edge, not a container: Mono's swatch is very
                          // nearly the light canvas, and without an edge
                          // that square is not on the screen at all.
                          boxShadow:
                            a.accent === name
                              ? "inset 0 0 0 2px var(--color-fg)"
                              : "inset 0 0 0 1px var(--color-line)",
                        }}
                      />
                      <span
                        className={cn(
                          "text-meta transition-colors duration-150",
                          a.accent === name
                            ? "font-medium text-fg"
                            : "text-fg-subtle",
                        )}
                      >
                        {ACCENTS[name].label}
                      </span>
                    </button>
                  ))}
                </div>
              </Row>

              <Row label="Corners">
                <Segmented<RadiusName>
                  value={a.radius}
                  options={[
                    ["sharp", "Sharp"],
                    ["default", "Default"],
                    ["soft", "Soft"],
                  ]}
                  onChange={(v) => a.set("radius", v)}
                />
              </Row>

              <Row label="Density" hint="Tightens rows, gaps and bar heights.">
                <Segmented<DensityName>
                  value={a.density}
                  options={[
                    ["comfortable", "Comfortable"],
                    ["compact", "Compact"],
                  ]}
                  onChange={(v) => a.set("density", v)}
                />
              </Row>

              {/* "System" and "Mono" each used to label two different things
                  within four rows of each other: System is a Theme option
                  (follow the OS light/dark setting) and was also a typeface,
                  and Mono is an accent colour and was also a typeface. All
                  four were visible at once. The typefaces say what they are
                  instead — the theme and the accent keep the short words,
                  because those are the ones people already say out loud. */}
              <Row label="Interface type">
                <Segmented<UIFont>
                  value={a.font}
                  options={[
                    ["geist", "Geist"],
                    ["system", "Your system's"],
                    ["mono", "Monospace"],
                  ]}
                  onChange={(v) => a.set("font", v)}
                />
              </Row>

              <Row label="Motion" hint="Reduced also respects your OS setting.">
                <Segmented<MotionName>
                  value={a.motion}
                  options={[
                    ["full", "Full"],
                    ["reduced", "Reduced"],
                  ]}
                  onChange={(v) => a.set("motion", v)}
                />
              </Row>

              <Row label="Sidebar width">
                <div className="flex items-center gap-(--space-3)">
                  <input
                    type="range"
                    min={180}
                    max={340}
                    step={4}
                    value={a.sidebarWidth}
                    aria-label="Sidebar width"
                    onChange={(e) => a.set("sidebarWidth", Number(e.target.value))}
                    className="h-1 w-[180px] cursor-pointer appearance-none rounded-full bg-line-strong accent-[var(--color-accent)] outline-none"
                  />
                  {/* A measurement is a fact, not something you paste into
                      a config file, so it goes sans with the other facts. */}
                  <span className="text-meta text-fg-subtle">
                    {a.sidebarWidth}px
                  </span>
                </div>
              </Row>

              <Loose>
                <button
                  type="button"
                  onClick={() => {
                    a.reset();
                    notify("Appearance reset");
                  }}
                  className="rounded-sm bg-surface-2 px-2.5 py-1.5 text-body font-medium text-fg transition-colors duration-150 hover:bg-surface-3"
                >
                  Reset appearance
                </button>
              </Loose>
            </Section>

            <Section
              id="shortcuts"
              title="Shortcuts"
              hint="The ones that work anywhere. Each editor has its own, and ⌘/ lists whichever set applies to what you are looking at."
            >
              <Loose>
                {/* .kbd keeps its box. A key cap is literally a glyph on a
                    physical key, which is the one thing on this page whose
                    border is drawing the object rather than a region. */}
                <ul className="flex flex-col gap-(--space-2)">
                  {(anywhere?.items ?? []).map((item) => (
                    <li
                      key={item.keys}
                      className="flex items-baseline gap-(--space-3) text-body"
                    >
                      <kbd className="kbd shrink-0">{item.keys}</kbd>
                      <span className="text-fg-muted">{item.what}</span>
                    </li>
                  ))}
                </ul>
              </Loose>
              <Loose>
                {/* Opens the full list; it navigates rather than writes, so
                    it is a word and not a shape. */}
                <button
                  type="button"
                  onClick={() => setShortcutsOpen(true)}
                  className="flex w-fit items-center gap-2 text-body text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-fg"
                >
                  <Icon name="list" size={12} />
                  Every shortcut
                </button>
              </Loose>
            </Section>

            <Section
              id="words"
              title="Your words"
              hint="Names, terms and spellings that are deliberate."
            >
              <Dictionary />
            </Section>

            <Section
              id="ai"
              title="AI"
              hint="Which model answers, and in what order the server falls through them when one is busy."
            >
              <Row label="Provider">
                <span className="font-mono text-meta text-fg-muted">
                  {aiProvider}
                </span>
              </Row>
              <Row label="Rotation" hint="Tried top to bottom.">
                {ai === null ? (
                  <span className="text-body text-fg-subtle">Asking…</span>
                ) : ai.models.length === 0 ? (
                  <p className="max-w-[52ch] text-body text-fg-muted">
                    No model is configured, so the built-in assistant answers
                    instead — it works offline and never leaves this browser,
                    and it is not as good. Set{" "}
                    <code className="font-mono text-meta">
                      OPENROUTER_API_KEY
                    </code>{" "}
                    to change that.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-(--space-1)">
                    {ai.models.map((model, i) => (
                      <li
                        key={model}
                        className="flex items-baseline gap-(--space-2) text-meta"
                      >
                        {/* The ordinal is a count and goes sans; the model
                            id is a literal you would paste, and keeps the
                            mono face. They were one mono run before, which
                            made the numbering look like part of the id. */}
                        <span className="text-fg-subtle">{i + 1}.</span>
                        <span className="font-mono text-fg-muted">{model}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Row>
            </Section>

            <Section
              id="providers"
              title="Providers"
              hint="Every capability sits behind an interface. These are what's wired in right now."
            >
              <ProviderRow
                name="AI"
                value={aiProvider}
                detail="askAI(prompt, context) — streaming, accept/reject"
              />
              <ProviderRow
                name="Storage"
                value={isClient ? backendName() : "…"}
                detail={sync}
              />
              <ProviderRow
                name="Speech"
                value={isClient ? speechProviderName() : "…"}
                detail="Web Speech where available, simulated otherwise"
              />
              <ProviderRow
                name="Realtime"
                value={isClient ? getRealtimeProviderName() : "…"}
                detail="Awareness-shaped; a Yjs provider drops in"
              />
              <ProviderRow
                name="Chat"
                value={isClient ? chatProviderName() : "…"}
                detail="Websocket-shaped: send, subscribe, typing"
              />
              <ProviderRow
                name="Sources"
                value={isClient ? sourceResolverName() : "…"}
                detail="Local parsing; a metadata service replaces it"
              />
            </Section>

            <Section
              id="templates"
              title={t("settings.templates")}
              hint="Shapes to start from. Yours stay in this browser; the workspace's are published by an admin and everybody here gets them."
            >
              <TemplatesPanel />
            </Section>

            <Section
              id="desktop"
              title="The desktop note"
              hint="A small window that stays above everything else, opens with a hotkey, and keeps what you write in the same account. Files dropped on it land in your library here."
            >
              <Row label="Version">
                <span className="text-meta text-fg-muted">
                  {DESKTOP_VERSION}
                </span>
              </Row>
              <Row label="Download">
                {/* Five bordered pills for five links that navigate. A link
                    that goes somewhere is a word; the shapes are for the
                    buttons that write something. */}
                <div className="flex flex-wrap gap-(--space-3)">
                  {DOWNLOADS.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-1.5 text-body text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-fg"
                    >
                      <Icon name="download" size={11} />
                      {item.label}
                    </a>
                  ))}
                </div>
              </Row>
              <Loose>
                <p className="max-w-[54ch] text-body text-fg-muted">
                  The builds are not code-signed, so macOS and Windows both
                  warn once — the message every unsigned app gets.{" "}
                  <a
                    href={RELEASES_URL}
                    className="underline decoration-line-strong underline-offset-2 hover:text-fg"
                  >
                    All releases
                  </a>
                  .
                </p>
              </Loose>
            </Section>

            <GroupHeading
              label="the shared workspace"
              note="what changes for everyone, not just for you"
            />

            {/* Only where there is something to administer. The console that
                used to live in the sidebar was hidden by the same rule, and
                for the same reason: a permanently present group that only
                ever says "this needs a database" teaches people to skip it. */}
            {configured && <Administration data={admin} />}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
