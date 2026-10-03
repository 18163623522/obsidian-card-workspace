/**
 * Builders for the three hydration patch shapes.
 *
 * These are also the attachment point for `taskSummary`. A whole-scope load
 * whose group dimension is not `"task"` leaves the field `null` rather than
 * paying one `getFileCache` lookup per card in the scope, so every patch that
 * settles a card re-derives the summary from the live metadata cache: one lookup
 * per hydrated card. Non-Markdown kinds can never carry tasks, so their
 * placeholder pins the field to `null` instead of consulting the cache.
 */

import type { App } from "obsidian";
import type { SearchPreview } from "../../search";

import type { FileKindStrings } from "../../i18n";
import { getCardPlaceholderText } from "../file-kind";
import { deriveCardTaskSummary } from "../task-summary";
import type { NoteCardRecord } from "../types";
import type { CardPreviewFields } from "../view-state-store";

export interface HydrationPreview {
  readonly html: string;
  readonly mode: "text" | "code" | "empty";
  readonly searchPreview?: SearchPreview;
}

/** A completed Markdown read: rendered preview plus the current task summary. */
export function buildPreviewPatch(
  app: App,
  card: NoteCardRecord,
  preview: HydrationPreview,
): Partial<CardPreviewFields> {
  return {
    previewHtml: preview.html,
    previewMode: preview.mode,
    hydrated: true,
    taskSummary: deriveCardTaskSummary(app, card.file, card.fileKind),
    searchPreview: preview.searchPreview,
  };
}

/** A failed read still settles the card, and its summary is independent of it. */
export function buildEmptyPreviewPatch(
  app: App,
  card: NoteCardRecord,
): Partial<CardPreviewFields> {
  return {
    excerpt: "",
    previewHtml: "",
    previewMode: "empty",
    hydrated: true,
    taskSummary: deriveCardTaskSummary(app, card.file, card.fileKind),
    searchPreview: undefined,
  };
}

/** Non-Markdown kinds: title-oriented placeholder, never a task footer. */
export function buildPlaceholderPatch(
  card: NoteCardRecord,
  strings: FileKindStrings,
): Partial<CardPreviewFields> {
  const text = getCardPlaceholderText(card.fileKind, strings);
  return {
    excerpt: "",
    previewHtml: `<p class="fce-preview-placeholder">${text}</p>`,
    previewMode: "placeholder",
    hydrated: true,
    taskSummary: null,
    searchPreview: undefined,
  };
}
