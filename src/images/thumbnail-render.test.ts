import { afterEach, describe, expect, it, vi } from "vitest";
import { generateThumbnail } from "./thumbnail-render";
function png(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(45), v = new DataView(bytes.buffer);
  v.setUint32(0, 0x89504e47); v.setUint32(4, 0x0d0a1a0a); v.setUint32(8, 13);
  bytes.set(new TextEncoder().encode("IHDR"), 12); v.setUint32(16, width); v.setUint32(20, height);
  bytes.set(new TextEncoder().encode("IEND"), 37); return bytes.buffer;
}
afterEach(() => vi.unstubAllGlobals());
describe("Worker render", () => {
  it("never decodes unknown or over-budget dimensions", async () => {
    const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
    const eligible = vi.fn();
    expect(await generateThumbnail(png(10000, 5001), eligible)).toEqual({ status: "skipped" });
    expect(await generateThumbnail(new ArrayBuffer(20), eligible)).toEqual({ status: "skipped" });
    expect(decode).not.toHaveBeenCalled(); expect(eligible).not.toHaveBeenCalled();
  });
  it("uses bounded decode dimensions, falls back to PNG and closes bitmap/canvas", async () => {
    const close = vi.fn(), decode = vi.fn(async () => ({ close })); vi.stubGlobal("createImageBitmap", decode);
    const canvas = { width: 1024, height: 512, getContext: () => ({ drawImage: vi.fn() }), convertToBlob: vi.fn().mockRejectedValueOnce(new Error("webp unavailable")).mockResolvedValueOnce(new Blob(["png"], { type: "image/png" })) };
    vi.stubGlobal("OffscreenCanvas", class { constructor() { return canvas; } });
    const eligible = vi.fn(), result = await generateThumbnail(png(8000, 4000), eligible);
    expect(result.status).toBe("ready"); expect(eligible).toHaveBeenCalledOnce();
    expect(decode.mock.calls[0]).toEqual([expect.any(Blob), { imageOrientation: "from-image", resizeWidth: 1024, resizeHeight: 512, resizeQuality: "high" }]);
    expect(canvas.convertToBlob).toHaveBeenNthCalledWith(1, { type: "image/webp", quality: 0.85 });
    expect(canvas.convertToBlob).toHaveBeenNthCalledWith(2, { type: "image/png" });
    expect(close).toHaveBeenCalledOnce(); expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });
  it("returns an eligible fixed-size failure on corrupt decode", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("corrupt")));
    const eligible = vi.fn(); expect(await generateThumbnail(png(100, 50), eligible)).toEqual({ status: "failed" }); expect(eligible).toHaveBeenCalledOnce();
  });
});
