import { describe, expect, it, vi } from "vitest";
import {
  asMock,
  elementsIn,
  groupsIn,
  type MockEl,
  Setting,
  type MockText,
} from "../../__mocks__/obsidian-modal-mock";
import { getUiStrings } from "../../i18n";
import type { PropertyInventorySnapshot } from "../../property-filter-settings";

vi.mock("obsidian", async () => await import("../../__mocks__/obsidian-modal-mock"));

const { PropertyPickerModal } = await import("./PropertyPickerModal");
type PropertyPickerModalInstance = InstanceType<typeof PropertyPickerModal>;

const strings = getUiStrings("en");

function contentOf(modal: PropertyPickerModalInstance): MockEl {
  return modal.contentEl as unknown as MockEl;
}

function listElOf(modal: PropertyPickerModalInstance): MockEl {
  const [list] = elementsIn(contentOf(modal), (el) => el.hasClass("fce-property-picker__list"));
  if (!list) {
    throw new Error("property picker list element not rendered");
  }
  return list;
}

function listGroupOf(modal: PropertyPickerModalInstance) {
  const [group] = groupsIn(listElOf(modal));
  if (!group) {
    throw new Error("property picker list group not rendered");
  }
  return group;
}

function isNoticeRow(setting: Setting): boolean {
  return setting.classes.includes("mod-empty-state");
}

function rowSettings(modal: PropertyPickerModalInstance): Setting[] {
  return listGroupOf(modal).settings.filter((setting) => !isNoticeRow(setting));
}

function rowNames(modal: PropertyPickerModalInstance): string[] {
  return rowSettings(modal).map((setting) => setting.name);
}

function noticeTexts(modal: PropertyPickerModalInstance): string[] {
  return listGroupOf(modal).settings.filter(isNoticeRow).map((setting) => setting.name);
}

function searchBarOf(modal: PropertyPickerModalInstance): MockEl {
  const [bar] = elementsIn(contentOf(modal), (el) => el.hasClass("fce-property-picker__search"));
  if (!bar) {
    throw new Error("search bar not rendered");
  }
  return bar;
}

function searchSetting(modal: PropertyPickerModalInstance): Setting {
  const setting = searchBarOf(modal).nodes[0];
  if (!(setting instanceof Setting)) {
    throw new Error("search row not rendered");
  }
  return setting;
}

function searchInput(modal: PropertyPickerModalInstance): MockText {
  const input = searchSetting(modal).searches[0];
  if (!input) {
    throw new Error("search input not rendered");
  }
  return input;
}

function clickCancel(modal: PropertyPickerModalInstance): void {
  void asMock(modal).buttons.find((button) => button.cancel)?.click();
}

