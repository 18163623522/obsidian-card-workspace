import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
  const settingTabs: unknown[] = [];
  const settings: MockSetting[] = [];
  const containerEl = {
    empty: vi.fn(),
  };

  class MockSliderComponent {
    min = 0;
    max = 0;
    step = 0;
    value = 0;
    dynamicTooltip = false;
    changeHandler: ((value: number) => Promise<void> | void) | null = null;

    setLimits(min: number, max: number, step: number): this {
      this.min = min;
      this.max = max;
      this.step = step;
      return this;
    }

    setValue(value: number): this {
      this.value = value;
      return this;
    }

    setDynamicTooltip(): this {
      this.dynamicTooltip = true;
      return this;
    }

    onChange(handler: (value: number) => Promise<void> | void): this {
      this.changeHandler = handler;
      return this;
    }
  }

  class MockDropdownComponent {
    options: Array<{ value: string; label: string }> = [];
    value = "";
    changeHandler: ((value: string) => Promise<void> | void) | null = null;

    addOption(value: string, label: string): this {
      this.options.push({ value, label });
      return this;
    }

    setValue(value: string): this {
      this.value = value;
      return this;
    }

    onChange(handler: (value: string) => Promise<void> | void): this {
      this.changeHandler = handler;
      return this;
    }
  }

  class MockToggleComponent {
    value = false;
    changeHandler: ((value: boolean) => Promise<void> | void) | null = null;

    setValue(value: boolean): this {
      this.value = value;
      return this;
    }

    onChange(handler: (value: boolean) => Promise<void> | void): this {
      this.changeHandler = handler;
      return this;
    }
  }

  class MockSetting {
    name = "";
    desc = "";
    slider: MockSliderComponent | null = null;
    dropdown: MockDropdownComponent | null = null;
    toggle: MockToggleComponent | null = null;

    constructor(_containerEl: unknown) {
      settings.push(this);
    }

    setName(name: string): this {
      this.name = name;
      return this;
    }

    setDesc(desc: string): this {
      this.desc = desc;
      return this;
    }

    addSlider(configure: (slider: MockSliderComponent) => void): this {
      this.slider = new MockSliderComponent();
      configure(this.slider);
      return this;
    }

    addDropdown(configure: (dropdown: MockDropdownComponent) => void): this {
      this.dropdown = new MockDropdownComponent();
      configure(this.dropdown);
      return this;
    }

    addToggle(configure: (toggle: MockToggleComponent) => void): this {
      this.toggle = new MockToggleComponent();
      configure(this.toggle);
      return this;
    }
  }

  class MockPluginSettingTab {
    app: unknown;
    plugin: unknown;
    containerEl = containerEl;

    constructor(app: unknown, plugin: unknown) {
      this.app = app;
      this.plugin = plugin;
      settingTabs.push(this);
    }
  }

  return {
    MockPluginSettingTab,
    MockSetting,
    containerEl,
    settings,
    settingTabs,
  };
});

vi.mock("obsidian", () => {
  return {
    PluginSettingTab: mockState.MockPluginSettingTab,
    Setting: mockState.MockSetting,
  };
});

import { CardWorkspaceSettingTab } from "./CardWorkspaceSettingTab";

