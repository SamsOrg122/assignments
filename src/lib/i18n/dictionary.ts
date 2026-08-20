/**
 * The words the interface says.
 *
 * One flat object rather than nested namespaces: a nested key is a key nobody
 * can grep for, and the first thing anybody does with a string table is search
 * it for the English they saw on screen.
 *
 * One language, deliberately. There was a Dutch column here, and the table
 * itself was nearly complete — but a table is not an interface. Seven files
 * out of a hundred and fifty ask it for their words; every editor, board,
 * chat, spreadsheet, slide deck and admin screen has its English written into
 * the markup. A browser set to Dutch picked Dutch on its own, so the result
 * was a Dutch sidebar wrapped around an English editor, and no way for the
 * person reading it to tell which half was the mistake. Half a language is
 * worse than one language.
 *
 * A second language belongs here again when every one of those hundred and
 * fifty files reads its words from this file — not before.
 *
 * Documents are a separate matter and always were: what somebody writes is in
 * whatever language they write it, and the proofing language is set per
 * project (see `lib/dictionary.ts`).
 *
 * Placeholders are `{name}`, filled by `t("key", { name: "…" })`.
 */

/** Every string the interface can say, keyed by what it says in English. */
export const EN = {
  /* Shell and navigation */
  "nav.library": "Library",
  "nav.chat": "Chat",
  "nav.agenda": "Agenda",
  "nav.notes": "Notes",
  "nav.kit": "Kit",
  "nav.team": "Team",
  "nav.community": "Community",
  "nav.admin": "Administration",
  "nav.settings": "Settings",
  "nav.search": "Search…",
  "nav.projects": "Projects",
  "nav.channels": "Channels",
  "nav.chats": "Chats",
  "nav.dms": "Direct messages",
  "nav.assistant": "Team assistant",
  "nav.newProject": "New",
  "nav.signIn": "Sign in",

  /* How work is kept, said in the chrome */
  "state.thisDevice": "this device",
  "state.synced": "synced",
  /* Syncing, but to an account only this browser can reach. */
  "state.noAccount": "no account yet",
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
  "folder.icon": "Icon…",
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
