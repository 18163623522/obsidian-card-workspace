import { ConfirmationModal, type App } from "obsidian";

export interface BulkActionConfirmModalOptions {
  title: string;
  message: string;
  cancelButtonText: string;
  confirmButtonText: string;
}

export class BulkActionConfirmModal extends ConfirmationModal {
  private readonly onDecision: (confirmed: boolean) => void;
  private resolved = false;

  constructor(app: App, options: BulkActionConfirmModalOptions, onDecision: (confirmed: boolean) => void) {
    super(app);
    this.onDecision = onDecision;
    this.setTitle(options.title);
    this.setContent(options.message);
    this.addButton((button) => {
      button
        .setWarning()
        .setButtonText(options.confirmButtonText)
        .onClick(() => {
          this.resolve(true);
        });
    });
    this.addCancelButton(options.cancelButtonText);
  }

  onClose(): void {
    super.onClose();
    this.resolve(false);
  }

  private resolve(confirmed: boolean): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.onDecision(confirmed);
  }
}
