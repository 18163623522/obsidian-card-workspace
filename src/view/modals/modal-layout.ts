import { SettingGroup } from "obsidian";

export interface ModalGroupOptions {
  heading?: string;
  /** Tighter rows for lists of paths, rules, and similar records. */
  compact?: boolean;
}

export function createModalGroup(containerEl: HTMLElement, options: ModalGroupOptions = {}): SettingGroup {
  const group = new SettingGroup(containerEl);
  if (options.heading) {
    group.setHeading(options.heading);
  }
  if (options.compact) {
    group.addClass("mod-list");
  }
  return group;
}

export function addEmptyGroupRow(group: SettingGroup, text: string, cls?: string): void {
  group.addSetting((setting) => {
    setting.setName(text).setClass("mod-empty-state");
    if (cls) {
      setting.setClass(cls);
    }
  });
}

/** Mount custom content through the public Setting surface, not group internals. */
export function createModalPreview(group: SettingGroup): HTMLElement {
  let previewEl!: HTMLElement;
  group.addSetting((setting) => {
    setting.setClass("fce-modal-preview-row");
    setting.settingEl.empty();
    previewEl = setting.settingEl.createDiv({ cls: "fce-modal-preview" });
  });
  return previewEl;
}
