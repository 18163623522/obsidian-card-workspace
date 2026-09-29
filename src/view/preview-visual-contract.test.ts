import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const styles = fs.readFileSync(path.resolve(testDir, "../../styles.css"), "utf8");

describe("preview visual contract", () => {
  it("rounds the excerpt clipping surface so truncated code keeps its bottom corners", () => {
    expect(styles).toMatch(
      /\.folder-card-view \.fce-excerpt \{[\s\S]*?max-block-size:[\s\S]*?border-radius: var\(--radius-s\);\s*overflow: hidden;/,
    );
    expect(styles).toMatch(
      /\.folder-card-view \.fce-excerpt \.fce-preview-code \{[\s\S]*?border-radius: var\(--radius-s\);/,
    );
  });

  it("wraps list text beside a fixed marker inside the existing excerpt clamp", () => {
    expect(styles).toMatch(/\.folder-card-view \.fce-excerpt \.fce-preview-list-item \{[^}]*display: flex;[^}]*line-height: inherit;/);
    expect(styles).toMatch(/\.folder-card-view \.fce-excerpt \.fce-preview-list-marker \{[^}]*flex: 0 0 auto;[^}]*white-space: pre;/);
    expect(styles).toMatch(/\.folder-card-view \.fce-excerpt \.fce-preview-list-content \{[^}]*min-inline-size: 0;[^}]*overflow-wrap: anywhere;/);
    expect(styles).toMatch(/\.folder-card-view \.fce-excerpt p \{\s*margin: 0;/);
  });
});
