/**
 * The words, in both languages.
 *
 * One flat object rather than nested namespaces: a nested key is a key nobody
 * can grep for, and the first thing anybody does with a translation file is
 * search it for the English they saw on screen.
 *
 * English is the source of truth and the fallback. A key missing from Dutch
 * renders its English — never a placeholder, never a key name. Somebody using
 * the app in Dutch should meet an English sentence at worst, which is a small
 * awkwardness; `settings.language` reads a word nobody wrote, which is a bug
 * wearing a translation's clothes.
 *
 * Placeholders are `{name}`, filled by `t("key", { name: "…" })`.
 */

export type Locale = "en" | "nl";

export const LOCALES: Array<{ code: Locale; label: string; own: string }> = [
  { code: "en", label: "English", own: "English" },
  { code: "nl", label: "Dutch", own: "Nederlands" },
];

/** Every string the interface can say, keyed by what it says in English. */
export const EN = {
  /* Shell and navigation */
  "nav.library": "Library",
  "nav.chat": "Chat",
  "nav.kit": "Kit",
  "nav.team": "Team",
  "nav.admin": "Administration",
  "nav.settings": "Settings",
  "nav.search": "Search…",
  "nav.projects": "Projects",
  "nav.channels": "Channels",
  "nav.dms": "Direct messages",
  "nav.assistant": "Team assistant",
  "nav.newProject": "New",
  "nav.signIn": "Sign in",

  /* How work is kept, said in the chrome */
  "state.thisDevice": "this device",
  "state.synced": "synced",
  "state.syncing": "connecting",
  "state.syncFailed": "sync failed",
  "state.syncPaused": "sync paused",
  "state.offline": "offline",

  /* Library */
  "library.title": "Finished work lives here.",
  "library.subtitle": "Thinking lives on a Board.",
  "library.eyebrow": "Everything, in one",
  "library.search": "Search the library…",
  "library.searchLabel": "Search projects",
  "library.all": "All",
  "library.folders": "Folders",
  "library.everything": "Everything",
  "library.newFolder": "New",
  "library.folderName": "Folder name",
  "library.empty": "Nothing here yet.",
  "library.clear": "Clear",

  /* Folders and labels */
  "folder.rename": "Rename",
  "folder.newInside": "New folder inside",
  "folder.moveTo": "Move to",
  "folder.topLevel": "Top level",
  "folder.delete": "Delete folder",
  "folder.deleted": "Folder deleted — everything in it moved up a level",
  "labels.title": "Labels",
  "labels.help":
    "Separate them with commas. A project keeps its folder; labels are for the things that cut across folders.",
  "labels.placeholder": "thesis, chapter 2, urgent",
  "labels.save": "Save",
  "labels.cancel": "Cancel",

  /* Accounts */
  "account.signIn": "Sign in",
  "account.signOut": "Sign out",
  "account.createAccount": "Create an account",
  "account.createIt": "Create it",
  "account.email": "Email",
  "account.password": "Password",
  "account.newPassword": "New password",
  "account.changePassword": "Change password",
  "account.forgot": "Forgotten your password?",
  "account.sendLink": "Send the link",
  "account.backToSignIn": "Back to signing in",
  "account.haveOne": "I have one already",
  "account.createInstead": "Create one instead",
  "account.oneMoment": "One moment…",
  "account.saveIt": "Save it",
  "account.resetTitle": "Reset your password",
  "account.resetHelp":
    "We'll email a link that signs you in and lets you set a new one.",
  "account.chooseNew": "Choose a new password",
  "account.minLength": "— at least {n} characters",
  "account.yourName": "Your name, as other people see it",
  "account.displayName": "Your display name",
  "account.carryOn": "Carry on working",
  "account.back": "Back",
  "account.signedIn": "Signed in",
  "account.signedOut": "Signed out — your work stays in this browser",
  "account.noDatabase":
    "No database is configured, so there is nothing to sign in to yet. Your work is safe in this browser meanwhile —",
  "account.whyOff": "Why accounts are off",
  "account.skip": "Skip this and just start writing",
  "account.skipHelp":
    "— your work stays in this browser, and you can make an account later without losing any of it.",
  "account.welcomeBack": "Welcome back",
  "account.lead":
    "An account carries your work between machines and survives clearing this browser. It is not required — everything works without one.",

  /* Forms */
  "form.send": "Send",
  "form.sending": "Sending…",
  "form.sent": "Sent",
  "form.sentBody":
    "Your answers have gone to whoever made this form. You can close this page.",
  "form.goesTo": "Your answers go to whoever made this form.",
  "form.required": "This one is required.",
  "form.badEmail": "That doesn't look like an email address.",
  "form.badDate": "Give a date as 2026-08-11.",
  "form.badNumber": "That has to be a number.",
  "form.pickOne": "Pick one of the options.",
  "form.linkBroken": "That link didn't open",
  "form.linkBrokenBody":
    "The form inside it couldn't be read. Links get cut short by some chat apps — ask whoever sent it for the whole thing.",

  /* Settings */
  "settings.title": "Settings",
  "settings.appearance": "Appearance",
  "settings.language": "Language",
  "settings.languageHint":
    "The interface, in the language you'd rather read. Your documents are untouched — this is the buttons and the labels.",
  "settings.account": "Your account",
  "settings.connection": "Connection",
  "settings.keeping": "Keeping your work",
  "settings.words": "Your words",
  "settings.workspace": "Workspace",
  "settings.templates": "Templates",

  /* Offline */
  "offline.title": "You're offline, and your work is fine.",
  "offline.eyebrow": "No connection",
  "offline.body":
    "Everything you have made is stored in this browser and opens without a network. What needs a connection is syncing to your account, live sessions with other people, and the AI — those pick up on their own when the network comes back.",
  "offline.open": "Open the library",

  /* Shared words */
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.close": "Close",
  "common.open": "Open",
  "common.rename": "Rename",
  "common.duplicate": "Duplicate",
  "common.export": "Export",
  "common.import": "Import",
  "common.done": "Done",
  "common.checking": "Checking…",
} as const;

