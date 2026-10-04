/** Real Chromium layout/activation checks; no vault, network assets or timing gates. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import sveltePlugin from "esbuild-svelte";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputIndex = process.argv.indexOf("--output");
if (outputIndex < 0) throw new Error("Pass --output <absolute report path>");
const output = path.resolve(process.argv[outputIndex + 1]);
const temporary = await mkdtemp(path.join(tmpdir(), "card-workspace-search-browser-"));
let server, browser;
try {
  // Reuse the panel fixture's complete host groups so production virtualization,
  // resize observers and scroll anchoring run in the same browser as card layout.
  const fixture = await readFile(path.join(root, "scripts/image-benchmark/browser.ts"), "utf8");
  const modelStart = fixture.indexOf("  model = createPanelModel({");
  const modelEnd = fixture.indexOf("  const target = document.querySelector", modelStart);
  const modelCode = fixture.slice(modelStart, modelEnd).replace("model =", "const model =");
  const entry = `
import {mount, unmount, tick} from 'svelte';
import CardItem from './src/view/CardItem.svelte';
import FolderCardPanel from './src/view/FolderCardPanel.svelte';
import {createPanelModel} from './src/view/panel-model';
import {DEFAULT_GROUP_SPEC} from './src/card-grouping-settings';
import {getUiStrings} from './src/i18n';
import {createSearchPreviewMatcher, extractSearchPreviewSnippets} from './src/search/search-preview';
const source = Array.from({length: 12}, (_, i) => 'prefix ' + '宽'.repeat(70) + ' needle ' + ('readable context ' + i + ' ').repeat(40)).join('\\n\\n');
let component, events = [], records = [], model;
const image = {status: 'ready', url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" rx="5" fill="#d8e7f5"/><path d="M8 69L30 37L48 55L66 22L80 69Z" fill="#7398b8"/></svg>')};
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
async function render({lines, snippetLimit = 2, mode, width = 280, panel = false, bulk = false}) {
  if (component) await unmount(component);
  events = [];
  const target = document.querySelector('#mount'); target.innerHTML = ''; target.style.width = width + 'px'; target.style.height = panel ? '640px' : 'auto';
  const snippets = await extractSearchPreviewSnippets(source, {limit: snippetLimit, idPrefix: 'browser', matcher: createSearchPreviewMatcher('needle')});
  const card = {path: 'test.md', title: 'Needle title', fileKind: 'markdown', file: {}, ctime: 1, mtime: 2, excerpt: '', previewHtml: '<p>Ordinary opening</p>', previewMode: 'text', hydrated: true, taskSummary: null,
    searchPreview: {query: 'needle', revision: 1, mtime: 2, previewLines: lines, snippetLimit, status: 'hits', snippets}};
  records = Array.from({length: panel ? 80 : 1}, (_, index) => ({...card, path: 'note-' + index + '.md', title: 'Needle ' + index}));
  if (!panel) component = mount(CardItem, {target, props: {card, searchQuery: 'needle', appearance: {previewLines: lines, searchPreviewSnippetCount: snippetLimit, cardCornerRadius: 'compact', cardImageMode: mode, cardImageFit: 'cover'},
    bulkMode: bulk, image: mode === 'right' ? image : undefined, onOpenNote: event => events.push(event), onBulkSelectCard: event => events.push(event)}});
  else {
    const epochs = {load: {value: 1}}, settings = {cardImageMode: mode};
    const cardsGroup = () => ({records, searchMatchCountsByPath: {}, selectedPath: null, loading: false, generation: 1, sequenceRevision: 1, hydrationRevision: 1, groupSegments: [], groupRevision: 0, extentCount: records.length});
    ${modelCode.replace('const model =', 'model =')}
    model.mutate(draft => {draft.search = {...draft.search, query: 'needle', committedQuery: 'needle'}; draft.appearance = {...draft.appearance, previewLines: lines, searchPreviewSnippetCount: snippetLimit}; draft.images = {byPath: mode === 'right' ? Object.fromEntries(records.map(card => [card.path, image])) : {}, requestVersion: 1};});
    component = mount(FolderCardPanel, {target, props: {panelModel: model, onOpenNote: event => events.push(event)}});
  }
  await tick(); await frame(); await frame();
}
window.searchPreviewBrowser = {render, events: () => events, resize: async width => {document.querySelector('#mount').style.width = width + 'px'; await frame(); await frame();}, patch: async () => {model.mutate(draft => {draft.cards = {...draft.cards, records: draft.cards.records.map(card => ({...card}))};}); await tick(); await frame();}};
`;
  await build({ stdin: {contents: entry, resolveDir: root, sourcefile: "search-preview-browser.ts", loader: "ts"}, outfile: path.join(temporary, "browser.js"),
    bundle: true, format: "iife", platform: "browser", target: "es2020", conditions: ["browser"],
    alias: {obsidian: path.join(root, "scripts/image-benchmark/obsidian.ts")}, plugins: [sveltePlugin({compilerOptions: {dev: false, css: "injected"}})] });
  const css = await readFile(path.join(root, "styles.css"), "utf8");
  await writeFile(path.join(temporary, "index.html"), `<!doctype html><meta charset="utf-8"><style>:root { --background-primary:#fff; --background-secondary:#eee; --text-normal:#222; --text-muted:#666; --text-faint:#999; --interactive-accent:#668cee; --text-highlight-bg:#fff0a5; --font-interface:Arial; --font-text:Arial; --font-monospace:monospace; } body {margin:20px; font:14px Arial;} button,input,select {font:inherit;} #mount {display:flex;} ${css} .folder-card-view { --fce-card-min-width:220px; --fce-wall-gap:12px; }</style><div id="mount" class="folder-card-view"></div><script src="/browser.js"></script>`);
  server = createServer(async (request, response) => {
    const file = request.url === "/browser.js" ? "browser.js" : "index.html";
    response.setHeader("Content-Type", file.endsWith("js") ? "text/javascript" : "text/html");
    response.end(await readFile(path.join(temporary, file)));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({headless: true, args: ["--no-sandbox"]});
  const page = await browser.newPage({viewport: {width: 1000, height: 850}});
  const errors = []; page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => !!window.searchPreviewBrowser);
  const measure = () => page.evaluate(() => [...document.querySelectorAll(".fce-search-snippet")].map(button => {
    const rect = button.getBoundingClientRect(), mark = button.querySelector("mark"), range = document.createRange(); range.selectNodeContents(mark);
    const hit = range.getClientRects()[0], text = button.querySelector(".fce-search-snippet-text");
    range.setStart(text, 0); range.setEndBefore(mark);
    const prefixWidth = range.getBoundingClientRect().width;
    const style = getComputedStyle(button), lineHeight = parseFloat(style.lineHeight);
    return {height: rect.height, width: rect.width, lineHeight, prefixWidth, firstHitVisible: hit.top >= rect.top - 1 && hit.bottom <= rect.bottom + 1 && hit.left >= rect.left - 1 && hit.right <= rect.right + 1,
      clamp: getComputedStyle(text).webkitLineClamp, location: button.getAttribute("aria-label")};
  }));
  const layouts = [];
  for (const mode of ["off", "right"]) for (const lines of [3,8]) for (const snippetLimit of [1,2,3,4,5]) {
    await page.evaluate(options => window.searchPreviewBrowser.render(options), {mode, lines, snippetLimit});
    const values = await measure(); assert.equal(values.length, snippetLimit);
    if (mode === "right") {
      const imageRect = await page.locator(".fce-card-image").boundingBox();
      assert(Math.abs(imageRect.width - 88) < 0.1); assert(Math.abs(imageRect.height - 88) < 0.1);
      assert(values[0].width < 200, "Image did not reserve body width");
    }
    for (const value of values) { assert(Math.abs(value.height - value.lineHeight * 2) < 1); assert.equal(value.clamp, "2"); assert(value.firstHitVisible); assert(value.prefixWidth <= value.width * 0.3 + 1); }
    const positions = await page.locator(".fce-search-snippet").evaluateAll(buttons => buttons.map(button => { const rect = button.getBoundingClientRect(); return {top: rect.top, bottom: rect.bottom}; }));
    positions.slice(1).forEach((rect, i) => assert(Math.abs(rect.top - positions[i].bottom) < 1, "Gap between snippets"));
    const excerpt = await page.locator(".fce-excerpt").boundingBox(); assert(excerpt.height >= values.reduce((sum, item) => sum + item.height, 0) - 1, "Half-snippet clipping");
    await page.locator(".fce-search-snippet").first().click();
    await page.locator(".fce-search-snippet").first().press("Enter");
    await page.locator(".fce-search-snippet").first().press("Space");
    assert.equal(await page.evaluate(() => window.searchPreviewBrowser.events().length), 3, "Native keyboard duplicate activation");
    await page.evaluate(() => window.searchPreviewBrowser.resize(220));
    const narrow = await measure(); assert(narrow.every(value => value.firstHitVisible && value.prefixWidth <= value.width * 0.3 + 1));
    layouts.push({mode, lines, snippetLimit, values, narrow});
  }
  await page.evaluate(() => window.searchPreviewBrowser.render({lines: 3, snippetLimit: 5, mode: "right"}));
  await mkdir(path.dirname(output), {recursive: true});
  await page.screenshot({path: output.replace(/\.json$/, ".png"), fullPage: true});
  await page.evaluate(() => window.searchPreviewBrowser.render({lines: 5, mode: "right", bulk: true}));
  await page.locator(".fce-search-snippet").first().click();
  await page.locator(".fce-search-snippet").first().press("Enter");
  await page.locator(".fce-search-snippet").first().press("Space");
  const selections = await page.evaluate(() => window.searchPreviewBrowser.events());
  assert.equal(selections.length, 3); assert(selections.every(event => event.snippetId === undefined && typeof event.shiftKey === "boolean"));
  await page.evaluate(() => window.searchPreviewBrowser.render({lines: 7, mode: "right", panel: true}));
  const scroller = page.locator(".fce-list");
  await scroller.evaluate(element => {element.scrollTop = 1200;}); await page.waitForTimeout(100);
  const before = await scroller.evaluate(element => element.scrollTop);
  await page.evaluate(() => window.searchPreviewBrowser.patch());
  const after = await scroller.evaluate(element => element.scrollTop); assert(Math.abs(after - before) < 1, "Preview patch moved scroll anchor");
  await page.evaluate(() => window.searchPreviewBrowser.resize(310)); await page.waitForTimeout(100);
  const resized = await scroller.evaluate(element => element.scrollTop); assert(resized > 0, "Resize lost scroll position");
  assert((await measure()).every(value => value.firstHitVisible));
  await mkdir(path.dirname(output), {recursive: true});
  await page.screenshot({path: output.replace(/\.json$/, "-scroll.png"), fullPage: true});
  assert.deepEqual(errors, []);
  await writeFile(output, JSON.stringify({chromium: browser.version(), layouts, bulkSelections: selections.length, scroll: {before, after, resized}, errors}, null, 2));
  console.log(JSON.stringify({output, layouts: layouts.length, scroll: {before, after, resized}, errors}));
} finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await rm(temporary, {recursive: true, force: true}); }
