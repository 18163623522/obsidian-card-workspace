export type GroupHeaderPropertyValue =
  | { readonly kind: "text" | "number"; readonly label: string }
  | { readonly kind: "boolean"; readonly value: boolean; readonly label: string };

/**
 * Structured header content. A bucket's flat `label` stays the form used for
 * ordering, the accessible name, and tooltips; this is only what the header
 * renders. A property header with no `values` is the unassigned bucket.
 */
export type GroupHeaderContent =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "folder"; readonly name: string; readonly parentPath: string }
  | { readonly kind: "tags"; readonly tags: readonly string[] }
  | {
      readonly kind: "property";
      readonly keyLabel: string;
      readonly values: readonly GroupHeaderPropertyValue[];
    };
