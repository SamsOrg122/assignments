/**
 * How to spell the hotkey for the person reading it.
 *
 * The Rust side has the same two strings, because the tray menu is drawn by
 * the OS and never sees this file. Kept in both places rather than passed
 * across the bridge: it is two constants, and a round trip to render a label
 * would make the window flash the wrong one first.
 */
const mac = navigator.platform.toLowerCase().includes("mac");

export const HOTKEY_LABEL = mac ? "⌘⇧N" : "Ctrl+Shift+N";
