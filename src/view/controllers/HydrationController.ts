import type { EpochToken } from "../async-epoch";
import { createSearchPreviewMatcher, extractSearchPreviewSnippets, searchPreviewSnippetLimit, type SearchPreview, type SearchMatchField } from "../../search";
import { isMarkdownCardKind } from "../file-kind";
import type { HydrateViewportRequest } from "../hydration-request";
import { buildLightPreview, DEFAULT_PREVIEW_MAX_VISIBLE_CHARS } from "../markdown-utils";
import { buildLocationPreview } from "../context-preview";
import { resolveLinkCardLocation } from "../link-card-location";
import type { CardScope } from "../scope";
import { createPreviewFingerprint, fingerprintsEqual, PreviewCache, PREVIEW_CACHE_CAPACITY,
  type PreviewFingerprint } from "../preview-cache";
import type { NoteCardRecord, VaultMutationEvent } from "../types";
import type { DisposableController, DisposeReport, ViewContext } from "../view-context";
import type { CardPreviewFields, CardPreviewUpdate } from "../view-state-store";
import { buildEmptyPreviewPatch, buildPlaceholderPatch, buildPreviewPatch,
  type HydrationPreview } from "./hydration-patch";

const MAX_ACTIVE_READS = 5;
const STARTUP_PREVIEW_CARD_COUNT = 6;
const STARTUP_PREVIEW_WAIT_MS = 120;
interface HydrationJob {
  readonly path: string;
  fingerprint: PreviewFingerprint;
  generation: number;
  hydrationRevision: number;
  priority: number;
  sequence: number;
  state: "queued" | "active";
  viewport: boolean;
  startup: boolean;
  startupLate: boolean;
  forced: boolean;
  foreground: boolean;
  replacementRequested: boolean;
  readonly settled: Promise<void>;
  resolve: () => void;
}
interface PendingPatch {
  readonly update: CardPreviewUpdate;
  readonly generation: number;
  readonly hydrationRevision: number;
  readonly fingerprint: PreviewFingerprint;
  readonly publish: boolean;
  readonly resolve: () => void;
}
export interface HydrationControllerDeps {
  context: ViewContext;
  isLoading: () => boolean;
  getCommittedQuery?: () => string;
  getSearchContentRevision?: () => number;
  isCommittedQueryCurrent?: () => boolean;
  getMatchFields?: (path: string) => readonly SearchMatchField[] | undefined;
}
/** Owns the per-view preview cache, demand queue, and incremental publication. */
export class HydrationController implements DisposableController {
  private readonly cache = new PreviewCache();
  private readonly appliedFingerprints = new Map<string, PreviewFingerprint>();
  private readonly jobs = new Map<string, HydrationJob>();
  private readonly queue: HydrationJob[] = [];
  private readonly latestViewport = new Set<string>();
  private pendingPatches: PendingPatch[] = [];
  private activeReads = 0;
  private sequence = 0;
  private patchFlushQueued = false;
  private startupWaitTimer: ReturnType<Window["setTimeout"]> | null = null;
  private disposed = false;
  private matcherQuery = "";
  private matcher = createSearchPreviewMatcher("");
  private mutationRevision = 0;
  private readonly fileRevisions = new WeakMap<object, number>();
  getFileRevision(file: NoteCardRecord["file"]): number { return this.fileRevisions.get(file) ?? 0; }
  constructor(private readonly deps: HydrationControllerDeps) {}
  private get context(): ViewContext {
    return this.deps.context;
  }
  static get startupCardCount(): number {
    return STARTUP_PREVIEW_CARD_COUNT;
  }
  hasPending(path: string): boolean {
    return this.jobs.has(path);
  }
  deletePending(path: string): boolean {
    const job = this.jobs.get(path);
    if (!job) return false;
    job.viewport = false;
    job.startup = false;
    job.forced = false;
    job.foreground = false;
    if (job.state === "queued") this.dropQueuedJob(job);
    return true;
  }
  clearPending(): void {
    this.resetForLoad();
  }
  resetForLoad(): void {
    this.latestViewport.clear();
    for (const job of this.jobs.values()) {
      job.viewport = false;
      job.startup = false;
      job.forced = false;
      job.foreground = false;
      if (job.state === "queued") this.dropQueuedJob(job);
    }
  }
  clearPreviewCache(): void {
    this.cache.clear();
    this.appliedFingerprints.clear();
  }
  invalidateForVaultMutation(event: VaultMutationEvent): void {
    if (event.eventType === "create" || (event.isFolder && event.eventType === "modify")) return;
    this.mutationRevision += 1;
    const affected = this.context.store.getBaseCards().filter((card) =>
      card.path === event.path || (event.isFolder && card.path.startsWith(`${event.path}/`))
      || (event.oldPath && (card.path === event.oldPath || (event.isFolder && card.path.startsWith(`${event.oldPath}/`)))));
    for (const card of affected) this.fileRevisions.set(card.file, this.mutationRevision);
    const liveFile = this.context.getApp().vault.getAbstractFileByPath?.(event.path);
    if (liveFile) this.fileRevisions.set(liveFile, this.mutationRevision);
    this.context.store.patchCardPreviews(affected.map((card) => ({
      path: card.path, patch: { searchPreview: undefined, hydrated: false, previewHtml: "", previewMode: "empty" },
    })));
    if (affected.length) this.context.publishGroups("cards");
    for (const job of this.jobs.values()) {
      if (job.path === event.path || (event.isFolder && job.path.startsWith(`${event.path}/`))
        || (event.oldPath && (job.path === event.oldPath || (event.isFolder && job.path.startsWith(`${event.oldPath}/`))))) {
        job.replacementRequested = true;
      }
    }
    const invalidate = (path: string): void => {
      if (event.isFolder) {
        this.cache.invalidatePrefix(path);
        for (const key of this.appliedFingerprints.keys()) {
          if (key === path || key.startsWith(`${path}/`)) this.appliedFingerprints.delete(key);
        }
      } else {
        this.cache.invalidateExact(path);
        this.appliedFingerprints.delete(path);
      }
    };
    invalidate(event.path);
    if (event.eventType === "rename" && event.oldPath !== null) invalidate(event.oldPath);
  }
  prepareRecordsFromCache(records: NoteCardRecord[], scope?: CardScope): void {
    for (const record of records) {
      if (!isMarkdownCardKind(record.fileKind)) {
        Object.assign(record, this.placeholderPatch(record));
        continue;
      }
      if (!this.cache.hasPath(record.path)) continue;
      const fingerprint = this.fingerprintFor(record, scope);
      const preview = this.cache.get(fingerprint);
      if (preview) {
        Object.assign(record, this.previewPatch(record, preview));
        this.rememberAppliedFingerprint(record.path, fingerprint);
      }
    }
  }
  schedulePath(path: string): void {
    if (this.disposed) return;
    const visible = this.context.store.getVisibleCards().some((card) => card.path === path);
    void this.requestPath(path, visible ? 0 : 3, { forced: true, foreground: visible });
  }
  async hydrateViewport(request: HydrateViewportRequest): Promise<void> {
    if (!this.validRequestIdentity(request) || this.deps.isLoading()) return;
    const visible = this.context.store.getVisibleCards();
    const count = Math.max(0, request.end - request.start);
    const paths = request.paths.slice(0, count).filter(
      (path, offset) => visible[request.start + offset]?.path === path,
    );
    const next = new Set(paths);
    for (const job of this.jobs.values()) {
      if (job.viewport && !next.has(job.path)) {
        job.viewport = false;
        if (job.state === "queued" && !job.startup && !job.forced) this.dropQueuedJob(job);
      }
    }
    this.latestViewport.clear();
    paths.forEach((path) => this.latestViewport.add(path));
    await Promise.all(paths.map((path) => this.requestPath(path, 1, { viewport: true })));
  }
  async hydrateStartupCardPaths(paths: string[], token: EpochToken): Promise<void> {
    if (this.disposed || !this.context.epochs.load.isCurrent(token)) return;
    const targets = paths.slice(0, STARTUP_PREVIEW_CARD_COUNT);
    const jobs = targets.map((path) => this.requestPath(path, 2, { startup: true }));
    if (jobs.length === 0) return;
    const hydration = Promise.all(jobs);
    const viewWindow = this.context.getViewWindow();
    const timeout = new Promise<"timeout">((resolve) => {
      this.startupWaitTimer = viewWindow.setTimeout(() => {
        this.startupWaitTimer = null;
        resolve("timeout");
      }, STARTUP_PREVIEW_WAIT_MS);
    });
    const result = await Promise.race([hydration.then(() => "hydrated" as const), timeout]);
    if (this.startupWaitTimer !== null) {
      viewWindow.clearTimeout(this.startupWaitTimer);
      this.startupWaitTimer = null;
    }
    if (result === "timeout" && !this.disposed && this.context.epochs.load.isCurrent(token)) {
      for (const path of targets) {
        const job = this.jobs.get(path);
        if (job?.startup) job.startupLate = true;
      }
    }
  }
  /** Kept until the host seam migration removes its existing open hook. */
  hydrateVisibleCardsOnOpen(): void {
    if (this.disposed || this.deps.isLoading()) return;
    const visible = this.context.store.getVisibleCards();
    const paths = visible.slice(0, STARTUP_PREVIEW_CARD_COUNT).map((card) => card.path);
    void this.hydrateViewport({
      generation: this.context.epochs.load.value,
      hydrationRevision: this.context.store.getHydrationRevision(),
      start: 0,
      end: paths.length,
      paths,
    });
  }
  private validRequestIdentity(request: HydrateViewportRequest): boolean {
    return !this.disposed
      && Number.isInteger(request.start)
      && Number.isInteger(request.end)
      && request.start >= 0
      && request.end >= request.start
      && request.generation === this.context.epochs.load.value
      && request.hydrationRevision === this.context.store.getHydrationRevision();
  }

