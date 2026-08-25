/**
 * Everything — the whole product, written down once.
 *
 * The sidebar is being cut to five rows, and the rest appear only once
 * somebody has a reason for them. That is only honest if there is one place
 * that still lists the doors they cannot currently see, with the condition
 * that opens each one said out loud. Without this page, showing a row later
 * and never having had it are the same thing from a chair, and the second one
 * is called deleting the feature.
 *
 * It is also the only page where two very different accounts — a person on
 * their own and a person in a team on a deployment with a database — read the
 * same list. That is what a support answer or a written guide needs: a
 * sentence like "open Team" that is true for whoever is reading it, with the
 * reason it is missing printed underneath.
 *
 * So: no state, no gating, nothing hidden. Every row is a live link, including
 * the rows for things somebody does not have yet — a destination that exists
 * and is empty explains itself, and a greyed-out row explains nothing.
 *
 * The path is printed beside every name on purpose. Half the use of this page
 * is somebody writing "go to /settings#keeping" into an email.
 */

import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";

export default function MorePage() {
  return (
    <>
      <TopBar>
        <span className="text-[13px] font-medium text-fg">Everything</span>
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1000px] px-5 py-8 sm:px-8">
          <h1 className="text-[15px] font-medium tracking-tight text-fg">
            Everything in here, and how to get to it
          </h1>
          <p className="mt-1.5 max-w-[64ch] text-[12.5px] leading-relaxed text-fg-muted">
            The sidebar shows the handful of rows you have a reason for. This
            is the rest as well — every page, the question it answers, and,
            where you have not got something yet, what brings it back. Nothing
            on this list is switched off — every link works now. What you find
            on the other side of one you have not set up yet is usually a page
            saying what is missing; Administration is the exception, and lands
            you on Settings without that section on it.
          </p>

          {/*
            * Two columns as one flow rather than a two-cell grid. The groups
            * are wildly different heights — eight rows under "your things",
            * one under "money" — and a grid would leave a column-high hole
            * beside the tall one. Columns fill and balance instead, and the
            * reading order stays the DOM order for anything not seeing the
            * layout at all.
            */}
          <div className="mt-8 md:columns-2 md:gap-12">
            <Group
              title="your things"
              note="Everything you make or collect. All of it works signed out and stays in this browser until an account is behind it."
            >
              <Row
                href="/library"
                name="Library"
                answers="Every document, sheet, deck and drawing you have made, in one list you can search and sort into folders."
              />
              <Row
                href="/due"
                name="Due"
                answers="What is next, in one place: the deadlines, the tasks and the cards that want looking at today."
              />
              <Row
                href="/notes"
                name="Notes"
                answers="The notepad — for the things that are not a document yet and may never be one."
              />
              <Row
                href="/study"
                name="Study"
                answers="Cards written from your own reading, and a session that asks the ones you keep missing more often than the ones you know."
              />
              <Row
                href="/kit"
                name="Kit"
                answers="The fonts, pictures and files you brought with you, ready to drop into a document. Using something copies it."
              />
              <Row
                href="/agenda"
                name="Agenda"
                answers="Your week as a timetable: what is on, what repeats, and the tasks with a day against them."
              />
              <Row
                href="/assignments"
                name="Assignments"
                answers="A deadline with the document attached to it, in three columns — to do, doing, handed in."
              />
              <Row
                href="/community"
                name="Community"
                answers="Ideas, designs and templates the other people on this deployment have shared, usable on your own work in two clicks."
              />
            </Group>

            <Group title="people">
              <Row
                href="/chat"
                name="Chat"
                answers="The channels this workspace talks in, and the team assistant, which answers from what the team has read."
              />
              <Row
                href="/team"
                name="Team"
                answers="Who is here, what each person may do, and what the group knows — which is also what the assistant is handed."
                unlocks="Most of it needs a team first — somebody else in the workspace, or an invite you have sent. Without one the page is the two doors into getting one."
              />
              <Row
                href="/chat"
                path={null}
                name="Direct messages"
                answers="One conversation with one person, kept out of the channels."
                unlocks="Start one with “message someone” on the chat page. It then shows up there, and in the recent list in the sidebar."
              />
            </Group>

            <Group title="the app">
              <Row
                href="/settings"
                name="Settings"
                answers="Everything you can change about the tool rather than about a document. One long page with a rail down the side."
              />
              <Nested label="Groups inside Settings">
                <Row
                  href="/settings#account"
                  name="Account"
                  answers="Who you are signed in as, and the two ways of keeping your work — neither one a trial version of the other."
                />
                <Row
                  href="/settings#keeping"
                  name="Keeping your work"
                  answers="What this browser is holding, how safe that is on its own, and how to take a copy of all of it."
                />
                <Row
                  href="/settings#appearance"
                  name="Appearance"
                  answers="Theme, accent, density and typeface. Every control writes straight to the app, so what you see is what you get."
                />
                <Row
                  href="/settings#administration"
                  name="Administration"
                  answers="Who has signed up on this deployment and what reached the server. Work somebody keeps in their own browser leaves no trace here."
                  unlocks="Appears once this deployment has a database behind it. Without one there is nothing to administer."
                />
              </Nested>
              <Row
                href="/settings#shortcuts"
                name="Keyboard shortcuts"
                answers="The keys that work anywhere. ⌘/ lists the same set from wherever you are, plus whichever editor you are in."
              />
              <Row
                href="/settings#desktop"
                name="The desktop note"
                answers="A small window that stays above everything else, opens with a hotkey, and writes into this same account. Where to get it, and which version is current."
              />
            </Group>

            <Group title="money">
              <Row
                href="/pricing"
                name="Pricing"
                answers="What it costs and what changes when you pay."
                unlocks="The other ways you meet it: “Your plan” in settings, and the Create a team button on a library or chat page that is looking at a team you do not have. Nothing in the tool interrupts you about a plan."
              />
            </Group>

            <Group
              title="about"
              note="Public pages. They open outside the app, without the sidebar."
            >
              <Row
                href="/"
                name="The front page"
                answers="What this is, written for somebody who has not opened it yet."
              />
              <Row
                href="/about"
                name="About"
                answers="Who is building this, and what it is trying to be instead of."
              />
              <Row
                href="/impact"
                name="Impact"
                answers="The share of revenue that is given away, where it goes, and how much has gone so far."
              />
              <Row
                href="/guides"
                name="Guides"
                answers="Long how-tos written out: a thesis, a pitch deck, spreadsheet formulas, working with no connection."
              />
              <Row
                href="/compare"
                name="Comparisons"
                answers="How this differs from Excel, Notion, Microsoft 365 and Google Workspace, including where they win."
              />
              <Row
                href="/legal"
                name="Legal"
                answers="Terms, privacy and cookies, in plain words. Still a draft, and it says so."
              />
              <Row
                href="/contact"
                name="Contact"
                answers="How to reach whoever is building this."
              />
            </Group>
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * One heading and its rows.
 *
 * `break-inside-avoid` keeps a group from being torn across the two columns.
 * A group taller than a column still breaks — the browser has nowhere else to
 * put it — and that is the right failure: a scrollbar beats a lost row.
 */
function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9 break-inside-avoid">
      <h2 className="label-mono border-b border-line pb-2 text-fg-subtle">
        {title}
      </h2>
      {note && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">
          {note}
        </p>
      )}
      <ul className="mt-1.5">{children}</ul>
    </section>
  );
}

