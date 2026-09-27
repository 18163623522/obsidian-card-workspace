import type { App } from "obsidian";
import type { UiStrings } from "../i18n";
import { serializePropertyScalarRef, type PropertyScalarRef } from "../property-filter-settings";
import { isMarkdownCardKind } from "./file-kind";
import { getFileFrontmatter } from "./metadata-utils";
import { extractPropertyScalars, resolvePropertyScalarLabels } from "./property-metadata";
import type { GroupBucket } from "./card-grouping";
import type { GroupHeaderPropertyValue } from "./group-header-content";
import type { NoteCardRecord } from "./types";

function toHeaderValue(ref: PropertyScalarRef, label: string): GroupHeaderPropertyValue | null {
  switch (ref.kind) {
    case "text":
    case "number":
      return { kind: ref.kind, label };
    case "boolean":
      return { kind: "boolean", value: ref.value, label };
    case "missing":
      return null;
  }
}

/** One bucket per card, identified by the complete normalized scalar set. */
export function buildPropertyGroupBuckets(app: App, cards: readonly NoteCardRecord[], key: string,
  strings: UiStrings): Map<string, GroupBucket> {
  const valuesByPath = new Map<string, PropertyScalarRef[]>();
  const uniqueRefs = new Map<string, PropertyScalarRef>();
  // Same rule as the property inventory, so the header spells the key the way navigation does.
  let keyLabel: string | null = null;
  for (const card of cards) {
    const entry = isMarkdownCardKind(card.fileKind)
      ? extractPropertyScalars(getFileFrontmatter(app, card.file)).find((candidate) => candidate.key === key)
      : undefined;
    const values = entry?.values ?? [];
    if (entry !== undefined && (keyLabel === null || entry.label < keyLabel)) keyLabel = entry.label;
    valuesByPath.set(card.path, values);
    for (const ref of values) uniqueRefs.set(serializePropertyScalarRef(ref), ref);
  }
  const headerKeyLabel = keyLabel ?? key;

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
        detail: "",
        header: { kind: "property", keyLabel: headerKeyLabel, values: [] },
        sortKey: "", isMissing: true,
      });
      continue;
    }
    const identities = values.map(serializePropertyScalarRef).sort();
    const labels = identities.map((identity) => valueLabels.get(identity) ?? identity);
    const headerValues = identities.flatMap((identity, index) => {
      const ref = uniqueRefs.get(identity);
      const value = ref === undefined ? null : toHeaderValue(ref, labels[index]);
      return value === null ? [] : [value];
    });
    const label = labels.join(", ");
    buckets.set(card.path, {
      key: `property:${JSON.stringify([key, identities])}`,
      label, detail: "",
      header: { kind: "property", keyLabel: headerKeyLabel, values: headerValues },
      sortKey: label, isMissing: false,
    });
  }
  return buckets;
}
