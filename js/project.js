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
