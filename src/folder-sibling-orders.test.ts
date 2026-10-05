import { describe, expect, it } from "vitest";
import { normalizeFolderSiblingOrders, orderFolderSiblings, reorderFolderSiblings,
  rewriteFolderSiblingOrders, pruneFolderSiblingOrders, folderSiblingOrdersEqual } from "./folder-sibling-orders";
import { DEFAULT_SETTINGS, migrateSettings, mergeSettings } from "./settings";
import { serializeSettings, SettingsStore } from "./services/SettingsStore";

const candidates = ["/", "A", "B", "C"].map((path) => ({ path }));

describe("folder sibling orders", () => {
  it("defaults old documents and normalizes malformed records without losing empty manual groups", () => {
    expect(migrateSettings({}).folderSiblingOrders).toEqual({});
    expect(normalizeFolderSiblingOrders(null)).toEqual({});
    expect(normalizeFolderSiblingOrders([])).toEqual({});
    expect(normalizeFolderSiblingOrders({ "/": [" B/ ", "B", "A", "", 12, "A/child"],
      " A/ ": ["A/c", "A/c", "B/c", "A/c/deep"], Empty: [], Bad: "bad" }))
      .toEqual({ "": ["B", "A"], A: ["A/c"], Empty: [] });
  });
  it("keeps root first, appends unrecorded name-ordered folders, and isolates parents", () => {
    expect(orderFolderSiblings(candidates, { "": ["C", "missing", "A"], A: ["A/x"] }, "").map((node) => node.path))
      .toEqual(["/", "C", "A", "B"]);
    expect(orderFolderSiblings(candidates, {}, "")).toEqual(candidates);
    expect(orderFolderSiblings(candidates, { "": [] }, "")).toEqual(candidates);
  });
  it("ignores original-position, stale, cross-parent, self, and root reorders", () => {
    const order = ["A", "B", "C"];
    expect(reorderFolderSiblings(order, "A", "B", "before")).toBeNull();
    expect(reorderFolderSiblings(order, "B", "A", "after")).toBeNull();
    expect(reorderFolderSiblings(order, "A", "A", "after")).toBeNull();
    expect(reorderFolderSiblings(order, "gone", "B", "after")).toBeNull();
    expect(reorderFolderSiblings(order, "A", "B/c", "after")).toBeNull();
    expect(reorderFolderSiblings(order, "", "B", "after")).toBeNull();
    expect(reorderFolderSiblings(order, "C", "A", "before")).toEqual(["C", "A", "B"]);
  });
  it("preserves rename positions and rewrites nested group keys and children", () => {
    const orders = { "": ["B", "A", "C"], A: ["A/y", "A/x"], "A/x": [] };
    expect(rewriteFolderSiblingOrders(orders, "A", "D"))
      .toEqual({ "": ["B", "D", "C"], D: ["D/y", "D/x"], "D/x": [] });
    expect(rewriteFolderSiblingOrders({ ...orders, B: ["B/old"] }, "A", "B/A"))
      .toEqual({ "": ["B", "C"], B: ["B/old", "B/A"], "B/A": ["B/A/y", "B/A/x"], "B/A/x": [] });
    expect(rewriteFolderSiblingOrders(orders, "A", "B/A"))
      .toEqual({ "": ["B", "C"], "B/A": ["B/A/y", "B/A/x"], "B/A/x": [] });
    expect(pruneFolderSiblingOrders(orders, "A" )).toEqual({ "": ["B", "C"] });
  });
  it("round trips in userData under schema 2 and replaces the whole map on reset", () => {
    const settings = mergeSettings(DEFAULT_SETTINGS, { folderSiblingOrders: { "": ["B", "A"], A: [] } });
    const document = serializeSettings(settings);
    expect(document.schemaVersion).toBe(2);
    expect(document.userData.folderSiblingOrders).toEqual(settings.folderSiblingOrders);
    expect(migrateSettings(document)).toEqual(settings);
    expect(mergeSettings(settings, { folderSiblingOrders: {} }).folderSiblingOrders).toEqual({});
    expect(folderSiblingOrdersEqual({ A: [], "": ["B"] }, { "": ["B"], A: [] })).toBe(true);
    expect(folderSiblingOrdersEqual({ A: [] }, {})).toBe(false);
  });
  it("persists a reset of the last manual group immediately and treats identical order as a no-op", async () => {
    const writes: unknown[] = [];
    const store = new SettingsStore({ load: async () => ({ folderSiblingOrders: { "": ["B", "A"] } }),
      save: async (data) => { writes.push(data); } });
    await store.init();
    expect(await store.updateFlat({ folderSiblingOrders: { "": ["B", "A"] } })).toBeNull();
    expect(writes).toHaveLength(0);
    expect(await store.updateFlat({ folderSiblingOrders: {} })).toBe("patch");
    expect(writes).toHaveLength(1);
    expect(migrateSettings(writes[0]).folderSiblingOrders).toEqual({});
    const restored = new SettingsStore({ load: async () => writes[0], save: async () => undefined });
    await restored.init();
    expect(restored.getFlat().folderSiblingOrders).toEqual({});
  });
});
