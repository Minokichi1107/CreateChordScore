// ════════════════════════════════════════
// PROJECT MANAGEMENT
// プロジェクトの保存・読み込み・自動保存
// ════════════════════════════════════════
// ════════════════════════════════════════
// PROJECT SCHEMA — Phase46
// ════════════════════════════════════════

/**
 * normalizeProject
 *
 * 全ロードパスで通す runtime invariant builder。
 *
 * 【設計方針】
 *   - ...raw を先頭に置き、未知フィールドを消さない（migration耐性）
 *   - 既知フィールドは typeof で明示補正し、後から上書きする
 *   - hasAnalysis === true の strict check は意図的
 *     （"true" / 1 等の壊れた値を false として扱う normalize設計）
 *   - 将来フィールド追加時はここに1行追加する
 *     （...raw があるので追加前でも silently 消えない）
 *
 * @param {object} raw - 生のプロジェクトデータ（undefined可）
 * @returns {object} invariant保証済みプロジェクト
 */

import { initDB } from './idb.js';

export function normalizeProject(raw = {}) {
  return {
    ...raw,

    id:
      typeof raw.id === 'string' && raw.id
        ? raw.id
        : crypto.randomUUID(),

    artist:
      typeof raw.artist === 'string'
        ? raw.artist
        : '',

    title:
      typeof raw.title === 'string'
        ? raw.title
        : '',

    audio:
      typeof raw.audio === 'string'
        ? raw.audio
        : '',

    capo:
      typeof raw.capo === 'number'
        ? raw.capo
        : 0,

    chord_source:
      typeof raw.chord_source === 'string'
        ? raw.chord_source
        : '',

    lines:
      Array.isArray(raw.lines)
        ? raw.lines
        : [],

    hasAnalysis:
      raw.hasAnalysis === true,
  };
}

/**
 * createEmptyProject
 *
 * 空プロジェクトを生成する唯一の経路。
 * resetProject / new project で使う。
 * 裸の `project = {...}` 生成を排除する。
 */
export function createEmptyProject() {
  return normalizeProject({});
}

/**
 * buildProjectFilename
 *
 * ファイル名生成を一元管理する。
 * dangling separator を生成しない。
 *
 * 生成ルール:
 *   artist + title → `${artist}-${title}_project.json`
 *   title のみ    → `${title}_project.json`
 *   artist のみ   → `${artist}_project.json`
 *   両方なし      → `project.json`
 */
export function buildProjectFilename(project) {
  const artist = (project.artist || '').trim();
  const title  = (project.title  || '').trim();

  if (artist && title) return `${artist}-${title}_project.json`;
  if (title)           return `${title}_project.json`;
  if (artist)          return `${artist}_project.json`;
  return 'project.json';
}
// ────────────────────────────────────────
// プロジェクトシリアライズ
// ────────────────────────────────────────
export function serializeProject(project, uiState) {
  return {
    id:           project.id,
    artist:       project.artist,
    title:        project.title,
    audio:        project.audio,
    capo:         uiState.capo,
    key:          uiState.key,
    tempo:        uiState.tempo,
    lines:        project.lines,
    chord_source: project.chord_source,
    // [RAW-READONLY] raw のみ保存。derived は保存禁止（Phase40設計）
    hasAnalysis:  project.hasAnalysis === true,
  };
}

// ────────────────────────────────────────
// プロジェクトデシリアライズ
// ────────────────────────────────────────
export function deserializeProject(jsonData) {
  const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

  const project = normalizeProject({
    ...data,

    // [migration] 旧形式の埋め込み analysis を loadProj() に引き渡す
    // 新形式（hasAnalysis:true）では参照しない
    _legacyAnalysis:
      data.analysis?.raw
        ? data.analysis
        : null,
  });

  return {
    project,
    uiState: {
      capo:  typeof data.capo  === 'number' ? data.capo  : 0,
      key:   typeof data.key   === 'string' ? data.key   : '',
      tempo: typeof data.tempo === 'number' ? data.tempo : 0,
    }
  };
}

