# Obsidian compatibility verification for 1.3.6

Minimum supported Obsidian: **1.11.4**. Settings and index persistence formats are unchanged. The existing 1.3.5 → 1.13.0 release mapping is preserved; 1.3.6 adds a 1.11.4 mapping.

## Runtime behavior

- Settings use one shared definition list. Obsidian 1.13+ renders it declaratively and indexes it for settings search. Older hosts render the same groups, dropdowns, toggles, sliders, values, ranges, and conditional visibility through `display()`.
- Plugin confirmations use `src/view/modals/compat-modal.ts`. Native confirmation dialogs remain in use when exported; otherwise the adapter supplies an asynchronous footer on `Modal` / `ButtonComponent`.
- Form submission updates buttons without rebuilding the body. Repeated submissions are guarded, and closed/reopened dialogs discard earlier submission results.
- Preview groups mount custom content through public `Setting.settingEl`, with no `SettingGroup.listEl` dependency.
- Single file/folder deletion awaits `fileManager.promptForDeletion()` and lets the host perform deletion. Folder fallback checks actual deletion, rename/replacement, the current scope, and pending source selections. Batch deletion keeps plugin confirmation and preference-aware helpers.

The settings dual entry points follow the [official migration guide](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Guides/Migrate%20to%20declarative%20settings.md).

## Automated checks

Run the normal CI chain and release validation:

```bash
npm run lint && npm run check && npm run check:svelte && npm run build && npm test
npm run release:check -- "1.3.6"
```

Additional regressions cover both confirmation implementations, missing confirmation exports and `refreshDomState`, preview groups without `listEl`, English/Chinese settings parity, saved values and invalid values, duplicate submission, false/error retries, cancellation, IME Enter, body/footer identity, stale close/reopen results, and void/boolean host deletion results with actual mocked vault changes. Folder tests include root protection, replacement/rename, unrelated/box/links scopes, and a selection that has started but has not committed.

Result: all checks passed; 137 test files, 2669 tests passed, 1 skipped. The skip is the adapter-specific duplicate-click test on the native host; the legacy adapter and both form implementations are tested. Lint reports warnings and zero errors; TypeScript and Svelte checks report zero errors. The production build passes its externals/sourcemap policy check, and release validation confirms 1.3.6 / 1.11.4.

## Desktop verification

The reusable harness creates its own vault and user profile and copies the built plugin there:

```bash
node scripts/run-compatibility-obsidian.mjs \
  --executable /absolute/path/to/obsidian \
  --version 1.11.4 \
  --output /absolute/path/to/report-1.11.4.json
```

Requires Linux, Xvfb, and the installed Playwright dependency. It leaves the generated vault/profile and writes a JSON report plus a UI screenshot for inspection. It never opens or modifies an existing user vault.

The checked clients use the official [Obsidian release resources](https://github.com/obsidianmd/obsidian-releases/releases). The launcher is 1.11.4; 1.12.7 and 1.13.7 use their official updated `obsidian.asar` resources on that launcher. The harness asserts the application's reported API version on every launch, including after restart.

| Verification | 1.11.4 | 1.12.7 | 1.13.7 |
| --- | --- | --- | --- |
| Plugin import/enable and folder restore after process restart | Pass | Pass | Pass |
| Shared settings, image fit visibility, saved values after restart | Pass | Pass | Pass |
| Native settings search | Unavailable in host | Unavailable in host | Pass |
| Confirmation renderer | Compatible | Compatible | Native |
| All form dialogs render; Escape closes without submitting | Pass | Pass | Pass |
| Box creation submits; box configuration and empty groups render | Pass | Pass | Pass |
| Add-to-box and delete-box cancellation; bulk confirmation | Pass | Pass | Pass |
| Merge preview and scrolling body/footer layout | Pass | Pass | Pass |
| Long box dialog: pinned footer and scroll position after repaint | Pass | Pass | Pass |
| Indexed search, tag filter, thumbnail generation | Pass | Pass | Pass |
| Synthetic card payload inserts into a real Markdown editor | Pass | Pass | Pass |
| File/folder deletion: local/system/permanent × confirmation on/off | Pass | Pass | Pass |
| Cancellation keeps files/folders; root deletion is refused | Pass | Pass | Pass |

Each deletion scenario uses disposable fixtures and asserts that the target is removed and the host's deletion method runs exactly once. Folder scenarios additionally assert fallback to vault root. Fixtures finish host metadata processing before deletion.

Validation date: 2026-10-05. Desktop tests run under Xvfb with software rendering. Physical Chinese IME behavior and a physical pointer drag remain manual checks; composition Enter is covered by automated form tests, and editor insertion uses the real editor with a synthetic drag payload.

Release metadata and build artifacts are prepared locally. No release tag or uploaded release is part of this verification.
