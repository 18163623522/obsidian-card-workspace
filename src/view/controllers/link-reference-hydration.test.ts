import { afterEach, describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { DEFAULT_SETTINGS, type BacklinkSnippetCount } from "../../settings";
import { getUiStrings } from "../../i18n";
import { createCardRecord } from "../card-record";
import { compareCards } from "../card-sort";
import { createLinksScope } from "../scope";
import { createViewEpochs } from "../view-epochs";
import { createViewStateStore } from "../view-state-store";
import type { ViewContext } from "../view-context";
import { HydrationController } from "./HydrationController";
import { buildLightPreview } from "../markdown-utils";

vi.mock("obsidian", () => ({
  TFile: class { path = ""; stat = { mtime: 1, ctime: 1, size: 0 }; extension = "md"; basename = ""; },
  TFolder: class { path = ""; },
  resolveSubpath: (cache: { subpaths?: Record<string, unknown> }, subpath: string) => cache.subpaths?.[subpath] ?? null,
}));

const controllers: HydrationController[] = [];
afterEach(() => controllers.splice(0).forEach((controller) => controller.dispose()));

function references(markdown: string) {
  return [...markdown.matchAll(/!?\[\[([^\]]+)\]\]/g)].map((match) => {
    const offset = match.index!;
    const prefix = markdown.slice(0, offset);
    const line = prefix.split("\n").length - 1;
    const col = offset - (prefix.lastIndexOf("\n") + 1);
    return { link: match[1].split("|")[0], original: match[0], position: {
      start: { offset, line, col }, end: { offset: offset + match[0].length, line, col: col + match[0].length },
    } };
  });
}

function harness(direction: "backlinks" | "outgoing", count: BacklinkSnippetCount = 3, targetCount = 1, targetExtension = "md") {
  const source = Object.assign(new TFile(), { path: "source.md", basename: "source" });
  const targets = Array.from({ length: targetCount }, (_, index) => Object.assign(new TFile(), { path: `target${index}.${targetExtension}`, basename: `target${index}`, extension: targetExtension }));
  const files = new Map([source, ...targets].map((file) => [file.path, file]));
  const bodies = new Map<string, string>();
  const body = Array.from({ length: 5 }, (_, index) => `paragraph ${index} ${targets.map((target) => `[[${target.basename}]]`).join(" ")}`).join("\n\n");
  bodies.set(source.path, body);
  for (const target of targets) bodies.set(target.path, "# Target\nbody");
  const graph: Record<string, Record<string, number>> = { [source.path]: Object.fromEntries(targets.map((target) => [target.path, 5])) };
  const read = vi.fn(async (file: TFile) => bodies.get(file.path)!);
  const app = { vault: { cachedRead: read, getAbstractFileByPath: (path: string) => files.get(path) ?? null },
    metadataCache: { resolvedLinks: graph,
      getFirstLinkpathDest: (path: string) => [...files.values()].find((file) => file.basename === path) ?? null,
      getFileCache: (file: TFile) => {
        const markdown = bodies.get(file.path) ?? "";
        const subpaths: Record<string, unknown> = {};
        markdown.split("\n").forEach((text, line) => {
          const heading = /^#+ (.+)$/.exec(text);
          const block = /\^([\w-]+)$/.exec(text);
          if (heading) subpaths[`#${heading[1]}`] = { type: "heading", current: { heading: heading[1], position: { start: { line }, end: { line } } } };
          if (block) subpaths[`#^${block[1]}`] = { type: "block", block: { id: block[1], position: { start: { line }, end: { line } } } };
        });
        return { links: references(markdown), subpaths };
      },
    } } as unknown as App;
  let settings = { ...DEFAULT_SETTINGS, backlinkSnippetCount: count };
  let query = "";
  let matchFields: readonly ("title" | "content")[] | undefined;
  let selectionVersion = 0;
  const scope = createLinksScope(direction === "backlinks" ? targets[0].path : source.path, direction);
  const store = createViewStateStore(scope);
  const records = (direction === "backlinks" ? [source] : targets).map((file) => createCardRecord(app, file, file.extension === "canvas" ? "canvas" : "markdown"));
  store.replaceBaseCards(records); store.replaceVisibleCards(records);
  const context = { store, getApp: () => app, epochs: createViewEpochs(), getSettings: () => settings,
    getUiStrings: () => getUiStrings("en"), publishGroups: vi.fn(), getViewWindow: () => globalThis } as unknown as ViewContext;
  const controller = new HydrationController({ context, isLoading: () => false,
    getMatchFields: () => matchFields, getCommittedQuery: () => query, isCommittedQueryCurrent: () => true, getActiveSelectionVersion: () => selectionVersion });
  controllers.push(controller);
  controller.prepareRecordsFromCache(records);
  const hydrate = () => controller.hydrateViewport({ generation: context.epochs.load.value,
    hydrationRevision: store.getHydrationRevision(), start: 0, end: records.length, paths: records.map((card) => card.path) });
  return { app, context, controller, store, records, read, source, targets, bodies, graph, hydrate,
    setCount: (next: BacklinkSnippetCount) => { settings = { ...settings, backlinkSnippetCount: next }; },
    setQuery: (next: string) => { query = next; }, setMatchFields: (next: readonly ("title" | "content")[]) => { matchFields = next; }, selectManually: () => { selectionVersion++; } };
}

