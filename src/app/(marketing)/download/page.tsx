import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/landing/PageShell";
import { Glass, Section } from "@/components/landing/primitives";
import { DownloadButton, BuildLine } from "@/components/landing/Download";
import { Icon } from "@/components/ui/Icon";
import { BROWSER_CAVEATS, BROWSER_VERSION, BUILDS } from "@/lib/browser";

export const metadata: Metadata = {
  title: "Download Tougather",
  alternates: { canonical: "/download" },
  description:
    "The Tougather browser for macOS, Windows and Linux — free, with the assistant running on your own subscription. Everything this early build does not do yet, written down before you download it.",
};

/**
 * The download page, which is mostly a page of warnings.
 *
 * That is deliberate and it is the more useful half. The button is one line;
 * what somebody actually needs from this page is the answer to "what happens
 * when I run it", and for an unsigned build on Windows the honest answer is
 * "a blue full-screen warning that looks like you have caught something".
 *
 * `browser/CLAUDE.md` keeps a section called "Bekende gaten" — known holes —
 * and `src/lib/browser.ts` carries it across into `BROWSER_CAVEATS` so this
 * page and that file cannot drift. A download page that only lists features is
 * a download page that generates support mail.
 */
export default function DownloadPage() {
  return (
    <PageShell
      eyebrow="Download"
      title="Take the browser."
      rail={false}
      glow={["var(--tangerine)", "var(--orchid)"]}
      lead="Free, for macOS, Windows and Linux. The assistant inside it runs on the agent already on your machine, so there is no key to paste and nothing of ours to sign up for first."
    >
      <Section className="pt-12 pb-16">
        <Glass className="flex flex-col gap-6 rounded-[28px] p-8 sm:p-10">
          <DownloadButton className="w-fit" />
          <BuildLine />

          <div className="grid gap-3 border-t border-line pt-7 sm:grid-cols-2 lg:grid-cols-3">
            {BUILDS.map((build) => (
              <a
                key={build.id}
                href={build.href}
                className="glass-soft lift flex items-start gap-3 rounded-2xl px-4 py-3.5"
              >
                {/* Aligned to the first line, not to the middle of the block:
                    "installs without admin rights" wraps to three lines in a
                    three-column grid, and a centred icon then floats opposite
                    the gap between two of them. */}
                <Icon
                  name="download"
                  size={15}
                  className="mt-[3px] shrink-0 text-fg-subtle"
                />
                <span className="flex-1">
                  <span className="block text-[14px] text-fg">
                    {build.label}
                    {build.note ? (
                      <span className="text-fg-subtle"> · {build.note}</span>
                    ) : null}
                  </span>
                  <span className="block text-[12px] text-fg-subtle">
                    {build.size}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </Glass>
      </Section>

      <Section className="pb-16">
        <h2 className="max-w-[20ch] text-[clamp(26px,3.4vw,40px)]">
          What this build does not do yet.
        </h2>
        <p className="mt-4 max-w-[58ch] text-[15.5px] leading-relaxed text-fg-muted">
          Version {BROWSER_VERSION} is an early build and this is the list its
          own developers keep. None of it is a surprise we would rather you
          found on your own.
        </p>

        <div className="mt-9 flex flex-col gap-3">
          {BROWSER_CAVEATS.map((caveat) => (
            <Glass key={caveat.title} className="rounded-2xl p-6">
              <p className="text-[15.5px] font-medium text-fg">{caveat.title}</p>
              <p className="mt-1.5 max-w-[76ch] text-[14.5px] leading-relaxed text-fg-muted">
                {caveat.detail}
              </p>
            </Glass>
          ))}
        </div>
      </Section>

      <Section className="pb-24">
        <Glass className="rounded-[28px] p-8 sm:p-10">
          <h2 className="max-w-[24ch] text-[clamp(22px,2.6vw,30px)]">
            You will also want an agent.
          </h2>
          <p className="mt-4 max-w-[64ch] text-[15px] leading-relaxed text-fg-muted">
            The browser works fully without one — tabs, workspaces, the lot. The
            assistant is the part that needs it, and it uses whatever is already
            signed in on your machine rather than an account with us. Today that
            is Claude Code. If it is not there, Settings inside the browser
            prints the single command that installs it, and nothing else is
            configured.
          </p>
          <p className="mt-5 max-w-[64ch] text-[14px] leading-relaxed text-fg-subtle">
            That is also why it is cheap: you pay one company once for a model,
            and we never stand between you and it.{" "}
            <Link
              href="/pricing"
              className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
            >
              What a subscription with us buys
            </Link>{" "}
            is the workspace, not the AI.
          </p>
        </Glass>
      </Section>
    </PageShell>
  );
}
