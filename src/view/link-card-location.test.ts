import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  TFile: class TFile { constructor(public path: string) {} },
  resolveSubpath: (cache: { subpaths?: Record<string, unknown> }, subpath: string) => cache.subpaths?.[subpath] ?? null,
}));

import { TFile, type App } from "obsidian";
import { resolveLinkCardLocation } from "./link-card-location";
import { createLinksScope, type LinksScope } from "./scope";

function scope(path: string, direction: LinksScope["direction"]): LinksScope {
  return createLinksScope(path, direction) as LinksScope;
}

function file(path: string): TFile {
  const result = new TFile();
  result.path = path;
  return result;
}

function reference(link: string, original: string, line: number, col = 0) {
  return { link, original, position: {
    start: { line, col, offset: line * 100 + col },
    end: { line, col: col + original.length, offset: line * 100 + col + original.length },
  } };
}

function appFor(sourceCache: object, targetCache: object = {}): App {
  const files = new Map([
    ["source.md", file("source.md")],
    ["target.md", file("target.md")],
  ]);
  return {
    vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
    metadataCache: {
      resolvedLinks: { "source.md": { "target.md": 3 } },
      getFileCache: (file: TFile) => file.path === "source.md" ? sourceCache : targetCache,
      getFirstLinkpathDest: (link: string) => link === "target" ? files.get("target.md") : null,
    },
  } as unknown as App;
}

describe("resolveLinkCardLocation", () => {
  it("uses the first valid backlink reference in source order", () => {
    const app = appFor({ links: [
      reference("target", "[[target]]", 12, 7),
      reference("target", "[[target]]", 4, 2),
    ] });
    expect(resolveLinkCardLocation(app, scope("target.md", "backlinks"), "source.md"))
      .toMatchObject({ line: 4, ch: 2, expectedText: "[[target]]" });
  });

  it("uses the first resolvable heading or block outgoing anchor and skips plain links", () => {
    const app = appFor({ links: [
      reference("target", "[[target]]", 1),
      reference("target#Missing", "[[target#Missing]]", 2),
      reference("target#Heading", "[[target#Heading]]", 3),
      reference("target#^block", "[[target#^block]]", 4),
    ] }, { subpaths: {
      "#Heading": { type: "heading", current: { heading: "Heading", position: reference("", "", 26).position } },
      "#^block": { type: "block", block: { position: reference("", "", 31).position } },
    } });
    expect(resolveLinkCardLocation(app, scope("source.md", "outgoing"), "target.md"))
      .toMatchObject({ line: 26, expectedText: "Heading" });
  });

  it("resolves a block anchor after an invalid heading and carries its id for stale checks", () => {
    const app = appFor({ links: [
      reference("target#Missing", "[[target#Missing]]", 1),
      reference("target#^block", "[[target#^block]]", 2),
    ] }, { subpaths: {
      "#^block": { type: "block", block: { id: "block", position: reference("", "", 31).position } },
    } });
    expect(resolveLinkCardLocation(app, scope("source.md", "outgoing"), "target.md"))
      .toMatchObject({ line: 31, expectedBlockId: "block" });
  });

  it("falls back for plain or unresolved outgoing links and stale graph membership", () => {
    const app = appFor({ links: [reference("target", "[[target]]", 1)] });
    expect(resolveLinkCardLocation(app, scope("source.md", "outgoing"), "target.md"))
      .toBeNull();
    (app.metadataCache.resolvedLinks as Record<string, Record<string, number>>)["source.md"] = {};
    expect(resolveLinkCardLocation(app, scope("target.md", "backlinks"), "source.md"))
      .toBeNull();
  });
});
