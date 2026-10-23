/**
 * Phase148: Chord Builder の数字コマンド入力・Space循環・Enter決定・ショートカット抑止の判定（DOMなしの純粋関数）。
 * 仕様: digit-command-input-spec v3（§2 番号／§3 Space／§4 抑止／§5 Enter）。
 * ここは「どう扱うか」を決めるだけで、DOM・曲データには触れない。実行は chartChordEditModal.js が行う。
 */
import { getBuilderNumberMap, formatBuilderNumber } from './chordBuilderCatalog.js';

const BUILDER_FIELDS = ['root', 'type', 'bass'];
// Space で次の欄へ移る順（Root→Type→Bass→Root）
const NEXT_FIELD = { root: 'type', type: 'bass', bass: 'root' };

export function nextBuilderField(field) {
  return NEXT_FIELD[field] || null;
}

/**
 * 数字を1桁受け取って入力バッファを進める。
 * @param {string} pending 入力中の桁（'' または 1桁）
 * @param {'root'|'type'|'bass'} field
 * @param {string} digit '0'〜'9'
 * @returns {{pending:string, commit:null|{value:string}, rejected:boolean}}
 *   - 1桁目: 有効な2桁番号の先頭になり得れば pending に保持（確定しない）。なり得なければ拒否。
 *   - 2桁目: 有効な番号なら commit（pending は空）。無効なら拒否（pending は空）。
 *   - 拒否時は pending を空にして返す（呼び出し側は選択値・プレビューを変えない）。
 *   有効な番号は getBuilderNumberMap から計算する（桁の範囲をハードコードしない）。
 */
export function reduceDigit(pending, field, digit) {
  const map = getBuilderNumberMap(field);
  const rejected = { pending: '', commit: null, rejected: true };
  if (!/^[0-9]$/.test(digit) || !map.size) return rejected;
  if (!pending) {
    const startsOk = [...map.keys()].some(n => formatBuilderNumber(n)[0] === digit);
    return startsOk ? { pending: digit, commit: null, rejected: false } : rejected;
  }
  const number = Number(pending + digit);
  if (!map.has(number)) return rejected;
  return { pending: '', commit: { value: map.get(number) }, rejected: false };
}

const CTRL_STOP_KEYS = new Set(['z', 'y', 'x', 'v']);
const NONE = Object.freeze({ op: null, prevent: false, stop: false });
const out = (op, prevent, stop) => ({ op, prevent, stop });

/**
 * モーダル表示中の keydown の扱いを決める。
 * @param {object} p
 * @param {string} p.key  @param {string} [p.code]
 * @param {boolean} [p.ctrlKey] [p.altKey] [p.metaKey] [p.shiftKey] [p.isComposing] [p.repeat]
 * @param {'root'|'type'|'bass'|'button'|'text'|'other'} p.targetKind 発生元
 *   text=INPUT/TEXTAREA、button=モーダル内のボタン、other=その他（body・モーダル外・その他の要素）
 * @param {boolean} p.gateOpen  モーダルが開いている（open クラス かつ 本文要素がある）
 * @param {boolean} [p.tipOpen] 番号表TIPが表示中
 * @returns {{op:null|'digit'|'focus-next'|'enter'|'tip-toggle'|'tip-close', prevent:boolean, stop:boolean}}
 *   prevent＝ブラウザ標準動作を止める／stop＝グローバルのリスナーへ伝えない
 */
export function decideModalKey(p) {
  if (!p || !p.gateOpen) return NONE;
  if (p.isComposing || p.key === 'Process') return NONE;      // IME変換中は処理しない
  const kind = p.targetKind;
  // 番号表TIP: 表示中の Escape はTIPだけを閉じる（モーダルは閉じない。入力欄でも先に閉じる）
  if (p.key === 'Escape' && p.tipOpen && !p.ctrlKey && !p.altKey && !p.metaKey) return out('tip-close', true, true);
  if (kind === 'text') return NONE;                           // 直接入力欄は通常入力を妨げない
  const isField = BUILDER_FIELDS.includes(kind);
  const mod = !!(p.ctrlKey || p.altKey || p.metaKey);
  const key = p.key;

  // Space: モーダル表示中は再生・停止を動かさない
  if (key === ' ' || p.code === 'Space') {
    if (kind === 'button') return out(null, false, true);     // ボタンの標準作動は残す
    if (isField && !mod && !p.shiftKey && !p.repeat) return out('focus-next', true, true);
    return out(null, true, true);   // select の修飾付き/Shift+Space/リピート、その他: 何もしない（スクロール等も止める）
  }
  // ? キー: 番号表TIPの表示・非表示（修飾キーなし。Shift は ? の入力に必要なので許可）。リピートは無視
  if (key === '?' && !mod) return p.repeat ? out(null, true, true) : out('tip-toggle', true, true);
  // 数字（3つの select 上。修飾キー・Shift 付きは対象外）
  if (/^[0-9]$/.test(key)) {
    if (isField && !mod && !p.shiftKey) return out('digit', true, false);
    return NONE;
  }
  // Enter（3つの select 上。ネイティブのポップアップを開かせず、決定操作に使う）
  if (key === 'Enter') {
    if (isField && !mod && !p.shiftKey) return out('enter', true, false);
    return NONE;
  }
  // 背後の編集へ作用してしまうキーはグローバルへ伝えない（標準動作は残す）
  if (key === 'Delete' || key === 'Backspace' || key === 'ArrowLeft' || key === 'ArrowRight') return out(null, false, true);
  if ((p.ctrlKey || p.metaKey) && CTRL_STOP_KEYS.has(String(key).toLowerCase())) return out(null, false, true);
  return NONE;
}
