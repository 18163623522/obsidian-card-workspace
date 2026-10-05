import { beforeAll, describe, expect, it, vi } from "vitest";
import { asMock, MockEl, SettingGroup, type MockButton } from "../../__mocks__/obsidian-modal-mock";

describe.each(["native", "legacy"])("confirmation compatibility (%s host)", (runtime) => {
  let Modal: typeof import("./compat-modal").CompatConfirmationModal;
  let BulkModal: typeof import("./BulkActionConfirmModal").BulkActionConfirmModal;
  let createModalPreview: typeof import("./modal-layout").createModalPreview;

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("obsidian", async () => {
      const exports = await import("../../__mocks__/obsidian-modal-mock");
      return runtime === "native" ? exports : Object.fromEntries(Object.entries(exports)
        .filter(([key]) => key !== "ConfirmationModal" && key !== "ConfirmationButton"));
    });
    Modal = (await import("./compat-modal")).CompatConfirmationModal;
    BulkModal = (await import("./BulkActionConfirmModal")).BulkActionConfirmModal;
    createModalPreview = (await import("./modal-layout")).createModalPreview;
  });

  function buttons(modal: unknown): MockButton[] {
    const mock = asMock(modal);
    return runtime === "native" ? mock.buttons : mock.modalEl.nodes
      .filter((node): node is MockEl => "hasClass" in node && node.hasClass("fce-compat-modal__footer"))
      .flatMap((node) => node.buttons);
  }

  it("preserves title, content, warning/primary styling, disabled state, and truthy callbacks", async () => {
    const modal = new Modal({} as never);
    const action = vi.fn(() => true);
    modal.setTitle("Confirm").setContent("Body");
    modal.addClass("custom");
    modal.addButton((button) => button.setWarning().setButtonText("Delete").setDisabled(true).onClick(action));
    modal.addButton((button) => button.setCta().setButtonText("Save").onClick(() => true));
    modal.open();
    expect(asMock(modal).title).toBe("Confirm");
    expect(asMock(modal).contentEl.text).toBe("Body");
    expect(asMock(modal).modalEl.hasClass("custom")).toBe(true);
    expect(buttons(modal).map((button) => [button.text, button.warning, button.cta])).toEqual([
      ["Delete", true, false], ["Save", false, true],
    ]);
    await buttons(modal)[0]!.click();
    expect(action).not.toHaveBeenCalled();
    buttons(modal)[0]!.setDisabled(false);
    await buttons(modal)[0]!.click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(asMock(modal).closeCount).toBe(0);
  });

  it("waits for the action before closing", async () => {
    let finish!: () => void;
    const modal = new Modal({} as never);
    modal.addButton((button) => button.onClick(() => new Promise<void>((resolve) => { finish = resolve; })));
    modal.open();
    const pending = buttons(modal)[0]!.click();
    expect(asMock(modal).closeCount).toBe(0);
    finish();
    await pending;
    expect(asMock(modal).closeCount).toBe(1);
  });

  it.skipIf(runtime === "native")("suppresses repeated clicks and drops auto-close after cancellation", async () => {
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const modal = new Modal({} as never);
    modal.addButton((button) => button.onClick(action));
    modal.addCancelButton("Cancel");
    modal.open();
    const pending = buttons(modal)[0]!.click();
    await buttons(modal)[0]!.click();
    expect(action).toHaveBeenCalledTimes(1);
    await buttons(modal)[1]!.click();
    finish();
    await pending;
    expect(asMock(modal).closeCount).toBe(1);
  });

  it("keeps a failed action open and permits a retry", async () => {
    const modal = new Modal({} as never);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let fail = true;
    modal.addButton((button) => button.onClick(async () => {
      if (fail) throw new Error("failure");
    }));
    modal.open();
    const first = buttons(modal)[0]!.click();
    if (runtime === "native") {
      await expect(first).rejects.toThrow("failure");
    } else {
      await first;
    }
    expect(asMock(modal).closeCount).toBe(0);
    fail = false;
    await buttons(modal)[0]!.click();
    expect(asMock(modal).closeCount).toBe(1);
    warning.mockRestore();
  });

  it.each(["confirm", "cancel", "external"])("resolves the %s decision once", async (choice) => {
    const decision = vi.fn();
    const modal = new BulkModal({} as never, {
      title: "Confirm", message: "Body", cancelButtonText: "Cancel", confirmButtonText: "Delete",
    }, decision);
    modal.open();
    if (choice === "external") modal.close();
    else await buttons(modal)[choice === "confirm" ? 0 : 1]!.click();
    modal.close();
    expect(decision).toHaveBeenCalledExactlyOnceWith(choice === "confirm");
  });

  it("mounts previews using public settings even when the group has no listEl", () => {
    const root = new MockEl();
    const backing = new SettingGroup(root);
    const group = { addSetting: backing.addSetting.bind(backing) };
    expect("listEl" in group).toBe(false);
    const preview = createModalPreview(group as never) as unknown as MockEl;
    expect(backing.settings).toHaveLength(1);
    expect(backing.settings[0]?.settingEl.nodes[0]).toBe(preview);
    expect(preview.hasClass("fce-modal-preview")).toBe(true);
  });
});
