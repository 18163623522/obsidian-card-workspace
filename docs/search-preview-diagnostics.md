# Search preview verification

Markdown search results render readable hit contexts in source order. Each snippet reserves two display lines, so preview settings of 3, 4, 5, 6, 7 and 8 lines allow 1, 2, 2, 3, 3 and 4 snippets. Overlapping contexts merge; short hit lines can include following prose, stopping at blank lines and new Markdown block boundaries. Each snippet has a 200 UTF-16 character budget and at most 60 preceding characters. Width changes crop only presentation text, keeping the first highlight visible and its source location unchanged.

Title-only matches retain the ordinary opening preview. One runtime LRU entry per file holds that preview and the current query context. Reads and cooperative extraction use the existing five-task queue; search results publish before snippet hydration finishes. Query drafts, preview settings and file events invalidate stale work, including file mutations with unchanged timestamps.

Clicking or activating a snippet selects and scrolls its first merged source highlight in editing mode, or locates the source line in reading mode. Opening keeps the resulting mode. Position validation accepts a moved hit only when its text and bounded surrounding context match uniquely. Automatic links following may replace the original card stream without canceling accepted positioning; manual source selection, input, pane changes, newer opens, view closure and query/settings/file changes cancel it. Snippet location is independent of the ordinary link-card positioning setting.

Run the full validation chain:

```sh
npm run lint && npm run check && npm run check:svelte && npm run build && npm test
```

Run the isolated Node diagnostic against the implementation baseline:

```sh
node scripts/run-search-preview-benchmark.mjs --baseline 8e4ceb5 --output /absolute/path/search-preview.json
```

The runner freezes baseline cleaning and hydration from Git and compares fixed synthetic notes using production index preparation, tokenization, queue/cache and location resolution. It asserts index-text, ranking and match-count compatibility and the five-reader cap. It reports query, first-screen hydration, cache, scroll supplementation, location resolution and cooperative extraction timings. These timings are diagnostic; there are no new CI speed thresholds. It does not use a real vault or IndexedDB, and excludes Obsidian disk latency, editor opening and DOM layout. Baseline opening previews and candidate hit contexts perform different work, so their hydration timings are not equivalent measures of search-result publication latency.

Run real Chromium layout and interaction checks:

```sh
npx playwright install chromium
node scripts/run-search-preview-browser.mjs --output /absolute/path/search-preview-browser.json
```

This mounts production cards and the production virtualized panel. It checks all six line budgets in 280px cards, with and without an 88px right image; two-line heights and clamps; contiguous snippet rows; first-highlight and prefix visibility; resizing to 220px; one activation per native mouse/Enter/Space gesture; bulk selection; and scroll anchoring during preview publication and resize. Its images are local fixtures, without external assets or a real vault.

Saved verification artifacts:

- [Node diagnostic](../diagnostics/search-preview-20261003.json): baseline `8e4ceb5`, compatibility assertions passed, peak reads 5.
- [Chromium report](../diagnostics/search-preview-browser-20261003.json): 12 layout combinations passed, three bulk activations, no browser errors; scroll position stayed at 1200px through publication and resize.
- [280px card with right image](../diagnostics/search-preview-browser-20261003.png) and [scrolled virtualized panel](../diagnostics/search-preview-browser-20261003-scroll.png).

The integration suite also exercises production card opening, the `file-open` selection fanout, automatic links following and complete card replacement before first positioning. Editing/reading positioning and the 400ms correction survive replacement; cancellation cases cover active source selection, input, newer opens, closure, and query/settings/file changes. These are host-contract tests using Obsidian mocks, rather than a claim of testing every behavior in a live desktop vault.