export type Key = keyof typeof EN;

/**
 * Dutch.
 *
 * Written rather than machine-translated, because the register matters: this
 * app addresses students directly and informally, and a translation that
 * slips into "u" halfway through reads like two different products. Everything
 * here is "je".
 */
export const NL: Partial<Record<Key, string>> = {
  "nav.library": "Bibliotheek",
  "nav.chat": "Chat",
  "nav.kit": "Kit",
  "nav.team": "Team",
  "nav.admin": "Beheer",
  "nav.settings": "Instellingen",
  "nav.search": "Zoeken…",
  "nav.projects": "Projecten",
  "nav.channels": "Kanalen",
  "nav.dms": "Directe berichten",
  "nav.assistant": "Teamassistent",
  "nav.newProject": "Nieuw",
  "nav.signIn": "Inloggen",

  "state.thisDevice": "dit apparaat",
  "state.synced": "gesynchroniseerd",
  "state.syncing": "verbinden",
  "state.syncFailed": "synchroniseren mislukt",
  "state.syncPaused": "synchroniseren gepauzeerd",
  "state.offline": "offline",

  "library.title": "Af werk staat hier.",
  "library.subtitle": "Denken gebeurt op een Board.",
  "library.eyebrow": "Alles, op één plek",
  "library.search": "Zoek in de bibliotheek…",
  "library.searchLabel": "Zoek projecten",
  "library.all": "Alles",
  "library.folders": "Mappen",
  "library.everything": "Alles",
  "library.newFolder": "Nieuw",
  "library.folderName": "Mapnaam",
  "library.empty": "Hier staat nog niets.",
  "library.clear": "Wissen",

  "folder.rename": "Naam wijzigen",
  "folder.newInside": "Nieuwe map hierin",
  "folder.moveTo": "Verplaatsen naar",
  "folder.topLevel": "Hoogste niveau",
  "folder.delete": "Map verwijderen",
  "folder.deleted": "Map verwijderd — alles erin is een niveau omhoog gegaan",
  "labels.title": "Labels",
  "labels.help":
    "Scheid ze met komma's. Een project houdt zijn map; labels zijn voor wat dwars door mappen heen loopt.",
  "labels.placeholder": "scriptie, hoofdstuk 2, urgent",
  "labels.save": "Opslaan",
  "labels.cancel": "Annuleren",

  "account.signIn": "Inloggen",
  "account.signOut": "Uitloggen",
  "account.createAccount": "Account aanmaken",
  "account.createIt": "Aanmaken",
  "account.email": "E-mail",
  "account.password": "Wachtwoord",
  "account.newPassword": "Nieuw wachtwoord",
  "account.changePassword": "Wachtwoord wijzigen",
  "account.forgot": "Wachtwoord vergeten?",
  "account.sendLink": "Stuur de link",
  "account.backToSignIn": "Terug naar inloggen",
  "account.haveOne": "Ik heb er al een",
  "account.createInstead": "Maak er juist een aan",
  "account.oneMoment": "Momentje…",
  "account.saveIt": "Opslaan",
  "account.resetTitle": "Wachtwoord opnieuw instellen",
  "account.resetHelp":
    "We mailen een link waarmee je inlogt en een nieuw wachtwoord kiest.",
  "account.chooseNew": "Kies een nieuw wachtwoord",
  "account.minLength": "— minstens {n} tekens",
  "account.yourName": "Je naam, zoals anderen die zien",
  "account.displayName": "Je weergavenaam",
  "account.carryOn": "Ga verder met werken",
  "account.back": "Terug",
  "account.signedIn": "Ingelogd",
  "account.signedOut": "Uitgelogd — je werk blijft in deze browser",
  "account.noDatabase":
    "Er is geen database ingesteld, dus er is nog nergens om in te loggen. Je werk staat intussen veilig in deze browser —",
  "account.whyOff": "Waarom accounts uit staan",
  "account.skip": "Sla dit over en begin gewoon met schrijven",
  "account.skipHelp":
    "— je werk blijft in deze browser, en je kunt later een account maken zonder er iets van kwijt te raken.",
  "account.welcomeBack": "Welkom terug",
  "account.lead":
    "Een account neemt je werk mee tussen apparaten en overleeft het wissen van deze browser. Het hoeft niet — alles werkt ook zonder.",

  "form.send": "Versturen",
  "form.sending": "Versturen…",
  "form.sent": "Verstuurd",
  "form.sentBody":
    "Je antwoorden zijn naar degene gegaan die dit formulier maakte. Je kunt deze pagina sluiten.",
  "form.goesTo": "Je antwoorden gaan naar degene die dit formulier maakte.",
  "form.required": "Deze is verplicht.",
  "form.badEmail": "Dat lijkt geen e-mailadres.",
  "form.badDate": "Geef een datum als 2026-08-11.",
  "form.badNumber": "Dit moet een getal zijn.",
  "form.pickOne": "Kies een van de opties.",
  "form.linkBroken": "Die link ging niet open",
  "form.linkBrokenBody":
    "Het formulier erin was niet te lezen. Sommige chat-apps knippen links af — vraag degene die hem stuurde om de hele link.",

  "settings.title": "Instellingen",
  "settings.appearance": "Uiterlijk",
  "settings.language": "Taal",
  "settings.languageHint":
    "De interface, in de taal die je liever leest. Je documenten blijven zoals ze zijn — dit gaat over de knoppen en de labels.",
  "settings.account": "Je account",
  "settings.connection": "Verbinding",
  "settings.keeping": "Je werk bewaren",
  "settings.words": "Je woorden",
  "settings.workspace": "Werkruimte",
  "settings.templates": "Sjablonen",

  "offline.title": "Je bent offline, en je werk is in orde.",
  "offline.eyebrow": "Geen verbinding",
  "offline.body":
    "Alles wat je hebt gemaakt staat in deze browser en opent zonder netwerk. Wat verbinding nodig heeft is synchroniseren met je account, live sessies met anderen, en de AI — die pakken vanzelf op zodra het netwerk terug is.",
  "offline.open": "Open de bibliotheek",

  "common.cancel": "Annuleren",
  "common.save": "Opslaan",
  "common.delete": "Verwijderen",
  "common.close": "Sluiten",
  "common.open": "Openen",
  "common.rename": "Naam wijzigen",
  "common.duplicate": "Dupliceren",
  "common.export": "Exporteren",
  "common.import": "Importeren",
  "common.done": "Klaar",
  "common.checking": "Bezig met controleren…",
};

export const DICTIONARIES: Record<Locale, Partial<Record<Key, string>>> = {
  en: EN,
  nl: NL,
};

/** How much of the interface a language actually covers. Shown in Settings. */
export function coverage(locale: Locale): { done: number; total: number } {
  const total = Object.keys(EN).length;
  const dictionary = DICTIONARIES[locale];
  const done = Object.keys(EN).filter((key) => dictionary[key as Key]).length;
  return { done, total };
}