describe("link reference hydration", () => {
  it.each([1, 2, 3, "all"] as const)("shows the configured %s contexts and the actual edge count", async (count) => {
    const h = harness("backlinks", count);
    expect(h.records[0].referenceCount).toBe(5);
    await h.hydrate();
    const preview = h.store.getBaseCard(h.source.path)!.linkPreview!;
    expect(preview.snippets).toHaveLength(count === "all" ? 5 : count);
    expect(preview.totalSnippets).toBe(5);
    expect(preview.status).toBe("ready");
    expect(h.read).toHaveBeenCalledTimes(1);
  });

  it("merges same-paragraph links, counting occurrences rather than displayed contexts", async () => {
    const h = harness("backlinks");
    h.bodies.set(h.source.path, "intro [[target0]] and ![[target0]]\n\nnext [[target0]]");
    h.graph[h.source.path][h.targets[0].path] = 3;
    h.controller.prepareRecordsFromCache(h.records);
    await h.hydrate();
    const card = h.store.getBaseCard(h.source.path)!;
    expect(card.referenceCount).toBe(3);
    expect(card.linkPreview?.totalSnippets).toBe(2);
    expect(card.linkPreview?.snippets[0].referenceCount).toBe(2);
  });

  it("expands, survives a same-scope reload, and resets when the preference changes", async () => {
    const h = harness("backlinks", 1);
    await h.hydrate();
    await h.controller.toggleReferences(h.source.path);
    expect(h.store.getBaseCard(h.source.path)?.linkPreview?.snippets).toHaveLength(5);
    h.context.epochs.load.bump(); h.controller.resetForLoad();
    const fresh = createCardRecord(h.app, h.source, "markdown");
    h.controller.prepareRecordsFromCache([fresh]);
    expect(fresh.linkPreview?.expanded).toBe(true);
    expect(fresh.linkPreview?.snippets).toHaveLength(5);
    h.setCount(2);
    h.controller.prepareRecordsFromCache([fresh]);
    h.store.replaceBaseCards([fresh]); h.store.replaceVisibleCards([fresh]);
    await h.hydrate();
    expect(h.store.getBaseCard(h.source.path)?.linkPreview?.expanded).toBe(false);
    expect(h.store.getBaseCard(h.source.path)?.linkPreview?.snippets).toHaveLength(2);
  });

  it("shows one ordinary destination preview for repeated plain links and shares one source read", async () => {
    const h = harness("outgoing", 3, 3);
    await h.hydrate();
    expect(h.read.mock.calls.filter(([file]) => file.path === h.source.path)).toHaveLength(1);
    for (const file of h.targets) expect(h.store.getBaseCard(file.path)?.linkPreview?.snippets).toHaveLength(1);
    await Promise.all(h.targets.map((file) => h.controller.toggleReferences(file.path)));
    expect(h.read.mock.calls.filter(([file]) => file.path === h.source.path)).toHaveLength(1);
    for (const file of h.targets) {
      const card = h.store.getBaseCard(file.path)!;
      expect(card.linkPreview?.snippets).toHaveLength(1);
      expect(card.previewHtml).toBe(buildLightPreview(h.bodies.get(file.path)!, undefined, DEFAULT_SETTINGS.previewLines).html);
      expect(card.previewHtml).not.toContain("paragraph 0");
      const snippet = card.linkPreview!.snippets[0];
      expect(snippet.referenceCount).toBe(5);
      expect(snippet.openingPreview).toBe(true);
      expect(h.controller.resolveReferenceLocation(file.path, snippet.id, true)?.path).toBe(file.path);
    }
  });

  it("combines the ordinary opening preview with distinct anchored previews in source order", async () => {
    const h = harness("outgoing");
    h.bodies.set(h.source.path, "[[target0#Target]]\n\n[[target0|alias]]\n\n![[target0]]\n\n[[target0#Target]]");
    h.bodies.set(h.targets[0].path, "---\ntitle: Hidden metadata\n---\nOpening text\nSecond line\nThird line\nFourth line\nFifth line\n\n# Target\nReferenced body");
    h.graph[h.source.path][h.targets[0].path] = 4;
    await h.hydrate();
    const card = h.store.getBaseCard(h.targets[0].path)!;
    const snippets = card.linkPreview!.snippets;
    expect(snippets).toHaveLength(2);
    expect(snippets[0].html).toContain("Referenced body");
    expect(snippets[0].html).not.toContain("Opening text");
    expect(snippets[0].openingPreview).toBeUndefined();
    expect(snippets[1].openingPreview).toBe(true);
    expect(snippets[1].html).toBe(buildLightPreview(h.bodies.get(card.path)!, undefined, DEFAULT_SETTINGS.previewLines).html);
    expect(snippets[1].html).not.toContain("Hidden metadata");
    expect(snippets.map((snippet) => snippet.referenceCount)).toEqual([2, 2]);
    expect(h.controller.resolveReferenceLocation(card.path, snippets[1].id, true)!.location.location.line).toBe(0);
  });

  it("updates count-only metadata and rejects stale reference IDs", async () => {
    const h = harness("backlinks");
    await h.hydrate();
    const id = h.store.getBaseCard(h.source.path)!.linkPreview!.snippets[0].id;
    const accepted = h.controller.resolveReferenceLocation(h.source.path, id, false)!;
    expect(accepted.location.isCurrent()).toBe(true);
    h.graph[h.source.path][h.targets[0].path] = 9;
    h.controller.invalidateLinkMetadata(h.source.path);
    expect(h.store.getBaseCard(h.source.path)?.referenceCount).toBe(9);
    expect(h.controller.resolveReferenceLocation(h.source.path, id, false)).toBeNull();
    expect(accepted.location.isCurrent()).toBe(false);
    await h.hydrate();
  });

  it("copies the clicked source location, survives automatic following, and cancels on manual selection", async () => {
    const h = harness("backlinks");
    await h.hydrate();
    const snippet = h.store.getBaseCard(h.source.path)!.linkPreview!.snippets[1];
    const accepted = h.controller.resolveReferenceLocation(h.source.path, snippet.id, false)!;
    expect(accepted.path).toBe(h.source.path);
    expect(accepted.location.location.line).toBe(2);
    h.store.setScope(createLinksScope(h.source.path, "backlinks"));
    h.context.epochs.load.bump(); h.store.replaceBaseCards([]); h.store.replaceVisibleCards([]);
    expect(accepted.location.isCurrent()).toBe(true);
    h.selectManually(); expect(accepted.location.isCurrent()).toBe(false);
  });

  it("resolves outgoing source and heading target separately", async () => {
    const h = harness("outgoing");
    h.bodies.set(h.source.path, "intro\n\n[[target0#Target]]");
    await h.hydrate(); await h.controller.toggleReferences(h.targets[0].path);
    const snippet = h.store.getBaseCard(h.targets[0].path)!.linkPreview!.snippets[0];
    const source = h.controller.resolveReferenceLocation(h.targets[0].path, snippet.id, false)!;
    const target = h.controller.resolveReferenceLocation(h.targets[0].path, snippet.id, true)!;
    expect(source.path).toBe(h.source.path); expect(source.location.location.line).toBe(2);
    expect(target.path).toBe(h.targets[0].path); expect(target.location.location.line).toBe(0);
  });

  it("previews the outgoing destination heading with ordinary Markdown rendering and no opening summary", async () => {
    const h = harness("outgoing");
    h.bodies.set(h.source.path, "[[target0#Target]]\n\n[[target0#Target]]");
    h.bodies.set(h.targets[0].path, "Unrelated opening paragraph\n\n# Target\n\nReferenced text with `code`.\n\n# Other\nother text");
    h.graph[h.source.path][h.targets[0].path] = 2;
    await h.hydrate();
    const card = h.store.getBaseCard(h.targets[0].path)!;
    const snippet = card.linkPreview!.snippets[0];
    expect(card.linkPreview!.snippets).toHaveLength(1);
    expect(snippet.displayTarget).toBe(true);
    expect(snippet.referenceCount).toBe(2);
    expect(snippet.html).toContain('class="fce-preview-heading"');
    expect(snippet.html).toContain("<code>code</code>");
    expect(snippet.html).not.toContain("Unrelated opening");
    expect(snippet.html).not.toContain("Other");
    expect(card.previewHtml).toBe(snippet.html);
    expect(h.controller.resolveReferenceLocation(card.path, snippet.id, true)!.location.location.line).toBe(2);
  });

  it("previews the outgoing referenced block and preserves distinct destination locations", async () => {
    const h = harness("outgoing");
    h.bodies.set(h.source.path, "[[target0#^block]] and [[target0#Target]]");
    h.bodies.set(h.targets[0].path, "Unrelated introduction\n\n# Target\nheading body\n\n- [ ] Referenced task ^block\n\nUnrelated ending");
    await h.hydrate();
    const snippets = h.store.getBaseCard(h.targets[0].path)!.linkPreview!.snippets;
    expect(snippets).toHaveLength(2);
    expect(snippets.every((snippet) => snippet.displayTarget)).toBe(true);
    expect(snippets[0].html).toContain('class="fce-preview-task"');
    expect(snippets[0].html).toContain("Referenced task");
    expect(snippets[0].html).not.toContain("Unrelated introduction");
    expect(snippets[0].html).not.toContain("Unrelated ending");
  });

  it("keeps heading-like code inside the referenced section's normal code preview", async () => {
    const h = harness("outgoing");
    h.bodies.set(h.source.path, "[[target0#Target]]");
    h.bodies.set(h.targets[0].path, "# Target\n```markdown\n# Sample\ncode body\n```\n# Other");
    await h.hydrate();
    const snippet = h.store.getBaseCard(h.targets[0].path)!.linkPreview!.snippets[0];
    expect(snippet.html).toContain('class="fce-preview-code"');
    expect(snippet.html).toContain("# Sample");
    expect(snippet.html).not.toContain("Other");
  });

  it("uses the ordinary list and inline-code renderer for backlink reference contexts", async () => {
    const h = harness("backlinks");
    h.bodies.set(h.source.path, "Unrelated opening paragraph\n\n- [ ] Use `code` with [[target0]]");
    await h.hydrate();
    const card = h.store.getBaseCard(h.source.path)!;
    expect(card.previewHtml).toContain('class="fce-preview-task"');
    expect(card.previewHtml).toContain("<code>code</code>");
    expect(card.previewHtml).not.toContain("Unrelated opening");
    expect(card.linkPreview!.snippets[0].html).toBe(card.previewHtml);
  });

  it("keeps reference previews for title-only link searches instead of returning the opening summary", async () => {
    const h = harness("backlinks");
    h.bodies.set(h.source.path, "Unrelated opening paragraph\n\nActual [[target0]] context");
    h.setQuery("source"); h.setMatchFields(["title"]);
    await h.hydrate();
    const card = h.store.getBaseCard(h.source.path)!;
    expect(card.searchPreview?.status).toBe("title-only");
    expect(card.previewHtml).toContain("Actual");
    expect(card.previewHtml).not.toContain("Unrelated opening");
    expect(card.linkPreview!.snippets).toHaveLength(1);
  });

  it("uses counts with stable path ties", () => {
    const h = harness("outgoing", 3, 3);
    const records = h.records.map((card, index) => ({ ...card, referenceCount: index === 0 ? 2 : 8 }));
    expect(compareCards(records[1], records[0], "reference-count", "desc")).toBeLessThan(0);
    expect(compareCards(records[1], records[2], "reference-count", "desc")).toBeLessThan(0);
    expect(compareCards(records[1], records[2], "reference-count", "asc")).toBeLessThan(0);
  });

  it("refreshes hidden counts without reading paths left over from an older viewport", async () => {
    const h = harness("backlinks");
    await h.hydrate();
    h.store.replaceVisibleCards([]);
    h.graph[h.source.path][h.targets[0].path] = 8;
    h.controller.invalidateLinkMetadata(h.source.path);
    expect(h.store.getBaseCard(h.source.path)?.referenceCount).toBe(8);
    expect(h.read).toHaveBeenCalledTimes(1);
  });

  it("drops a pending preview when the source selection changes", async () => {
    const h = harness("backlinks");
    let release!: (value: string) => void;
    h.read.mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; }));
    const pending = h.hydrate();
    h.context.epochs.load.bump();
    h.store.setScope(createLinksScope("another.md", "backlinks"));
    release(h.bodies.get(h.source.path)!);
    await pending;
    expect(h.store.getBaseCard(h.source.path)?.hydrated).toBe(false);
  });

  it("keeps outgoing source reads within the same five-reader ceiling", async () => {
    const h = harness("outgoing", 3, 9);
    let active = 0, peak = 0;
    h.read.mockImplementation(async (file) => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      active--;
      return h.bodies.get(file.path)!;
    });
    await Promise.all(h.targets.map((file) => h.controller.toggleReferences(file.path)));
    expect(peak).toBeLessThanOrEqual(5);
    expect(h.read.mock.calls.filter(([file]) => file.path === h.source.path)).toHaveLength(1);
  });

  it("keeps plain links to non-Markdown targets as ordinary placeholders", async () => {
    const h = harness("outgoing", 3, 1, "canvas");
    h.controller.prepareRecordsFromCache(h.records);
    await h.hydrate(); await h.controller.toggleReferences(h.targets[0].path);
    const card = h.store.getBaseCard(h.targets[0].path)!;
    expect(card.previewMode).toBe("placeholder");
    expect(card.linkPreview?.snippets).toHaveLength(1);
    expect(card.linkPreview?.snippets[0].openingPreview).toBe(true);
    expect(h.read.mock.calls.map(([file]) => file.path)).toEqual([h.source.path]);
  });

  it("rebinds cached reference IDs for a non-Markdown target after reloading", async () => {
    const h = harness("outgoing", 3, 1, "canvas");
    await h.hydrate(); await h.controller.toggleReferences(h.targets[0].path);
    const oldId = h.store.getBaseCard(h.targets[0].path)!.linkPreview!.snippets[0].id;
    const reads = h.read.mock.calls.length;
    h.context.epochs.load.bump(); h.controller.resetForLoad();
    const fresh = createCardRecord(h.app, h.targets[0], "canvas");
    h.controller.prepareRecordsFromCache([fresh]);
    h.store.replaceBaseCards([fresh]); h.store.replaceVisibleCards([fresh]);
    await h.hydrate();
    const next = h.store.getBaseCard(h.targets[0].path)!;
    expect(next.previewMode).toBe("placeholder");
    expect(next.linkPreview!.snippets[0].id).not.toBe(oldId);
    expect(h.controller.resolveReferenceLocation(next.path, oldId, false)).toBeNull();
    expect(h.read).toHaveBeenCalledTimes(reads);
  });

  it("keeps badge counts when no reference has a valid source location", async () => {
    const h = harness("backlinks");
    h.bodies.set(h.source.path, "ordinary body without locatable links");
    await h.hydrate();
    const card = h.store.getBaseCard(h.source.path)!;
    expect(card.referenceCount).toBe(5);
    expect(card.linkPreview?.status).toBe("unavailable");
    expect(card.previewHtml).toBe("");
  });
  it("does not impose a hidden cap when all contexts are selected", async () => {
    const h = harness("backlinks", "all");
    h.bodies.set(h.source.path, Array.from({ length: 300 }, (_, index) => `paragraph ${index} [[target0]]`).join("\n\n"));
    h.graph[h.source.path][h.targets[0].path] = 300;
    await h.hydrate();
    expect(h.store.getBaseCard(h.source.path)?.linkPreview?.snippets).toHaveLength(300);
  });
});