  private requestPath(path: string, priority: number,
    owner: { viewport?: boolean; startup?: boolean; forced?: boolean; foreground?: boolean }): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.deps.isCommittedQueryCurrent?.() === false) return Promise.resolve();
    const card = this.context.store.getBaseCard(path);
    if (!card) return Promise.resolve();
    if (!isMarkdownCardKind(card.fileKind)) {
      if (card.hydrated && !this.deps.getCommittedQuery?.().trim()) return Promise.resolve();
      return this.enqueuePatch(
        path, this.placeholderPatch(card), this.fingerprintFor(card),
        owner.viewport === true || owner.foreground === true || owner.startup === true,
      );
    }
    const fingerprint = this.fingerprintFor(card);
    const existing = this.jobs.get(path);
    if (existing) {
      existing.viewport ||= owner.viewport === true;
      existing.startup ||= owner.startup === true;
      existing.forced ||= owner.forced === true;
      existing.foreground ||= owner.foreground === true;
      existing.priority = Math.min(existing.priority, priority);
      if (!fingerprintsEqual(existing.fingerprint, fingerprint)
        || existing.generation !== this.context.epochs.load.value
        || existing.hydrationRevision !== this.context.store.getHydrationRevision()) {
        existing.replacementRequested = true;
      }
      this.sortQueue();
      return existing.settled;
    }
    if (!owner.forced) {
      const applied = this.appliedFingerprints.get(path);
      if (card.hydrated && applied && fingerprintsEqual(applied, fingerprint)) return Promise.resolve();
      const cached = this.cache.get(fingerprint);
      if (cached) {
        return this.enqueuePatch(
          path, this.previewPatch(card, cached), fingerprint,
          owner.viewport === true || owner.startup === true,
        );
      }
    }
    let resolve!: () => void;
    const settled = new Promise<void>((done) => { resolve = done; });
    const job: HydrationJob = {
      path, fingerprint,
      generation: this.context.epochs.load.value,
      hydrationRevision: this.context.store.getHydrationRevision(),
      priority, sequence: this.sequence++, state: "queued",
      viewport: owner.viewport === true,
      startup: owner.startup === true,
      startupLate: false,
      forced: owner.forced === true,
      foreground: owner.foreground === true,
      replacementRequested: false,
      settled, resolve,
    };
    this.jobs.set(path, job);
    this.queue.push(job);
    this.sortQueue();
    this.pump();
    return settled;
  }
  private pump(): void {
    while (!this.disposed && this.activeReads < MAX_ACTIVE_READS && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job || this.jobs.get(job.path) !== job) continue;
      job.state = "active";
      this.activeReads += 1;
      void this.runJob(job).finally(() => {
        this.activeReads -= 1;
        this.finishJob(job);
        this.pump();
      });
    }
  }
  private async runJob(job: HydrationJob): Promise<void> {
    if (!this.currentFingerprint(job)) return;
    const card = this.context.store.getBaseCard(job.path);
    if (!card) return;
    const query = this.deps.getCommittedQuery?.().trim() ?? "";
    const fields = this.deps.getMatchFields?.(card.path);
    const titleOnly = !!query && fields?.includes("title") && !fields.includes("content");
    const ordinaryFingerprint = createPreviewFingerprint(card.path, card.mtime,
      job.fingerprint.previewLines, job.fingerprint.maxVisibleChars, `|file:${this.getFileRevision(card.file)}|live:${card.file.stat?.mtime ?? card.mtime}`);
    const ordinary = this.cache.get(ordinaryFingerprint);
    if (titleOnly && ordinary) {
      const preview = { ...ordinary, searchPreview: this.searchPreviewFor(card, "title-only") };
      this.cache.set(job.fingerprint, preview);
      if (this.shouldPatch(job)) await this.enqueuePatch(job.path, this.previewPatch(card, preview), job.fingerprint,
        job.viewport || job.foreground || job.startup || job.startupLate);
      return;
    }
    let patch: Partial<CardPreviewFields>;
    try {
      const markdown = await this.context.getApp().vault.cachedRead(card.file);
      if (!this.currentFingerprint(job)) return;
      const scope = this.context.store.getScope();
      const location = !query && scope.kind === "links"
        ? resolveLinkCardLocation(this.context.getApp(), scope, card.path) : null;
      let preview: HydrationPreview;
      const leading = ordinary ?? buildLightPreview(markdown, job.fingerprint.maxVisibleChars, job.fingerprint.previewLines);
      if (query && titleOnly) {
        preview = { ...leading, searchPreview: this.searchPreviewFor(card, "title-only") };
      } else if (query) {
        if (this.matcherQuery !== query) {
          this.matcherQuery = query;
          this.matcher = createSearchPreviewMatcher(query);
        }
        const snippets = await extractSearchPreviewSnippets(markdown, {
          limit: searchPreviewSnippetLimit(job.fingerprint.previewLines),
          maxChars: 200,
          idPrefix: `${job.generation}:${job.hydrationRevision}:${job.fingerprint.contextKey}`,
          matcher: this.matcher,
          isCurrent: () => this.currentFingerprint(job),
        });
        if (!snippets || !this.currentFingerprint(job)) return;
        preview = { ...leading, searchPreview: this.searchPreviewFor(card, snippets.length ? "hits" : "unavailable", snippets) };
      } else {
        preview = (location
          ? buildLocationPreview(markdown, location, job.fingerprint.maxVisibleChars, job.fingerprint.previewLines)
          : null)
        ?? leading;
      }
      if (!this.currentFingerprint(job)) return;
      this.cache.set(ordinaryFingerprint, leading);
      this.cache.set(job.fingerprint, preview);
      patch = this.previewPatch(card, preview);
    } catch {
      if (!this.currentFingerprint(job)) return;
      patch = buildEmptyPreviewPatch(this.context.getApp(), card);
      if (this.deps.getCommittedQuery?.().trim()) {
        patch.searchPreview = this.searchPreviewFor(card, "unavailable");
      }
    }
    if (this.shouldPatch(job)) {
      await this.enqueuePatch(job.path, patch, job.fingerprint,
        job.viewport || job.foreground || job.startup || job.startupLate);
    }
  }
  private finishJob(job: HydrationJob): void {
    if (this.jobs.get(job.path) !== job) return;
    if (!this.disposed && job.replacementRequested && this.hasDemand(job)) {
      const card = this.context.store.getBaseCard(job.path);
      if (card) {
        job.fingerprint = this.fingerprintFor(card);
        job.generation = this.context.epochs.load.value;
        job.hydrationRevision = this.context.store.getHydrationRevision();
        job.replacementRequested = false;
        job.state = "queued";
        job.sequence = this.sequence++;
        this.queue.push(job);
        this.sortQueue();
        return;
      }
    }
    this.jobs.delete(job.path);
    job.resolve();
  }
  private currentFingerprint(job: HydrationJob): boolean {
    const card = this.context.store.getBaseCard(job.path);
    return !this.disposed
      && this.deps.isCommittedQueryCurrent?.() !== false
      && job.generation === this.context.epochs.load.value
      && job.hydrationRevision === this.context.store.getHydrationRevision()
      && card !== undefined
      && fingerprintsEqual(job.fingerprint, this.fingerprintFor(card));
  }
  private hasDemand(job: HydrationJob): boolean {
    return job.forced || job.startup || job.viewport;
  }
  private shouldPatch(job: HydrationJob): boolean {
    return job.startup || job.foreground || (job.viewport && this.latestViewport.has(job.path));
  }

  private enqueuePatch(path: string, patch: Partial<CardPreviewFields>,
    fingerprint: PreviewFingerprint, publish: boolean): Promise<void> {
    return new Promise((resolve) => {
      this.pendingPatches.push({
        update: { path, patch },
        generation: this.context.epochs.load.value,
        hydrationRevision: this.context.store.getHydrationRevision(),
        fingerprint,
        publish,
        resolve,
      });
      if (this.patchFlushQueued) return;
      this.patchFlushQueued = true;
      queueMicrotask(() => this.flushPatches());
    });
  }
  private flushPatches(): void {
    this.patchFlushQueued = false;
    const pending = this.pendingPatches;
    this.pendingPatches = [];
    const valid = pending.filter((item) => {
      const card = this.context.store.getBaseCard(item.update.path);
      return !this.disposed
        && this.deps.isCommittedQueryCurrent?.() !== false
        && item.generation === this.context.epochs.load.value
        && item.hydrationRevision === this.context.store.getHydrationRevision()
        && card !== undefined
        && fingerprintsEqual(item.fingerprint, this.fingerprintFor(card));
    });
    if (valid.length > 0) {
      this.context.store.patchCardPreviews(valid.map((item) => item.update));
      for (const item of valid) this.rememberAppliedFingerprint(item.update.path, item.fingerprint);
      if (valid.some((item) => item.publish)) this.context.publishGroups("cards");
    }
    pending.forEach((item) => item.resolve());
  }
  private fingerprintFor(card: NoteCardRecord, scopeOverride?: CardScope): PreviewFingerprint {
    const query = this.deps.getCommittedQuery?.().trim() ?? "";
    const scope = scopeOverride ?? this.context.store.getScope();
    const location = !query && scope.kind === "links"
      ? resolveLinkCardLocation(this.context.getApp(), scope, card.path) : null;
    return createPreviewFingerprint(
      card.path,
      card.mtime,
      this.context.getSettings().previewLines,
      DEFAULT_PREVIEW_MAX_VISIBLE_CHARS,
      `${query ? `search:${this.deps.getSearchContentRevision?.() ?? 0}:${query}` : location ? `link:${location.identity}` : ""}|file:${this.getFileRevision(card.file)}|live:${card.file.stat?.mtime ?? card.mtime}`,
    );
  }
  private rememberAppliedFingerprint(path: string, fingerprint: PreviewFingerprint): void {
    this.appliedFingerprints.delete(path);
    this.appliedFingerprints.set(path, fingerprint);
    if (this.appliedFingerprints.size > PREVIEW_CACHE_CAPACITY) {
      const oldest = this.appliedFingerprints.keys().next().value;
      if (oldest !== undefined) this.appliedFingerprints.delete(oldest);
    }
  }
  private previewPatch(card: NoteCardRecord, preview: HydrationPreview): Partial<CardPreviewFields> {
    const patch = buildPreviewPatch(this.context.getApp(), card, preview);
    if (preview.searchPreview) {
      patch.searchPreview = {
        ...preview.searchPreview,
        snippets: preview.searchPreview.snippets.map((snippet) => ({
          ...snippet,
          id: `${this.context.epochs.load.value}:${this.context.store.getHydrationRevision()}:${card.path}:${snippet.location.offset}`,
        })),
      };
    }
    return patch;
  }
  private placeholderPatch(card: NoteCardRecord): Partial<CardPreviewFields> {
    const patch = buildPlaceholderPatch(card, this.context.getUiStrings().fileKind);
    if (this.deps.getCommittedQuery?.().trim()) patch.searchPreview = this.searchPreviewFor(card, "title-only");
    return patch;
  }
  private searchPreviewFor(card: NoteCardRecord, status: SearchPreview["status"], snippets: SearchPreview["snippets"] = []): SearchPreview {
    return {
      query: this.deps.getCommittedQuery?.().trim() ?? "",
      revision: this.deps.getSearchContentRevision?.() ?? 0,
      mtime: card.file.stat?.mtime ?? card.mtime,
      previewLines: this.context.getSettings().previewLines,
      status, snippets,
    };
  }
  private sortQueue(): void {
    this.queue.sort((left, right) => left.priority - right.priority || left.sequence - right.sequence);
  }
  private dropQueuedJob(job: HydrationJob): void {
    const index = this.queue.indexOf(job);
    if (index >= 0) this.queue.splice(index, 1);
    this.jobs.delete(job.path);
    job.resolve();
  }

  dispose(): DisposeReport {
    const clearedPendingHydration = this.jobs.size > 0;
    const cancelledDebounce = this.startupWaitTimer !== null;
    if (this.startupWaitTimer !== null) {
      this.context.getViewWindow().clearTimeout(this.startupWaitTimer);
      this.startupWaitTimer = null;
    }
    this.disposed = true;
    this.cache.clear();
    this.appliedFingerprints.clear();
    this.latestViewport.clear();
    for (const job of this.jobs.values()) job.resolve();
    this.jobs.clear();
    this.queue.length = 0;
    const pending = this.pendingPatches;
    this.pendingPatches = [];
    pending.forEach((item) => item.resolve());
    this.patchFlushQueued = false;
    return {
      clearedPendingHydration,
      ...(cancelledDebounce ? { cancelledDebounce: true } : {}),
    };
  }
}
