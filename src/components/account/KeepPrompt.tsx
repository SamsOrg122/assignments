"use client";

/**
 * The one moment we ask where work should live.
 *
 * Not on first load — nobody can answer that before they have made anything.
 * It waits until there is work worth keeping, asks once, and takes either
 * answer as final. `choiceMade` is set by both buttons, including the one that
 * changes nothing, because "I'll stay here" is a decision and a prompt that
 * reappears after it is a nag.
 *
 * Two shapes, one condition, never both at once. The wide row sits at the top
 * of the Library; the compact block sits in the sidebar everywhere else, so
 * the question is present while you are actually working rather than only on
 * the way in. Both are *in the layout* —
 * the app already has three bottom-anchored surfaces (selection bars, voice,
 * toasts), and a floating fourth is how a fair question becomes an obstacle.
 *
 * The lead is the cross-browser point, because that is the one thing local
 * storage genuinely cannot do and therefore the only honest reason to sign up.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/store";
import { useProjects } from "@/lib/store";
import { SEED_TS } from "@/lib/seed";
import { accountsAvailable } from "@/lib/auth";
import { Icon } from "@/components/ui/Icon";

/** Whether there is anything of the user's own yet. */
function useHasOwnWork(): boolean {
  const projects = useProjects((s) => s.projects);
  return projects.some((p) => p.updatedAt > SEED_TS);
}

/** Both doors, in the sentence that asks the question. */
const DOOR =
  "underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-fg";

export function KeepPrompt() {
  const choiceMade = useAuth((s) => s.choiceMade);
  const keepOnDevice = useAuth((s) => s.keepOnDevice);
  const theirs = useHasOwnWork();

  if (choiceMade || !theirs) return null;

  /*
   * A sentence, not a tray.
   *
   * This was a bordered, filled row with an icon, a paragraph, a filled
   * accent button and an outlined one — and it sat 82 pixels from "New
   * document", which is the one filled control this screen is allowed. Two
   * filled accents on one screen means "what do I press to start something"
   * has two answers, and the wrong one was the more insistent.
   *
   * On a 390px phone the flex column made it 304 pixels tall: three quarters
   * of the first screen of a page called Your work, spent on a question about
   * storage. A sentence wraps. A flex row holding two buttons does not.
   *
   * Every word survives, both doors keep their addresses, `keepOnDevice` is
   * untouched, and it is still asked exactly once — `choiceMade` is still set
   * by both answers, including the one that changes nothing.
   */
  return (
    <p className="anim-slide-up mb-(--space-5) max-w-[68ch] text-body text-fg-muted">
      <span className="text-fg">This is saved in this browser only.</span> Open
      Tougather on another computer — or in a different browser here — and none
      of it will be there. An account is what carries it across.{" "}
      <Link href="/settings#account" className={DOOR}>
        See the options
      </Link>
      {", or "}
      <button type="button" onClick={keepOnDevice} className={DOOR}>
        Keep it here
      </button>
      .
    </p>
  );
}

/**
 * The sidebar version. Same question, same one-time behaviour, sized for a
 * column — so someone who is deep in a document still gets asked once instead
 * of only ever seeing it on the Library page they may not return to.
 */
export function KeepPromptCompact() {
  const choiceMade = useAuth((s) => s.choiceMade);
  const keepOnDevice = useAuth((s) => s.keepOnDevice);
  const theirs = useHasOwnWork();
  // Not on the page that already asks. The two shapes exist so that somebody
  // who never returns to the library still gets the question once — but on
  // the library itself they render forty centimetres apart, the same sentence
  // over the same two buttons, and one question asked twice reads as a nag
  // rather than as a choice.
  const onLibrary = usePathname() === "/library";

  if (choiceMade || !theirs || onLibrary) return null;

  /*
   * The same question, the same once, in the sidebar's column — and now in the
   * same shape as the wide one, because two shapes for one question was half
   * the reason it read as a nag. The box and the fill go for the reason they
   * go everywhere: a panel on this palette is a 1.03:1 step in light, so the
   * border was doing all the grouping, and 40px of air does it without an
   * edge. Stacked rather than side by side, because the sidebar resizes down
   * to a width where two words in a row each wrap onto three lines.
   */
  return (
    <div className="anim-slide-up mx-2.5 my-(--space-5)">
      <p className="flex items-center gap-1.5 text-body font-medium text-fg">
        <Icon name="users" size={11} className="shrink-0 text-fg-subtle" />
        Only in this browser
      </p>
      <p className="mt-(--space-1) text-body text-fg-muted">
        Your work won&apos;t be here on another computer or in another browser.
        {accountsAvailable()
          ? " An account carries it across."
          : " An account will carry it across."}
      </p>
      <Link
        href="/settings#account"
        className={`mt-(--space-2) block text-body text-fg ${DOOR}`}
      >
        See the options
      </Link>
      <button
        type="button"
        onClick={keepOnDevice}
        aria-label="Keep my work in this browser and stop asking"
        className={`mt-(--space-1) block text-body text-fg-subtle ${DOOR}`}
      >
        Keep it here
      </button>
    </div>
  );
}
