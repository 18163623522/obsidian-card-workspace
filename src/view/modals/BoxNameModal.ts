import { Notice, Setting, type App } from "obsidian";
import type { UiStrings } from "../../i18n";
import { FormModal } from "./FormModal";

export interface BoxNameModalOptions {
  strings: UiStrings;
  title: string;
  initialName: string;
  submitLabel: string;
  previewText?: string;
  onSubmit: (name: string) => Promise<void>;
}

/** Lightweight name-entry modal for creating/renaming/saving card boxes. */
export class BoxNameModal extends FormModal {
  private readonly options: BoxNameModalOptions;
  private nextName: string;

  constructor(app: App, options: BoxNameModalOptions) {
    super(app, {
      cancel: options.strings.box.cancel,
      submit: options.submitLabel,
      submitting: options.submitLabel,
    });
    this.options = options;
    this.nextName = options.initialName;
  }

  protected renderBody(): void {
    const strings = this.options.strings.box;
    this.setTitle(this.options.title);

    if (this.options.previewText) {
      this.contentEl.createEl("p", {
        text: this.options.previewText,
        cls: "fce-box-name__preview",
      });
    }

    new Setting(this.contentEl).setName(strings.nameLabel).addText((text) => {
      text
        .setValue(this.nextName)
        .setPlaceholder(strings.namePlaceholder)
        .onChange((value) => {
          this.nextName = value;
        });
      this.submitOnEnter(text.inputEl);
    });
  }

  protected async handleSubmit(): Promise<boolean> {
    const name = this.nextName.trim();
    if (name.length === 0) {
      new Notice(this.options.strings.box.emptyNameError);
      return false;
    }

    await this.options.onSubmit(name);
    return true;
  }
}
