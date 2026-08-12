"use client";

/**
 * Choosing the language.
 *
 * The coverage figure is deliberate. A half-translated interface is a normal
 * state for any product that ships more than one language, and hiding that
 * behind a flag icon means somebody meets an English sentence with no idea
 * why. Saying "312 of 340" turns a defect into a known quantity — and makes it
 * obvious when a release has let it slip.
 */

import { LOCALES, coverage, useLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export function LanguagePanel() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        {LOCALES.map((option) => {
          const { done, total } = coverage(option.code as Locale);
          const partial = done < total;
          return (
            <button
              key={option.code}
              type="button"
              aria-pressed={locale === option.code}
              onClick={() => setLocale(option.code)}
              className={cn(
                "flex min-w-[136px] flex-col rounded-md border px-3 py-2 text-left transition-colors duration-150",
                locale === option.code
                  ? "border-accent bg-accent-soft"
                  : "border-line hover:border-line-strong",
              )}
            >
              <span
                className={cn(
                  "text-[13px]",
                  locale === option.code ? "text-accent" : "text-fg",
                )}
              >
                {option.own}
              </span>
              <span className="font-mono text-[10px] text-fg-subtle">
                {partial ? `${done}/${total} translated` : "complete"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[12px] leading-relaxed text-fg-subtle">
        {t("settings.languageHint")} Anything not yet translated falls back to
        English rather than showing a blank.
      </p>
    </div>
  );
}
