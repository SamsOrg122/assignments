/// <reference types="vite/client" />

/*
 * Vite's own ambient types, which this project never pulled in because until
 * now nothing here imported anything that was not TypeScript.
 *
 * The bar imports the mark as an asset (`./assets/logo.png`), which Vite
 * resolves to a URL at build time and inlines or copies depending on size.
 * Without this reference `tsc` has no idea what that import is and refuses it.
 */
