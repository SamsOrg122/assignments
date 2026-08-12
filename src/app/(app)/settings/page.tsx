"use client";

/**
 * Settings.
 *
 * Appearance first, because that's the one people reach for. Every control
 * writes a CSS custom property, so the preview *is* the app — there's no
 * separate sample to disagree with what you get.
 */

import { useSyncExternalStore } from "react";
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
import { subscribeSync, syncStatus } from "@/lib/db/sync";
import { getRealtimeProviderName } from "@/lib/realtime";
import { speechProviderName } from "@/lib/speech";
import { sourceResolverName } from "@/lib/sources";
import { chatProviderName } from "@/lib/chat";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { SafeKeeping } from "@/components/settings/SafeKeeping";
import { Dictionary } from "@/components/settings/Dictionary";
import { AccountPanel } from "@/components/account/AccountPanel";
import { ConnectionPanel } from "@/components/account/ConnectionPanel";
import { LanguagePanel } from "@/components/settings/LanguagePanel";
import { TemplatesPanel } from "@/components/settings/TemplatesPanel";
import { useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

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
  useSyncExternalStore(
    subscribeAIProvider,
    getAIProviderName,
    () => "…",
  );

/** Whether work is actually reaching the account, in one line. */
function useSyncLine(): string {
  const status = useSyncExternalStore(
    subscribeSync,
    syncStatus,
    () => ({ state: "off" }) as ReturnType<typeof syncStatus>,
  );
  if (status.state === "off") return "this browser only — no database configured";
  if (status.state === "working")
    return status.at ? "syncing…" : "connecting…";
  if (status.state === "paused") return `paused: ${status.problem}`;
  if (status.state === "error") return `stopped: ${status.problem}`;
  return status.at
    ? `last synced ${new Date(status.at).toLocaleTimeString()}`
    : "connected";
}

export default function SettingsPage() {
  const { t } = useLocale();
  const a = useAppearance();
  const isClient = useIsClient();
  const aiProvider = useAIProviderName();
  const sync = useSyncLine();
  const resetWorkspace = useProjects((s) => s.resetWorkspace);
  const notify = useUI((s) => s.notify);
  const router = useRouter();

  return (
    <>
      <TopBar>
        <span className="text-[13px] font-medium text-fg">
          {t("settings.title")}
        </span>
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-5 py-10 sm:px-8">
          <Section
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

            <Row label="Interface type">
              <Segmented<UIFont>
                value={a.font}
                options={[
                  ["geist", "Geist"],
                  ["system", "System"],
                  ["mono", "Mono"],
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
            id="language"
            title={t("settings.language")}
            hint={t("settings.languageHint")}
          >
            <LanguagePanel />
          </Section>

          <Section
            id="account"
            title={t("settings.account")}
            hint="Two ways to keep your work, and you pick. Neither one is a trial version of the other."
          >
            <AccountPanel />
          </Section>

          <Section
            id="connection"
            title="Connection"
            hint="Whether accounts and sync actually work on this deployment — asked of the project itself, not guessed from a variable."
          >
            <ConnectionPanel />
          </Section>

          <Section
            id="templates"
            title={t("settings.templates")}
            hint="Shapes to start from. Yours stay in this browser; the workspace's are published by an admin and everybody here gets them."
          >
            <TemplatesPanel />
          </Section>

          <Section
            title="Your words"
            hint="Names, terms and spellings that are deliberate."
          >
            <Dictionary />
          </Section>

          <Section
            id="keeping"
            title="Keeping your work"
            hint="There is no account yet, so this browser is the only thing holding it. Here is exactly how safe that is."
          >
            <SafeKeeping />
          </Section>

          <Section title="Workspace" hint="Everything lives in this browser.">
            <button
              type="button"
              onClick={() => {
                resetWorkspace();
                notify("Workspace reset to the samples");
                router.push("/library");
              }}
              className="flex items-center gap-2 rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-danger/50 hover:text-danger"
            >
              <Icon name="refresh" size={12} />
              Reset projects to the samples
            </button>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-fg-subtle">
              Discards local project changes. Chat history and appearance are
              kept separately and survive this.
            </p>
          </Section>
        </div>
      </main>
    </>
  );
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  /** Set where something links straight to this section. */
  id?: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-20">
      <h2 className="text-[15px] font-medium tracking-[-0.01em] text-fg">
        {title}
      </h2>
      {hint && (
        <p className="mt-1 mb-4 max-w-[54ch] text-[12.5px] leading-relaxed text-fg-muted">
          {hint}
        </p>
      )}
      <div className="flex flex-col gap-3.5 border-t border-line pt-4">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="sm:w-[152px] sm:shrink-0">
        <p className="text-[12.5px] text-fg">{label}</p>
        {hint && (
          <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">{hint}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-sm border border-line p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "rounded-xs px-2 py-1 text-[11.5px] transition-colors duration-150",
            value === key
              ? "bg-surface-3 text-fg"
              : "text-fg-subtle hover:text-fg-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ProviderRow({
  name,
  value,
  detail,
}: {
  name: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[68px] shrink-0 text-[12.5px] text-fg">{name}</span>
      <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
        {value}
      </span>
      <span className="min-w-0 truncate font-mono text-[10px] text-fg-subtle">
        {detail}
      </span>
    </div>
  );
}
