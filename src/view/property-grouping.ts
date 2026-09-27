import type { App } from "obsidian";
import type { UiStrings } from "../i18n";
import { serializePropertyScalarRef, type PropertyScalarRef } from "../property-filter-settings";
import { isMarkdownCardKind } from "./file-kind";
import { getFileFrontmatter } from "./metadata-utils";
import { extractPropertyScalars, resolvePropertyScalarLabels } from "./property-metadata";
import type { GroupBucket } from "./card-grouping";
import type { NoteCardRecord } from "./types";

/** One bucket per card, identified by the complete normalized scalar set. */
export function buildPropertyGroupBuckets(app: App, cards: readonly NoteCardRecord[], key: string,
  strings: UiStrings): Map<string, GroupBucket> {
  const valuesByPath = new Map<string, PropertyScalarRef[]>();
  const uniqueRefs = new Map<string, PropertyScalarRef>();
  for (const card of cards) {
    const values = isMarkdownCardKind(card.fileKind)
      ? extractPropertyScalars(getFileFrontmatter(app, card.file)).find((entry) => entry.key === key)?.values ?? []
      : [];
    valuesByPath.set(card.path, values);
    for (const ref of values) uniqueRefs.set(serializePropertyScalarRef(ref), ref);
  }

  // Resolve display collisions over the whole source, so text "1" and number
  // 1 keep different, understandable headers even when they occur in separate files.
  const valueLabels = resolvePropertyScalarLabels([...uniqueRefs.values()], strings.property);
  const buckets = new Map<string, GroupBucket>();
  for (const card of cards) {
    const values = valuesByPath.get(card.path) ?? [];
    if (values.length === 0) {
      buckets.set(card.path, {
        key: `property:${JSON.stringify([key, null])}`,
        label: strings.sortGroup.bucketPropertyUnassigned,
        detail: "", sortKey: "", isMissing: true,
      });
      continue;
    }
    const identities = values.map(serializePropertyScalarRef).sort();
    const label = identities.map((identity) => valueLabels.get(identity) ?? identity).join(", ");
    buckets.set(card.path, {
      key: `property:${JSON.stringify([key, identities])}`,
      label, detail: "", sortKey: label, isMissing: false,
    });
  }
  return buckets;
}
