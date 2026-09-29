import { describe, expect, it } from "vitest";

import { buildLocationPreview, buildSearchContextPreview, findSearchContextLocation } from "./context-preview";

describe("context previews", () => {
  it("shows the linked line under the existing line budget and rejects a stale position", () => {
    const markdown = ["intro", "long prefix [[target]] and more", "following detail", "end"].join("\n");
    const preview = buildLocationPreview(markdown, {
      line: 1, ch: 12, expectedText: "[[target]]", identity: "link",
    }, 200, 3);
    expect(preview?.html).toContain("target");
    expect(preview?.html).toContain("following detail");
    expect(buildLocationPreview(markdown, {
      line: 1, expectedText: "[[removed]]", identity: "stale",
    }, 200, 3)).toBeNull();
    expect(buildLocationPreview("paragraph\n^moved", {
      line: 0, endLine: 0, expectedBlockId: "block", identity: "block",
    }, 200, 3)).toBeNull();
  });

  it("finds the first body hit beyond the ordinary 400-line preview window", () => {
    const markdown = ["---", "title: Needle", "---", ...Array(600).fill("padding"),
      "the first needle appears here", "another needle later"].join("\n");
    const preview = buildSearchContextPreview(markdown, "needle", 200, 3);
    expect(preview?.html).toContain("first needle");
    expect(findSearchContextLocation(markdown, "needle")?.line).toBe(603);
    expect(preview?.html).not.toContain("title:");
    expect(buildSearchContextPreview(markdown, "absent", 200, 3)).toBeNull();
  });
});