describe("CardWorkspaceSettingTab", () => {
  beforeEach(() => {
    mockState.settings.length = 0;
    vi.clearAllMocks();
  });

  it("renders the card behavior dropdowns, preview slider, and navigation toggle", () => {
    const plugin = {
      getSettings: vi.fn(() => ({
        cardCornerRadius: "medium",
        defaultCardOpenBehavior: "split-right",
        locateLinkCardOnOpen: false,
        dragInsertAction: "embed",
        newNoteTemplate: "blank",
        previewLines: 6,
        showNavItemCounts: false,
      })),
      saveSettings: vi.fn(),
      getUiLanguage: vi.fn(() => "en"),
    };

    const tab = new CardWorkspaceSettingTab({} as never, plugin as never);
    tab.display();

    expect(mockState.containerEl.empty).toHaveBeenCalledTimes(1);
    expect(mockState.settings).toHaveLength(9);
    expect(mockState.settings.map((setting) => setting.name)).toEqual([
      "Default card open behavior",
      "Card drag insert behavior",
      "New note content",
      "Card corner radius",
      "Preview lines",
      "Show item counts in navigation",
      "Jump to link location when opening a link card",
      "Card images",
      "Image fit",
    ]);
    expect(mockState.settings[0]?.dropdown).toMatchObject({
      value: "split-right",
      options: [
        { value: "smart", label: "Current pane / current tab" },
        { value: "new-tab", label: "Open in new tab" },
        { value: "split-right", label: "Open to the right" },
        { value: "new-window", label: "Open in new window" },
      ],
    });
    expect(mockState.settings[1]?.dropdown).toMatchObject({
      value: "embed",
      options: [
        { value: "ask", label: "Ask every time" },
        { value: "wiki", label: "Insert wiki link" },
        { value: "embed", label: "Insert embed link" },
        { value: "content", label: "Insert card content" },
        { value: "title-content", label: "Insert card title & content" },
      ],
    });
    expect(mockState.settings[2]?.dropdown).toMatchObject({
      value: "blank",
      options: [
        { value: "tags-frontmatter", label: "Start with a tags property" },
        { value: "blank", label: "Start blank" },
      ],
    });
    expect(mockState.settings[3]?.dropdown).toMatchObject({
      value: "medium",
      options: [
        { value: "compact", label: "Compact" },
        { value: "medium", label: "Softer" },
        { value: "rounded", label: "Rounded" },
      ],
    });
    expect(mockState.settings[4]?.slider).toMatchObject({
      min: 3,
      max: 8,
      step: 1,
      value: 6,
      dynamicTooltip: true,
    });
    expect(mockState.settings[5]?.toggle).toMatchObject({
      value: false,
    });
    expect(mockState.settings[6]?.toggle).toMatchObject({ value: false });
    expect(mockState.settings[6]?.desc).toContain("Remember Cursor Position");

    const definitions = tab.getSettingDefinitions();
    expect(definitions.map((definition) => definition.name)).toEqual(
      mockState.settings.map((setting) => setting.name),
    );
    expect(definitions.map((definition) => definition.desc)).toEqual(
      mockState.settings.map((setting) => setting.desc),
    );
    expect(definitions[0]?.control).toEqual({
      type: "dropdown",
      key: "defaultCardOpenBehavior",
      options: {
        smart: "Current pane / current tab",
        "new-tab": "Open in new tab",
        "split-right": "Open to the right",
        "new-window": "Open in new window",
      },
    });
    expect(definitions[4]?.control).toBeUndefined();
    expect(definitions[4]?.render).toEqual(expect.any(Function));
    expect(definitions[5]?.control).toEqual({ type: "toggle", key: "showNavItemCounts" });
    expect(tab.getControlValue("defaultCardOpenBehavior")).toBe("split-right");
    expect(tab.getControlValue("previewLines")).toBe(6);
    expect(tab.getControlValue("showNavItemCounts")).toBe(false);
    expect(tab.getControlValue("pinnedPaths")).toBeUndefined();
  });

  it("renders Chinese labels when the Obsidian language is Chinese", () => {
    const plugin = {
      getSettings: vi.fn(() => ({
        cardCornerRadius: "medium",
        defaultCardOpenBehavior: "split-right",
        dragInsertAction: "embed",
        newNoteTemplate: "tags-frontmatter",
        previewLines: 6,
        showNavItemCounts: false,
      })),
      saveSettings: vi.fn(),
      getUiLanguage: vi.fn(() => "zh"),
    };

    const tab = new CardWorkspaceSettingTab({} as never, plugin as never);
    tab.display();

    expect(mockState.settings.map((setting) => setting.name)).toEqual([
      "卡片默认打开方式",
      "卡片拖拽插入行为",
      "新建笔记内容",
      "卡片圆角",
      "预览行数",
      "在导航栏显示条目计数",
      "双链卡片点击定位",
      "卡片图片",
      "图片显示方式",
    ]);
    expect(mockState.settings[0]?.dropdown?.options[0]).toEqual({
      value: "smart",
      label: "当前窗格 / 当前标签页",
    });
    expect(mockState.settings[1]?.dropdown?.options).toEqual([
      { value: "ask", label: "每次弹框确认" },
      { value: "wiki", label: "插入 wiki link" },
      { value: "embed", label: "插入嵌入 link" },
      { value: "content", label: "插入卡片内容" },
      { value: "title-content", label: "插入卡片标题&内容" },
    ]);
    expect(mockState.settings[2]?.dropdown?.options).toEqual([
      { value: "tags-frontmatter", label: "带 tags 属性" },
      { value: "blank", label: "完全空白" },
    ]);
    expect(tab.getSettingDefinitions().map((definition) => definition.name)).toEqual([
      "卡片默认打开方式",
      "卡片拖拽插入行为",
      "新建笔记内容",
      "卡片圆角",
      "预览行数",
      "在导航栏显示条目计数",
      "双链卡片点击定位",
      "卡片图片",
      "图片显示方式",
    ]);
    expect(tab.getSettingDefinitions()[0]?.control).toMatchObject({
      options: { smart: "当前窗格 / 当前标签页" },
    });
  });

  it("saves defaultCardOpenBehavior changes from the dropdown", async () => {
    const plugin = {
      getSettings: vi.fn(() => ({
        cardCornerRadius: "compact",
        defaultCardOpenBehavior: "smart",
        dragInsertAction: "ask",
        newNoteTemplate: "tags-frontmatter",
        previewLines: 5,
      })),
      saveSettings: vi.fn(async () => undefined),
      getUiLanguage: vi.fn(() => "en"),
    };

    const tab = new CardWorkspaceSettingTab({} as never, plugin as never);
    tab.display();

    await mockState.settings[0]?.dropdown?.changeHandler?.("new-window");

    expect(plugin.saveSettings).toHaveBeenCalledWith({ defaultCardOpenBehavior: "new-window" });
  });

  it("saves dragInsertAction changes from the dropdown", async () => {
    const plugin = {
      getSettings: vi.fn(() => ({
        cardCornerRadius: "compact",
        defaultCardOpenBehavior: "smart",
        dragInsertAction: "ask",
        newNoteTemplate: "tags-frontmatter",
        previewLines: 5,
      })),
      saveSettings: vi.fn(async () => undefined),
      getUiLanguage: vi.fn(() => "en"),
    };

    const tab = new CardWorkspaceSettingTab({} as never, plugin as never);
    tab.display();

    await mockState.settings[1]?.dropdown?.changeHandler?.("embed");

    expect(plugin.saveSettings).toHaveBeenCalledWith({ dragInsertAction: "embed" });
  });

  it("saves newNoteTemplate changes from the dropdown", async () => {
    const plugin = {
      getSettings: vi.fn(() => ({
        cardCornerRadius: "compact",
        defaultCardOpenBehavior: "smart",
        dragInsertAction: "ask",
        newNoteTemplate: "tags-frontmatter",
        previewLines: 5,
      })),
      saveSettings: vi.fn(async () => undefined),
      getUiLanguage: vi.fn(() => "en"),
    };

    const tab = new CardWorkspaceSettingTab({} as never, plugin as never);
    tab.display();

    await mockState.settings[2]?.dropdown?.changeHandler?.("blank");

    expect(plugin.saveSettings).toHaveBeenCalledWith({ newNoteTemplate: "blank" });
  });

  it("ignores unsupported newNoteTemplate values from the dropdown", async () => {
    const plugin = {
      getSettings: vi.fn(() => ({
        cardCornerRadius: "compact",
        defaultCardOpenBehavior: "smart",
        dragInsertAction: "ask",
        newNoteTemplate: "tags-frontmatter",
        previewLines: 5,
      })),
      saveSettings: vi.fn(async () => undefined),
      getUiLanguage: vi.fn(() => "en"),
    };

    const tab = new CardWorkspaceSettingTab({} as never, plugin as never);
    tab.display();

    await mockState.settings[2]?.dropdown?.changeHandler?.("daily-note");

    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it("saves cardCornerRadius changes from the dropdown", async () => {
    const plugin = {
      getSettings: vi.fn(() => ({
        cardCornerRadius: "compact",
        defaultCardOpenBehavior: "smart",
        dragInsertAction: "ask",
        newNoteTemplate: "tags-frontmatter",
        previewLines: 5,
      })),
      saveSettings: vi.fn(async () => undefined),
      getUiLanguage: vi.fn(() => "en"),
    };

    const tab = new CardWorkspaceSettingTab({} as never, plugin as never);
    tab.display();

    await mockState.settings[3]?.dropdown?.changeHandler?.("rounded");

    expect(plugin.saveSettings).toHaveBeenCalledWith({ cardCornerRadius: "rounded" });
  });

  it("saves the link-card jump toggle independently of preview settings", async () => {
    const plugin = {
      getSettings: vi.fn(() => ({ locateLinkCardOnOpen: false })),
      saveSettings: vi.fn(async () => undefined),
      getUiLanguage: vi.fn(() => "en"),
    };
    const tab = new CardWorkspaceSettingTab({} as never, plugin as never);
    tab.display();
    await mockState.settings[6]?.toggle?.changeHandler?.(true);
    expect(plugin.saveSettings).toHaveBeenCalledWith({ locateLinkCardOnOpen: true });
  });

  it("saves declarative setting changes and ignores values outside the legacy tab", async () => {
    const plugin = {
      getSettings: vi.fn(() => ({
        cardCornerRadius: "compact",
        defaultCardOpenBehavior: "smart",
        locateLinkCardOnOpen: false,
        dragInsertAction: "ask",
        newNoteTemplate: "tags-frontmatter",
        previewLines: 5,
        showNavItemCounts: true,
      })),
      saveSettings: vi.fn(async () => undefined),
      getUiLanguage: vi.fn(() => "en"),
    };
    const tab = new CardWorkspaceSettingTab({} as never, plugin as never);

    await tab.setControlValue("newNoteTemplate", "blank");
    await tab.setControlValue("newNoteTemplate", "daily-note");
    await tab.setControlValue("previewLines", 4);
    await tab.setControlValue("previewLines", 99);
    await tab.setControlValue("locateLinkCardOnOpen", true);
    await tab.setControlValue("pinnedPaths", ["notes/a.md"]);

    expect(plugin.saveSettings.mock.calls).toEqual([
      [{ newNoteTemplate: "blank" }],
      [{ previewLines: 4 }],
      [{ locateLinkCardOnOpen: true }],
    ]);

    const preview = tab.getSettingDefinitions()[4];
    const setting = new mockState.MockSetting({});
    preview?.render?.(setting as never);
    await setting.slider?.changeHandler?.(7);
    await setting.slider?.changeHandler?.(1);

    expect(plugin.saveSettings.mock.calls).toEqual([
      [{ newNoteTemplate: "blank" }],
      [{ previewLines: 4 }],
      [{ locateLinkCardOnOpen: true }],
      [{ previewLines: 7 }],
    ]);
    expect(setting.slider).toMatchObject({
      min: 3,
      max: 8,
      step: 1,
      value: 5,
      dynamicTooltip: true,
    });
  });
});
