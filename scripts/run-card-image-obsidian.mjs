// Runs only in an isolated generated vault and profile; requires a Linux Obsidian executable and Xvfb.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { createFixtures } from "./image-benchmark/fixtures.mjs";
const args = process.argv.slice(2), option = (key) => args[args.indexOf(key) + 1];
const executable = args.includes("--executable") ? option("--executable") : null;
const output = args.includes("--output") ? option("--output") : null;
if (!executable || !output || !path.isAbsolute(executable) || !path.isAbsolute(output)) throw new Error("Pass --executable <absolute Linux Obsidian binary> --output <absolute report path>");
const temporary = await mkdtemp(path.join(tmpdir(), "card-image-desktop-")), vault = path.join(temporary, "vault"), profile = path.join(temporary, "profile");
const pluginDirectory = path.join(vault, ".obsidian/plugins/card-workspace");
let processHandle, browser;
const report = { schemaVersion: 1, platform: process.platform, phases: [], limitations: ["Desktop window runs under Xvfb with software rendering.", "Renderer RSS includes decoder buffers, UI and browser caches; internal decoder allocation is not separately exposed."] };
try {
  await mkdir(pluginDirectory, { recursive: true }); await mkdir(profile);
  await createFixtures(path.join(vault, "attachments"));
  for (let i = 0; i < 48; i++) {
    const image = i % 4 === 0 ? "8k" : i % 4 === 1 ? "long" : "regular";
    await writeFile(path.join(vault, `Note ${String(i).padStart(2, "0")}.md`), `# Body heading\n\nText preview remains available.\nA searchable needle.\nThird line.\nFourth line.\nFifth line.\n\n${i % 4 === 3 ? "No image in this note." : i % 2 ? `![alt](attachments/${image}.png)` : `![[attachments/${image}.png]]`}\n`);
  }
  await writeFile(path.join(profile, "obsidian.json"), JSON.stringify({ vaults: { imageTest: { path: vault, ts: Date.now(), open: true } } }));
  await writeFile(path.join(vault, ".obsidian/community-plugins.json"), '["card-workspace"]');
  for (const file of ["manifest.json", "styles.css"]) await copyFile(file, path.join(pluginDirectory, file));
  const bundle = await readFile("main.js", "utf8");
  // Instrument only the copied test bundle, before the plugin starts any work.
  await writeFile(path.join(pluginDirectory, "main.js"), bundle + `\n;{ const P=module.exports.default||module.exports; const onload=P.prototype.onload; P.prototype.onload=function(){
    window.imageAcceptance={reads:0,active:0,peak:0,urls:new Set(),tasks:[]}; const m=window.imageAcceptance;
    const get=P.prototype.getThumbnailService;
    if(!P.__acceptanceWrapped){P.__acceptanceWrapped=true;P.prototype.getThumbnailService=function(){const runtime=get.call(this);if(runtime&&!runtime.service.__acceptanceWrapped){runtime.service.__acceptanceWrapped=true;const read=runtime.service.deps.read;runtime.service.deps.read=async(f)=>{m.reads++;m.peak=Math.max(m.peak,++m.active);try{return await read(f);}finally{m.active--;}};}return runtime;};}
    const make=URL.createObjectURL.bind(URL),drop=URL.revokeObjectURL.bind(URL);URL.createObjectURL=(blob)=>{const url=make(blob);m.urls.add(url);return url;};URL.revokeObjectURL=(url)=>{m.urls.delete(url);drop(url);};
    new PerformanceObserver(list=>{for(const e of list.getEntries())m.tasks.push(e.duration);}).observe({type:'longtask'});
    return onload.call(this);}; }\n`);
  const port = 9600 + Math.floor(Math.random() * 200);
  processHandle = spawn("xvfb-run", ["-a", executable, `--user-data-dir=${profile}`, "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${port}`], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; processHandle.stdout.on("data", (data) => { log += data; }); processHandle.stderr.on("data", (data) => { log += data; });
  for (let i = 0; i < 150; i++) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 200)); } }
  if (!browser) throw new Error(`Obsidian did not start: ${log}`);
  const page = browser.contexts()[0].pages()[0]; await page.waitForLoadState();
  await page.waitForFunction(() => !!window.app?.plugins.plugins["card-workspace"] || document.body.innerText.includes("Trust author and enable plugins"));
  const trust = page.getByText("Trust author and enable plugins", { exact: true }); if (await trust.isVisible()) await trust.click();
  await page.waitForFunction(() => !!window.app?.plugins.plugins["card-workspace"]);
  report.obsidian = await page.title(); report.chromium = browser.version();
  await page.evaluate(async () => { const plugin = app.plugins.plugins["card-workspace"]; await plugin.activateAndEnsureScope(true); await plugin.saveSettings({ sort: { field: "name", direction: "asc" }, navPaneCollapsed: true }); });
  const snapshot = () => page.evaluate(() => {
    const plugin = app.plugins.plugins["card-workspace"], m = window.imageAcceptance;
    return { reads: m.reads, peak: m.peak, urls: m.urls.size, service: plugin.thumbnails?.service.getDiagnostics() ?? null,
      images: [...document.querySelectorAll(".fce-card-image img")].map((image) => ({ width: image.naturalWidth, height: image.naturalHeight, complete: image.complete })),
      regions: [...document.querySelectorAll(".fce-card-image")].map((image) => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height })),
      longTasks: [...m.tasks] };
  });
  const off = await snapshot(); await page.evaluate(() => window.imageAcceptance.urls.clear()); assert.equal(off.reads, 0); assert.equal(off.service, null); report.phases.push({ phase: "default-off", ...off });
  const rootCDP = await browser.newBrowserCDPSession();
  const processInfo = await rootCDP.send("SystemInfo.getProcessInfo");
  const renderers = processInfo.processInfo.filter((process) => process.type === "renderer").map((process) => process.id);
  const readRSS = async () => {
    const results = await Promise.all(renderers.map(async (pid) => { try { const status = await readFile(`/proc/${pid}/status`, "utf8"); return Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) * 1024; } catch { return 0; } }));
    return results.reduce((sum, bytes) => sum + bytes, 0);
  };
  const rssBefore = await readRSS(); let rssPeak = rssBefore;
  const sampler = setInterval(() => { void readRSS().then((bytes) => { rssPeak = Math.max(rssPeak, bytes); }); }, 10);
  await page.evaluate(() => { window.imageAcceptance.tasks.length = 0; return app.plugins.plugins["card-workspace"].saveSettings({ cardImageMode: "right" }); });
  await page.waitForFunction(() => document.querySelectorAll(".fce-card-image img").length > 0 && app.plugins.plugins["card-workspace"].getThumbnailService().service.getDiagnostics().jobs === 0);
  clearInterval(sampler);
  report.rendererRSS = { before: rssBefore, peak: rssPeak, after: await readRSS(), intervalMs: 10, rendererPids: renderers };
  const right = await snapshot(); assert(right.reads > 0 && right.reads <= 3); assert.equal(right.peak, 1); assert(right.regions.every((region) => Math.abs(region.width-88)<1 && Math.abs(region.height-88)<1)); assert(right.images.every((image) => Math.max(image.width, image.height) <= 1024)); report.phases.push({ phase: "cold-right", ...right });
  const scroll = await page.evaluate(async () => {
    const list = document.querySelector(".fce-list"); let peakScrollTop = 0;
    for (const positions of [Array.from({length:10}, (_,i) => i*600), Array.from({length:10}, (_,i) => (9-i)*600)]) {
      for (const position of positions) { list.scrollTop = position; list.dispatchEvent(new Event("scroll")); peakScrollTop = Math.max(peakScrollTop, list.scrollTop); await new Promise(resolve => requestAnimationFrame(resolve)); }
    }
    return { peakScrollTop, endScrollTop: list.scrollTop };
  });
  await page.waitForTimeout(100);
  const scrolled = await snapshot(); assert.equal(scrolled.reads, right.reads); assert(scroll.peakScrollTop > 0); assert.equal(scroll.endScrollTop, 0); report.phases.push({ phase: "scroll-right", ...scroll, ...scrolled });
  await page.evaluate(() => app.workspace.getLeavesOfType("folder-card-view")[0].view.refresh({ reason: "manual", forceRefresh: true }));
  await page.waitForTimeout(100);
  const refreshed = await snapshot(); assert.equal(refreshed.reads, right.reads); report.phases.push({ phase: "refreshed-cached-scope", ...refreshed });
  await page.evaluate(() => app.plugins.plugins["card-workspace"].saveSettings({ cardImageMode: "inline", cardImageFit: "cover" })); await page.waitForTimeout(100);
  const inline = await snapshot(); assert.equal(inline.reads, right.reads); assert(inline.regions.every((region) => Math.abs(region.height-160)<1)); report.phases.push({ phase: "inline-cover", ...inline });
  await mkdir(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output.replace(/\.json$/, "-inline.png") });
  await page.evaluate(async () => { const leaf = app.workspace.getLeaf("tab"); await leaf.setViewState({ type: "folder-card-view", active: true }); await leaf.view.refresh({ reason: "manual" }); });
  await page.waitForFunction(() => app.plugins.plugins["card-workspace"].getThumbnailService().service.getDiagnostics().jobs === 0); await page.waitForTimeout(100);
  const crossView = await snapshot(); assert.equal(crossView.reads, right.reads); report.phases.push({ phase: "cross-view-memory", ...crossView });
  await page.evaluate(() => app.plugins.plugins["card-workspace"].saveSettings({ cardImageMode: "off" }));
  const closed = await snapshot(); assert.equal(closed.urls, 0); assert.equal(closed.service.owners, 0); assert.equal(closed.service.jobs, 0); report.phases.push({ phase: "disabled", ...closed });
  // A fresh plugin service with the same vault must restore only requested thumbnail Blobs.
  await page.evaluate(async () => {
    const plugin = app.plugins.plugins["card-workspace"]; plugin.thumbnails.service.dispose(); plugin.thumbnails = null;
    window.imageAcceptance.reads = 0; await plugin.saveSettings({ cardImageMode: "right" });
  });
  await page.waitForFunction(() => app.plugins.plugins["card-workspace"].getThumbnailService().service.getDiagnostics().jobs === 0 && document.querySelectorAll(".fce-card-image img").length > 0); await page.waitForTimeout(100);
  const persistent = await snapshot(); assert.equal(persistent.reads, 0); report.phases.push({ phase: "fresh-service-persistent", ...persistent });
  const cdp = await page.context().newCDPSession(page); await cdp.send("HeapProfiler.collectGarbage");
  const heapBefore = await page.evaluate(() => performance.memory.usedJSHeapSize);
  for (let i = 0; i < 10; i++) {
    await page.evaluate(async () => { const plugin = app.plugins.plugins["card-workspace"]; await plugin.saveSettings({ cardImageMode: "off" }); await plugin.saveSettings({ cardImageMode: "right" }); });
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => app.plugins.plugins["card-workspace"].saveSettings({ cardImageMode: "off" })); await cdp.send("HeapProfiler.collectGarbage");
  report.heap = { before: heapBefore, after: await page.evaluate(() => performance.memory.usedJSHeapSize) };
  const final = await snapshot(); assert.equal(final.urls, 0); assert(final.service.bytes <= 16*1024*1024); report.phases.push({ phase: "ten-toggle-cycles", ...final });
  report.passed = true;
} catch (error) { report.passed = false; report.error = String(error); throw error; }
finally {
  await browser?.close(); if (processHandle?.pid) { try { process.kill(-processHandle.pid, "SIGTERM"); } catch {} }
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2));
  await rm(temporary, { recursive: true, force: true }); console.log(`Desktop report: ${output}`);
}
