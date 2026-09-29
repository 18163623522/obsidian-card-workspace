/**
 * Node has no DOM window. Search ingest yields with window.setTimeout, so the
 * benchmark process aliases window to the Node global before the bundle runs.
 */
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}
