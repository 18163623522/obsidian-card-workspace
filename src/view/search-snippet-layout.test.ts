import { describe, expect, it } from "vitest";
import { createSearchPreviewMatcher, extractSearchPreviewSnippets } from "../search";
import { buildSearchSnippetSegments, buildSearchSnippetHtml } from "./search-snippet-layout";

async function snippet(source: string, query = "needle") {
  return (await extractSearchPreviewSnippets(source, { limit: 1, idPrefix: "test", matcher: createSearchPreviewMatcher(query) }))![0];
}

describe("search snippet presentation", () => {
  it("emits only fixed format wrappers and escapes source markup and entities", async () => {
    const result = await snippet('needle [[Target|<img src=x onerror="bad()"> &amp;]] `code_text`');
    const html = buildSearchSnippetHtml(buildSearchSnippetSegments(result));
    expect(html).toContain('class="fce-preview-link"');
    expect(html).toContain("&lt;img");
    expect(html).toContain("&amp;amp;");
    expect(html).not.toMatch(/<img\b|<script\b|href=/);
  });
  it.each([
    ["- needle", "•", "none", ""], ["1. needle", "1.", "none", ""], ["2) needle", "2)", "none", ""],
    ["  - [ ] needle", "", "open", ""], ["- [X] needle", "", "done", ""], ["2) [?] needle", "2)", "custom", "?"],
  ])("uses ordinary list and task cues: %s", async (source, marker, taskKind, taskGlyph) => {
    const result = await snippet(source);
    expect(result.presentation?.list).toEqual({ marker, taskKind, taskGlyph });
    expect(result.presentation?.text).toBe("needle");
    expect(result.location.offset).toBe(source.indexOf("needle"));
    expect(buildSearchSnippetSegments(result).filter(s => s.highlighted).map(s => s.text)).toEqual(["needle"]);
  });

  it("limits heading styling to the heading while retaining following prose", async () => {
    const result = await snippet("# needle heading\nplain continuation");
    const segments = buildSearchSnippetSegments(result);
    expect(segments.find(s => s.text.includes("heading"))?.heading).toBe(true);
    expect(segments.find(s => s.text.includes("continuation"))?.heading).toBe(false);
    expect(result.text).toBe("needle heading plain continuation");
  });

  it("keeps fenced line breaks and indentation without moving the original source target", async () => {
    const source = "```ts\r\n  const needle = 1;\r\n    return needle;\r\n```";
    const result = await snippet(source);
    expect(result.presentation?.text).toBe("  const needle = 1;\n    return needle;");
    expect(result.presentation?.codeBlock).toBe(true);
    expect(result.presentation?.runs.every(run => run.kind === "code")).toBe(true);
    expect(result.location.from).toEqual({ line: 1, ch: 8 });
    expect(buildSearchSnippetSegments(result).filter(s => s.highlighted).map(s => s.text)).toEqual(["needle", "needle"]);
  });

  it("styles code and link labels through emphasis without styling links inside code", async () => {
    const result = await snippet("needle **[[Target|alias]]** [label](url) `code_text` `[[literal|text]]`");
    const segments = buildSearchSnippetSegments(result);
    expect(segments.filter(s => s.kind === "link").map(s => s.text).join("")).toBe("aliaslabel");
    expect(segments.filter(s => s.kind === "code").map(s => s.text).join("")).toBe("code_text[[literal|text]]");
  });

  it("retains marker-only matches through plain-text fallback", async () => {
    const result = await snippet("1) needle", "1");
    expect(result.presentation).toBeUndefined();
    expect(buildSearchSnippetSegments(result).find(s => s.highlighted)?.text).toBe("1");
  });

  it("bounds raw syntax and format counts, retaining readable hits on fallback", async () => {
    for (const source of ["[needle](" + "x".repeat(5000) + ")", "needle " + "`code` ".repeat(33)]) {
      const result = await snippet(source);
      expect(result.presentation).toBeUndefined();
      expect(buildSearchSnippetSegments(result).find(s => s.highlighted)?.text).toBe("needle");
    }
  });

  it("crops styled prefixes logarithmically on Unicode boundaries and preserves all hits", async () => {
    const result = await snippet("# `" + "𠮷".repeat(45) + "` needle [[Target|needle alias]]");
    let calls = 0;
    const segments = buildSearchSnippetSegments(result, 100, (value, kind) => { calls++; return [...value].length * (kind === "code" ? 12 : 8); });
    expect(segments[0].text).toBe("…");
    expect(calls).toBeLessThan(25);
    expect(segments.filter(s => s.highlighted).map(s => s.text)).toEqual(["needle", "needle"]);
    expect(segments.map(s => s.text).join("")).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
  });
});
