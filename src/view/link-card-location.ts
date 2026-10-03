import { resolveSubpath, TFile, type App, type ReferenceCache } from "obsidian";

import type { LinksScope } from "./scope";
import type { SearchSnippetLocation } from "../search";

/** A zero-based source line for a backlink or target line for an anchored outgoing link. */
export interface LinkCardLocation {
  line: number;
  ch?: number;
  /** Text from the metadata entry, used to reject stale line positions. */
  expectedText?: string;
  expectedBlockId?: string;
  endLine?: number;
  identity: string;
}

export interface SearchSnippetCardLocation {
  readonly kind: "search-snippet";
  readonly snippet: SearchSnippetLocation;
  /** Rechecked after opening and during delayed correction. */
  readonly isCurrent?: () => boolean;
}

export type CardOpenLocation = LinkCardLocation | { readonly query: string } | SearchSnippetCardLocation;

function validLine(line: unknown): line is number {
  return typeof line === "number" && Number.isSafeInteger(line) && line >= 0;
}

function references(app: App, file: TFile): ReferenceCache[] {
  const cache = app.metadataCache.getFileCache?.(file);
  return [...(cache?.links ?? []), ...(cache?.embeds ?? [])]
    .filter((entry) => validLine(entry.position?.start.line))
    .sort((a, b) => a.position.start.offset - b.position.start.offset);
}

/** Uses the resolved graph for membership, then metadata positions for the first usable location. */
export function resolveLinkCardLocation(app: App, scope: LinksScope, cardPath: string): LinkCardLocation | null {
  const sourcePath = scope.direction === "backlinks" ? cardPath : scope.notePath;
  const source = app.vault.getAbstractFileByPath(sourcePath);
  if (!(source instanceof TFile)) return null;
  const graph = app.metadataCache.resolvedLinks?.[sourcePath];
  const destinationPath = scope.direction === "backlinks" ? scope.notePath : cardPath;
  if (!graph || !(destinationPath in graph)) return null;

  for (const reference of references(app, source)) {
    const [linkpath, subpath] = reference.link.split("#", 2);
    const destination = app.metadataCache.getFirstLinkpathDest?.(linkpath ?? "", sourcePath);
    if (destination?.path !== destinationPath) continue;
    if (scope.direction === "backlinks") {
      const line = reference.position.start.line;
      const ch = reference.position.start.col;
      return { line, ch, expectedText: reference.original || undefined, identity: `back:${line}:${ch}:${reference.original}` };
    }
    if (!subpath) continue;
    const target = app.vault.getAbstractFileByPath(cardPath);
    if (!(target instanceof TFile)) continue;
    const cache = app.metadataCache.getFileCache?.(target);
    if (!cache || typeof resolveSubpath !== "function") continue;
    const resolved = resolveSubpath(cache, `#${subpath}`);
    if (!resolved) continue;
    const line = resolved.type === "heading"
      ? resolved.current.position.start.line
      : resolved.type === "block" ? resolved.block.position.start.line : -1;
    if (!validLine(line)) continue;
    return {
      line,
      expectedText: resolved.type === "heading" ? resolved.current.heading : undefined,
      expectedBlockId: resolved.type === "block" ? resolved.block.id : undefined,
      endLine: resolved.type === "block" ? resolved.block.position.end.line : undefined,
      identity: `out:${reference.link}:${line}:${resolved.type === "block" ? resolved.block.position.end.line : ""}`,
    };
  }
  return null;
}

export function locationExistsInText(markdown: string, location: LinkCardLocation): boolean {
  return locationExistsInLines(markdown.split(/\r?\n/), location);
}

export function locationExistsInLines(lines: string[], location: LinkCardLocation): boolean {
  const line = lines[location.line];
  if (line === undefined || (location.expectedText && !line.includes(location.expectedText))) return false;
  if (location.expectedBlockId) {
    const end = Math.min(lines.length, (location.endLine ?? location.line) + 2);
    return lines.slice(location.line, end).some((entry) => entry.includes(`^${location.expectedBlockId}`));
  }
  return true;
}
