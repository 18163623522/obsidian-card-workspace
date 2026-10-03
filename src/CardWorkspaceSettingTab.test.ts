import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingDefinition, SettingDefinitionGroup, SettingDefinitionItem } from "obsidian";

const mockState = vi.hoisted(() => {
  class MockPluginSettingTab {
    app: unknown;
    plugin: unknown;
    refreshDomState = vi.fn();

    constructor(app: unknown, plugin: unknown) {
      this.app = app;
      this.plugin = plugin;
    }
  }

  return { MockPluginSettingTab };
});

vi.mock("obsidian", () => ({
  PluginSettingTab: mockState.MockPluginSettingTab,
}));

import { CardWorkspaceSettingTab } from "./CardWorkspaceSettingTab";

interface PluginStub {
  getSettings: ReturnType<typeof vi.fn>;
  saveSettings: ReturnType<typeof vi.fn>;
  getUiLanguage: ReturnType<typeof vi.fn>;
}

function createPlugin(
  settings: Record<string, unknown> = {},
  language = "en",
): PluginStub {
  return {
    getSettings: vi.fn(() => ({
      cardCornerRadius: "medium",
      defaultCardOpenBehavior: "split-right",
      locateLinkCardOnOpen: false,
      dragInsertAction: "embed",
      enableHeadingDragInsert: false,
      newNoteTemplate: "blank",
      previewLines: 6,
      showNavItemCounts: false,
      cardImageMode: "off",
      cardImageFit: "contain",
      ...settings,
    })),
    saveSettings: vi.fn(async () => undefined),
    getUiLanguage: vi.fn(() => language),
  };
}

function createTab(plugin: PluginStub = createPlugin()) {
  return new CardWorkspaceSettingTab({} as never, plugin as never);
}

function groupsOf(definitions: SettingDefinitionItem[]): SettingDefinitionGroup[] {
  return definitions.filter(
    (definition): definition is SettingDefinitionGroup => "items" in definition,
  );
}

function rowsOf(group: SettingDefinitionGroup | undefined): SettingDefinition[] {
  return (group?.items ?? []).filter((item): item is SettingDefinition => !("items" in item));
}

function controlOf(row: SettingDefinition | undefined) {
  return row?.control;
}

