// Uses only generated files in an isolated vault/profile. Never point this at a real vault.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const args = process.argv.slice(2);
const option = (key) => args[args.indexOf(key) + 1];
const executable = option("--executable"), version = option("--version"), output = option("--output");
if (!args.includes("--executable") || !args.includes("--version") || !args.includes("--output")
  || !path.isAbsolute(executable) || !path.isAbsolute(output)) {
  throw new Error("Pass --executable <absolute Linux binary> --version <expected version> --output <absolute JSON path>");
}
const temporary = await mkdtemp(path.join(tmpdir(), "card-workspace-compat-"));
const vault = path.join(temporary, "vault"), profile = path.join(temporary, "profile");
const pluginDirectory = path.join(vault, ".obsidian/plugins/card-workspace");
const report = { version, vault, profile, phases: [], errors: [], limitations: ["Xvfb/software rendering on Linux; no physical IME or pointer drag interaction."] };
let processHandle, browser, page;
const phase = (name, detail = {}) => { report.phases.push({ name, ...detail }); console.log(`${version}: ${name}`); };

async function launch(expectRestore = false) {
  const port = 9600 + Math.floor(Math.random() * 300);
  processHandle = spawn("xvfb-run", ["-a", executable, `--user-data-dir=${profile}`, "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${port}`], { detached: true, stdio: "ignore" });
  for (let i = 0; i < 150; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  if (!browser) throw new Error("Obsidian failed to start");
  page = browser.contexts()[0].pages()[0];
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.waitForFunction(() => !!window.app?.plugins?.plugins?.["card-workspace"] || document.body.innerText.includes("Trust author and enable plugins"));
  const trust = page.getByText("Trust author and enable plugins", { exact: true });
  if (await trust.isVisible()) await trust.click();
  await page.waitForFunction(() => !!window.app?.plugins?.plugins?.["card-workspace"]);
  if (expectRestore) {
    await page.waitForFunction(() => app.workspace.getLeavesOfType("folder-card-view")[0]?.view.cardScope?.path === "notes");
  }
  await page.evaluate(async () => {
    window.compatPlugin = app.plugins.plugins["card-workspace"];
    await compatPlugin.activateAndEnsureScope(true);
    window.compatView = app.workspace.getLeavesOfType("folder-card-view")[0].view;
    const original = app.fileManager.trashFile.bind(app.fileManager);
    window.compatTrashCalls = [];
    app.fileManager.trashFile = async (file) => { compatTrashCalls.push(file.path); await original(file); };
  });
  assert.equal(await page.evaluate(() => compatHostApi.apiVersion), version);
  await page.waitForSelector(".fce-card");
}

async function stop() {
  await browser?.close(); browser = undefined;
  if (processHandle) { try { process.kill(-processHandle.pid, "SIGTERM"); } catch {} }
  processHandle = undefined;
}

async function closeModal() {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.compatLastModal?.contentEl.isConnected);
}

try {
  await mkdir(pluginDirectory, { recursive: true }); await mkdir(profile);
  await mkdir(path.join(vault, "notes"));
  await writeFile(path.join(profile, "obsidian.json"), JSON.stringify({ updateDisabled: true, vaults: { compatibility: { path: vault, ts: Date.now(), open: true } } }));
  await writeFile(path.join(vault, ".obsidian/community-plugins.json"), '["card-workspace"]');
  await writeFile(path.join(vault, "notes/A.md"), "---\ntags: [test]\nstatus: draft\n---\n# Heading\n\nSearchable needle.\n\n![[pixel.png]]\n");
  await writeFile(path.join(vault, "notes/B.md"), "# Second\n\nOther body #other\n");
  await writeFile(path.join(vault, "Target.md"), "Drop target\n");
  await writeFile(path.join(vault, "pixel.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"));
  for (const file of ["manifest.json", "styles.css"]) await copyFile(file, path.join(pluginDirectory, file));
  const manifest = JSON.parse(await readFile(path.join(pluginDirectory, "manifest.json"), "utf8"));
  // Supports verifying a candidate before release metadata has been prepared.
  manifest.minAppVersion = "1.11.4";
  await writeFile(path.join(pluginDirectory, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(pluginDirectory, "main.js"), await readFile("main.js", "utf8") + `
;window.compatHostApi = require("obsidian");
{ const open = compatHostApi.Modal.prototype.open;
  compatHostApi.Modal.prototype.open = function() { window.compatLastModal = this; return open.call(this); };
}
`);
  await launch();
  const native = await page.evaluate(() => typeof compatHostApi.ConfirmationModal === "function");
  assert.equal(native, version.startsWith("1.13."));
  phase("enabled", { native });

  await page.evaluate(() => { app.setting.open(); app.setting.openTabById("card-workspace"); });
  // Newer desktop hosts open settings in a separate window.
  await page.waitForTimeout(500);
  const settingsPage = browser.contexts()[0].pages().at(-1);
  await settingsPage.waitForSelector(".vertical-tab-content .setting-item");
  assert.equal(await page.evaluate(() => app.setting.pluginTabs.find((tab) => tab.id === "card-workspace").getSettingDefinitions().flatMap((group) => group.items).length), 12);
  const content = settingsPage.locator(".vertical-tab-content").last();
  const fitRow = content.locator(".setting-item").filter({ has: settingsPage.getByText("Image fit", { exact: true }) });
  const modeRow = content.locator(".setting-item").filter({ has: settingsPage.getByText("Card images", { exact: true }) });
  await modeRow.locator("select:not([aria-hidden=true])").selectOption("off");
  await fitRow.waitFor({ state: "hidden" });
  await modeRow.locator("select:not([aria-hidden=true])").selectOption("right");
  await fitRow.waitFor({ state: "visible" });
  phase("settings-shared-definitions-and-image-visibility", { searchInputCount: await settingsPage.locator(".vertical-tab-header input").count(), popout: settingsPage !== page });
  if (native) {
    const search = settingsPage.locator(".vertical-tab-header input");
    assert.equal(await search.count(), 1);
    await search.fill("Card images");
    await settingsPage.getByText("Card images", { exact: true }).first().waitFor();
    await search.fill("");
    phase("native-settings-search");
  }
  await page.evaluate(() => { app.setting.close(); });

  await page.evaluate(async () => {
    await compatView.modules.scopeController.moveScopeToFolder("notes");
    compatView.modules.bulk.toggleBulkMode();
    compatView.modules.bulk.setSelectedPaths(new Set(["notes/A.md", "notes/B.md"]));
  });
  const openers = [
    ["rename-file", () => compatView.modules.fileActions.renameCardFile("notes/A.md")],
    ["create-folder", () => compatView.modules.folderActions.openCreateChildFolderModal("notes")],
    ["add-tag", () => compatView.modules.tagActions.openSingleTagModal("notes/A.md", "add")],
    ["remove-tags", () => compatView.modules.tagActions.openSingleTagModal("notes/A.md", "remove")],
    ["rename-tag", () => compatView.modules.tagManageActions.openRenameTagModal("test")],
    ["create-box", () => compatView.modules.boxActions.openCreateBoxModal()],
    ["property-picker", () => compatView.modules.propertyActions.chooseVisibleProperties()],
    ["merge", () => compatView.modules.mergeActions.bulkMergeSelected()],
  ];
  for (const [name, open] of openers) {
    await page.evaluate(open);
    await page.waitForSelector(".modal.fce-modal");
    assert.equal(await page.evaluate(() => compatLastModal.modalEl.classList.contains("fce-compat-modal")), !native);
    if (name === "merge") {
      await page.waitForFunction(() => document.querySelector(".fce-modal-preview")?.textContent.includes("Searchable needle"));
      const layout = await page.evaluate(() => {
        const modal = compatLastModal, footer = modal.modalEl.querySelector(".fce-compat-modal__footer") ?? modal.buttonContainerEl;
        return { bodyOverflow: getComputedStyle(modal.contentEl).overflowY, footerInside: footer.getBoundingClientRect().bottom <= modal.modalEl.getBoundingClientRect().bottom };
      });
      assert(layout.footerInside); phase("merge-preview-and-scroll-layout", layout);
    }
    await closeModal();
    phase(`modal-${name}-escape`);
  }

  // Submit through the real footer, then exercise compact configuration and box confirmations.
  await page.evaluate(() => { compatView.modules.boxActions.openCreateBoxModal(); });
  await page.locator(".modal.fce-modal input").fill("Compatibility box");
  await page.locator(".modal.fce-modal button.mod-cta").click();
  await page.waitForFunction(() => !compatLastModal.contentEl.isConnected && compatPlugin.getSettings().boxes.length === 1);
  await page.evaluate(() => { compatView.modules.boxActions.openBoxConfig(compatPlugin.getSettings().boxes[0].id); });
  await page.waitForSelector(".modal .setting-item"); await closeModal(); phase("box-config-and-empty-groups");
  // Seed only the disposable dialog draft; cancellation leaves the saved box unchanged.
  await page.evaluate(() => {
    compatLastModal.draft.manualPaths = Array.from({ length: 80 }, (_, index) => `missing/Test ${index}.md`);
    compatLastModal.open();
  });
  const longLayout = await page.evaluate(() => {
    const modal = compatLastModal, body = modal.contentEl;
    const footer = modal.modalEl.querySelector(".fce-compat-modal__footer") ?? modal.buttonContainerEl;
    const footerTop = footer.getBoundingClientRect().top;
    body.scrollTop = 200;
    modal.render();
    return { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: body.scrollTop,
      footerShift: footer.getBoundingClientRect().top - footerTop, footerInBody: body.contains(footer) };
  });
  assert(longLayout.scrollHeight > longLayout.clientHeight);
  assert.equal(longLayout.scrollTop, 200);
  assert.equal(longLayout.footerInBody, false);
  assert(Math.abs(longLayout.footerShift) < 1);
  await closeModal(); phase("long-dialog-pinned-footer-and-repaint-scroll", longLayout);
  await page.evaluate(async () => {
    await compatView.modules.scopeController.moveScopeToFolder("notes");
    compatView.modules.bulk.setSelectedPaths(new Set(["notes/A.md", "notes/B.md"]));
    compatView.modules.boxActions.bulkAddToBox();
  });
  await page.waitForSelector(".modal"); await closeModal(); phase("bulk-add-to-box-cancel");
  await page.evaluate(() => { compatView.modules.boxActions.openDeleteBoxConfirm(compatPlugin.getSettings().boxes[0].id); });
  await page.waitForSelector(".modal");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.evaluate(() => compatPlugin.getSettings().boxes.length), 1); phase("delete-box-cancel");
  await page.evaluate(() => {
    window.compatDecision = null;
    compatView.modules.mergeActions.requestDestructiveConfirmation({ title: "Bulk confirmation", message: "Testing", confirmButtonText: "Confirm" }).then((value) => { compatDecision = value; });
  });
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.waitForFunction(() => compatDecision === true); phase("bulk-confirmation");

  await page.waitForFunction(() => compatPlugin.getSearchSnapshot()?.status === "ready");
  const matches = await page.evaluate(async () => {
    const service = compatPlugin.getSearchService();
    return await service.query({ query: "needle", candidatePaths: ["notes/A.md", "notes/B.md"] });
  });
  assert(JSON.stringify(matches).includes("notes/A.md")); phase("indexed-search");
  await page.evaluate(async () => { await compatView.modules.tagActions.applyTagFilter(["test"]); });
  await page.waitForFunction(() => compatView.visibleCards.length === 1);
  await page.evaluate(async () => { await compatView.modules.tagActions.applyTagFilter([]); });
  await page.waitForFunction(() => compatView.visibleCards.length === 2); phase("tag-filter");
  await page.waitForSelector(".fce-card-image img"); phase("image-preview");
  const inserted = await page.evaluate(async () => {
    await compatPlugin.saveSettings({ dragInsertAction: "wiki" });
    const leaf = app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: "markdown", state: { file: "Target.md", mode: "source" }, active: true });
    const view = leaf.view, transfer = new DataTransfer();
    transfer.setData("application/x-card-workspace-note", JSON.stringify({ path: "notes/A.md", title: "A" }));
    const event = new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true });
    await compatPlugin.editorDropController.handleCardEditorDrop(event, view.editor, view);
    return view.editor.getValue();
  });
  assert(inserted.includes("[[A]]")); phase("editor-drop-insert");

  for (const trashOption of ["local", "none", "system"]) {
    for (const promptDelete of [false, true]) {
      for (const kind of ["file", "folder"]) {
        const target = `delete-${kind}-${trashOption}-${promptDelete}${kind === "file" ? ".md" : ""}`;
        await page.evaluate(async ({ target, kind, trashOption, promptDelete }) => {
          app.vault.setConfig("trashOption", trashOption); app.vault.setConfig("promptDelete", promptDelete);
          if (kind === "file") await app.vault.create(target, "Disposable test file");
          else { await app.vault.createFolder(target); await app.vault.create(`${target}/child.md`, "Disposable child"); await compatView.modules.scopeController.moveScopeToFolder(target); }
        }, { target, kind, trashOption, promptDelete });
        // Let the host finish indexing newly created fixtures before immediate deletion.
        await page.waitForFunction(({ target, kind }) => {
          const file = app.vault.getFileByPath(kind === "file" ? target : `${target}/child.md`);
          return file && app.metadataCache.getFileCache(file) !== null;
        }, { target, kind });
        await page.evaluate(({ target, kind }) => {
          window.compatDeleteError = null;
          window.compatDeleteDone = false;
          const action = kind === "file" ? compatView.modules.fileActions.deleteCardFile(target) : compatView.modules.folderActions.deleteFolder(target);
          action.catch((error) => { compatDeleteError = String(error); }).finally(() => { compatDeleteDone = true; });
        }, { target, kind });
        if (promptDelete) {
          await page.waitForSelector(".modal");
          await page.locator(".modal button.mod-warning, .modal button.mod-destructive").last().click();
        }
        await page.waitForFunction(() => compatDeleteDone);
        const result = await page.evaluate(({ target }) => ({ exists: !!app.vault.getAbstractFileByPath(target), calls: compatTrashCalls.filter((item) => item === target).length, scope: compatView.cardScope }), { target });
        assert.equal(result.exists, false, `${target} was not deleted`);
        assert.equal(result.calls, 1, `${target} deletion count`);
        if (kind === "folder") assert.equal(result.scope.path, "");
        phase("host-delete", { trashOption, promptDelete, kind, ...result });
      }
    }
  }
  for (const kind of ["file", "folder"]) {
    const target = kind === "file" ? "cancel-delete.md" : "cancel-delete-folder";
    await page.evaluate(async ({ kind, target }) => {
      app.vault.setConfig("promptDelete", true);
      if (kind === "file") await app.vault.create(target, "Keep me");
      else await app.vault.createFolder(target);
      window.compatDeleteDone = false;
      const action = kind === "file" ? compatView.modules.fileActions.deleteCardFile(target) : compatView.modules.folderActions.deleteFolder(target);
      action.finally(() => { compatDeleteDone = true; });
    }, { kind, target });
    await page.waitForSelector(".modal");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForFunction(() => compatDeleteDone);
    assert(await page.evaluate((target) => !!app.vault.getAbstractFileByPath(target), target));
    assert.equal(await page.evaluate((target) => compatTrashCalls.filter((item) => item === target).length, target), 0);
    phase("host-delete-cancel", { kind });
  }
  await page.evaluate(async () => { await compatView.modules.folderActions.deleteFolder("/"); });
  assert.equal(await page.evaluate(() => compatTrashCalls.filter((item) => item === "/" || item === "").length), 0);
  phase("vault-root-protected");

  await page.evaluate(async () => {
    await compatView.modules.scopeController.moveScopeToFolder("notes");
    await compatPlugin.saveSettings({ previewLines: 8, cardImageFit: "contain" });
    await app.workspace.saveLayout();
  });
  await page.screenshot({ path: output.replace(/\.json$/, "-ui.png") });
  await stop(); await launch(true);
  assert.equal(await page.evaluate(() => compatPlugin.getSettings().previewLines), 8);
  assert.equal(await page.evaluate(() => compatPlugin.getSettings().cardImageFit), "contain");
  assert.equal(await page.evaluate(() => compatView.cardScope.path), "notes"); phase("restart-settings-and-folder-restore");
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  if (page && !page.isClosed()) {
    report.diagnostics = await page.evaluate(() => ({
      text: document.body.innerText,
      cards: [...document.querySelectorAll(".fce-card")].map((card) => card.outerHTML),
      thumbnails: window.compatPlugin?.thumbnails?.service.getDiagnostics(),
    })).catch(() => null);
  }
  report.passed = false; report.failure = String(error); throw error;
} finally {
  await stop();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
}
