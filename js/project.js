// ════════════════════════════════════════
// PROJECT MANAGEMENT
// プロジェクトの保存・読み込み・自動保存
// ════════════════════════════════════════

// ────────────────────────────────────────
// プロジェクトシリアライズ
// ────────────────────────────────────────
export function serializeProject(project, uiState) {
  return {
    title: uiState.title,
    artist: uiState.artist,
    audio: project.audio,
    capo: uiState.capo,
    key: uiState.key,
    tempo: uiState.tempo,
    meter: uiState.meter,
    lines: project.lines,
    chord_source: project.chord_source,
  };
}

// ────────────────────────────────────────
// プロジェクトデシリアライズ
// ────────────────────────────────────────
export function deserializeProject(jsonData) {
  const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
  
  return {
    project: {
      audio: data.audio || '',
      chord_source: data.chord_source || '',
      lines: data.lines || [],
    },
    uiState: {
      title: data.title || '',
      artist: data.artist || '',
      capo: data.capo || 0,
      key: data.key || '',
      tempo: data.tempo || 0,
      meter: data.meter || '4/4',
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
  const title = projectData.title || 'chordscore';
  const suggestedName = title.replace(/[^\w\-ぁ-ん一-龯ァ-ヶ]/g, '_') + '_project.json';

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
