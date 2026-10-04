import type { SearchPreviewSnippet, SearchSnippetRun } from "../search";

export interface SearchSnippetSegment {
  text: string;
  highlighted: boolean;
  kind: SearchSnippetRun["kind"];
  heading: boolean;
}
export type SearchSnippetMeasure = (text: string, kind: SearchSnippetRun["kind"], heading: boolean) => number;

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "\r": "&#13;",
};
function escapeSnippetText(value: string): string {
  return value.replace(/[&<>"'\r]/g, character => HTML_ESCAPES[character]);
}

/** Only fixed phrasing tags/classes are emitted; all source text is escaped before HTML parsing. */
export function buildSearchSnippetHtml(segments: readonly SearchSnippetSegment[]): string {
  return groupSearchSnippetSegments(segments).map(run => {
    const body = run.segments.map(segment => segment.highlighted
      ? `<mark class="fce-search-hit">${escapeSnippetText(segment.text)}</mark>` : escapeSnippetText(segment.text)).join("");
    if (run.kind === "code") return `<code${run.heading ? ' class="fce-preview-heading"' : ""}>${body}</code>`;
    const classes = [run.heading ? "fce-preview-heading" : "", run.kind === "link" ? "fce-preview-link" : ""].filter(Boolean).join(" ");
    return classes ? `<span class="${classes}">${body}</span>` : body;
  }).join("");
}

export function groupSearchSnippetSegments(segments: readonly SearchSnippetSegment[]): {
  kind: SearchSnippetSegment["kind"]; heading: boolean; segments: SearchSnippetSegment[];
}[] {
  const groups: ReturnType<typeof groupSearchSnippetSegments> = [];
  for (const segment of segments) {
    const previous = groups.at(-1);
    if (previous?.kind === segment.kind && previous.heading === segment.heading) previous.segments.push(segment);
    else groups.push({ kind: segment.kind, heading: segment.heading, segments: [segment] });
  }
  return groups;
}

/** Binary prefix cropping at code-point boundaries; bounded runs are measured in their own fonts. */
export function buildSearchSnippetSegments(
  snippet: SearchPreviewSnippet, width = 0, measure?: SearchSnippetMeasure,
): SearchSnippetSegment[] {
  const presentation = snippet.presentation;
  const { text, highlights } = presentation ?? snippet;
  const runs = presentation?.runs ?? [{ start: 0, end: text.length, kind: "text" as const, heading: false }];
  const first = highlights[0];
  let cursor = 0;
  if (first && width > 0 && measure) {
    const boundaries = [0];
    for (let index = 0; index < first.start;) {
      index += (text.codePointAt(index) ?? 0) > 0xffff ? 2 : 1;
      boundaries.push(index);
    }
    const prefixWidth = (start: number) => {
      let total = start ? measure("…", "text", false) : 0;
      for (const run of runs) {
        const from = Math.max(start, run.start), to = Math.min(first.start, run.end);
        if (from < to) total += measure(text.slice(from, to).replace(/\t/g, "        "), run.kind, run.heading);
      }
      return total;
    };
    if (prefixWidth(0) > width * 0.3) {
      let low = 1, high = boundaries.length - 1;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (prefixWidth(boundaries[mid]) > width * 0.3) low = mid + 1;
        else high = mid;
      }
      cursor = boundaries[low];
    }
  }
  const segments: SearchSnippetSegment[] = [];
  if (cursor) segments.push({ text: "…", highlighted: false, kind: "text", heading: false });
  let hitIndex = 0;
  for (const run of runs) {
    let start = Math.max(cursor, run.start);
    while (start < run.end) {
      while (hitIndex < highlights.length && highlights[hitIndex].end <= start) hitIndex += 1;
      const hit = highlights[hitIndex];
      const highlighted = !!hit && hit.start <= start;
      const end = Math.min(run.end, hit ? highlighted ? hit.end : hit.start : run.end);
      if (end <= start) break;
      segments.push({ text: text.slice(start, end), highlighted, kind: run.kind, heading: run.heading });
      start = end;
    }
  }
  return segments;
}
