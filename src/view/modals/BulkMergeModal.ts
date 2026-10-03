import { Notice, Setting, TFile, TFolder, type App } from "obsidian";
import { FolderPickerModal } from "../../FolderPickerModal";
import type { UiStrings } from "../../i18n";
import { buildMergedNoteContent } from "../note-ops";
import { FormModal } from "./FormModal";
import { createModalGroup } from "./modal-layout";

export type MergeCleanupMode = "keep" | "trash";

export interface MergeModalSubmitResult {
  files: TFile[];
  targetFolder: TFolder;
  mergedTitle: string;
  separator: string;
  cleanupMode: MergeCleanupMode;
}

export interface BulkMergeModalOptions {
  files: TFile[];
  initialTargetFolder: TFolder;
  initialMergedTitle: string;
  strings: UiStrings["view"]["merge"];
  folderPickerTitle: string;
}

/**
 * Merged notes are `# title` + body blocks joined directly, so every preset keeps at
 * least one line break to stop the next heading from gluing onto the previous body.
 */
const SEPARATOR_PRESETS = {
  blankLine: "\n\n",
  rule: "\n\n---\n\n",
  newline: "\n",
} as const;

type SeparatorPreset = keyof typeof SEPARATOR_PRESETS;

const PREVIEW_MAX_CHARS = 4000;

type PreviewState =
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  | { kind: "error"; message: string };

export class BulkMergeModal extends FormModal {
  private readonly strings: UiStrings["view"]["merge"];
  private readonly folderPickerTitle: string;
  private readonly onSubmit: (result: MergeModalSubmitResult) => Promise<boolean>;
  private readonly noteContents = new Map<string, string>();
  private orderedFiles: TFile[];
  private targetFolder: TFolder;
  private mergedTitle: string;
  private separatorPreset: SeparatorPreset = "blankLine";
  private cleanupMode: MergeCleanupMode = "keep";
  private previewState: PreviewState = { kind: "loading" };
  private previewEl: HTMLElement | null = null;
  private targetFolderSetting: Setting | null = null;
  private closed = true;
  private previewRequestSeq = 0;
  private submitRequestSeq = 0;

  constructor(app: App, options: BulkMergeModalOptions, onSubmit: (result: MergeModalSubmitResult) => Promise<boolean>) {
    super(app, { cancel: options.strings.cancel, submit: options.strings.mergeNotes, submitting: options.strings.merging });
    this.useScrollableLayout();
    this.orderedFiles = [...options.files];
    this.targetFolder = options.initialTargetFolder;
    this.mergedTitle = options.initialMergedTitle;
    this.strings = options.strings;
    this.folderPickerTitle = options.folderPickerTitle;
    this.onSubmit = onSubmit;
  }

  override onOpen(): void {
    this.closed = false;
    this.render();
    void this.refreshPreview();
  }

  override onClose(): void {
    this.closed = true;
    this.previewRequestSeq += 1;
    this.submitRequestSeq += 1;
    this.previewEl = null;
    this.targetFolderSetting = null;
    super.onClose();
  }

  protected override render(): void {
    if (this.closed) {
      return;
    }
    const scrollTop = this.contentEl.scrollTop;
    super.render();
    this.contentEl.scrollTop = scrollTop;
  }

  protected override isSubmitDisabled(): boolean {
    return this.orderedFiles.length < 2;
  }

  protected renderBody(): void {
    const strings = this.strings;
    this.setTitle(strings.title);

    const optionsGroup = createModalGroup(this.contentEl);
    optionsGroup.addSetting((setting) => {
      setting.setName(strings.mergedTitle).addText((text) => {
        text
          .setValue(this.mergedTitle)
          .setPlaceholder(strings.defaultMergedTitle)
          .onChange((value) => {
            this.mergedTitle = value;
          });
      });
    });
    optionsGroup.addSetting((setting) => {
      this.targetFolderSetting = setting;
      setting
        .setName(strings.targetFolder)
        .setDesc(this.describeTargetFolder())
        .addButton((button) => {
          button.setButtonText(strings.chooseFolder).onClick(() => this.chooseTargetFolder());
        });
    });
    optionsGroup.addSetting((setting) => {
      setting
        .setName(strings.separator)
        .setDesc(strings.separatorDesc)
        .addDropdown((dropdown) => {
          dropdown
            .addOption("blankLine", strings.separatorBlankLine)
            .addOption("rule", strings.separatorRule)
            .addOption("newline", strings.separatorNewline)
            .setValue(this.separatorPreset)
            .onChange((value) => {
              this.separatorPreset = value as SeparatorPreset;
              void this.refreshPreview();
            });
        });
    });
    optionsGroup.addSetting((setting) => {
      setting.setName(strings.trashSourceNotesAfterMerge).addToggle((toggle) => {
        toggle.setValue(this.cleanupMode === "trash").onChange((value) => {
          this.cleanupMode = value ? "trash" : "keep";
        });
      });
    });

    const orderGroup = createModalGroup(this.contentEl, {
      heading: `${strings.sourceOrder} · ${strings.sourceCount(this.orderedFiles.length)}`,
      compact: true,
    });
    const lastIndex = this.orderedFiles.length - 1;
    this.orderedFiles.forEach((file, index) => {
      orderGroup.addSetting((setting) => {
        setting.setName(`${index + 1}. ${file.basename}`).setDesc(describeParentFolder(file));
        setting.addExtraButton((button) => {
          button
            .setIcon("arrow-up")
            .setTooltip(strings.up)
            .setDisabled(index === 0)
            .onClick(() => this.moveFile(index, -1));
        });
        setting.addExtraButton((button) => {
          button
            .setIcon("arrow-down")
            .setTooltip(strings.down)
            .setDisabled(index === lastIndex)
            .onClick(() => this.moveFile(index, 1));
        });
      });
    });

    const previewGroup = createModalGroup(this.contentEl, { heading: strings.preview });
    this.previewEl = previewGroup.listEl.createDiv({ cls: "fce-modal-preview" });
    this.applyPreview();
  }

