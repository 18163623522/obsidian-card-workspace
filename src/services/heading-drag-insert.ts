import { resolveSubpath, stripHeadingForLink, type HeadingCache } from "obsidian";

/** A heading snapshot belongs to one drop; components never own section state. */
export function snapshotHeadings(headings: readonly HeadingCache[]): HeadingCache[] {
  return headings.map((heading) => ({
    heading: heading.heading,
    level: heading.level,
    position: {
      start: { ...heading.position.start },
      end: { ...heading.position.end },
    },
  })).sort((a, b) => a.position.start.offset - b.position.start.offset);
}

export function headingsEqual(left: readonly HeadingCache[], right: readonly HeadingCache[]): boolean {
  return left.length === right.length && left.every((heading, index) => {
    const other = right[index];
    return heading.heading === other.heading && heading.level === other.level
      && heading.position.start.offset === other.position.start.offset
      && heading.position.start.line === other.position.start.line
      && heading.position.end.offset === other.position.end.offset
      && heading.position.end.line === other.position.end.line;
  });
}

/** Only accept anchors that Obsidian resolves to the selected original position. */
export function resolveHeadingAnchor(headings: HeadingCache[], selected: HeadingCache): string | null {
  const ancestors: HeadingCache[] = [];
  for (const heading of headings) {
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].level >= heading.level) {
      ancestors.pop();
    }
    if (heading === selected) break;
    ancestors.push(heading);
  }

  const path = [stripHeadingForLink(selected.heading)];
  for (;;) {
    if (path.every((part) => part.length > 0)) {
      const anchor = `#${path.join("#")}`;
      const resolved = resolveSubpath({ headings }, anchor);
      if (resolved?.type === "heading"
        && resolved.current.position.start.offset === selected.position.start.offset) return anchor;
    }
    const parent = ancestors.pop();
    if (!parent) return null;
    path.unshift(stripHeadingForLink(parent.heading));
  }
}

/** Slice original lines, including Setext syntax and CRLF, without rewriting Markdown. */
export function extractHeadingSection(
  content: string,
  headings: readonly HeadingCache[],
  selected: HeadingCache,
  includeHeading: boolean,
): string | null {
  const index = headings.indexOf(selected);
  if (index < 0) return null;
  const next = headings.slice(index + 1).find((heading) => heading.level <= selected.level);
  const lineStarts = [0];
  for (let offset = content.indexOf("\n"); offset !== -1; offset = content.indexOf("\n", offset + 1)) {
    lineStarts.push(offset + 1);
  }
  const start = includeHeading
    ? lineStarts[selected.position.start.line]
    : lineStarts[selected.position.end.line + 1] ?? content.length;
  const end = next ? lineStarts[next.position.start.line] : content.length;
  if (start === undefined || end === undefined || start > end
    || selected.position.end.offset > content.length) return null;
  const text = content.slice(start, end)
    .replace(/^(?:[\t ]*\r?\n)+/, "")
    .replace(/(?:\r?\n[\t ]*)+$/, "");
  return /^[\t ]*$/.test(text) ? "" : text;
}
