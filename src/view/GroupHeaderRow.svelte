<script lang="ts">
  import { setIcon } from "obsidian";
  import type { UiStrings } from "../i18n";
  import type { CardGroupSegment } from "./card-grouping";

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
  const header = $derived(segment.header);
  const hasChips = $derived(
    header.kind === "tags" || (header.kind === "property" && header.values.length > 1),
  );

  function splitTag(tag: string): { parent: string; leaf: string } {
    const cut = tag.lastIndexOf("/");
    return cut === -1 ? { parent: "", leaf: tag } : { parent: tag.slice(0, cut + 1), leaf: tag.slice(cut + 1) };
  }

  function formatParentPath(path: string): string {
    return path.split("/").join(" / ");
  }

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
  <span class="fce-card-group-label" class:has-chips={hasChips}>
    {#if header.kind === "tags"}
      {#each header.tags as tag (tag)}
        {@const parts = splitTag(tag)}
        <span class="fce-card-group-tag">{#if parts.parent}<span class="fce-card-group-tag-parent">{parts.parent}</span>{/if}{parts.leaf}</span>
      {/each}
    {:else if header.kind === "folder"}
      <span class="fce-card-group-title">{header.name}</span>
      {#if header.parentPath}
        <span class="fce-card-group-path">{formatParentPath(header.parentPath)}</span>
      {/if}
    {:else if header.kind === "property"}
      <span class="fce-card-group-key">{header.keyLabel}</span>
      {#if header.values.length === 0}
        <span class="fce-card-group-title">{segment.label}</span>
      {:else if header.values.length === 1}
        {@const value = header.values[0]}
        {#if value.kind === "boolean"}
          <span class="fce-card-group-title fce-card-group-boolean" class:is-off={!value.value}><span
              class="fce-card-group-boolean-icon"
              use:applyIcon={value.value ? "check-square" : "square"}
            ></span>{value.label}</span>
        {:else}
          <span class="fce-card-group-title">{value.label}</span>
        {/if}
      {:else}
        {#each header.values as value, index (index)}
          <span class="fce-card-group-chip">{value.label}</span>
        {/each}
      {/if}
    {:else}
      <span class="fce-card-group-title">{header.text}</span>
    {/if}
  </span>
  <span class="fce-card-group-count">{groupStrings.groupCount(segment.count)}</span>
</button>