function clickDone(modal: PropertyPickerModalInstance): void {
  void asMock(modal).buttons.find((button) => button.cta)?.click();
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function openModal(options: {
  selectedKeys?: string[];
  inventory?: PropertyInventorySnapshot;
  onSubmit?: (keys: string[]) => Promise<void>;
} = {}) {
  const collect = vi.fn((): PropertyInventorySnapshot =>
    options.inventory ?? { status: "ready", options: [] });
  const onSubmit = vi.fn(options.onSubmit ?? (async () => {}));
  const modal = new PropertyPickerModal({} as never, {
    strings,
    selectedKeys: options.selectedKeys ?? [],
    collectPropertyInventory: collect,
    onSubmit,
  });
  modal.open();
  return { modal, onSubmit, collect };
}

describe("PropertyPickerModal", () => {
  it("collects the inventory exactly once per open and never on re-render", () => {
    const { modal, collect } = openModal({
      inventory: {
        status: "ready",
        options: [
          { key: "alpha", label: "alpha", available: true },
          { key: "beta", label: "beta", available: true },
        ],
      },
    });
    expect(collect).toHaveBeenCalledTimes(1);
    expect(asMock(modal).title).toBe(strings.property.chooseVisible);

    searchInput(modal).type("alp");
    searchInput(modal).type("");
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("lists selected keys first, then remaining keys, each group sorted by identity", () => {
    const { modal } = openModal({
      selectedKeys: ["zeta", "alpha"],
      inventory: {
        status: "ready",
        options: [
          // Labels deliberately sort differently from key identity.
          { key: "gamma", label: "aaa-gamma", available: true },
          { key: "zeta", label: "ZZZ Zeta", available: true },
          { key: "beta", label: "beta", available: true },
          { key: "alpha", label: "yyy-alpha", available: true },
        ],
      },
    });

    expect(rowNames(modal)).toEqual(["yyy-alpha", "ZZZ Zeta", "beta", "aaa-gamma"]);
    const toggles = rowSettings(modal).map((setting) => setting.toggles[0]?.value);
    expect(toggles).toEqual([true, true, false, false]);
  });

  it("filters rows by label or identity on search without touching the draft", async () => {
    const { modal, onSubmit } = openModal({
      inventory: {
        status: "ready",
        options: [
          { key: "alpha", label: "Alpha Label", available: true },
          { key: "beta", label: "Beta", available: true },
        ],
      },
    });

    // Toggle beta on, then hide it behind a search; the draft must survive.
    rowSettings(modal)[1]?.toggles[0]?.set(true);
    searchInput(modal).type("alpha label");
    expect(rowNames(modal)).toEqual(["Alpha Label"]);

    searchInput(modal).type("beta");
    expect(rowNames(modal)).toEqual(["Beta"]);

    clickDone(modal);
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(["beta"]);
  });

  it("toggles only the draft: no save and no re-render until Done", () => {
    const { modal, onSubmit } = openModal({
      selectedKeys: ["alpha"],
      inventory: {
        status: "ready",
        options: [
          { key: "alpha", label: "alpha", available: true },
          { key: "beta", label: "beta", available: true },
        ],
      },
    });

    const before = rowNames(modal);
    const group = listGroupOf(modal);
    rowSettings(modal)[1]?.toggles[0]?.set(true);
    expect(onSubmit).not.toHaveBeenCalled();
    // No re-render: the same group stays mounted and rows keep their initial order.
    expect(listGroupOf(modal)).toBe(group);
    expect(rowNames(modal)).toEqual(before);
  });

  it("keeps a stale selected key listed as unavailable and removable", async () => {
    const { modal, onSubmit } = openModal({
      selectedKeys: ["ghost"],
      inventory: {
        status: "ready",
        options: [{ key: "real", label: "real", available: true }],
      },
    });

    expect(rowNames(modal)).toEqual(["ghost", "real"]);
    const ghost = rowSettings(modal)[0];
    expect(ghost?.classes).toContain("fce-property-picker__unavailable");
    expect(ghost?.desc).toBe(strings.property.unavailable);
    expect(ghost?.toggles[0]?.value).toBe(true);

    ghost?.toggles[0]?.set(false);
    clickDone(modal);
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith([]);
  });

  it("never erases current selections from inventory status alone", async () => {
    const { modal, onSubmit } = openModal({
      selectedKeys: ["ghost"],
      inventory: { status: "unavailable", options: [] },
    });

    // Still listed and removable even when the inventory is unavailable.
    expect(rowNames(modal)).toEqual(["ghost"]);
    clickDone(modal);
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the empty copy for a ready inventory with no properties", () => {
    const { modal } = openModal({ inventory: { status: "ready", options: [] } });

    expect(noticeTexts(modal)).toEqual([strings.property.emptyNoProperties]);
    expect(rowSettings(modal)).toHaveLength(0);
  });

  it("shows discovered options plus a non-blocking warning for a partial inventory", () => {
    const { modal } = openModal({
      inventory: {
        status: "partial",
        options: [{ key: "alpha", label: "alpha", available: true }],
      },
    });

    expect(noticeTexts(modal)).toEqual([strings.property.partialWarning]);
    expect(rowNames(modal)).toEqual(["alpha"]);
  });

  it("shows the unavailable copy and still allows cancellation", () => {
    const { modal, onSubmit } = openModal({ inventory: { status: "unavailable", options: [] } });

    expect(noticeTexts(modal)).toEqual([strings.property.unavailable]);
    clickCancel(modal);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("writes nothing on Cancel even after draft edits", () => {
    const { modal, onSubmit } = openModal({
      inventory: {
        status: "ready",
        options: [{ key: "alpha", label: "alpha", available: true }],
      },
    });

    rowSettings(modal)[0]?.toggles[0]?.set(true);
    clickCancel(modal);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("writes nothing on a no-change Done but still closes", async () => {
    const { modal, onSubmit } = openModal({
      selectedKeys: ["alpha"],
      inventory: {
        status: "ready",
        options: [{ key: "alpha", label: "alpha", available: true }],
      },
    });

    clickDone(modal);
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(asMock(modal).closeCount).toBe(1);
  });

  it("commits the normalized draft exactly once on Done", async () => {
    const { modal, onSubmit } = openModal({
      selectedKeys: ["alpha"],
      inventory: {
        status: "ready",
        options: [
          { key: "alpha", label: "alpha", available: true },
          { key: "gamma", label: "gamma", available: true },
          { key: "beta", label: "beta", available: true },
        ],
      },
    });

    // Rows: alpha (selected), then beta, gamma (remaining, identity-sorted).
    rowSettings(modal)[0]?.toggles[0]?.set(false);
    rowSettings(modal)[1]?.toggles[0]?.set(true);
    rowSettings(modal)[2]?.toggles[0]?.set(true);
    clickDone(modal);
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(["beta", "gamma"]);
    expect(asMock(modal).closeCount).toBe(1);
  });

  it("keeps the modal open after a rejected submit and permits retry", async () => {
    const deferreds: Deferred[] = [];
    class TestPickerModal extends PropertyPickerModal {
      triggerSubmit(): Promise<void> {
        return this.submit();
      }
    }
    const onSubmit = vi.fn((_keys: string[]) => {
      const deferred = createDeferred();
      deferreds.push(deferred);
      return deferred.promise;
    });
    const modal = new TestPickerModal({} as never, {
      strings,
      selectedKeys: [],
      collectPropertyInventory: () => ({
        status: "ready",
        options: [{ key: "alpha", label: "alpha", available: true }],
      }),
      onSubmit,
    });
    modal.open();

    rowSettings(modal)[0]?.toggles[0]?.set(true);

    const first = modal.triggerSubmit();
    const firstAssertion = expect(first).rejects.toThrow("save failed");
    deferreds[0]?.reject(new Error("save failed"));
    await firstAssertion;
    expect(asMock(modal).closeCount).toBe(0);
    expect(modal.contentEl.isConnected).toBe(true);

    const second = modal.triggerSubmit();
    deferreds[1]?.resolve();
    await second;
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(asMock(modal).closeCount).toBe(1);
  });

  it("runs a single submit flight even when Done is clicked repeatedly", async () => {
    const deferred = createDeferred();
    const onSubmit = vi.fn((_keys: string[]) => deferred.promise);
    const { modal } = openModal({
      inventory: {
        status: "ready",
        options: [{ key: "alpha", label: "alpha", available: true }],
      },
      onSubmit,
    });

    rowSettings(modal)[0]?.toggles[0]?.set(true);
    clickDone(modal);
    clickDone(modal);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(asMock(modal).closeCount).toBe(1);
  });

  it("uses a scrolling modal body with a pinned search field and a compact list group", () => {
    const { modal } = openModal({
      inventory: { status: "ready", options: [{ key: "alpha", label: "alpha", available: true }] },
    });

    expect(asMock(modal).modalEl.hasClass("mod-scrollable-content")).toBe(true);
    expect(asMock(modal).modalEl.hasClass("fce-property-picker")).toBe(true);
    expect(contentOf(modal).nodes[0]).toBe(searchBarOf(modal));
    expect(searchInput(modal)).toMatchObject({ placeholder: strings.property.searchPlaceholder });
    expect(searchInput(modal).ariaLabel).toBe(strings.property.searchPlaceholder);
    expect(listGroupOf(modal).classes).toContain("mod-list");
  });

  it("keeps the search field mounted while the list group is rebuilt", () => {
    const { modal } = openModal({
      inventory: {
        status: "ready",
        options: [
          { key: "alpha", label: "alpha", available: true },
          { key: "beta", label: "beta", available: true },
        ],
      },
    });

    const search = searchSetting(modal);
    const group = listGroupOf(modal);
    searchInput(modal).type("beta");

    expect(searchSetting(modal)).toBe(search);
    expect(listGroupOf(modal)).not.toBe(group);
    expect(rowNames(modal)).toEqual(["beta"]);
  });

  it("uses the native footer with Done before Cancel", () => {
    const { modal } = openModal();

    expect(asMock(modal).buttons.map((button) => button.text)).toEqual([
      strings.box.done,
      strings.box.cancel,
    ]);
  });
});
