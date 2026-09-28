/**
 * Structural stand-in for a projected panel row. Declared locally so this
 * module keeps zero imports, which is what exempts it from the Svelte
 * layering rule.
 */
export interface StickyHeaderRow {
  readonly kind: "group-header" | "cards";
  readonly segmentIndex: number;
}

export interface StickyGroupHeaderInput {
  scrollTop: number;
  /**
   * Padding-top of the scrollport. Row positions start at the content box,
   * below this padding, while `scrollTop` is measured from the padding edge.
   */
  listPaddingTop: number;
  /**
   * Space above a following group's header button. Matches
   * `.fce-wall-group-row.is-following` (half of `--fce-wall-gap`). The first
   * group has none.
   */
  followingHeaderLead: number;
  rowPositions: readonly number[];
  rows: readonly StickyHeaderRow[];
  /** Rendered height of the pinned header bar. */
  headerHeight: number;
}

export interface StickyGroupHeader {
  readonly segmentIndex: number;
  readonly headerRowIndex: number;
  /** Upward shift, in pixels, as the next header pushes this one out. Always `<= 0`. */
  readonly offset: number;
}

/**
 * The group whose header has crossed the top of the scrollport stays pinned
 * there until the next group's header pushes it out. While a header still
 * sits on that line, the in-flow header is the one on screen and this
 * returns null so the two do not stack.
 */
export function resolveStickyGroupHeader(input: StickyGroupHeaderInput): StickyGroupHeader | null {
  if (input.rows.length === 0 || input.rowPositions.length === 0) {
    return null;
  }

  const scrollTop = finiteOrZero(input.scrollTop);
  const paddingTop = Math.max(0, finiteOrZero(input.listPaddingTop));
  const lead = Math.max(0, finiteOrZero(input.followingHeaderLead));
  const headerHeight = Math.max(0, finiteOrZero(input.headerHeight));
  const pinScroll = scrollTop - paddingTop;

  let activeIndex = -1;
  let activeButtonTop = 0;
  let nextButtonTop = Number.POSITIVE_INFINITY;

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    if (!row || row.kind !== "group-header") {
      continue;
    }

    const buttonTop = (input.rowPositions[index] ?? 0) + (row.segmentIndex > 0 ? lead : 0);
    if (buttonTop <= pinScroll) {
      activeIndex = index;
      activeButtonTop = buttonTop;
      nextButtonTop = Number.POSITIVE_INFINITY;
      continue;
    }

    if (activeIndex !== -1) {
      nextButtonTop = buttonTop;
      break;
    }
  }

  if (activeIndex === -1 || !(activeButtonTop < pinScroll)) {
    return null;
  }

  const segmentIndex = input.rows[activeIndex]?.segmentIndex ?? -1;
  if (segmentIndex < 0) {
    return null;
  }

  return {
    segmentIndex,
    headerRowIndex: activeIndex,
    offset: Math.min(0, nextButtonTop - pinScroll - headerHeight),
  };
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
