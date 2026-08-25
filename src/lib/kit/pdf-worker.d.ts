/**
 * The pdf.js worker bundle, imported for its side effect.
 *
 * It ships as `.mjs` with no declaration beside it, and it is not imported
 * for anything it exports — loading it in a window is what puts the message
 * handler on `globalThis`, which is how `pdf.ts` gets pdf.js to work without
 * a worker URL. This says so to the typechecker rather than reaching for a
 * suppression comment that would also hide a real mistake.
 */
declare module "pdfjs-dist/build/pdf.worker.mjs";
