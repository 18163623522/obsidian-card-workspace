import { PluginSettingTab, type App, type SettingDefinitionItem } from "obsidian";
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
  isCardImageMode,
  isCardImageFit,
  isDefaultCardOpenBehavior,
  isDragInsertAction,
  isNewNoteTemplate,
  type PartialPluginSettings,
} from "./settings";
import type CardWorkspacePlugin from "./main";

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
    case "cardImageMode":
      return isCardImageMode(value) ? { cardImageMode: value } : null;
    case "cardImageFit":
      return isCardImageFit(value) ? { cardImageFit: value } : null;
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
    case "enableHeadingDragInsert":
      return typeof value === "boolean" ? { enableHeadingDragInsert: value } : null;
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
   * Settings live in SettingsStore, so the declarative control binding must not
   * read or write `plugin.settings` / `saveData`.
   */
  getControlValue(key: string): unknown {
    const settings = this.plugin.getSettings();
    switch (key) {
      case "defaultCardOpenBehavior":
        return settings.defaultCardOpenBehavior;
      case "dragInsertAction":
        return settings.dragInsertAction;
      case "enableHeadingDragInsert":
        return settings.enableHeadingDragInsert;
      case "newNoteTemplate":
        return settings.newNoteTemplate;
      case "cardCornerRadius":
        return settings.cardCornerRadius;
      case "cardImageMode":
        return settings.cardImageMode;
      case "cardImageFit":
        return settings.cardImageFit;
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
    if (key === "cardImageMode") {
      this.refreshDomState();
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const language = this.plugin.getUiLanguage();
    const strings = getSettingTabStrings(language);

    return [
      {
        type: "group",
        heading: strings.behaviorHeading,
        items: [
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
            name: strings.locateLinkCardOnOpenName,
            desc: strings.locateLinkCardOnOpenDesc,
            control: { type: "toggle", key: "locateLinkCardOnOpen" },
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
            name: strings.enableHeadingDragInsertName,
            desc: strings.enableHeadingDragInsertDesc,
            control: { type: "toggle", key: "enableHeadingDragInsert" },
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
        ],
      },
      {
        type: "group",
        heading: strings.appearanceHeading,
        items: [
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
            control: {
              type: "slider",
              key: "previewLines",
              min: PREVIEW_LINES_MIN,
              max: PREVIEW_LINES_MAX,
              step: 1,
            },
          },
          {
            name: strings.cardImageModeName,
            desc: strings.cardImageModeDesc,
            control: {
              type: "dropdown",
              key: "cardImageMode",
              options: {
                off: strings.imageOff,
                right: strings.imageRight,
                inline: strings.imageInline,
              },
            },
          },
          {
            name: strings.cardImageFitName,
            desc: strings.cardImageFitDesc,
            visible: () => this.plugin.getSettings().cardImageMode !== "off",
            control: {
              type: "dropdown",
              key: "cardImageFit",
              options: { contain: strings.imageContain, cover: strings.imageCover },
            },
          },
          {
            name: strings.showNavItemCountsName,
            desc: strings.showNavItemCountsDesc,
            control: { type: "toggle", key: "showNavItemCounts" },
          },
        ],
      },
    ];
  }

  private async saveDeclarativeSetting(key: string, value: unknown): Promise<void> {
    const patch = declarativeSettingPatch(key, value);
    if (patch === null) {
      return;
    }
    await this.plugin.saveSettings(patch);
  }
}
