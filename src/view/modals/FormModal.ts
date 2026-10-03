import { ConfirmationModal, type App, type ConfirmationButton } from "obsidian";

export interface FormModalLabels {
  cancel: string;
  submit: string;
  submitting: string;
}

/**
 * Draft-and-submit dialog on top of the native `ConfirmationModal` footer.
 *
 * The footer is built once; submit state is patched onto the existing button,
 * so typing in the body is never interrupted by a re-render. Subclasses own
 * `renderBody()` and call `render()` only when the body itself must change.
 */
export abstract class FormModal extends ConfirmationModal {
  private submitting = false;
  private submitButton: ConfirmationButton | null = null;

  protected constructor(app: App, private readonly labels: FormModalLabels) {
    super(app);
    this.addClass("fce-modal");
    this.addButton((button) => {
      this.submitButton = button;
      button
        .setCta()
        .setButtonText(labels.submit)
        .onClick(() => {
          void this.submit();
          // Truthy keeps the dialog open; `submit()` closes it once the work succeeds.
          return true;
        });
    });
    this.addCancelButton(labels.cancel);
  }

  protected abstract handleSubmit(): Promise<boolean>;
  protected abstract renderBody(): void;

  protected isSubmitting(): boolean {
    return this.submitting;
  }

  protected isSubmitDisabled(): boolean {
    return false;
  }

  /** Tall dialogs opt in to the native scrolling body with a pinned footer. */
  protected useScrollableLayout(): void {
    this.addClass("mod-scrollable-content");
  }

  protected render(): void {
    this.contentEl.empty();
    this.renderBody();
    this.refreshFooter();
  }

  protected refreshFooter(): void {
    const button = this.submitButton;
    if (button === null) {
      return;
    }
    button.setButtonText(this.submitting ? this.labels.submitting : this.labels.submit);
    button.setDisabled(this.submitting || this.isSubmitDisabled());
  }

  protected submitOnEnter(inputEl: HTMLInputElement): void {
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        void this.submit();
      }
    });
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    super.onClose();
    this.contentEl.empty();
  }

  protected async submit(): Promise<void> {
    if (this.submitting || this.isSubmitDisabled()) {
      return;
    }

    this.submitting = true;
    this.refreshFooter();
    try {
      if (await this.handleSubmit()) {
        this.close();
      }
    } finally {
      this.submitting = false;
      if (this.contentEl.isConnected) {
        this.refreshFooter();
      }
    }
  }
}
