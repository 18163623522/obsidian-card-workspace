import type { SortDirection, LinksSortField } from "../settings";
import type { NoteCardRecord } from "./types";

/** Snapshot sort key shared by records and files; counts are populated only for Links. */
export interface CardOrderKey {
  name: string;
  ctime: number;
  mtime: number;
  path: string;
  referenceCount?: number;
}

/**
 * Total order for one sort field. Equal keys fall through to path, and that
 * tie-break is not reversed when the direction is descending.
 */
export function compareCardOrderKeys(
  left: CardOrderKey,
  right: CardOrderKey,
  field: LinksSortField,
  direction: SortDirection,
): number {
  let difference: number;
  if (field === "reference-count") {
    difference = (left.referenceCount ?? 0) - (right.referenceCount ?? 0);
  } else if (field === "name") {
    difference = left.name.localeCompare(right.name);
  } else {
    const leftValue = field === "ctime" ? left.ctime : left.mtime;
    const rightValue = field === "ctime" ? right.ctime : right.mtime;
    difference = leftValue - rightValue;
  }

  if (difference !== 0) {
    return direction === "asc" ? difference : -difference;
  }
  return left.path.localeCompare(right.path);
}

/** Stable card ordering; ties use path so reloads retain deterministic order. */
export function compareCards(
  left: NoteCardRecord,
  right: NoteCardRecord,
  field: LinksSortField,
  direction: SortDirection,
): number {
  return compareCardOrderKeys(
    { name: left.title, ctime: left.ctime, mtime: left.mtime, path: left.path, referenceCount: left.referenceCount },
    { name: right.title, ctime: right.ctime, mtime: right.mtime, path: right.path, referenceCount: right.referenceCount },
    field,
    direction,
  );
}

/** Binary insertion point for an already-sorted card array. */
export function findSortedInsertIndex(
  cards: readonly NoteCardRecord[],
  card: NoteCardRecord,
  field: LinksSortField,
  direction: SortDirection,
): number {
  let low = 0;
  let high = cards.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const existing = cards[mid];
    if (!existing) {
      break;
    }
    if (compareCards(existing, card, field, direction) <= 0) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}