describe("CardWorkspaceSettingTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("describes the settings as two declarative groups with native controls", () => {
    const tab = createTab();
    const definitions = tab.getSettingDefinitions();

    const [behavior, appearance] = groupsOf(definitions);
    expect(definitions).toHaveLength(2);
    expect(behavior?.type).toBe("group");
    expect(behavior?.heading).toBe("Behavior");
    expect(appearance?.heading).toBe("Appearance");

    expect(rowsOf(behavior).map((row) => row.name)).toEqual([
      "Default card open behavior",
      "Jump to link location when opening a link card",
      "Card drag insert behavior",
      "Enable section drag insertion",
      "New note content",
    ]);
    expect(rowsOf(appearance).map((row) => row.name)).toEqual([
      "Card corner radius",
      "Preview lines",
      "Card images",
      "Image fit",
      "Show item counts in navigation",
    ]);
  });

  it("binds each row to a persisted key with the expected option sets", () => {
    const [behavior, appearance] = groupsOf(createTab().getSettingDefinitions());
    const behaviorRows = rowsOf(behavior);
    const appearanceRows = rowsOf(appearance);

    expect(controlOf(behaviorRows[0])).toEqual({
      type: "dropdown",
      key: "defaultCardOpenBehavior",
      options: {
        smart: "Current pane / current tab",
        "new-tab": "Open in new tab",
        "split-right": "Open to the right",
        "new-window": "Open in new window",
      },
    });
    expect(controlOf(behaviorRows[1])).toEqual({ type: "toggle", key: "locateLinkCardOnOpen" });
    expect(controlOf(behaviorRows[2])).toEqual({
      type: "dropdown",
      key: "dragInsertAction",
      options: {
        ask: "Ask every time",
        wiki: "Insert wiki link",
        embed: "Insert embed link",
        content: "Insert card content",
        "title-content": "Insert card title & content",
      },
    });
    expect(controlOf(behaviorRows[3])).toEqual({ type: "toggle", key: "enableHeadingDragInsert" });
    expect(controlOf(behaviorRows[4])).toEqual({
      type: "dropdown",
      key: "newNoteTemplate",
      options: {
        "tags-frontmatter": "Start with a tags property",
        blank: "Start blank",
      },
    });

    expect(controlOf(appearanceRows[0])).toEqual({
      type: "dropdown",
      key: "cardCornerRadius",
      options: { compact: "Compact", medium: "Softer", rounded: "Rounded" },
    });
    expect(controlOf(appearanceRows[1])).toEqual({
      type: "slider",
      key: "previewLines",
      min: 3,
      max: 8,
      step: 1,
    });
    expect(controlOf(appearanceRows[2])).toEqual({
      type: "dropdown",
      key: "cardImageMode",
      options: { off: "Off", right: "Right thumbnail", inline: "Below title" },
    });
    expect(controlOf(appearanceRows[3])).toEqual({
      type: "dropdown",
      key: "cardImageFit",
      options: { contain: "Show whole image", cover: "Crop to fill" },
    });
    expect(controlOf(appearanceRows[4])).toEqual({ type: "toggle", key: "showNavItemCounts" });
  });

  it("keeps descriptions on every row, including the Remember Cursor Position caveat", () => {
    const [behavior, appearance] = groupsOf(createTab().getSettingDefinitions());
    const rows = [...rowsOf(behavior), ...rowsOf(appearance)];

    expect(rows.every((row) => typeof row.desc === "string" && row.desc.length > 0)).toBe(true);
    expect(rowsOf(behavior)[1]?.desc).toContain("Remember Cursor Position");
    expect(rowsOf(appearance)[1]?.desc).toBe(
      "Choose how many normalized summary lines each card preview can show (3-8).",
    );
  });

  it("only offers the image fit row while card images are enabled", () => {
    const plugin = createPlugin({ cardImageMode: "off" });
    const tab = createTab(plugin);
    const fit = rowsOf(groupsOf(tab.getSettingDefinitions())[1])[3];
    const isVisible = fit?.visible as () => boolean;

    expect(isVisible()).toBe(false);
    plugin.getSettings.mockReturnValue({ cardImageMode: "right" });
    expect(isVisible()).toBe(true);
    plugin.getSettings.mockReturnValue({ cardImageMode: "inline" });
    expect(isVisible()).toBe(true);
  });

  it("renders Chinese labels when the Obsidian language is Chinese", () => {
    const tab = createTab(createPlugin({}, "zh"));
    const [behavior, appearance] = groupsOf(tab.getSettingDefinitions());

    expect(behavior?.heading).toBe("行为");
    expect(appearance?.heading).toBe("外观");
    expect(rowsOf(behavior).map((row) => row.name)).toEqual([
      "卡片默认打开方式",
      "双链卡片点击定位",
      "卡片拖拽插入行为",
      "启用章节拖拽插入",
      "新建笔记内容",
    ]);
    expect(rowsOf(appearance).map((row) => row.name)).toEqual([
      "卡片圆角",
      "预览行数",
      "卡片图片",
      "图片显示方式",
      "在导航栏显示条目计数",
    ]);
    expect(controlOf(rowsOf(behavior)[0])).toMatchObject({
      options: { smart: "当前窗格 / 当前标签页" },
    });
    expect(controlOf(rowsOf(behavior)[2])).toMatchObject({
      options: {
        ask: "每次弹框确认",
        wiki: "插入 wiki link",
        embed: "插入嵌入 link",
        content: "插入卡片内容",
        "title-content": "插入卡片标题&内容",
      },
    });
  });

  it("does not implement the deprecated imperative display fallback", () => {
    expect("display" in createTab()).toBe(false);
  });

  it("reads control values from the settings store only", () => {
    const tab = createTab();

    expect(tab.getControlValue("defaultCardOpenBehavior")).toBe("split-right");
    expect(tab.getControlValue("dragInsertAction")).toBe("embed");
    expect(tab.getControlValue("enableHeadingDragInsert")).toBe(false);
    expect(tab.getControlValue("newNoteTemplate")).toBe("blank");
    expect(tab.getControlValue("cardCornerRadius")).toBe("medium");
    expect(tab.getControlValue("previewLines")).toBe(6);
    expect(tab.getControlValue("showNavItemCounts")).toBe(false);
    expect(tab.getControlValue("locateLinkCardOnOpen")).toBe(false);
    expect(tab.getControlValue("cardImageMode")).toBe("off");
    expect(tab.getControlValue("cardImageFit")).toBe("contain");
    expect(tab.getControlValue("pinnedPaths")).toBeUndefined();
  });

  it("saves valid changes through the plugin and ignores values outside the schema", async () => {
    const plugin = createPlugin();
    const tab = createTab(plugin);

    await tab.setControlValue("defaultCardOpenBehavior", "new-window");
    await tab.setControlValue("dragInsertAction", "embed");
    await tab.setControlValue("enableHeadingDragInsert", true);
    await tab.setControlValue("enableHeadingDragInsert", "yes");
    await tab.setControlValue("newNoteTemplate", "blank");
    await tab.setControlValue("newNoteTemplate", "daily-note");
    await tab.setControlValue("cardCornerRadius", "rounded");
    await tab.setControlValue("previewLines", 4);
    await tab.setControlValue("previewLines", 99);
    await tab.setControlValue("previewLines", 4.5);
    await tab.setControlValue("showNavItemCounts", true);
    await tab.setControlValue("showNavItemCounts", "yes");
    await tab.setControlValue("locateLinkCardOnOpen", true);
    await tab.setControlValue("cardImageFit", "cover");
    await tab.setControlValue("pinnedPaths", ["notes/a.md"]);

    expect(plugin.saveSettings.mock.calls).toEqual([
      [{ defaultCardOpenBehavior: "new-window" }],
      [{ dragInsertAction: "embed" }],
      [{ enableHeadingDragInsert: true }],
      [{ newNoteTemplate: "blank" }],
      [{ cardCornerRadius: "rounded" }],
      [{ previewLines: 4 }],
      [{ showNavItemCounts: true }],
      [{ locateLinkCardOnOpen: true }],
      [{ cardImageFit: "cover" }],
    ]);
  });

  it("re-evaluates row visibility only after the card image mode is saved", async () => {
    const plugin = createPlugin();
    const tab = createTab(plugin) as unknown as {
      refreshDomState: ReturnType<typeof vi.fn>;
      setControlValue: (key: string, value: unknown) => Promise<void>;
    };

    await tab.setControlValue("cardImageFit", "cover");
    await tab.setControlValue("previewLines", 5);
    expect(tab.refreshDomState).not.toHaveBeenCalled();

    await tab.setControlValue("cardImageMode", "right");
    expect(plugin.saveSettings).toHaveBeenLastCalledWith({ cardImageMode: "right" });
    expect(tab.refreshDomState).toHaveBeenCalledTimes(1);
  });
});
