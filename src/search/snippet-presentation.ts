import { parsePreviewListItem, readPreviewLink, type PreviewListItem } from "../markdown-preview-cues";
import type { SearchPreviewSnippet, SearchTextRange } from "./search-preview";

export const SNIPPET_FORMAT_SOURCE_LIMIT = 4096;
export const SNIPPET_FORMAT_RANGE_LIMIT = 32;
export interface SearchSnippetRun extends SearchTextRange {
  kind: "text" | "code" | "link";
  heading: boolean;
}
export interface SearchSnippetPresentation {
  text: string;
  highlights: SearchTextRange[];
  runs: SearchSnippetRun[];
  list?: Pick<PreviewListItem, "marker" | "taskKind" | "taskGlyph">;
  codeBlock: boolean;
}

/** Inspect at most one bounded context. All original snippet coordinates remain untouched. */
export function* buildSearchSnippetPresentation(
  source: string, snippet: SearchPreviewSnippet, offsets: readonly number[],
  sourceStart: number, sourceEnd: number, codeBlock: boolean,
): Generator<unknown, SearchSnippetPresentation | undefined> {
  if (sourceEnd - sourceStart > SNIPPET_FORMAT_SOURCE_LIMIT) return;
  const raw = source.slice(sourceStart, sourceEnd);
  const firstLine = raw.split("\n", 1)[0].replace(/\r$/, "");
  const trimmed = firstLine.trim();
  const list = codeBlock ? null : parsePreviewListItem(trimmed);
  const heading = !codeBlock && /^#{1,6}\s+./.test(trimmed);
  if (!codeBlock && !list && !heading && !raw.includes("`") && !raw.includes("[")) return;
  const bodyStart = list ? sourceStart + firstLine.indexOf(trimmed) + list.bodyOffset : sourceStart;
  const inline: { start: number; end: number; kind: "code" | "link" }[] = [];
  let attempts = 0;
  if (!codeBlock) for (let index = 0; index < raw.length; index += 1) {
    if (index % 64 === 0) yield;
    if (raw[index] === "`") {
      if (++attempts > SNIPPET_FORMAT_RANGE_LIMIT) return;
      const close = raw.indexOf("`", index + 1);
      if (close > index + 1) {
        inline.push({ start: sourceStart + index + 1, end: sourceStart + close, kind: "code" });
        index = close;
      }
    } else if (raw[index] === "[" && raw[index - 1] !== "!") {
      if (++attempts > SNIPPET_FORMAT_RANGE_LIMIT) return;
      const link = readPreviewLink(raw, index);
      if (link) {
        inline.push({ start: sourceStart + link.bodyOffset, end: sourceStart + link.bodyOffset + link.body.length, kind: "link" });
        index += link.length - 1;
      }
    }
  }
  if (!codeBlock && !list && !heading && !inline.length) return;
  const runs: SearchSnippetRun[] = [];
  const starts = new Int32Array(snippet.text.length).fill(-1);
  const ends = new Int32Array(snippet.text.length).fill(-1);
  let text = "";
  let inlineIndex = 0;
  function append(value: string, kind: SearchSnippetRun["kind"], isHeading: boolean) {
    const start = text.length;
    text += value;
    const previous = runs.at(-1);
    if (previous && previous.kind === kind && previous.heading === isHeading) previous.end = text.length;
    else runs.push({ start, end: text.length, kind, heading: isHeading });
  }
  if (codeBlock && offsets[0] >= sourceStart) {
    const indent = source.slice(sourceStart, offsets[0]);
    if (/^[\t ]+$/.test(indent)) append(indent, "code", false);
  }
  for (let index = 0; index < snippet.text.length; index += 1) {
    if (index % 64 === 0) yield;
    const offset = offsets[index];
    if (offset >= 0 && offset < bodyStart) continue;
    while (inlineIndex < inline.length && inline[inlineIndex].end <= offset) inlineIndex += 1;
    const cue = inline[inlineIndex];
    const kind = codeBlock ? "code" : cue && offset >= cue.start && offset < cue.end ? cue.kind : "text";
    let value = snippet.text[index];
    if (codeBlock && value === " " && offsets[index + 1] >= 0) {
      const whitespaceStart = offset >= 0 ? offset : offsets[index - 1] + 1;
      const whitespace = source.slice(whitespaceStart, offsets[index + 1]);
      if (whitespace && /^\s+$/.test(whitespace)) value = whitespace.replace(/\r\n/g, "\n");
    }
    starts[index] = text.length;
    append(value, kind, heading && offset >= sourceStart && offset < sourceStart + firstLine.length);
    ends[index] = text.length;
    if (text.length > 200 || runs.length > SNIPPET_FORMAT_RANGE_LIMIT) return;
  }
  const highlights: SearchTextRange[] = [];
  for (const range of snippet.highlights) {
    for (let index = range.start; index < range.end; index += 1) if (starts[index] < 0) return;
    highlights.push({ start: starts[range.start], end: ends[range.end - 1] });
  }
  return { text, highlights, runs, codeBlock,
    ...(list ? { list: { marker: list.marker, taskKind: list.taskKind, taskGlyph: list.taskGlyph } } : {}) };
}
