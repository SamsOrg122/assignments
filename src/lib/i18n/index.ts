"use client";

/**
 * The interface, in the language somebody would rather read.
 *
 * Per user rather than per deployment, and defaulting to what the browser asks
 * for — so a Dutch student gets Dutch without configuring anything, and the
 * same build still serves everybody else. Flipping a hard-coded default would
 * have been less work and would have made the second language impossible.
 *
 * **The honest limitation, stated once here:** the pages are prerendered in
 * English at build time, so a Dutch reader gets one frame of English before
 * hydration swaps it. Avoiding that entirely means reading a cookie on the
 * server and giving up static rendering for the whole app, which is a real
 * cost for a flicker measured in milliseconds. `useSyncExternalStore` with an
 * English server snapshot is the supported way to do this and is what runs
 * here; when it becomes worth paying for, the cookie is a contained change.
 *
 * Documents are never touched. This is the buttons and the labels — a person
 * writing a Dutch thesis in an English interface is a nuisance, and a person
 * whose *thesis* got translated would be a catastrophe.
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  DICTIONARIES,
  EN,
  LOCALES,
  type Key,
  type Locale,
} from "./dictionary";

export type { Locale, Key } from "./dictionary";
export { LOCALES, coverage } from "./dictionary";

const STORAGE = "assignments:locale:v1";

const KNOWN = new Set(LOCALES.map((l) => l.code));

const isLocale = (value: string | null): value is Locale =>
  value !== null && KNOWN.has(value as Locale);

/** What the browser would like, narrowed to something we actually have. */
export function preferredLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.split("-")[0]?.toLowerCase();
    if (isLocale(base)) return base;
  }
  return "en";
}

let current: Locale | null = null;
const watchers = new Set<() => void>();

/** Read once, lazily: `localStorage` during module evaluation is a crash on
 *  the server and a hydration mismatch in the browser. */
function read(): Locale {
  if (current) return current;
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE);
  current = isLocale(stored) ? stored : preferredLocale();
  return current;
}

export function setLocale(next: Locale) {
  current = next;
  try {
    window.localStorage.setItem(STORAGE, next);
  } catch {
    // A browser refusing storage is not a reason to refuse the language.
  }
  document.documentElement.lang = next;
  watchers.forEach((fn) => fn());
}

const subscribe = (onChange: () => void) => {
  watchers.add(onChange);
  return () => watchers.delete(onChange);
};

/** Fill `{name}` placeholders. Anything unmatched is left alone rather than
 *  blanked, so a typo in a key shows itself instead of eating a sentence. */
function fill(text: string, values?: Record<string, string | number>): string {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

export function translate(
  locale: Locale,
  key: Key,
  values?: Record<string, string | number>,
): string {
  const dictionary = DICTIONARIES[locale];
  // English is the fallback, always. A missing key must never surface as a
  // key name — see the note at the top of `dictionary.ts`.
  return fill(dictionary[key] ?? EN[key] ?? key, values);
}

/**
 * The language, and the function that speaks it.
 *
 * The server snapshot is English, which is also the first client render, so
 * hydration agrees; the stored preference lands on the next paint.
 */
export function useLocale(): {
  locale: Locale;
  t: (key: Key, values?: Record<string, string | number>) => string;
  setLocale: (next: Locale) => void;
} {
  const locale = useSyncExternalStore(
    subscribe,
    read,
    () => "en" as Locale,
  );

  const t = useCallback(
    (key: Key, values?: Record<string, string | number>) =>
      translate(locale, key, values),
    [locale],
  );

  return { locale, t, setLocale };
}

/** For the handful of places that want the words without the hook. */
export const t = (key: Key, values?: Record<string, string | number>) =>
  translate(read(), key, values);

/**
 * Sets `<html lang>` before first paint.
 *
 * Not decoration: a screen reader picks its voice from this attribute, so a
 * Dutch interface announced in an English voice is unusable in a way that
 * looks fine on screen.
 *
 * The URL wins where there is one. The storefront has pages written in Dutch
 * at `/nl/…` and pages written in English everywhere else, and those are
 * documents rather than interface — their language is a fact about the page,
 * not a preference. Without this a Dutch reader landed on an English guide and
 * had it announced in Dutch, and a Dutch page reached from an English
 * interface was announced in English. Inside the app, where there is no
 * language in the path, the preference decides as before.
 */
export const LOCALE_BOOT_SCRIPT = `try{
  var s=localStorage.getItem(${JSON.stringify(STORAGE)});
  var known=${JSON.stringify([...KNOWN])};
  var l=known.indexOf(s)>=0?s:null;
  if(!l){
    var langs=navigator.languages||[navigator.language||"en"];
    for(var i=0;i<langs.length;i++){
      var base=String(langs[i]).split("-")[0].toLowerCase();
      if(known.indexOf(base)>=0){l=base;break;}
    }
  }
  var path=location.pathname;
  var onDutchPage=path==="/nl"||path.indexOf("/nl/")===0;
  document.documentElement.lang=onDutchPage?"nl":(l||"en");
}catch(e){}`;
