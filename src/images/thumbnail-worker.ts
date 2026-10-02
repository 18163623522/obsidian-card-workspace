import { generateThumbnail } from "./thumbnail-render";
import type { ThumbnailResult } from "./types";
const workerScope = globalThis as unknown as {
  onmessage: (event: MessageEvent<ArrayBuffer>) => void;
  postMessage: (value: ThumbnailResult | { status: "eligible" }) => void;
};
workerScope.onmessage = async (event) => {
  workerScope.postMessage(await generateThumbnail(event.data, () => workerScope.postMessage({ status: "eligible" })));
};
