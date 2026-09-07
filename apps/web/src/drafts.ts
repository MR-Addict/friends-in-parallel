export interface Draft {
  personId: string;
  type: 'photo' | 'sticker';
  description: string;
  time: string;
  stickerId: string;
  file?: File;
}
const memory = new Map<string, Draft>();
let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('parallel-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
// Queue operations so closing/reopening or publishing cannot race an earlier save.
let pending: Promise<unknown> = Promise.resolve();
export function readDraft(key: string): Promise<Draft | undefined> {
  const result = pending.then(async () => {
    if (memory.has(key)) return memory.get(key);
    try {
      const db = await open();
      return await new Promise<Draft | undefined>((resolve, reject) => {
        const request = db.transaction('drafts').objectStore('drafts').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return memory.get(key);
    }
  });
  pending = result.catch(() => {});
  return result;
}
export function writeDraft(key: string, draft?: Draft): Promise<boolean> {
  if (draft) memory.set(key, draft);
  else memory.delete(key);
  const result = pending.then(async () => {
    try {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readwrite');
        const store = transaction.objectStore('drafts');
        if (draft) store.put(draft, key);
        else store.delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return true;
    } catch {
      return false;
    }
  });
  pending = result;
  return result;
}