/** Rows that live inside the row above them, said with an indent and a rule. */
function Nested({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="my-1 ml-2 border-l border-line pl-3">
      <ul aria-label={label}>{children}</ul>
    </li>
  );
}

/**
 * One destination.
 *
 * The whole row is the link, including the description, because a target the
 * width of a word is a target somebody misses on a phone.
 */
function Row({
  href,
  name,
  answers,
  unlocks,
  path,
}: {
  href: string;
  name: string;
  answers: string;
  unlocks?: string;
  /**
   * What to print beside the name, when it is not simply `href`.
   *
   * `null` prints nothing, which is right for a thing that lives at an
   * address it does not own — direct messages are inside /chat, and printing
   * /chat twice under two names makes the paths useless for the one purpose
   * they are printed for: being read out to somebody over a phone.
   */
  path?: string | null;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group -mx-2 block rounded-sm px-2 py-2 transition-colors duration-150 hover:bg-surface"
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] text-fg group-hover:underline">
            {name}
          </span>
          {/* Printed, not hidden behind the link, so it can be read out or
              typed into an address bar by somebody being helped over a
              phone. */}
          {path !== null && (
            <span className="text-[11px] text-fg-subtle">{path ?? href}</span>
          )}
        </span>
        <span className="mt-0.5 block max-w-[52ch] text-[12px] leading-relaxed text-fg-muted">
          {answers}
        </span>
        {unlocks && (
          <span className="mt-1 block max-w-[52ch] text-[11.5px] leading-relaxed text-fg-subtle">
            {unlocks}
          </span>
        )}
      </Link>
    </li>
  );
}
