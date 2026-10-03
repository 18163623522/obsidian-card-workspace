export const FRONTMATTER_PATTERN = /^---[\s\S]*?---\s*/;

/** Shared by index preparation and the source-mapped, cooperative preview scan. */
export const MARKDOWN_SEARCH_REPLACEMENTS: readonly {
  pattern: RegExp;
  group?: number;
  aliasGroup?: number;
  asciiCode?: boolean;
  opener?: string;
  boundary?: RegExp;
  closer?: string;
}[] = [
  { pattern: /!\[[^\]]*]\([^)]+\)/g, opener: "![", boundary: /]/, closer: ")" },
  { pattern: /!\[\[[^\]]+]]/g, opener: "![[", boundary: /]/, closer: "]]" },
  { pattern: /\[([^\]]+)]\([^)]+\)/g, group: 1, opener: "[", boundary: /]/, closer: ")" },
  { pattern: /\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|([^\]]+))?]]/g, group: 1, aliasGroup: 2, opener: "[[", boundary: /[\]#|]/, closer: "]]" },
  { pattern: /^#{1,6}\s+/g, group: 0 },
  { pattern: /^\s*[-*+]\s+/g, group: 0 },
  { pattern: /^\s*\d+\.\s+/g, group: 0 },
  { pattern: /\$\$([\s\S]*?)\$\$/g, group: 1 },
  { pattern: /\$([^$\n]+)\$/g, group: 1 },
  { pattern: /\\\((.*?)\\\)/g, group: 1, opener: "\\(", boundary: /[\r\n]/, closer: "\\)" },
  { pattern: /\\\[(.*?)\\\]/g, group: 1, opener: "\\[", boundary: /[\r\n]/, closer: "\\]" },
  { pattern: /`([^`]*)`/g, group: 1, asciiCode: true },
  { pattern: /[*_~=>]/g },
];

export function searchReplacementText(
  rule: typeof MARKDOWN_SEARCH_REPLACEMENTS[number], match: readonly string[],
): string {
  if (rule.group === 0) return "";
  const text = rule.aliasGroup && match[rule.aliasGroup] !== undefined
    ? match[rule.aliasGroup] : rule.group ? match[rule.group] : " ";
  return rule.asciiCode && !/^[A-Za-z0-9 _-]+$/.test(text) ? " " : text;
}

export function extractMarkdownSearchText(markdown: string): string {
  const normalized = stripFrontmatter(markdown).replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const textParts: string[] = [];
  const expandedParts: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    const fence = getFenceInfo(trimmed);
    if (fence) {
      const fenceText = readFenceBody(lines, index, fence.marker, fence.size);
      appendCleanText(textParts, expandedParts, fenceText.text.join("\n"));
      index = fenceText.nextIndex;
      continue;
    }

    appendCleanText(textParts, expandedParts, normalizeMarkdownLine(line));
    index += 1;
  }

  return collapseSearchText(`${textParts.join(" ")} ${expandedParts.join(" ")}`);
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(FRONTMATTER_PATTERN, "");
}

export function getFenceInfo(line: string): { marker: "`" | "~"; size: number } | null {
  const match = line.match(/^\s*(`{3,}|~{3,})/);
  if (!match?.[1]) {
    return null;
  }

  const token = match[1];
  return { marker: token[0] as "`" | "~", size: token.length };
}

function readFenceBody(
  lines: string[],
  startIndex: number,
  marker: "`" | "~",
  size: number,
): { text: string[]; nextIndex: number } {
  const body: string[] = [];
  let cursor = startIndex + 1;

  while (cursor < lines.length) {
    const trimmed = lines[cursor].trim();
    if (isFenceClosingLine(trimmed, marker, size)) {
      cursor += 1;
      break;
    }

    body.push(lines[cursor]);
    cursor += 1;
  }

  return { text: body, nextIndex: cursor };
}

export function isFenceClosingLine(line: string, marker: "`" | "~", size: number): boolean {
  if (size < 3) {
    return false;
  }

  const pattern = marker === "`" ? /^`{3,}\s*$/ : /^~{3,}\s*$/;
  const match = line.match(pattern);
  return !!match && line.replace(/\s+$/, "").length >= size;
}

function normalizeMarkdownLine(line: string): string {
  for (const rule of MARKDOWN_SEARCH_REPLACEMENTS) {
    line = line.replace(rule.pattern, (...args: unknown[]) =>
      searchReplacementText(rule, args.slice(0, -2) as string[]));
  }
  return collapseSearchText(line.trim());
}

function appendCleanText(parts: string[], expandedParts: string[], text: string): void {
  if (text.length === 0) {
    return;
  }

  parts.push(text);

  const expanded = expandSeparatorTokens(text);
  if (expanded !== null) {
    expandedParts.push(expanded);
  }
}

function expandSeparatorTokens(text: string): string | null {
  const expandedTokens = text
    .split(/\s+/)
    .map((token) => {
      if (!/[._/\\-]/.test(token) || !/[A-Za-z0-9]/.test(token)) {
        return null;
      }

      const expanded = collapseSearchText(token.replace(/[._/\\-]+/g, " "));
      return expanded.length > 0 && expanded !== token ? expanded : null;
    })
    .filter((token): token is string => token !== null)
    .join(" ");

  const collapsed = collapseSearchText(expandedTokens);
  if (collapsed.length === 0) {
    return null;
  }

  return collapsed;
}

function collapseSearchText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
