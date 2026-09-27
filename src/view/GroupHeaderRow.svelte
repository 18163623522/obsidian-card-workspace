<script lang="ts">
  import { setIcon } from "obsidian";
  import type { UiStrings } from "../i18n";
  import type { CardGroupSegment } from "./card-grouping";
  import { resolveGroupHeaderParts } from "./group-header-content";

  interface GroupHeaderRowProps {
    segment: CardGroupSegment;
    strings: UiStrings;
    headerId: string;
    onToggle: (key: string) => void;
  }

  let { segment, strings, headerId, onToggle }: GroupHeaderRowProps = $props();

  const groupStrings = $derived(strings.sortGroup);
  const accessibleName = $derived(groupStrings.groupHeaderAria(segment.label, segment.count));
  const chevronIcon = $derived(segment.collapsed ? "chevron-right" : "chevron-down");
  const parts = $derived(resolveGroupHeaderParts(segment.header, segment.label, groupStrings));

  function applyIcon(node: HTMLElement, iconName: string): { update: (nextIconName: string) => void } {
    setIcon(node, iconName);
    return {
      update(nextIconName: string) {
        setIcon(node, nextIconName);
      },
    };
  }

  function handleClick(): void {
    onToggle(segment.key);
  }
</script>

<button
  type="button"
  class="fce-card-group-header"
  class:is-collapsed={segment.collapsed}
  class:is-missing={segment.isMissingBucket}
  id={headerId}
  aria-expanded={!segment.collapsed}
  aria-label={accessibleName}
  onclick={handleClick}
>
  <span class="fce-card-group-chevron" use:applyIcon={chevronIcon}></span>
  <span class="fce-card-group-label">{#if parts.dimension}<span class="fce-card-group-dimension"><span
          class="fce-card-group-dimension-icon"
          use:applyIcon={parts.dimension.icon}
        ></span><span class="fce-card-group-dimension-text">{parts.dimension.label}</span></span><span
        class="fce-card-group-divider"
        aria-hidden="true"
      ></span>{/if}<span class="fce-card-group-values">{#each parts.chips as chip, index (index)}<span
          class="fce-card-group-value"
          class:is-off={chip.iconOff}
          title={chip.title}
        >{#if chip.icon}<span class="fce-card-group-value-icon" use:applyIcon={chip.icon}></span>{/if}{#if chip.prefix}<span
              class="fce-card-group-value-prefix">{chip.prefix}</span>{/if}<span class="fce-card-group-value-text"
            >{chip.text}</span></span>{/each}</span></span>
  <span class="fce-card-group-count">{groupStrings.groupCount(segment.count)}</span>
</button>
