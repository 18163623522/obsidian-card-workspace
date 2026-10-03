import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Notice,
  asMock,
  elementsIn,
  groupsIn,
  requireGroup,
  resetNotices,
  settingsIn,
  type MockEl,
  type Setting,
} from "../../__mocks__/obsidian-modal-mock";
import { getUiStrings } from "../../i18n";

const pickerState = vi.hoisted(() => ({
  opened: [] as Array<{ title: string; choose: (folder: unknown) => void }>,
}));

vi.mock("obsidian", async () => await import("../../__mocks__/obsidian-modal-mock"));
vi.mock("../../FolderPickerModal", () => ({
  FolderPickerModal: class {
    constructor(
      _app: unknown,
      private readonly choose: (folder: unknown) => void,
      private readonly title: string,
    ) {}

    open(): void {
      pickerState.opened.push({ title: this.title, choose: this.choose });
    }
  },
}));

const { BulkMergeModal } = await import("./BulkMergeModal");
const { buildMergedNoteContent } = await import("../note-ops");

type MergeModalInstance = InstanceType<typeof BulkMergeModal>;
type SubmitResult = Parameters<ConstructorParameters<typeof BulkMergeModal>[2]>[0];

const strings = getUiStrings("en").view.merge;

const CONTENTS: Record<string, string> = {
  "Notes/alpha.md": "Alpha body",
  "Notes/beta.md": "Beta body",
  "Root.md": "Root body",
};

function createFile(path: string) {
  const basename = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  return { path, basename };
}

function createModal(options: {
  paths?: string[];
  read?: (path: string) => Promise<string>;
  onSubmit?: (result: SubmitResult) => Promise<boolean>;
} = {}) {
  const paths = options.paths ?? ["Notes/alpha.md", "Notes/beta.md", "Root.md"];
  const cachedRead = vi.fn(async (file: { path: string }) =>
    await (options.read ?? (async (path: string) => CONTENTS[path] ?? ""))(file.path));
  const onSubmit = vi.fn(options.onSubmit ?? (async () => true));
  const root = { path: "" };
  const modal = new BulkMergeModal(
    { vault: { cachedRead } } as never,
    {
      files: paths.map(createFile) as never,
      initialTargetFolder: root as never,
      initialMergedTitle: "Draft title",
      strings,
      folderPickerTitle: "Pick a folder",
    },
    onSubmit,
  );
  return { modal, cachedRead, onSubmit, root };
}

function contentOf(modal: MergeModalInstance): MockEl {
  return modal.contentEl as unknown as MockEl;
}

function optionRows(modal: MergeModalInstance): Setting[] {
  const [options] = groupsIn(contentOf(modal));
  if (!options) {
    throw new Error("options group not rendered");
  }
  return options.settings;
}

function orderGroup(modal: MergeModalInstance) {
  const group = groupsIn(contentOf(modal)).find((candidate) => candidate.heading.startsWith(strings.sourceOrder));
  if (!group) {
    throw new Error("order group not rendered");
  }
  return group;
}

function previewText(modal: MergeModalInstance): string {
  const [preview] = elementsIn(contentOf(modal), (el) => el.hasClass("fce-modal-preview"));
  if (!preview) {
    throw new Error("preview not rendered");
  }
  return preview.text;
}

function previewEl(modal: MergeModalInstance): MockEl {
  const [preview] = elementsIn(contentOf(modal), (el) => el.hasClass("fce-modal-preview"));
  if (!preview) {
    throw new Error("preview not rendered");
  }
  return preview;
}

