import { describe, expect, it } from "vitest";

import {
  DEFAULT_GROUP_SPEC,
  normalizeGroupSpec,
  type GroupDimension,
  type GroupOrderBy,
} from "./card-grouping-settings";
import type { SortDirection } from "./settings";

const DIMENSIONS: GroupDimension[] = ["none", "folder", "tag", "box-rule", "task"];
const ORDER_BY: GroupOrderBy[] = ["default", "name", "count"];
const DIRECTIONS: SortDirection[] = ["asc", "desc"];

describe("DEFAULT_GROUP_SPEC", () => {
  it("is the ungrouped default", () => {
    expect(DEFAULT_GROUP_SPEC).toEqual({
      dimension: "none",
      orderBy: "default",
      orderDirection: "asc",
    });
  });
});

describe("normalizeGroupSpec", () => {
  it("normalizes a property key and drops property grouping without one", () => {
    expect(normalizeGroupSpec({ dimension: "property", propertyKey: " Status ", orderBy: "count" }))
      .toEqual({ dimension: "property", propertyKey: "status", orderBy: "count", orderDirection: "asc" });
    expect(normalizeGroupSpec({ dimension: "property", propertyKey: "position" }).dimension).toBe("none");
    expect(normalizeGroupSpec({ dimension: "property" }).dimension).toBe("none");
    expect(normalizeGroupSpec({ dimension: "tag", propertyKey: "status" })).toEqual({ ...DEFAULT_GROUP_SPEC, dimension: "tag" });
  });
  it("returns the default spec for undefined, null, and non-record values", () => {
    expect(normalizeGroupSpec(undefined)).toEqual(DEFAULT_GROUP_SPEC);
    expect(normalizeGroupSpec(null)).toEqual(DEFAULT_GROUP_SPEC);
    expect(normalizeGroupSpec("x")).toEqual(DEFAULT_GROUP_SPEC);
    expect(normalizeGroupSpec(0)).toEqual(DEFAULT_GROUP_SPEC);
    expect(normalizeGroupSpec(true)).toEqual(DEFAULT_GROUP_SPEC);
  });

  it("returns the default spec for a record with unknown members", () => {
    expect(
      normalizeGroupSpec({ dimension: "colour", orderBy: "size", orderDirection: "sideways" }),
    ).toEqual(DEFAULT_GROUP_SPEC);
    expect(normalizeGroupSpec({})).toEqual(DEFAULT_GROUP_SPEC);
  });

  it("does not return the shared default instance", () => {
    expect(normalizeGroupSpec(undefined)).not.toBe(DEFAULT_GROUP_SPEC);
  });

  it("round-trips every valid dimension", () => {
    for (const dimension of DIMENSIONS) {
      expect(normalizeGroupSpec({ ...DEFAULT_GROUP_SPEC, dimension }).dimension).toBe(dimension);
    }
  });

  it("round-trips every valid order-by", () => {
    for (const orderBy of ORDER_BY) {
      expect(normalizeGroupSpec({ ...DEFAULT_GROUP_SPEC, orderBy }).orderBy).toBe(orderBy);
    }
  });

  it("round-trips every valid direction", () => {
    for (const orderDirection of DIRECTIONS) {
      expect(normalizeGroupSpec({ ...DEFAULT_GROUP_SPEC, orderDirection }).orderDirection).toBe(
        orderDirection,
      );
    }
  });

  it("keeps valid members of a partially valid record and defaults the rest", () => {
    expect(normalizeGroupSpec({ dimension: "tag", orderBy: 7, orderDirection: null })).toEqual({
      dimension: "tag",
      orderBy: "default",
      orderDirection: "asc",
    });
    expect(normalizeGroupSpec({ orderBy: "count", orderDirection: "desc" })).toEqual({
      dimension: "none",
      orderBy: "count",
      orderDirection: "desc",
    });
  });

  it("ignores unrelated members", () => {
    expect(normalizeGroupSpec({ dimension: "folder", collapsed: ["a"] })).toEqual({
      dimension: "folder",
      orderBy: "default",
      orderDirection: "asc",
    });
  });
});
