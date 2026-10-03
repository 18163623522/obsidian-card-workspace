/** Deterministic before/after diagnostics, isolated from vaults and IndexedDB. */
import { build } from "esbuild";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputArg = process.argv.indexOf("--output");
const baselineArg = process.argv.indexOf("--baseline");
if (outputArg < 0 || !process.argv[outputArg + 1]) throw new Error("Pass --output <absolute report path>");
const output = resolve(process.argv[outputArg + 1]);
const baseline = baselineArg >= 0 ? process.argv[baselineArg + 1] : "8e4ceb5";
const revision = execFileSync("git", ["rev-parse", baseline], { cwd: root, encoding: "utf8" }).trim();
const temporary = mkdtempSync(join(tmpdir(), "card-workspace-preview-benchmark-"));
const baselineRoot = join(temporary, "baseline");
try {
  for (const file of ["src/search/markdown-search-text.ts", "src/view/controllers/HydrationController.ts"]) {
    const destination = join(baselineRoot, file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, execFileSync("git", ["show", `${revision}:${file}`], { cwd: root }));
  }
  const entry = `
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cpus } from 'node:os';
import MiniSearch from 'minisearch';
import { extractMarkdownSearchText as beforeText } from ${JSON.stringify(join(baselineRoot, "src/search/markdown-search-text.ts"))};
import { HydrationController as BeforeHydration } from ${JSON.stringify(join(baselineRoot, "src/view/controllers/HydrationController.ts"))};
import { HydrationController } from ${JSON.stringify(join(root, "src/view/controllers/HydrationController.ts"))};
import { createViewStateStore } from ${JSON.stringify(join(root, "src/view/view-state-store.ts"))};
import { createViewEpochs } from ${JSON.stringify(join(root, "src/view/view-epochs.ts"))};
import { createFolderScope } from ${JSON.stringify(join(root, "src/view/scope.ts"))};
import { DEFAULT_SETTINGS } from ${JSON.stringify(join(root, "src/settings.ts"))};
import { getUiStrings } from ${JSON.stringify(join(root, "src/i18n/index.ts"))};
import { prepareSearchableDocument } from ${JSON.stringify(join(root, "src/search/document-preparation.ts"))};
import { createMiniSearchOptions, MINISEARCH_SEARCH_OPTIONS } from ${JSON.stringify(join(root, "src/search/minisearch-options.ts"))};
import { buildMatchCountsByPath } from ${JSON.stringify(join(root, "src/search/match-counts.ts"))};
import { createSearchPreviewMatcher, extractSearchPreviewSnippets, resolveSearchSnippetLocation } from ${JSON.stringify(join(root, "src/search/search-preview.ts"))};
import { findSearchContextLocation } from ${JSON.stringify(join(root, "src/view/context-preview.ts"))};
const fixtures = Array.from({length: 36}, (_, i) => ({ path: 'fixture/' + i + '.md', title: 'Note ' + i,
  markdown: Array.from({length: 320}, (_, line) => 'context ' + i + ' line ' + line + ' ordinary prose').join('\\n')
    + '\\nfirst needle 中文命中\\nsecond needle\\nthird needle\\nfourth needle\\nfifth needle', mtime: 2, ctime: 1 }));
const query = 'need';
const documents = fixtures.map(prepareSearchableDocument);
for (let i = 0; i < fixtures.length; i++) assert.equal(beforeText(fixtures[i].markdown), documents[i].content);
const sourceByPath = new Map(fixtures.map(f => [f.path, f.markdown]));
const index = new MiniSearch(createMiniSearchOptions()); index.addAll(documents);
const beforeDocuments = fixtures.map(f => ({...prepareSearchableDocument(f), content: beforeText(f.markdown)}));
const beforeIndex = new MiniSearch(createMiniSearchOptions()); beforeIndex.addAll(beforeDocuments);
const beforeDocumentsByPath = new Map(beforeDocuments.map(d => [d.path, d]));
const documentsByPath = new Map(documents.map(d => [d.path, d]));
const time = async (task) => { const start = performance.now(); const value = await task(); return {ms: performance.now() - start, value}; };
const queryRun = (fields) => {
  const result = (fields ? index : beforeIndex).search(query, MINISEARCH_SEARCH_OPTIONS);
  const paths = result.map(r => r.path);
  const counts = buildMatchCountsByPath(query, paths, fields ? documentsByPath : beforeDocumentsByPath);
  const metadata = fields ? Object.fromEntries(result.map(r => [r.path, [...new Set(Object.values(r.match).flat())]])) : undefined;
  return {paths, counts, metadata};
};
const beforeQuery = await time(() => Array.from({length: 30}, () => queryRun(false)).at(-1));
const afterQuery = await time(() => Array.from({length: 30}, () => queryRun(true)).at(-1));
assert.deepEqual(afterQuery.value.paths, beforeQuery.value.paths); assert.deepEqual(afterQuery.value.counts, beforeQuery.value.counts);
async function hydrationRun(Controller) {
  let previousTick = performance.now(), longestEventLoopGapMs = 0;
  const probe = setInterval(() => {const now = performance.now(); longestEventLoopGapMs = Math.max(longestEventLoopGapMs, now - previousTick); previousTick = now;}, 1);
  let reads = 0, active = 0, peakReads = 0;
  const store = createViewStateStore(createFolderScope('', true)); const epochs = createViewEpochs();
  const records = documents.map(d => ({...d, file: {path: d.path, stat: {mtime: 2}}, fileKind: 'markdown', previewHtml: '', previewMode: 'empty', hydrated: false, taskSummary: null}));
  store.replaceBaseCards(records); store.replaceVisibleCards(records);
  const context = { store, epochs, getSettings: () => DEFAULT_SETTINGS, getUiStrings: () => getUiStrings('en'), getViewWindow: () => globalThis, publishGroups: () => {},
    getApp: () => ({vault: {cachedRead: async (file) => {reads++; active++; peakReads = Math.max(peakReads, active); await Promise.resolve(); active--; return sourceByPath.get(file.path);}}, metadataCache: {getFileCache: () => null}}) };
  const controller = new Controller({context, isLoading: () => false, getCommittedQuery: () => query});
  const request = (start, end) => ({generation: epochs.load.value, hydrationRevision: store.getHydrationRevision(), start, end, paths: records.slice(start, end).map(c => c.path)});
  const first = await time(() => controller.hydrateViewport(request(0, 6)));
  const cached = await time(() => controller.hydrateViewport(request(0, 6)));
  const readsAfterCache = reads;
  const scroll = await time(() => controller.hydrateViewport(request(6, 12)));
  assert.equal(readsAfterCache, 6); assert.equal(reads, 12); assert.ok(peakReads <= 5);
  const location = store.getBaseCard(records[0].path).searchPreview?.snippets[0].location;
  if (location) assert.ok(store.getBaseCard(records[0].path).searchPreview.snippets.length <= Math.floor(DEFAULT_SETTINGS.previewLines / 2));
  controller.dispose();
  await new Promise(resolve => setTimeout(resolve, 0));
  clearInterval(probe);
  return {longestEventLoopGapMs, firstScreenMs: first.ms, cacheHitMs: cached.ms, scrollSupplementMs: scroll.ms, reads, peakReads, location};
}
const before = await hydrationRun(BeforeHydration);
const after = await hydrationRun(HydrationController);
assert.ok(after.location);
const beforeClick = await time(() => findSearchContextLocation(fixtures[0].markdown, query));
const afterClick = await time(() => resolveSearchSnippetLocation(fixtures[0].markdown, after.location));
assert.equal(afterClick.value.from.line, beforeClick.value.line);
const extraction = [];
for (const [name, markdown] of [
 ['normal', fixtures[0].markdown],
 ['long-line', 'longword'.repeat(60000) + ' needle'],
 ['malformed-wiki-line', '['.repeat(480000) + '#|alias]] needle'],
 ['term-budget', 'word '.repeat(49998) + 'needle'],
 ['han-run', '中'.repeat(100000) + '中文'],
 ['fenced-separators', '\x60\x60\x60js\\n' + 'long_word '.repeat(49000) + 'needle\\n\x60\x60\x60'],
]) {
  let diagnostics;
  const snippets = await extractSearchPreviewSnippets(markdown, {limit: Math.floor(DEFAULT_SETTINGS.previewLines / 2), idPrefix: name, matcher: createSearchPreviewMatcher(name === 'han-run' ? '中' : query), onDiagnostics: d => {diagnostics = d;}});
  extraction.push({name, sourceChars: markdown.length, snippets: snippets.length, ...diagnostics});
}
const report = {schemaVersion: 1, fixture: '36 deterministic notes; 320 ordinary lines and five hit lines', baselineCommit: ${JSON.stringify(revision)},
 environment: {node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model},
 before: {queryMsPerRun: beforeQuery.ms / 30, ...before, location: undefined, clickResolverMs: beforeClick.ms},
 after: {queryMsPerRun: afterQuery.ms / 30, ...after, location: undefined, clickResolverMs: afterClick.ms}, extraction,
 correctness: {indexTextCompatible: true, rankingCompatible: true, matchCountsCompatible: true, peakReadsWithinFive: after.peakReads <= 5},
 scope: 'Node diagnostics using production queue/cache and resolver; excludes Obsidian DOM, disk IO, and editor opening'};
mkdirSync(dirname(${JSON.stringify(output)}), {recursive: true}); writeFileSync(${JSON.stringify(output)}, JSON.stringify(report, null, 2) + '\\n');
console.log(JSON.stringify(report, null, 2));
`;
  const stub = join(temporary, "obsidian-stub.ts");
  writeFileSync(stub, `export * from ${JSON.stringify(join(root, "src/__mocks__/obsidian.ts"))}; export class TFile {} export const resolveSubpath = () => null; export const getLanguage = () => "en";`);
  const bundle = join(temporary, "benchmark.mjs");
  await build({
    stdin: { contents: entry, resolveDir: root, sourcefile: "search-preview-benchmark.ts", loader: "ts" },
    bundle: true, format: "esm", platform: "node", target: "node18", outfile: bundle, logLevel: "warning",
    alias: { obsidian: stub },
    plugins: [{ name: "baseline-relative-dependencies", setup(plugin) {
      plugin.onResolve({ filter: /^\./ }, (args) => {
        if (!args.importer.startsWith(baselineRoot)) return;
        const candidate = resolve(dirname(args.importer), args.path);
        if (existsSync(candidate + ".ts")) return;
        const current = candidate.replace(baselineRoot, root);
        for (const path of [current + ".ts", join(current, "index.ts")]) if (existsSync(path)) return { path };
      });
    } }],
  });
  const run = spawnSync(process.execPath, ["--import", join(root, "scripts/ensure-main-window.mjs"), bundle], { stdio: "inherit" });
  if (run.error) throw run.error;
  process.exitCode = run.status ?? 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
