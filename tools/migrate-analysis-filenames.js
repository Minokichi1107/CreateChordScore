// ============================================================
// migrate-analysis-filenames.js — Analysisファイル名の一度限りの移行（Phase139 / Issue #118）
//
// UUID名の既存Analysis（analysis/{projectId}.json）を、Libraryの曲名・アーティストに
// 合わせた名前（{artist}-{title}_{projectId}.json）へ改名する開発者向けスクリプト。
// アプリ本体は import しない（メニュー・UIなし）。実行しない限り何も起きない。
//
// 使い方（アプリを開いた状態で F12 → Console に1行ずつ入力）:
//   const m = await import('/tools/migrate-analysis-filenames.js')
//   await m.dryRun()   // ① 内訳を表示。ファイルは一切変更しない
//   await m.run()      // ② 確認ダイアログのあと実行
// 事前に backup_chordscore.bat の実行を推奨。2回目以降の実行は「変更なし」になるだけ（冪等）。
//
// [ANALYSIS FILE RESOLUTION] 名前の生成・特定・改名の判断はすべてserver側
// （/rename-analysis）が行う。このスクリプトは曲を列挙して順に呼ぶだけで、
// ファイル名の規則は持たない。
//   ・対象は Library（IndexedDB）の hasAnalysis===true の曲のみ。analysis/ は走査しない
//     （Projectに属さない孤児ファイル・hasAnalysis=false の曲は触らない）。
//   ・run() は dryRun() の結果を引き継がず、毎回server側で再判定される。
//   ・1件失敗しても次の曲へ進む。直列実行（1件ずつ）。
// ============================================================
import { listProjects } from '/js/project.js';
import { renameAnalysisFile } from '/js/analysisLoader.js';

const LABELS = {
  renamed:   '改名',
  unchanged: '変更なし',
  skipped:   'スキップ（曲名・アーティスト未入力など）',
  none:      'ファイルなし',
  conflict:  '競合（同じIDのファイルが複数）',
  error:     'エラー',
};

/** 対象曲を1件ずつ処理して集計する（execute=false ならdryRun） */
async function _process(execute) {
  const projects = (await listProjects()).filter(p => p.hasAnalysis === true);
  const counts = Object.fromEntries(Object.keys(LABELS).map(k => [k, 0]));
  const attention = []; // conflict / error の曲
  const renamedList = [];

  for (const p of projects) {
    let result;
    try {
      result = await renameAnalysisFile(
        p.id, { artist: p.artist, title: p.title }, { dryRun: !execute });
    } catch (e) {
      result = 'error';
    }
    if (!(result in counts)) result = 'error';
    counts[result]++;
    if (result === 'renamed') renamedList.push({ id: p.id, artist: p.artist, title: p.title });
    if (result === 'conflict' || result === 'error') {
      attention.push({ id: p.id, artist: p.artist, title: p.title, result });
    }
  }
  return { total: projects.length, counts, attention, renamedList };
}

function _print(label, r) {
  console.log(`${label}: 対象 ${r.total} 件`);
  console.table(Object.entries(r.counts).map(([k, n]) => ({ 結果: LABELS[k], 件数: n })));
  if (r.attention.length) {
    console.warn('要確認（競合・エラー）:');
    console.table(r.attention);
  }
}

/** ① 内訳を表示する。ファイルは一切変更しない。 */
export async function dryRun() {
  const r = await _process(false);
  _print('【dryRun】改名予定の内訳', r);
  console.log('改名予定の例（先頭10件）:');
  console.table(r.renamedList.slice(0, 10));
  return r.counts;
}

/** ② 実行する。内訳の確認ダイアログのあと、1件ずつ改名する。 */
export async function run() {
  const pre = await _process(false);
  if (pre.counts.renamed === 0) {
    console.log('改名予定の曲はありません（すべて変更なし／スキップ）。');
    return pre.counts;
  }
  const ok = confirm(
    `Analysisファイル名を整理します（対象 ${pre.total} 件）\n\n` +
    `改名予定: ${pre.counts.renamed} 件\n変更なし: ${pre.counts.unchanged} 件\n` +
    `スキップ: ${pre.counts.skipped} 件\nファイルなし: ${pre.counts.none} 件\n` +
    `競合: ${pre.counts.conflict} 件\nエラー: ${pre.counts.error} 件\n\n` +
    '先にバックアップ（backup_chordscore.bat）を実行しましたか？\n実行しますか？');
  if (!ok) {
    console.log('キャンセルしました。何も変更していません。');
    return null;
  }
  const r = await _process(true); // 実行時もserver側で毎回再判定される
  _print('【実行結果】', r);
  return r.counts;
}
