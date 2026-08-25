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

import { useEffect, useState, useSyncExternalStore } from "react";
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

  return (
    <>
      <TopBar>
        <span className="text-[13px] font-medium text-fg">
          {t("settings.title")}
        </span>
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1000px] gap-10 px-5 py-10 sm:px-8">
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
            */}
          <nav
            aria-label="Settings sections"
            className="sticky top-4 hidden h-fit w-[172px] shrink-0 flex-col gap-0.5 xl:flex"
          >
            {RAIL.filter((item) => !item.admin || configured).map((item) => (
              <span key={item.id} className="contents">
                {item.group && (
                  <span className="label-mono mt-3 px-2 py-1 text-fg-subtle/60 first:mt-0">
                    {item.group}
                  </span>
                )}
                <a
                  href={`#${item.id}`}
                  className="rounded-xs px-2 py-1 text-[12px] text-fg-subtle transition-colors duration-150 hover:bg-surface hover:text-fg"
                >
                  {item.label}
                </a>
              </span>
            ))}
          </nav>

          <div className="min-w-0 max-w-[760px] flex-1">
            {/* The same rail, laid on its side, for every width below xl. */}
            <nav
              aria-label="Settings sections"
              className="no-scrollbar -mx-5 mb-8 flex gap-1 overflow-x-auto px-5 sm:-mx-8 sm:px-8 xl:hidden"
            >
              {RAIL.filter((item) => !item.admin || configured).map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="shrink-0 rounded-xs border border-line px-2 py-1 text-[11.5px] whitespace-nowrap text-fg-subtle transition-colors duration-150 hover:border-line-strong hover:text-fg"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <h2 className="label-mono mt-14 mb-4 border-b border-line pb-2 text-fg-subtle first:mt-0">
              you <span className="ml-2 normal-case text-fg-subtle/70">who you are</span>
            </h2>

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

            <h2 className="label-mono mt-14 mb-4 border-b border-line pb-2 text-fg-subtle first:mt-0">
              money <span className="ml-2 normal-case text-fg-subtle/70">what you pay, if anything</span>
            </h2>

            <Section
              id="plan"
              title="Your plan"
              hint="Read from the subscription your workspace actually has, not from what a checkout once said. No row means the free plan, and being unable to ask says so rather than answering Free."
            >
              <YourPlan />
            </Section>

            <h2 className="label-mono mt-14 mb-4 border-b border-line pb-2 text-fg-subtle first:mt-0">
              where your work is kept <span className="ml-2 normal-case text-fg-subtle/70">and whether it is anywhere but this browser</span>
            </h2>

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
                <span className="text-[12.5px] text-fg-muted">
                  {!isClient
                    ? "…"
                    : offline
                      ? "No network. Everything you write is kept here and goes up when it returns."
                      : "Online."}
                </span>
              </Row>
              <Row label="Installed">
                <span className="text-[12.5px] text-fg-muted">
                  {!isClient
                    ? "…"
                    : installed
                      ? "Running as an installed app."
                      : "Running in a browser tab. Your browser's install button puts it in the dock."}
                </span>
              </Row>
              {isClient && offlineSupported() && (
                <button
                  type="button"
                  onClick={() => {
                    void clearOffline().then(() =>
                      notify("Offline cache cleared — reload to fetch fresh"),
                    );
                  }}
                  className="flex w-fit items-center gap-2 rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                >
                  <Icon name="refresh" size={12} />
                  Clear the offline cache
                </button>
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
              <button
                type="button"
                onClick={() => {
                  resetWorkspace();
                  notify("Workspace reset to the samples");
                  router.push("/library");
                }}
                className="flex w-fit items-center gap-2 rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-danger/50 hover:text-danger"
              >
                <Icon name="refresh" size={12} />
                Reset projects to the samples
              </button>
              <p className="font-mono text-[10px] leading-relaxed text-fg-subtle">
                Discards local project changes. Chat history and appearance are
                kept separately and survive this.
              </p>
            </Section>

            <Section
              id="erase"
              title="Delete your account"
              hint="The one thing in here that cannot be undone, kept where somebody looking for it would look."
            >
              <EraseAccount />
            </Section>

            <h2 className="label-mono mt-14 mb-4 border-b border-line pb-2 text-fg-subtle first:mt-0">
              how the app behaves <span className="ml-2 normal-case text-fg-subtle/70">preferences for the tool, not for any document</span>
            </h2>

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
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(ACCENTS) as AccentName[]).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => a.set("accent", name)}
                      aria-pressed={a.accent === name}
                      title={ACCENTS[name].label}
                      className={cn(
                        "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11.5px] transition-colors duration-150",
                        a.accent === name
                          ? "border-line-strong bg-surface-2 text-fg"
                          : "border-line text-fg-subtle hover:text-fg-muted",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full"
                        style={{ background: ACCENTS[name].swatch }}
                      />
                      {ACCENTS[name].label}
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
                <div className="flex items-center gap-3">
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
                  <span className="font-mono text-[10px] text-fg-subtle">
                    {a.sidebarWidth}px
                  </span>
                </div>
              </Row>

              <button
                type="button"
                onClick={() => {
                  a.reset();
                  notify("Appearance reset");
                }}
                className="mt-1 text-[12.5px] text-fg-subtle transition-colors hover:text-fg"
              >
                Reset appearance
              </button>
            </Section>

            <Section
              id="shortcuts"
              title="Shortcuts"
              hint="The ones that work anywhere. Each editor has its own, and ⌘/ lists whichever set applies to what you are looking at."
            >
              <ul className="flex flex-col gap-1.5">
                {(anywhere?.items ?? []).map((item) => (
                  <li
                    key={item.keys}
                    className="flex items-baseline gap-3 text-[12.5px]"
                  >
                    <kbd className="kbd shrink-0">{item.keys}</kbd>
                    <span className="text-fg-muted">{item.what}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                className="mt-1 flex w-fit items-center gap-2 rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                <Icon name="list" size={12} />
                Every shortcut
              </button>
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
                <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-fg-muted">
                  {aiProvider}
                </span>
              </Row>
              <Row label="Rotation" hint="Tried top to bottom.">
                {ai === null ? (
                  <span className="text-[12.5px] text-fg-subtle">Asking…</span>
                ) : ai.models.length === 0 ? (
                  <p className="max-w-[52ch] text-[12.5px] leading-relaxed text-fg-subtle">
                    No model is configured, so the built-in assistant answers
                    instead — it works offline and never leaves this browser,
                    and it is not as good. Set{" "}
                    <code className="font-mono text-[11.5px]">
                      OPENROUTER_API_KEY
                    </code>{" "}
                    to change that.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-1">
                    {ai.models.map((model, i) => (
                      <li
                        key={model}
                        className="flex items-baseline gap-2 font-mono text-[10.5px] text-fg-muted"
                      >
                        <span className="text-fg-subtle">{i + 1}.</span>
                        {model}
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
                <span className="font-mono text-[10.5px] text-fg-muted">
                  {DESKTOP_VERSION}
                </span>
              </Row>
              <Row label="Download">
                <div className="flex flex-wrap gap-1.5">
                  {DOWNLOADS.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                    >
                      <Icon name="download" size={11} />
                      {item.label}
                    </a>
                  ))}
                </div>
              </Row>
              <p className="max-w-[54ch] text-[11.5px] leading-relaxed text-fg-subtle">
                The builds are not code-signed, so macOS and Windows both warn
                once — the message every unsigned app gets.{" "}
                <a
                  href={RELEASES_URL}
                  className="underline decoration-line-strong underline-offset-2 hover:text-fg"
                >
                  All releases
                </a>
                .
              </p>
            </Section>

            <h2 className="label-mono mt-14 mb-4 border-b border-line pb-2 text-fg-subtle first:mt-0">
              the shared workspace <span className="ml-2 normal-case text-fg-subtle/70">what changes for everyone, not just for you</span>
            </h2>

            {/* Only where there is something to administer. The console that
                used to live in the sidebar was hidden by the same rule, and
                for the same reason: a permanently present group that only
                ever says "this needs a database" teaches people to skip it. */}
            {configured && <Administration data={admin} />}
          </div>
        </div>
      </main>
    </>
  );
}
