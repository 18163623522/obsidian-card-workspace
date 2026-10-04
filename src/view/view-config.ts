/**
 * Pure view-configuration resolver over `(scope, settings)`.
 *
 * Returns only the sort, pin, and grouping settings that apply to the current
 * scope. Never reads App, MetadataCache, vault, or view runtime state, and
 * never computes arrangement: `group` carries the dimension *names* rather than
 * computed groups. Arrangement ownership comes from the exhaustive capability
 * resolver (C6), so a future source must declare its owner there explicitly.
 */
import { findCardBox } from "./card-boxes";
import { resolveSourceCapabilities } from "./source-capabilities";
import type { CardScope } from "./scope";
import type { GroupSpec } from "../card-grouping-settings";
import type { LinksSortSpec, PluginSettings } from "../settings";

export interface ResolvedViewConfig {
  sort: LinksSortSpec;
  pinnedPaths: string[];
  group: GroupSpec;
}

export function resolveViewConfig(
  scope: CardScope,
  settings: PluginSettings,
): ResolvedViewConfig {
  const global = {
    sort: scope.kind === "links" ? settings.linksSort[scope.direction] : settings.sort,
    pinnedPaths: settings.pinnedPaths,
    group: settings.group,
  };
  const { arrangementOwner } = resolveSourceCapabilities(scope);
  if (arrangementOwner.kind !== "box") {
    return global;
  }

  // A missing Box definition falls back to the global arrangement config.
  const box = findCardBox(settings.boxes ?? [], arrangementOwner.boxId);
  return box
    ? { sort: box.sort, pinnedPaths: box.pinnedPaths, group: box.group }
    : global;
}
