export interface ImageViewportRequest {
  generation: number;
  sequenceRevision: number;
  requestVersion: number;
  start: number;
  end: number;
  paths: readonly string[];
}