// ────────────────────────────────────────
// ファイルハンドル書き込み（private）
// ────────────────────────────────────────
async function writeToHandle(handle, data) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

// ────────────────────────────────────────
// Blob生成
// ────────────────────────────────────────
export function createProjectBlob(projectData) {
  return new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
}

// ────────────────────────────────────────
// Phase60.5: File picker 用途別 ID 定数
// ────────────────────────────────────────
// 用途ごとに id を分けることで Chrome が
// 「その用途で最後に使ったフォルダ」を別々に記憶する。
// scatter 防止のため必ずこの定数を参照すること。
export const PICKER_IDS = {
  audio:       'ccs-audio',        // 音声ファイル
  chord:       'ccs-chord',        // コードファイル
  projectOpen: 'ccs-project-open', // プロジェクト読み込み
  projectSave: 'ccs-project-save', // プロジェクト保存
};

// ────────────────────────────────────────
// プロジェクト保存
// ────────────────────────────────────────
export async function saveProjectToFile(projectData, fileHandle, forceNew = false) {
  // TODO: sanitizeFilename() に切り出す（autosave/export/library で規則分裂防止）
  const suggestedName = buildProjectFilename(projectData)
    .replace(/[^\w\-ぁ-ん一-龯ァ-ヶ\.]/g, '_');

  // File System Access API対応ブラウザ
  if (window.showSaveFilePicker) {
    try {
      let handle = fileHandle;
      
      if (!handle || forceNew) {
        handle = await window.showSaveFilePicker({
          id: PICKER_IDS.projectSave,   // Phase60.5: 保存フォルダを別履歴で記憶
          suggestedName,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
      }
      
      await writeToHandle(handle, projectData);
      
      return {
        success: true,
        fileHandle: handle,
        fileName: handle.name,
        blob: null,
        error: null,
      };
    } catch (e) {
      return {
        success: false,
        fileHandle: fileHandle,
        fileName: null,
        blob: null,
        error: e,
      };
    }
  } else {
    // フォールバック：Blobを返すのみ（DOM操作はapp.js側で実行）
    const blob = createProjectBlob(projectData);
    
    return {
      success: true,
      fileHandle: null,
      fileName: suggestedName,
      blob: blob,
      error: null,
    };
  }
}

// ────────────────────────────────────────
// localStorage自動保存
// ────────────────────────────────────────
export function saveToLocalStorage(projectData) {
  try {
    localStorage.setItem('cs_auto', JSON.stringify(projectData));
    const now = new Date();
    const timestamp = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    return {
      success: true,
      timestamp,
    };
  } catch (e) {
    return {
      success: false,
      timestamp: null,
    };
  }
}

// ────────────────────────────────────────
// localStorage自動復元
// ────────────────────────────────────────
export function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem('cs_auto');
    if (!saved) return null;
    
    const data = JSON.parse(saved);
    return data;
  } catch (e) {
    return null;
  }
}

// ────────────────────────────────────────
// localStorage自動保存削除
// ────────────────────────────────────────
export function clearLocalStorage() {
  localStorage.removeItem('cs_auto');
}

// ════════════════════════════════════════
// Phase73-B: Project DB Repository
// ════════════════════════════════════════
//
// 【設計原則】
//   [PROJECT CORE AUTHORITY]
//   IndexedDB "projects" store が project core data の canonical source。
//   audio / analysis / customDiagrams は既存 authority のまま（変更なし）。
//
//   [DB META SEPARATION]
//   createdAt / updatedAt / schemaVersion は Repository 層のみで管理する。
//   serializeProject() には混入しない（FSA Export との差分汚染防止）。
//
//   [INTERNAL / PUBLIC 分離]
//   _getRawRecord(id): 内部専用。生レコード（DBメタ含む）をそのまま返す。
//   getProject(id):    公開API。DBメタを除いた serializeProject() 互換データを返す。
//   saveProjectToDB(): 公開API。createdAt 継承のため _getRawRecord() を内部使用。
// ════════════════════════════════════════

