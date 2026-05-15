// ════════════════════════════════════════
// idb.js - IndexedDB Asset Storage
// ════════════════════════════════════════
//
// 【責務】
// - audio / chord_source の Blob・テキストを IndexedDB に保存・取得・削除
//
// 【DB設計】
// DB名: ChordScoreDB / version: 1
// store名: assets
// key形式: `${projectId}:audio` / `${projectId}:chord`
// value: { blob, filename, updatedAt }
//
// 【エクスポート】
// - initDB()
// - saveAsset(projectId, type, blob, filename)
// - loadAsset(projectId, type)
// - deleteAssets(projectId)
// ════════════════════════════════════════

const DB_NAME = 'ChordScoreDB';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

let _db = null;

// ────────────────────────────────────────
// DB初期化
// ────────────────────────────────────────
export function initDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = e => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = e => {
      reject(e.target.error);
    };
  });
}

// ────────────────────────────────────────
// asset保存
// type: 'audio' | 'chord'
// asset: { data: Blob|string, filename: string }
// ────────────────────────────────────────
export async function saveAsset(projectId, type, asset) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const key = `${projectId}:${type}`;
    const value = { data: asset.data, filename: asset.filename, updatedAt: Date.now() };
    const req = store.put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = e => reject(e.target.error);
  });
}

// ────────────────────────────────────────
// asset取得
// ────────────────────────────────────────
export async function loadAsset(projectId, type) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const key = `${projectId}:${type}`;
    const req = store.get(key);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror = e => reject(e.target.error);
  });
}

// ────────────────────────────────────────
// asset削除（projectId に紐づく全asset）
// ────────────────────────────────────────
export async function deleteAssets(projectId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const keys = [`${projectId}:audio`, `${projectId}:chord`];
    let count = 0;
    keys.forEach(key => {
      const req = store.delete(key);
      req.onsuccess = () => { count++; if (count === keys.length) resolve(true); };
      req.onerror = e => reject(e.target.error);
    });
  });
}
