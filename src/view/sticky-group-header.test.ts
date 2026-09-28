import { describe, expect, it } from "vitest";

import { resolveStickyGroupHeader, type StickyHeaderRow } from "./sticky-group-header";

function rows(): StickyHeaderRow[] {
  return [
    { kind: "group-header", segmentIndex: 0 },
    { kind: "cards", segmentIndex: 0 },
    { kind: "group-header", segmentIndex: 1 },
    { kind: "cards", segmentIndex: 1 },
    { kind: "group-header", segmentIndex: 2 },
  ];
}

const positions = [0, 40, 280, 320, 560];

describe("resolveStickyGroupHeader", () => {
  it("stays unpinned while the in-flow header still sits on the top edge", () => {
    expect(resolveStickyGroupHeader({
      scrollTop: 0,
      listPaddingTop: 0,
      followingHeaderLead: 0,
      rowPositions: positions,
      rows: rows(),
      headerHeight: 36,
    })).toBeNull();
  });

  it("pins the current group once its header has crossed the top", () => {
    expect(resolveStickyGroupHeader({
      scrollTop: 80,
      listPaddingTop: 0,
      followingHeaderLead: 0,
      rowPositions: positions,
      rows: rows(),
      headerHeight: 36,
    })).toEqual({ segmentIndex: 0, headerRowIndex: 0, offset: 0 });
  });

  it("lets the next header push the pinned one out", () => {
    expect(resolveStickyGroupHeader({
      scrollTop: 260,
      listPaddingTop: 0,
      followingHeaderLead: 0,
      rowPositions: positions,
      rows: rows(),
      headerHeight: 36,
    })).toEqual({ segmentIndex: 0, headerRowIndex: 0, offset: -16 });
  });

  it("hands the pin to the in-flow header exactly when that header reaches the top", () => {
    expect(resolveStickyGroupHeader({
      scrollTop: 280,
      listPaddingTop: 0,
      followingHeaderLead: 0,
      rowPositions: positions,
      rows: rows(),
      headerHeight: 36,
    })).toBeNull();

    expect(resolveStickyGroupHeader({
      scrollTop: 281,
      listPaddingTop: 0,
      followingHeaderLead: 0,
      rowPositions: positions,
      rows: rows(),
      headerHeight: 36,
    })).toEqual({ segmentIndex: 1, headerRowIndex: 2, offset: 0 });
  });

  it("keeps the last group pinned with nothing left to push it", () => {
    expect(resolveStickyGroupHeader({
      scrollTop: 600,
      listPaddingTop: 0,
      followingHeaderLead: 0,
      rowPositions: positions,
      rows: rows(),
      headerHeight: 36,
    })).toEqual({ segmentIndex: 2, headerRowIndex: 4, offset: 0 });
  });

  it("waits out the scrollport padding and a following group's lead", () => {
    expect(resolveStickyGroupHeader({
      scrollTop: 12,
      listPaddingTop: 12,
      followingHeaderLead: 6,
      rowPositions: positions,
      rows: rows(),
      headerHeight: 36,
    })).toBeNull();

    expect(resolveStickyGroupHeader({
      scrollTop: 20,
      listPaddingTop: 12,
      followingHeaderLead: 6,
      rowPositions: positions,
      rows: rows(),
      headerHeight: 36,
    })?.segmentIndex).toBe(0);

    // Second header button is at 280 + 6. With 12px padding the pin line at
    // scrollTop 290 is still 8px above that button, so the first group is
    // pushed by headerHeight - 8.
    expect(resolveStickyGroupHeader({
      scrollTop: 290,
      listPaddingTop: 12,
      followingHeaderLead: 6,
      rowPositions: positions,
      rows: rows(),
      headerHeight: 36,
    })).toEqual({ segmentIndex: 0, headerRowIndex: 0, offset: -28 });
  });

  it("returns null when nothing is grouped or the layout is empty", () => {
    expect(resolveStickyGroupHeader({
      scrollTop: 40,
      listPaddingTop: 0,
      followingHeaderLead: 0,
      rowPositions: [0, 200],
      rows: [
        { kind: "cards", segmentIndex: -1 },
        { kind: "cards", segmentIndex: -1 },
      ],
      headerHeight: 36,
    })).toBeNull();

    expect(resolveStickyGroupHeader({
      scrollTop: 10,
      listPaddingTop: 0,
      followingHeaderLead: 0,
      rowPositions: [],
      rows: [],
      headerHeight: 36,
    })).toBeNull();
  });

  it("treats non-finite metrics as zero", () => {
    expect(resolveStickyGroupHeader({
      scrollTop: Number.NaN,
      listPaddingTop: Number.POSITIVE_INFINITY,
      followingHeaderLead: Number.NaN,
      rowPositions: positions,
      rows: rows(),
      headerHeight: Number.NaN,
    })).toBeNull();
  });
});
