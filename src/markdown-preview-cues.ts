/** Pure syntax recognizers shared by ordinary previews and source-mapped snippets. */
export interface PreviewListItem {
  marker: string;
  body: string;
  bodyOffset: number;
  isTask: boolean;
  taskKind: "none" | "open" | "done" | "custom";
  taskGlyph: string;
}

export function parsePreviewListItem(line: string): PreviewListItem | null {
  const unordered = line.match(/^[-*+]\s+(.*)$/);
  const ordered = unordered ? null : line.match(/^(\d+[.)])\s+(.*)$/);
  if (!unordered && !ordered) return null;
  const marker = ordered?.[1] ?? "•";
  const sourceBody = ordered?.[2] ?? unordered?.[1] ?? "";
  const task = sourceBody.match(/^\[([^\]\r\n])\](?:\s+(.*)|\s*)$/);
  if (!task) return { marker, body: sourceBody, bodyOffset: line.length - sourceBody.length,
    isTask: false, taskKind: "none", taskGlyph: "" };
  const state = task[1];
  const taskKind = state === " " ? "open" : state === "x" || state === "X" ? "done" : "custom";
  const body = task[2] ?? "";
  return { marker: ordered ? marker : "", body, bodyOffset: line.length - body.length,
    isTask: true, taskKind, taskGlyph: taskKind === "custom" ? state : "" };
}

const WIKI_LINK_PATTERN = /\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|([^\]]+))?]]/y;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)]\([^)]+\)/y;

export function readPreviewLink(source: string, index: number): { body: string; bodyOffset: number; length: number } | null {
  WIKI_LINK_PATTERN.lastIndex = index;
  const wiki = WIKI_LINK_PATTERN.exec(source);
  if (wiki) return { body: wiki[2] ?? wiki[1],
    bodyOffset: index + (wiki[2] === undefined ? 2 : wiki[0].indexOf("|") + 1), length: wiki[0].length };
  MARKDOWN_LINK_PATTERN.lastIndex = index;
  const markdown = MARKDOWN_LINK_PATTERN.exec(source);
  return markdown ? { body: markdown[1], bodyOffset: index + 1, length: markdown[0].length } : null;
}
