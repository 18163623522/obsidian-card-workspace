import { describe, expect, it } from "vitest";
import { resolveFolderDrop, folderDragScrollSpeed } from "./navigation-folder-dnd";

const rect = { top: 100, height: 40 };
describe("folder drop decision", () => {
  it.each([[109, "before"], [110, "inside"], [129, "inside"], [130, "after"]] as const)(
    "uses the 25/50/25 regions at %s", (y, operation) => {
      expect(resolveFolderDrop("a/source", "a/target", y, rect)).toEqual({ path: "a/target", operation });
    });
  it("rejects cross-level edges but accepts center moves", () => {
    expect(resolveFolderDrop("a/source", "b/target", 101, rect)).toBeNull();
    expect(resolveFolderDrop("a/source", "b/target", 139, rect)).toBeNull();
    expect(resolveFolderDrop("a/source", "b/target", 120, rect)?.operation).toBe("inside");
  });
  it("rejects self, descendants, current parent, missing sources, and root sources", () => {
    for (const target of ["a/source", "a/source/child"]) {
      for (const y of [101, 120, 139]) expect(resolveFolderDrop("a/source", target, y, rect)).toBeNull();
    }
    expect(resolveFolderDrop("a/source", "a", 120, rect)).toBeNull();
    expect(resolveFolderDrop(null, "a", 120, rect)).toBeNull();
    expect(resolveFolderDrop("", "a", 120, rect)).toBeNull();
  });
  it("accepts only moves into root and rejects a move to the existing root parent", () => {
    for (const y of [101, 120, 139]) expect(resolveFolderDrop("a/source", "", y, rect))
      .toEqual({ path: "", operation: "inside" });
    expect(resolveFolderDrop("source", "", 120, rect)).toBeNull();
  });
  it("ramps edge scrolling from zero to 480 pixels per second and stops outside", () => {
    const bounds = { top: 100, bottom: 500 };
    expect(folderDragScrollSpeed(100, bounds)).toBe(-480);
    expect(folderDragScrollSpeed(116, bounds)).toBe(-240);
    expect(folderDragScrollSpeed(132, bounds)).toBe(0);
    expect(folderDragScrollSpeed(300, bounds)).toBe(0);
    expect(folderDragScrollSpeed(484, bounds)).toBe(240);
    expect(folderDragScrollSpeed(500, bounds)).toBe(480);
    expect(folderDragScrollSpeed(99, bounds)).toBe(0);
    expect(folderDragScrollSpeed(501, bounds)).toBe(0);
  });
});
