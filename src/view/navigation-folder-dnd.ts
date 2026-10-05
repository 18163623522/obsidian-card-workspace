import { folderParentPath } from "../folder-sibling-orders";
import type { NavigationRowDragState } from "./navigation-favorite-dnd";
import type { NavigationRow } from "./navigation-model";

export type FolderDropOperation = "inside" | "before" | "after";
export interface FolderDropTarget { path: string; operation: FolderDropOperation }
export interface FolderDragState { source: string | null; target: FolderDropTarget | null }

/** Constant-time path/geometry decision. Root accepts only moves in every region. */
export function resolveFolderDrop(
  source: string | null, target: string, clientY: number, rect: { top: number; height: number },
): FolderDropTarget | null {
  if (!source || target === source || target.startsWith(`${source}/`)) return null;
  const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  const operation = target === "" ? "inside" : ratio < 0.25 ? "before" : ratio >= 0.75 ? "after" : "inside";
  if (operation === "inside") {
    if (folderParentPath(source) === target) return null;
  } else if (folderParentPath(source) !== folderParentPath(target)) return null;
  return { path: target, operation };
}

export function folderRowDragState(row: NavigationRow, drag: FolderDragState): NavigationRowDragState | null {
  if (row.kind !== "folder") return null;
  return {
    draggable: row.folderPath !== "",
    dragging: row.folderPath === drag.source,
    dropIndicator: drag.target?.path === row.folderPath && drag.target.operation !== "inside" ? drag.target.operation : null,
    dropInside: drag.target?.path === row.folderPath && drag.target.operation === "inside",
  };
}

/** Signed velocity in CSS pixels/second within the shared scroller's 32px edge. */
export function folderDragScrollSpeed(clientY: number, rect: { top: number; bottom: number }): number {
  if (clientY < rect.top || clientY > rect.bottom) return 0;
  const top = clientY - rect.top, bottom = rect.bottom - clientY;
  if (Math.min(top, bottom) >= 32) return 0;
  return top < bottom ? -480 * (1 - top / 32) : 480 * (1 - bottom / 32);
}