  private get separator(): string {
    return SEPARATOR_PRESETS[this.separatorPreset];
  }

  private describeTargetFolder(): string {
    return this.targetFolder.path === "" ? "/" : this.targetFolder.path;
  }

  private chooseTargetFolder(): void {
    const picker = new FolderPickerModal(this.app, (folder: TFolder) => {
      this.targetFolder = folder;
      this.targetFolderSetting?.setDesc(this.describeTargetFolder());
    }, this.folderPickerTitle);
    picker.open();
  }

  private moveFile(index: number, delta: -1 | 1): void {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= this.orderedFiles.length) {
      return;
    }
    const nextFiles = [...this.orderedFiles];
    const [moved] = nextFiles.splice(index, 1);
    if (!moved) {
      return;
    }
    nextFiles.splice(nextIndex, 0, moved);
    this.orderedFiles = nextFiles;
    void this.refreshPreview();
    this.render();
  }

  private applyPreview(): void {
    const previewEl = this.previewEl;
    if (previewEl === null || !previewEl.isConnected) {
      return;
    }
    const state = this.previewState;
    previewEl.toggleClass("is-error", state.kind === "error");
    if (state.kind === "loading") {
      previewEl.setText(this.strings.loadingPreview);
    } else if (state.kind === "error") {
      previewEl.setText(state.message);
    } else {
      previewEl.setText(
        state.text.length > PREVIEW_MAX_CHARS ? `${state.text.slice(0, PREVIEW_MAX_CHARS)}\n…` : state.text,
      );
    }
  }

  private async refreshPreview(): Promise<void> {
    const requestSeq = ++this.previewRequestSeq;
    const orderedFiles = [...this.orderedFiles];
    const separator = this.separator;
    try {
      // Each source is read once; reorder and separator changes rebuild from the cache.
      for (const file of orderedFiles) {
        if (this.noteContents.has(file.path)) {
          continue;
        }
        const content = await this.app.vault.cachedRead(file);
        if (this.closed || requestSeq !== this.previewRequestSeq) {
          return;
        }
        this.noteContents.set(file.path, content);
      }
      if (this.closed || requestSeq !== this.previewRequestSeq) {
        return;
      }
      const notes = orderedFiles.map((file) => ({
        basename: file.basename,
        content: this.noteContents.get(file.path) ?? "",
      }));
      this.previewState = { kind: "ready", text: buildMergedNoteContent(notes, separator) };
    } catch (error) {
      if (this.closed || requestSeq !== this.previewRequestSeq) {
        return;
      }
      this.previewState = { kind: "error", message: this.strings.failedToBuildPreview(String(error)) };
    }
    this.applyPreview();
  }

  protected async handleSubmit(): Promise<boolean> {
    if (this.orderedFiles.length < 2) {
      return false;
    }
    const requestSeq = ++this.submitRequestSeq;
    try {
      const mergedTitle = this.mergedTitle.trim();
      const shouldClose = await this.onSubmit({
        files: [...this.orderedFiles],
        targetFolder: this.targetFolder,
        mergedTitle: mergedTitle.length > 0 ? mergedTitle : this.strings.defaultMergedTitle,
        separator: this.separator,
        cleanupMode: this.cleanupMode,
      });
      if (this.closed || requestSeq !== this.submitRequestSeq) {
        return false;
      }
      return shouldClose;
    } catch (error) {
      if (this.closed || requestSeq !== this.submitRequestSeq) {
        return false;
      }
      new Notice(this.strings.failedToMergeNotes(String(error)));
      return false;
    }
  }
}

function describeParentFolder(file: TFile): string {
  const separatorIndex = file.path.lastIndexOf("/");
  return separatorIndex < 0 ? "/" : file.path.slice(0, separatorIndex);
}
