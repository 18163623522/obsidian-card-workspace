import { buildLightPreview, type LightPreviewResult } from "./markdown-utils";
import { locationExistsInLines, type LinkCardLocation } from "./link-card-location";
import { tokenizeSearchQuery } from "../search-tokenization";

/** The same line budget is used for ordinary and location-centered previews. */
export function buildLocationPreview(
  markdown: string,
  location: LinkCardLocation,
  maxVisibleChars: number,
  previewLines: number,
): LightPreviewResult | null {
  return buildLocationPreviewFromLines(markdown.split(/\r?\n/), location, maxVisibleChars, previewLines);
}

export function buildLocationPreviewFromLines(
  lines: string[], location: LinkCardLocation, maxVisibleChars: number, previewLines: number,
  endLineExclusive = lines.length,
): LightPreviewResult | null {
  if (!locationExistsInLines(lines, location)) return null;
  const target = lines[location.line] ?? "";
  const start = location.line;
  const end = Math.min(lines.length, endLineExclusive, start + Math.max(2, previewLines * 2));
  const snippet = lines.slice(start, end);
  if (location.ch !== undefined && location.ch > 60) {
    snippet[0] = target.slice(location.ch - 60);
  }
  return buildLightPreview(snippet.join("\n"), maxVisibleChars, previewLines);
}

/** Searches source text only when a visible card is hydrated. */
export function buildSearchContextPreview(
  markdown: string,
  query: string,
  maxVisibleChars: number,
  previewLines: number,
): LightPreviewResult | null {
  const lines = markdown.split(/\r?\n/);
  const location = findSearchContextLocationInLines(lines, query);
  return location ? buildLocationPreviewFromLines(lines, location, maxVisibleChars, previewLines) : null;
}

export function findSearchContextLocation(markdown: string, query: string): LinkCardLocation | null {
  return findSearchContextLocationInLines(markdown.split(/\r?\n/), query);
}

function findSearchContextLocationInLines(lines: string[], query: string): LinkCardLocation | null {
  const terms = tokenizeSearchQuery(query).map((term) => term.toLocaleLowerCase());
  if (terms.length === 0) return null;
  let bodyStart = 0;
  if (lines[0] === "---") {
    const closing = lines.indexOf("---", 1);
    if (closing >= 0) bodyStart = closing + 1;
  }
  for (let line = bodyStart; line < lines.length; line += 1) {
    const text = lines[line]?.toLocaleLowerCase() ?? "";
    let hit = -1;
    for (const term of terms) {
      const index = text.indexOf(term);
      if (index >= 0 && (hit < 0 || index < hit)) hit = index;
    }
    if (hit >= 0) {
      return { line, ch: hit, identity: `search:${query}` };
    }
  }
  return null;
}
