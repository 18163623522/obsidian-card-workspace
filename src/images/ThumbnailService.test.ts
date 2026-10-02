import { describe, expect, it, vi } from "vitest";
import { ThumbnailService } from "./ThumbnailService";
import { IMAGE_MAX_BYTES, MEMORY_MAX_BYTES, MEMORY_MAX_ENTRIES, type ImageFingerprint, type ThumbnailResult } from "./types";
const fingerprint = (path = "outside/image.png", mtime = 1, size = 100): ImageFingerprint => ({ vault: "vault", path, mtime, size, version: 1 });
const request = () => ({ signal: new AbortController().signal, canGenerate: () => true, onEligible: vi.fn() });
function harness(blob = new Blob(["thumb"])) {
  const disk = new Map<string, Blob>();
  const read = vi.fn(async () => new ArrayBuffer(100));
  const generate = vi.fn(async (_buffer: ArrayBuffer, eligible: () => void): Promise<ThumbnailResult> => { eligible(); return { status: "ready", blob }; });
  const storage = { get: vi.fn(async (key: string) => disk.get(key) ?? null), put: vi.fn(async (key: string, value: Blob) => { disk.set(key, value); }), close: vi.fn() };
  const generator = { available: () => true, generate, dispose: vi.fn() };
  const isCurrent = vi.fn(() => true);
  const deps = { read, generator, storage, isCurrent };
  return { service: new ThumbnailService(deps), read, generate, storage, generator, isCurrent, disk, deps };
}
describe("plugin thumbnail service", () => {
  it("does nothing at construction, rejects the file budget without reading", async () => {
    const h = harness();
    expect(h.storage.get).not.toHaveBeenCalled(); expect(h.generate).not.toHaveBeenCalled();
    expect(await h.service.request(fingerprint("large", 1, IMAGE_MAX_BYTES + 1), request())).toEqual({ status: "skipped" });
    expect(h.read).not.toHaveBeenCalled(); expect(h.storage.get).not.toHaveBeenCalled();
  });
  it("merges attachments across views and serializes all original reads/generation", async () => {
    const h = harness(); let active = 0, peak = 0;
    h.generate.mockImplementation(async (_buffer, eligible) => { eligible(); peak = Math.max(peak, ++active); await new Promise((resolve) => setTimeout(resolve, 1)); active--; return { status: "ready", blob: new Blob(["thumb"]) }; });
    await Promise.all([h.service.request(fingerprint(), request()), h.service.request(fingerprint(), request()), ...Array.from({ length: 8 }, (_, i) => h.service.request(fingerprint(`${i}.png`), request()))]);
    expect(h.read).toHaveBeenCalledTimes(9); expect(h.generate).toHaveBeenCalledTimes(9); expect(peak).toBe(1);
    await h.service.request(fingerprint(), request()); expect(h.read).toHaveBeenCalledTimes(9);
    const restart = new ThumbnailService(h.deps); await restart.request(fingerprint(), request()); expect(h.read).toHaveBeenCalledTimes(9);
  });
  it("allows cached thumbnails while cold work waits for text", async () => {
    const h = harness(); await h.service.request(fingerprint(), request());
    let ready = false;
    const options = { ...request(), canGenerate: () => ready };
    const pending = h.service.request(fingerprint("second.png"), options);
    await new Promise((resolve) => setTimeout(resolve, 0)); expect(h.read).toHaveBeenCalledTimes(1);
    await h.service.request(fingerprint(), options); expect(h.read).toHaveBeenCalledTimes(1);
    ready = true; h.service.pump(); await pending; expect(h.read).toHaveBeenCalledTimes(2);
  });
  it("cancels queued demand and drops modified/deleted active results", async () => {
    const h = harness(); const abort = new AbortController();
    const queued = h.service.request(fingerprint(), { ...request(), signal: abort.signal, canGenerate: () => false });
    abort.abort(); await queued; expect(h.read).not.toHaveBeenCalled();
    let finish!: (result: ThumbnailResult) => void;
    h.generate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const active = h.service.request(fingerprint("active"), request());
    await new Promise((resolve) => setTimeout(resolve, 40)); h.isCurrent.mockReturnValue(false);
    finish({ status: "ready", blob: new Blob(["stale"]) });
    expect(await active).toEqual({ status: "skipped" }); expect(h.disk.size).toBe(0); expect(h.service.getDiagnostics().entries).toBe(0);
  });
  it("invalidates matching cached and active fingerprints even when stat values are unchanged", async () => {
    const h = harness(); await h.service.request(fingerprint(), request());
    h.service.invalidate(["outside"], true);
    // This harness intentionally has no persistent invalidation; prove memory invalidation with a disk miss.
    h.disk.clear(); await h.service.request(fingerprint(), request()); expect(h.read).toHaveBeenCalledTimes(2);
    let finish!: (result: ThumbnailResult) => void;
    h.generate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const active = h.service.request(fingerprint("active.png"), request()); await new Promise((resolve) => setTimeout(resolve, 40));
    h.service.invalidate(["active.png"], false); expect(await active).toEqual({ status: "skipped" });
    finish({ status: "ready", blob: new Blob(["old"]) }); await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...h.disk.values()].map((blob) => blob.size)).not.toContain(3); h.service.dispose();
  });

  it("enforces both memory limits and continues after storage failures", async () => {
    const h = harness(new Blob([new Uint8Array(1024 * 1024)])); h.storage.put.mockRejectedValue(new Error("quota"));
    for (let i = 0; i < MEMORY_MAX_ENTRIES + 5; i++) await h.service.request(fingerprint(`${i}.png`), request());
    expect(h.service.getDiagnostics().entries).toBe(16); expect(h.service.getDiagnostics().bytes).toBeLessThanOrEqual(MEMORY_MAX_BYTES);
    const tiny = harness(); for (let i = 0; i < 70; i++) await tiny.service.request(fingerprint(`${i}.png`), request());
    expect(tiny.service.getDiagnostics().entries).toBe(64);
  });
  it("works with a missing Worker and releases shared resources on last view close", async () => {
    const h = harness(); await h.service.request(fingerprint(), request());
    h.generator.available = () => false;
    await new ThumbnailService(h.deps).request(fingerprint(), request());
    await h.service.request(fingerprint("cold"), request()); expect(h.read).toHaveBeenCalledTimes(1);
    const a = h.service.acquire(), b = h.service.acquire(); a(); expect(h.generator.dispose).not.toHaveBeenCalled();
    b(); expect(h.generator.dispose).toHaveBeenCalledOnce(); expect(h.storage.close).toHaveBeenCalledOnce();
    h.service.dispose(); expect(h.service.getDiagnostics()).toMatchObject({ jobs: 0, entries: 0, bytes: 0 });
  });
});
