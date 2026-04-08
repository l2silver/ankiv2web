import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { CardEntity } from "@/features/cards/cardsSlice";

const DB_NAME = "ankiv2";
const DB_VERSION = 1;

/** Card row in IndexedDB; `_dirty` means local changes not yet sent with `PATCH /sync`. */
export type StoredCard = CardEntity & {
  _dirty?: boolean;
};

interface Anki2DB extends DBSchema {
  cards: {
    key: string;
    value: StoredCard;
  };
  meta: {
    key: string;
    value: string;
  };
}

let dbPromise: Promise<IDBPDatabase<Anki2DB>> | null = null;

function getDb(): Promise<IDBPDatabase<Anki2DB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  if (!dbPromise) {
    dbPromise = openDB<Anki2DB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("cards")) {
          db.createObjectStore("cards", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    });
  }
  return dbPromise;
}

export async function idbGetAllCards(): Promise<StoredCard[]> {
  const db = await getDb();
  return db.getAll("cards");
}

export async function idbGetAllIds(): Promise<string[]> {
  const db = await getDb();
  return db.getAllKeys("cards");
}

export async function idbPutCard(card: StoredCard): Promise<void> {
  const db = await getDb();
  await db.put("cards", card);
}

export async function idbPutCards(cards: StoredCard[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("cards", "readwrite");
  await Promise.all([...cards.map((c) => tx.store.put(c)), tx.done]);
}

export async function idbClearDirtyMany(ids: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("cards", "readwrite");
  for (const id of ids) {
    const row = await tx.store.get(id);
    if (!row) continue;
    const rest: StoredCard = { ...row };
    delete rest._dirty;
    await tx.store.put(rest);
  }
  await tx.done;
}

export async function idbSetMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.put("meta", value, key);
}

export async function idbGetMeta(key: string): Promise<string | undefined> {
  const db = await getDb();
  return db.get("meta", key);
}

/** Close connections and remove the whole DB (cards + meta). Next open recreates empty stores. */
export async function idbDeleteEntireDatabase(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available");
  }
  const pending = dbPromise;
  dbPromise = null;
  if (pending) {
    try {
      const db = await pending;
      db.close();
    } catch {
      /* ignore — proceed with delete */
    }
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onerror = () => reject(req.error ?? new Error("deleteDatabase failed"));
    req.onsuccess = () => resolve();
    req.onblocked = () =>
      reject(new Error("IndexedDB delete blocked — close other tabs using this app, then try again"));
  });
}
