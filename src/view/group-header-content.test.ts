import { describe, expect, it } from "vitest";
import { getUiStrings } from "../i18n";
import { resolveGroupHeaderParts } from "./group-header-content";

const EN = getUiStrings("en").sortGroup;
const ZH = getUiStrings("zh").sortGroup;

describe("resolveGroupHeaderParts", () => {
  it("labels each dimension with its menu icon and localized name", () => {
    const cases = [
      { header: { kind: "folder", name: "c", path: "a/b/c" }, icon: "folder", en: "Folder", zh: "文件夹" },
      { header: { kind: "tags", tags: ["x"] }, icon: "tag", en: "Tag", zh: "标签" },
      { header: { kind: "task", text: "t" }, icon: "list-checks", en: "Task status", zh: "任务状态" },
      { header: { kind: "box-rule", text: "r" }, icon: "package-check", en: "Card box rule", zh: "卡片盒规则" },
    ] as const;

    for (const { header, icon, en, zh } of cases) {
      expect(resolveGroupHeaderParts(header, "", EN).dimension).toEqual({ icon, label: en });
      expect(resolveGroupHeaderParts(header, "", ZH).dimension).toEqual({ icon, label: zh });
    }
  });

  it("uses the property key spelling as the dimension label", () => {
    const parts = resolveGroupHeaderParts({ kind: "property", keyLabel: "Status", values: [{ kind: "text", label: "open" }] }, "open", ZH);

    expect(parts.dimension).toEqual({ icon: "list", label: "Status" });
    expect(parts.chips).toEqual([{ text: "open" }]);
  });

  it("shows only the folder name and keeps the full path as the tooltip", () => {
    expect(resolveGroupHeaderParts({ kind: "folder", name: "c", path: "a/b/c" }, "c", EN).chips)
      .toEqual([{ text: "c", title: "a/b/c" }]);
    expect(resolveGroupHeaderParts({ kind: "folder", name: "Vault root", path: "" }, "Vault root", EN).chips)
      .toEqual([{ text: "Vault root", title: "Vault root" }]);
  });

  it("splits a nested tag into a faded parent prefix and its leaf", () => {
    expect(resolveGroupHeaderParts({ kind: "tags", tags: ["project/alpha", "read"] }, "", EN).chips).toEqual([
      { text: "alpha", prefix: "project/" },
      { text: "read" },
    ]);
  });

  it("gives boolean values an on or off checkbox icon", () => {
    const parts = resolveGroupHeaderParts({
      kind: "property",
      keyLabel: "done",
      values: [{ kind: "boolean", value: true, label: "Yes" }, { kind: "boolean", value: false, label: "No" }],
    }, "", EN);

    expect(parts.chips).toEqual([
      { text: "Yes", icon: "check-square", iconOff: false },
      { text: "No", icon: "square", iconOff: true },
    ]);
  });

  it("falls back to the bucket label when a tag or property header carries no values", () => {
    expect(resolveGroupHeaderParts({ kind: "tags", tags: [] }, "No tag", EN).chips).toEqual([{ text: "No tag" }]);
    expect(resolveGroupHeaderParts({ kind: "property", keyLabel: "topics", values: [] }, "Unassigned", EN).chips)
      .toEqual([{ text: "Unassigned" }]);
  });

  it("renders the text fallback as a lone chip without a dimension", () => {
    expect(resolveGroupHeaderParts({ kind: "text", text: "g1" }, "g1", EN)).toEqual({
      dimension: null,
      chips: [{ text: "g1" }],
    });
  });
});