function mergedPreview(paths: string[], separator: string): string {
  return buildMergedNoteContent(
    paths.map((path) => ({ basename: createFile(path).basename, content: CONTENTS[path] ?? "" })),
    separator,
  );
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function clickMerge(modal: MergeModalInstance): Promise<void> {
  await asMock(modal).buttons.find((button) => button.cta)?.click();
  await flush();
}

describe("BulkMergeModal", () => {
  beforeEach(() => {
    pickerState.opened.length = 0;
    resetNotices();
  });

  it("groups the options, merge order, and preview inside a scrolling dialog", async () => {
    const { modal } = createModal();
    modal.open();
    await flush();

    expect(asMock(modal).title).toBe(strings.title);
    expect(asMock(modal).modalEl.hasClass("mod-scrollable-content")).toBe(true);
    expect(groupsIn(contentOf(modal)).map((group) => group.heading)).toEqual([
      "",
      `${strings.sourceOrder} · ${strings.sourceCount(3)}`,
      strings.preview,
    ]);
    expect(optionRows(modal).map((row) => row.name)).toEqual([
      strings.mergedTitle,
      strings.targetFolder,
      strings.separator,
      strings.trashSourceNotesAfterMerge,
    ]);
    expect(asMock(modal).buttons.map((button) => button.text)).toEqual([strings.mergeNotes, strings.cancel]);
  });

  it("seeds the title, target folder, separator preset, and cleanup toggle", async () => {
    const { modal } = createModal();
    modal.open();
    await flush();

    const [title, folder, separator, cleanup] = optionRows(modal);
    expect(title?.texts[0]).toMatchObject({ value: "Draft title", placeholder: strings.defaultMergedTitle });
    expect(folder?.desc).toBe("/");
    expect(folder?.buttons[0]?.text).toBe(strings.chooseFolder);
    expect(separator?.desc).toBe(strings.separatorDesc);
    expect(separator?.dropdowns[0]?.options).toEqual([
      { value: "blankLine", label: strings.separatorBlankLine },
      { value: "rule", label: strings.separatorRule },
      { value: "newline", label: strings.separatorNewline },
    ]);
    expect(separator?.dropdowns[0]?.value).toBe("blankLine");
    expect(cleanup?.toggles[0]?.value).toBe(false);
  });

  it("lists sources in order with their folders and edge-aware move buttons", async () => {
    const { modal } = createModal();
    modal.open();
    await flush();

    const rows = orderGroup(modal).settings;
    expect(rows.map((row) => [row.name, row.desc])).toEqual([
      ["1. alpha", "Notes"],
      ["2. beta", "Notes"],
      ["3. Root", "/"],
    ]);
    expect(rows[0]?.extraButtons.map((button) => [button.icon, button.tooltip, button.disabled])).toEqual([
      ["arrow-up", strings.up, true],
      ["arrow-down", strings.down, false],
    ]);
    expect(rows[2]?.extraButtons.map((button) => button.disabled)).toEqual([false, true]);
  });

  it("builds the preview once from cached reads and rebuilds it for separator changes", async () => {
    const { modal, cachedRead } = createModal();
    modal.open();
    await flush();

    const paths = ["Notes/alpha.md", "Notes/beta.md", "Root.md"];
    expect(previewText(modal)).toBe(mergedPreview(paths, "\n\n"));
    expect(cachedRead).toHaveBeenCalledTimes(3);

    optionRows(modal)[2]?.dropdowns[0]?.select("rule");
    await flush();
    expect(previewText(modal)).toBe(mergedPreview(paths, "\n\n---\n\n"));

    optionRows(modal)[2]?.dropdowns[0]?.select("newline");
    await flush();
    expect(previewText(modal)).toBe(mergedPreview(paths, "\n"));
    expect(cachedRead).toHaveBeenCalledTimes(3);
  });

  it("shows the loading copy until the sources have been read", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { modal } = createModal({
      read: async (path) => {
        await gate;
        return CONTENTS[path] ?? "";
      },
    });
    modal.open();

    expect(previewText(modal)).toBe(strings.loadingPreview);
    release();
    await flush();
    expect(previewText(modal)).not.toBe(strings.loadingPreview);
  });

  it("reports a read failure in the preview instead of throwing", async () => {
    const { modal } = createModal({
      read: async () => {
        throw new Error("disk gone");
      },
    });
    modal.open();
    await flush();

    expect(previewText(modal)).toBe(strings.failedToBuildPreview("Error: disk gone"));
    expect(previewEl(modal).hasClass("is-error")).toBe(true);
  });

  it("reorders sources, refreshes the preview from cache, and keeps the title draft", async () => {
    const { modal, cachedRead, onSubmit } = createModal();
    modal.open();
    await flush();

    optionRows(modal)[0]?.texts[0]?.type("Weekly digest");
    orderGroup(modal).settings[0]?.extraButtons[1]?.click();

    expect(orderGroup(modal).settings.map((row) => row.name)).toEqual(["1. beta", "2. alpha", "3. Root"]);
    expect(previewText(modal)).toBe(mergedPreview(["Notes/beta.md", "Notes/alpha.md", "Root.md"], "\n\n"));
    expect(optionRows(modal)[0]?.texts[0]?.value).toBe("Weekly digest");
    expect(cachedRead).toHaveBeenCalledTimes(3);

    await clickMerge(modal);
    const submitted = onSubmit.mock.calls[0]?.[0] as SubmitResult;
    expect(submitted.files.map((file) => file.path)).toEqual(["Notes/beta.md", "Notes/alpha.md", "Root.md"]);
    expect(submitted.mergedTitle).toBe("Weekly digest");
  });

  it("ignores moves past either end of the list", async () => {
    const { modal } = createModal();
    modal.open();
    await flush();

    orderGroup(modal).settings[0]?.extraButtons[0]?.click();
    orderGroup(modal).settings[2]?.extraButtons[1]?.click();

    expect(orderGroup(modal).settings.map((row) => row.name)).toEqual(["1. alpha", "2. beta", "3. Root"]);
  });

  it("updates the target folder row in place after choosing a folder", async () => {
    const { modal, onSubmit } = createModal();
    modal.open();
    await flush();

    const folderRow = optionRows(modal)[1];
    folderRow?.buttons[0]?.click();
    expect(pickerState.opened.map((entry) => entry.title)).toEqual(["Pick a folder"]);

    const archive = { path: "Archive" };
    pickerState.opened[0]?.choose(archive);
    expect(optionRows(modal)[1]).toBe(folderRow);
    expect(folderRow?.desc).toBe("Archive");

    await clickMerge(modal);
    const submitted = onSubmit.mock.calls[0]?.[0] as SubmitResult;
    expect(submitted.targetFolder).toBe(archive);
  });

  it("submits the chosen separator preset, cleanup mode, and a trimmed title", async () => {
    const { modal, onSubmit } = createModal();
    modal.open();
    await flush();

    optionRows(modal)[0]?.texts[0]?.type("  Digest  ");
    optionRows(modal)[2]?.dropdowns[0]?.select("rule");
    optionRows(modal)[3]?.toggles[0]?.set(true);
    await clickMerge(modal);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      mergedTitle: "Digest",
      separator: "\n\n---\n\n",
      cleanupMode: "trash",
    });
    expect(asMock(modal).closeCount).toBe(1);
  });

  it("falls back to the default title and keeps sources by default", async () => {
    const { modal, onSubmit } = createModal();
    modal.open();
    await flush();

    optionRows(modal)[0]?.texts[0]?.type("   ");
    await clickMerge(modal);

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      mergedTitle: strings.defaultMergedTitle,
      separator: "\n\n",
      cleanupMode: "keep",
    });
  });

  it("stays open when the merge handler declines to close", async () => {
    const { modal } = createModal({ onSubmit: async () => false });
    modal.open();
    await flush();

    await clickMerge(modal);
    expect(asMock(modal).closeCount).toBe(0);
    expect(asMock(modal).buttons[0]?.disabled).toBe(false);
  });

  it("surfaces a failed merge as a notice and stays open", async () => {
    const { modal } = createModal({
      onSubmit: async () => {
        throw new Error("boom");
      },
    });
    modal.open();
    await flush();

    await clickMerge(modal);
    expect(Notice.messages).toEqual([strings.failedToMergeNotes("Error: boom")]);
    expect(asMock(modal).closeCount).toBe(0);
  });

  it("drops preview work that finishes after the dialog closed", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { modal } = createModal({
      read: async (path) => {
        await gate;
        return CONTENTS[path] ?? "";
      },
    });
    modal.open();
    const preview = previewEl(modal);

    modal.close();
    release();
    await flush();
    expect(preview.text).toBe(strings.loadingPreview);
  });

  it("disables the merge action when fewer than two sources remain", async () => {
    const { modal } = createModal({ paths: ["Root.md"] });
    modal.open();
    await flush();

    expect(asMock(modal).buttons[0]?.disabled).toBe(true);
    expect(settingsIn(contentOf(modal)).length).toBeGreaterThan(0);
    expect(requireGroup(contentOf(modal), strings.preview)).toBeDefined();
  });
});