const _STORE_PROJECTS = 'projects';
const _SCHEMA_VERSION = 1;

// ────────────────────────────────────────
// _getRawRecord（内部専用）
//
// IndexedDB から生レコード（DBメタ情報含む）をそのまま返す。
// saveProjectToDB() が createdAt を継承するために使う。
// 公開 getProject() とは分離すること（Phase73-A ChatGPT指摘）。
// 理由: 将来 getProject() の戻り値形式が変わっても
//       saveProjectToDB() 内の createdAt 継承ロジックが壊れないため。
// ────────────────────────────────────────
async function _getRawRecord(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(_STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(_STORE_PROJECTS);
    const req   = store.get(id);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}

// ────────────────────────────────────────
// saveProjectToDB
//
// serializeProject() の出力をそのまま受け取り、
// DBメタ情報（schemaVersion / createdAt / updatedAt）を付加して保存する。
//
// [createdAt 継承ルール]
//   既存レコードあり → createdAt を継承（初回保存日時を保持）
//   既存レコードなし → 現在時刻（初回保存）
//
// @param {object} project  - app.js の project オブジェクト
// @param {object} uiState  - { capo, key, tempo }
// @returns {boolean} 成功: true / 失敗: false
// ────────────────────────────────────────
export async function saveProjectToDB(project, uiState) {
  try {
    const base     = serializeProject(project, uiState);
    const now      = Date.now();
    const existing = await _getRawRecord(base.id);

    const record = {
      ...base,
      schemaVersion: _SCHEMA_VERSION,
      createdAt:     existing?.createdAt ?? now,
      updatedAt:     now,
    };

    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(_STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(_STORE_PROJECTS);
      const req   = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror   = e => reject(e.target.error);
    });
  } catch (e) {
    console.error('[saveProjectToDB] failed:', e);
    return false;
  }
}

// ────────────────────────────────────────
// getProject
//
// project.id で1件取得する。
// 戻り値は serializeProject() 互換データ（DBメタを除いたもの）。
// loadProj() では deserializeProject(await getProject(id)) として使う。
//
// @param {string} id
// @returns {object|null} serializeProject() 互換データ、または null
// ────────────────────────────────────────
export async function getProject(id) {
  const raw = await _getRawRecord(id);
  if (!raw) return null;

  // DBメタ（schemaVersion / createdAt / updatedAt）を除いて返す
  const { schemaVersion: _sv, createdAt: _ca, updatedAt: _ua, ...projectData } = raw;
  return projectData;
}

// ────────────────────────────────────────
// listProjects
//
// 全プロジェクトを updatedAt 降順で返す。
// 将来のライブラリ一覧UI（Phase73-C）で使用する。
// 各要素は生レコード（DBメタ含む）。
//
// @returns {object[]}
// ────────────────────────────────────────
export async function listProjects() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx      = db.transaction(_STORE_PROJECTS, 'readonly');
    const store   = tx.objectStore(_STORE_PROJECTS);
    const index   = store.index('by-updatedAt');
    const results = [];

    // direction: 'prev' で降順（最新が先頭）
    const req = index.openCursor(null, 'prev');
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = e => reject(e.target.error);
  });
}

// ────────────────────────────────────────
// deleteProject
//
// project.id で1件削除する。
// audio / chord（assets store）の削除は deleteAssets() で別途行うこと。
//
// @param {string} id
// @returns {boolean} 成功: true / 失敗: false
// ────────────────────────────────────────
export async function deleteProject(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(_STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(_STORE_PROJECTS);
    const req   = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror   = e => reject(e.target.error);
  });
}