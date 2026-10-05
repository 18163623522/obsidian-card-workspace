import { beforeAll, describe, expect, it, vi } from "vitest";
import { asMock, type MockEl } from "../../__mocks__/obsidian-modal-mock";


interface Deferred {
  promise: Promise<boolean>;
  resolve: (value: boolean) => void;
}

function createDeferred(): Deferred {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createTestFormClass(FormModal: typeof import("./FormModal").FormModal, legacy: boolean) {
  return class TestFormModal extends FormModal {
    renderBodyCount = 0;
    handleSubmitCount = 0;
    pending: Deferred | null = null;
    submitDisabled = false;
    error: unknown = null;
    inputEl: MockEl | null = null;

    constructor(private result: boolean | "pending") {
      super({} as never, { cancel: "Cancel", submit: "Save", submitting: "Saving" });
      if (legacy) {
        Object.defineProperty(this, "buttons", {
          get: () => (this.modalEl as unknown as MockEl).nodes
            .filter((node): node is MockEl => "hasClass" in node && node.hasClass("fce-compat-modal__footer"))
            .flatMap((node) => node.buttons),
        });
      }
    }

    protected renderBody(): void {
      this.renderBodyCount += 1;
      this.inputEl = (this.contentEl as unknown as MockEl).createEl("input");
      this.submitOnEnter(this.inputEl as unknown as HTMLInputElement);
    }

    protected override isSubmitDisabled(): boolean {
      return this.submitDisabled;
    }

    protected async handleSubmit(): Promise<boolean> {
      this.handleSubmitCount += 1;
      if (this.error !== null) {
        throw this.error;
      }
      if (this.result === "pending") {
        this.pending = createDeferred();
        return await this.pending.promise;
      }
      return this.result;
    }

    triggerSubmit(): Promise<void> {
      return this.submit();
    }

    refresh(): void {
      this.refreshFooter();
    }
  };
}

type TestFormModal = InstanceType<ReturnType<typeof createTestFormClass>>;

function submitButton(modal: TestFormModal) {
  const button = asMock(modal).buttons.find((candidate) => candidate.cta);
  if (!button) {
    throw new Error("submit button not rendered");
  }
  return button;
}

function pressEnter(modal: TestFormModal, isComposing = false): void {
  const event = { key: "Enter", isComposing, preventDefault: vi.fn() };
  modal.inputEl?.dispatch("keydown", event);
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe.each(["native", "legacy"])("FormModal (%s host)", (runtime) => {
  let TestFormModal: ReturnType<typeof createTestFormClass>;
  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("obsidian", async () => {
      const exports = await import("../../__mocks__/obsidian-modal-mock");
      return runtime === "native" ? exports : Object.fromEntries(Object.entries(exports)
        .filter(([key]) => key !== "ConfirmationModal" && key !== "ConfirmationButton"));
    });
    const { FormModal } = await import("./FormModal");
    TestFormModal = createTestFormClass(FormModal, runtime === "legacy");
  });
  it("builds the footer once: primary action first, cancel last", () => {
    const modal = new TestFormModal(true);
    modal.open();
    modal.open();

    expect(asMock(modal).buttons.map((button) => button.text)).toEqual(["Save", "Cancel"]);
    expect(asMock(modal).buttons[0]?.cta).toBe(true);
    expect(asMock(modal).modalEl.hasClass("fce-compat-modal")).toBe(runtime === "legacy");
    expect(asMock(modal).modalEl.hasClass("fce-modal")).toBe(true);
  });

  it("runs handleSubmit once while a submit is still in flight", async () => {
    const modal = new TestFormModal("pending");
    modal.open();
    const first = modal.triggerSubmit();
    const second = modal.triggerSubmit();
    expect(modal.handleSubmitCount).toBe(1);
    modal.pending?.resolve(true);
    await Promise.all([first, second]);
    expect(modal.handleSubmitCount).toBe(1);
  });

  it("patches the submit state in place without re-rendering the body", async () => {
    const modal = new TestFormModal("pending");
    modal.open();
    const button = submitButton(modal);

    const flight = modal.triggerSubmit();
    expect(button.text).toBe("Saving");
    expect(button.disabled).toBe(true);
    expect(modal.renderBodyCount).toBe(1);

    modal.pending?.resolve(false);
    await flight;
    expect(button.text).toBe("Save");
    expect(button.disabled).toBe(false);
    expect(modal.renderBodyCount).toBe(1);
  });

  it("does not close on false and restores the submit state", async () => {
    const modal = new TestFormModal(false);
    modal.open();
    await modal.triggerSubmit();
    expect(asMock(modal).closeCount).toBe(0);
    expect(modal.contentEl.isConnected).toBe(true);
    expect(submitButton(modal).text).toBe("Save");
  });

  it("closes exactly once when handleSubmit returns true", async () => {
    const modal = new TestFormModal(true);
    modal.open();
    await modal.triggerSubmit();
    expect(asMock(modal).closeCount).toBe(1);
  });

  it("keeps the dialog open after the primary click until the submit settles", async () => {
    const modal = new TestFormModal("pending");
    modal.open();

    await submitButton(modal).click();
    expect(asMock(modal).closeCount).toBe(0);
    expect(modal.handleSubmitCount).toBe(1);

    modal.pending?.resolve(true);
    await flush();
    expect(asMock(modal).closeCount).toBe(1);
  });

  it("closes through the cancel button without submitting", async () => {
    const modal = new TestFormModal(true);
    modal.open();

    await asMock(modal).buttons.find((button) => button.text === "Cancel")?.click();
    expect(asMock(modal).closeCount).toBe(1);
    expect(modal.handleSubmitCount).toBe(0);
  });

  it("propagates the original error, stays open, and permits retry", async () => {
    const modal = new TestFormModal(true);
    const failure = new Error("submit failed");
    modal.error = failure;
    modal.open();
    await expect(modal.triggerSubmit()).rejects.toBe(failure);
    expect(asMock(modal).closeCount).toBe(0);
    expect(submitButton(modal).text).toBe("Save");
    expect(submitButton(modal).disabled).toBe(false);
    modal.error = null;
    await modal.triggerSubmit();
    expect(modal.handleSubmitCount).toBe(2);
    expect(asMock(modal).closeCount).toBe(1);
  });

  it("does not touch the footer after the modal disconnects", async () => {
    const modal = new TestFormModal("pending");
    modal.open();
    const button = submitButton(modal);

    const flight = modal.triggerSubmit();
    modal.close();
    button.setButtonText("untouched");
    modal.pending?.resolve(false);
    await flight;
    expect(button.text).toBe("untouched");
  });

  it("drops a successful submission after external close, including after reopen", async () => {
    const modal = new TestFormModal("pending");
    modal.open();
    const flight = modal.triggerSubmit();
    modal.close();
    modal.open();
    const button = submitButton(modal);
    button.setButtonText("untouched");
    modal.pending?.resolve(true);
    await flight;
    expect(asMock(modal).closeCount).toBe(1);
    expect(button.text).toBe("untouched");
  });

  it("does not let an old submission reset a new submission after reopen", async () => {
    const modal = new TestFormModal("pending");
    modal.open();
    const first = modal.triggerSubmit(), firstPending = modal.pending;
    modal.close();
    modal.open();
    expect(submitButton(modal).disabled).toBe(false);
    const second = modal.triggerSubmit();
    firstPending?.resolve(true);
    await first;
    expect(submitButton(modal).text).toBe("Saving");
    expect(submitButton(modal).disabled).toBe(true);
    expect(asMock(modal).closeCount).toBe(1);
    await modal.triggerSubmit();
    expect(modal.handleSubmitCount).toBe(2);
    modal.pending?.resolve(false);
    await second;
    expect(submitButton(modal).disabled).toBe(false);
  });

  it("disables the primary action while the subclass reports it unavailable", async () => {
    const modal = new TestFormModal(true);
    modal.submitDisabled = true;
    modal.open();
    expect(submitButton(modal).disabled).toBe(true);

    await modal.triggerSubmit();
    expect(modal.handleSubmitCount).toBe(0);

    modal.submitDisabled = false;
    modal.refresh();
    expect(submitButton(modal).disabled).toBe(false);
  });

  it("submits on Enter but ignores Enter that confirms an IME composition", async () => {
    const modal = new TestFormModal(false);
    modal.open();

    pressEnter(modal, true);
    expect(modal.handleSubmitCount).toBe(0);

    pressEnter(modal);
    await flush();
    expect(modal.handleSubmitCount).toBe(1);
  });
});
