import { DISK_MAX_BYTES, DISK_MAX_ENTRIES, type ThumbnailStorage } from "./types";
interface CacheMeta { key: string; size: number; used: number }
/** Separate metadata store keeps eviction from materializing every cached Blob. */
export class ThumbnailStore implements ThumbnailStorage {
  private database: Promise<IDBDatabase | null> | null = null;
  private generation = 0;
  private unavailable = false;
  private pendingInvalidations: Array<{ paths: readonly string[]; prefix: boolean }> = [];
  private clearPending = false;
  constructor(private readonly vault: string, private readonly factory: IDBFactory | null = typeof indexedDB === "undefined" ? null : indexedDB,
    private readonly maxEntries = DISK_MAX_ENTRIES, private readonly maxBytes = DISK_MAX_BYTES) {}
  private open(): Promise<IDBDatabase | null> {
    if (this.unavailable || !this.factory) return Promise.resolve(null);
    if (this.database) return this.database;
    const generation = this.generation;
    this.database = new Promise((resolve) => {
      let request: IDBOpenDBRequest;
      try { request = this.factory!.open(`card-workspace-thumbnails:${this.vault}`, 1); }
      catch { this.unavailable = true; resolve(null); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("blobs");
        db.createObjectStore("meta", { keyPath: "key" }).createIndex("used", "used");
      };
      request.onerror = () => { this.unavailable = true; resolve(null); };
      request.onblocked = () => { this.unavailable = true; resolve(null); };
      request.onsuccess = async () => {
        const db = request.result;
        if (generation !== this.generation || this.unavailable) { db.close(); resolve(null); return; }
        db.onversionchange = () => { this.close(); };
        await this.applyInvalidations(db);
        if (generation !== this.generation) { db.close(); resolve(null); } else resolve(db);
      };
    });
    return this.database;
  }
  async invalidate(paths: readonly string[], prefix: boolean): Promise<void> {
    if (this.clearPending) return;
    this.pendingInvalidations.push({ paths: [...paths], prefix });
    if (this.pendingInvalidations.length > 128) { this.pendingInvalidations = []; this.clearPending = true; }
    // Closed/off caches collect bounded invalidations without opening a database.
    const database = this.database;
    if (database) { const db = await database; if (db) await this.applyInvalidations(db); }
  }
  private async applyInvalidations(db: IDBDatabase): Promise<void> {
    if (!this.clearPending && !this.pendingInvalidations.length) return;
    const pending = this.pendingInvalidations, clear = this.clearPending;
    this.pendingInvalidations = []; this.clearPending = false;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(["blobs", "meta"], "readwrite"), blobs = tx.objectStore("blobs"), meta = tx.objectStore("meta");
        if (clear) { blobs.clear(); meta.clear(); }
        else {
          const cursor = meta.openKeyCursor();
          cursor.onsuccess = () => {
            const item = cursor.result;
            if (!item) return;
            let path = "";
            try { path = (JSON.parse(String(item.primaryKey)) as string[])[1]; } catch { /* discard malformed cache keys */ }
            if (!path || pending.some((invalidation) => invalidation.paths.some((root) => path === root || (invalidation.prefix && path.startsWith(`${root}/`))))) {
              blobs.delete(item.primaryKey); meta.delete(item.primaryKey);
            }
            item.continue();
          };
        }
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => { this.unavailable = true; db.close(); resolve(); };
      } catch { this.unavailable = true; resolve(); }
    });
  }
  async get(key: string): Promise<Blob | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(["blobs", "meta"], "readwrite");
        const get = tx.objectStore("blobs").get(key);
        let blob: Blob | null = null;
        get.onsuccess = () => {
          const value: unknown = get.result;
          if (value instanceof Blob && value.size > 0 && value.size <= this.maxBytes) {
            blob = value;
            tx.objectStore("meta").put({ key, size: value.size, used: Date.now() } satisfies CacheMeta);
          }
        };
        tx.oncomplete = () => resolve(blob);
        tx.onabort = tx.onerror = () => resolve(blob);
      } catch { resolve(null); }
    });
  }
  async touch(key: string): Promise<void> {
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction("meta", "readwrite"), meta = tx.objectStore("meta"), request = meta.get(key);
        request.onsuccess = () => { if (request.result) meta.put({ ...request.result, used: Date.now() }); };
        tx.oncomplete = tx.onabort = tx.onerror = () => resolve();
      } catch { resolve(); }
    });
  }
  async put(key: string, blob: Blob): Promise<void> {
    if (blob.size > this.maxBytes || blob.size === 0) return;
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(["blobs", "meta"], "readwrite");
        const meta = tx.objectStore("meta"), blobs = tx.objectStore("blobs");
        const entries: CacheMeta[] = [];
        const cursor = meta.index("used").openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (item) { if (item.primaryKey !== key) entries.push(item.value as CacheMeta); item.continue(); return; }
          let count = entries.length + 1, bytes = entries.reduce((sum, entry) => sum + entry.size, blob.size);
          for (const entry of entries) {
            if (count <= this.maxEntries && bytes <= this.maxBytes) break;
            meta.delete(entry.key); blobs.delete(entry.key); count--; bytes -= entry.size;
          }
          blobs.put(blob, key); meta.put({ key, size: blob.size, used: Date.now() } satisfies CacheMeta);
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => resolve();
      } catch { resolve(); }
    });
  }
  close(): void {
    this.generation++;
    const database = this.database;
    this.database = null;
    void database?.then((db) => db?.close());
  }
}
