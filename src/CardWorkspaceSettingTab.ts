import { PluginSettingTab, Setting, type App } from "obsidian";
import {
  getCardCornerRadiusOptions,
  getDefaultCardOpenBehaviorOptions,
  getDragInsertActionOptions,
  getNewNoteTemplateOptions,
  getSettingTabStrings,
} from "./i18n";
import {
  PREVIEW_LINES_MAX,
  PREVIEW_LINES_MIN,
  isCardCornerRadius,
  isDefaultCardOpenBehavior,
  isDragInsertAction,
  isNewNoteTemplate,
  type PartialPluginSettings,
} from "./settings";
import type CardWorkspacePlugin from "./main";

/**
 * One settings row as Obsidian 1.13+ indexes it for settings search.
 * Hosts older than 1.13 keep using {@link CardWorkspaceSettingTab.display}.
 */
interface SearchableSettingDefinition {
  name: string;
  desc: string;
  control?:
    | { type: "dropdown"; key: string; options: Record<string, string> }
    | { type: "toggle"; key: string };
  render?: (setting: Setting) => void;
}

function optionRecord(options: readonly { value: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(options.map((option) => [option.value, option.label]));
}

function declarativeSettingPatch(key: string, value: unknown): PartialPluginSettings | null {
  switch (key) {
    case "defaultCardOpenBehavior":
      return typeof value === "string" && isDefaultCardOpenBehavior(value)
        ? { defaultCardOpenBehavior: value }
        : null;
    case "dragInsertAction":
      return typeof value === "string" && isDragInsertAction(value)
        ? { dragInsertAction: value }
        : null;
    case "newNoteTemplate":
      return typeof value === "string" && isNewNoteTemplate(value)
        ? { newNoteTemplate: value }
        : null;
    case "cardCornerRadius":
      return typeof value === "string" && isCardCornerRadius(value)
        ? { cardCornerRadius: value }
        : null;
    case "previewLines":
      return typeof value === "number"
        && Number.isInteger(value)
        && value >= PREVIEW_LINES_MIN
        && value <= PREVIEW_LINES_MAX
        ? { previewLines: value }
        : null;
    case "showNavItemCounts":
      return typeof value === "boolean" ? { showNavItemCounts: value } : null;
    case "locateLinkCardOnOpen":
      return typeof value === "boolean" ? { locateLinkCardOnOpen: value } : null;
    default:
      return null;
  }
}

export class CardWorkspaceSettingTab extends PluginSettingTab {
  private plugin: CardWorkspacePlugin;

  constructor(app: App, plugin: CardWorkspacePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Settings live in SettingsStore, so the 1.13 control binding must not read
   * or write `plugin.settings` / `saveData`.
   */
  getControlValue(key: string): unknown {
    const settings = this.plugin.getSettings();
    switch (key) {
      case "defaultCardOpenBehavior":
        return settings.defaultCardOpenBehavior;
      case "dragInsertAction":
        return settings.dragInsertAction;
      case "newNoteTemplate":
        return settings.newNoteTemplate;
      case "cardCornerRadius":
        return settings.cardCornerRadius;
      case "previewLines":
        return settings.previewLines;
      case "showNavItemCounts":
        return settings.showNavItemCounts;
      case "locateLinkCardOnOpen":
        return settings.locateLinkCardOnOpen;
      default:
        return undefined;
    }
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    await this.saveDeclarativeSetting(key, value);
  }

  getSettingDefinitions(): SearchableSettingDefinition[] {
    const language = this.plugin.getUiLanguage();
    const strings = getSettingTabStrings(language);

    return [
      {
        name: strings.defaultCardOpenBehaviorName,
        desc: strings.defaultCardOpenBehaviorDesc,
        control: {
          type: "dropdown",
          key: "defaultCardOpenBehavior",
          options: optionRecord(getDefaultCardOpenBehaviorOptions(language)),
        },
      },
      {
        name: strings.dragInsertActionName,
        desc: strings.dragInsertActionDesc,
        control: {
          type: "dropdown",
          key: "dragInsertAction",
          options: optionRecord(getDragInsertActionOptions(language)),
        },
      },
      {
        name: strings.newNoteTemplateName,
        desc: strings.newNoteTemplateDesc,
        control: {
          type: "dropdown",
          key: "newNoteTemplate",
          options: optionRecord(getNewNoteTemplateOptions(language)),
        },
      },
      {
        name: strings.cardCornerRadiusName,
        desc: strings.cardCornerRadiusDesc,
        control: {
          type: "dropdown",
          key: "cardCornerRadius",
          options: optionRecord(getCardCornerRadiusOptions(language)),
        },
      },
      {
        name: strings.previewLinesName,
        desc: strings.previewLinesDesc(PREVIEW_LINES_MIN, PREVIEW_LINES_MAX),
        render: (setting) => {
          this.bindPreviewLinesSlider(setting);
        },
      },
      {
        name: strings.showNavItemCountsName,
        desc: strings.showNavItemCountsDesc,
        control: { type: "toggle", key: "showNavItemCounts" },
      },
      {
        name: strings.locateLinkCardOnOpenName,
        desc: strings.locateLinkCardOnOpenDesc,
        control: { type: "toggle", key: "locateLinkCardOnOpen" },
      },
    ];
  }

  display(): void {
    const { containerEl } = this;
    const {
      cardCornerRadius,
      defaultCardOpenBehavior,
      locateLinkCardOnOpen,
      dragInsertAction,
      newNoteTemplate,
      showNavItemCounts,
    } = this.plugin.getSettings();
    const language = this.plugin.getUiLanguage();
    const strings = getSettingTabStrings(language);

    containerEl.empty();

    new Setting(containerEl)
      .setName(strings.defaultCardOpenBehaviorName)
      .setDesc(strings.defaultCardOpenBehaviorDesc)
      .addDropdown((dropdown) => {
        for (const option of getDefaultCardOpenBehaviorOptions(language)) {
          dropdown.addOption(option.value, option.label);
        }

        dropdown.setValue(defaultCardOpenBehavior).onChange(async (value) => {
          await this.saveDeclarativeSetting("defaultCardOpenBehavior", value);
        });
      });

    new Setting(containerEl)
      .setName(strings.dragInsertActionName)
      .setDesc(strings.dragInsertActionDesc)
      .addDropdown((dropdown) => {
        for (const option of getDragInsertActionOptions(language)) {
          dropdown.addOption(option.value, option.label);
        }

        dropdown.setValue(dragInsertAction).onChange(async (value) => {
          await this.saveDeclarativeSetting("dragInsertAction", value);
        });
      });

    new Setting(containerEl)
      .setName(strings.newNoteTemplateName)
      .setDesc(strings.newNoteTemplateDesc)
      .addDropdown((dropdown) => {
        for (const option of getNewNoteTemplateOptions(language)) {
          dropdown.addOption(option.value, option.label);
        }

        dropdown.setValue(newNoteTemplate).onChange(async (value) => {
          await this.saveDeclarativeSetting("newNoteTemplate", value);
        });
      });

    new Setting(containerEl)
      .setName(strings.cardCornerRadiusName)
      .setDesc(strings.cardCornerRadiusDesc)
      .addDropdown((dropdown) => {
        for (const option of getCardCornerRadiusOptions(language)) {
          dropdown.addOption(option.value, option.label);
        }

        dropdown.setValue(cardCornerRadius).onChange(async (value) => {
          await this.saveDeclarativeSetting("cardCornerRadius", value);
        });
      });

    this.bindPreviewLinesSlider(
      new Setting(containerEl)
        .setName(strings.previewLinesName)
        .setDesc(strings.previewLinesDesc(PREVIEW_LINES_MIN, PREVIEW_LINES_MAX)),
    );

    new Setting(containerEl)
      .setName(strings.showNavItemCountsName)
      .setDesc(strings.showNavItemCountsDesc)
      .addToggle((toggle) => {
        toggle.setValue(showNavItemCounts).onChange(async (value) => {
          await this.saveDeclarativeSetting("showNavItemCounts", value);
        });
      });

    new Setting(containerEl)
      .setName(strings.locateLinkCardOnOpenName)
      .setDesc(strings.locateLinkCardOnOpenDesc)
      .addToggle((toggle) => {
        toggle.setValue(locateLinkCardOnOpen).onChange(async (value) => {
          await this.saveDeclarativeSetting("locateLinkCardOnOpen", value);
        });
      });
  }

  private bindPreviewLinesSlider(setting: Setting): void {
    setting.addSlider((slider) => {
      slider
        .setLimits(PREVIEW_LINES_MIN, PREVIEW_LINES_MAX, 1)
        .setValue(this.plugin.getSettings().previewLines)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await this.saveDeclarativeSetting("previewLines", value);
        });
    });
  }

  private async saveDeclarativeSetting(key: string, value: unknown): Promise<void> {
    const patch = declarativeSettingPatch(key, value);
    if (patch === null) {
      return;
    }
    await this.plugin.saveSettings(patch);
  }
}
