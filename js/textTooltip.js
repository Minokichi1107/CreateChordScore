/**
 * ════════════════════════════════════════
 * textTooltip.js — Ephemeral Text Tooltip Subsystem
 * ════════════════════════════════════════
 *
 * 【責務】
 *   1行の短いテキストを、指定されたanchor要素の近くに一時表示する。
 *   それ以上でもそれ以下でもない（[Phase127-D' ChatGPT Review Required change #1]）。
 *
 * 【責務外（意図的に持たない）】
 *   - 表示する文字列の「意味」（例: Provenance・コード名等のドメイン知識）
 *     → 呼び出し側（app.js）が文字列を組み立てて渡す
 *   - 複数行 / HTML / 画像 / SVG 等のリッチコンテンツ
 *     → 将来必要になった時点で別途設計判断とする（Phase67 chart-diag-tooltipとは別物）
 *   - DOM要素へのイベント登録（pointerover/out等）
 *     → 呼び出し側が自身のDOM構造に応じてshow()/hide()を呼ぶ
 *
 * 【設計原則】
 *   Ephemeral UI（Phase67 chart-diag-tooltipと同じ思想）:
 *     状態を保持しない。表示要求を受けて一時的にDOMへ表示し、hideで消す。
 *     どのAuthorityにも紐付かない（[EPHEMERAL UI]系の既存原則を踏襲）。
 *
 *   単一インスタンス（body直下）:
 *     init()時に1個だけDOM生成。以降は使い回す。
 *
 * 【使用箇所】
 *   app.js（Library一覧）・chartmode.js（Chart Modeヘッダー・依存注入経由）
 *   [Phase127-D' ChatGPT Review Required change #2] Provenanceを知らない
 *   汎用モジュールとして、両モジュールから同じAPIで呼ばれる。
 *
 * ════════════════════════════════════════
 */

let _el = null;

/**
 * init — tooltip DOM を body 直下に生成する。
 * アプリ起動時に1回だけ呼ぶ（Chart Modeのopen/closeとは無関係・常時存在）。
 */
export function init() {
  if (_el) return; // 既に存在する場合はスキップ（idempotent）
  const el = document.createElement('div');
  el.className = 'text-tooltip';
  el.style.display = 'none';
  document.body.appendChild(el);
  _el = el;
}

/**
 * show — tooltip を表示する。
 * @param {string} text        表示するテキスト（1行想定・呼び出し側が意味を決める）
 * @param {DOMRect} anchorRect  anchor要素の getBoundingClientRect()
 *
 * 画面端でのoverflow時は自動的に位置を補正する（clamp）。
 * ロジックはPhase67 chart-diag-tooltipの_showTooltip()と同じ考え方を踏襲するが、
 * コードは独立（textTooltip.jsはchartmode.jsのプライベート実装を参照しない）。
 */
export function show(text, anchorRect) {
  if (!_el || !text || !anchorRect) return;

  const safeText = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  _el.textContent = ''; // reset
  _el.innerHTML = safeText; // safeText は上記でescape済み（HTMLタグを含めない前提）

  // 先に visible にして実サイズを取得（overflow 判定のため）
  _el.style.visibility = 'hidden';
  _el.style.display    = 'block';

  const tipRect = _el.getBoundingClientRect();
  const MARGIN  = 8;

  // 基本位置: anchor の中央下
  let left = anchorRect.left + (anchorRect.width / 2) - (tipRect.width / 2);
  let top  = anchorRect.bottom + MARGIN;

  // 右 overflow → 左方向にずらす
  if (left + tipRect.width > window.innerWidth) {
    left = window.innerWidth - tipRect.width - MARGIN;
  }
  // 左 overflow guard
  if (left < MARGIN) left = MARGIN;
  // 下 overflow → anchor の上側へ
  if (top + tipRect.height > window.innerHeight) {
    top = anchorRect.top - tipRect.height - MARGIN;
  }
  // 上 overflow guard
  if (top < MARGIN) top = MARGIN;

  _el.style.left       = left + 'px';
  _el.style.top        = top  + 'px';
  _el.style.visibility = 'visible';
}

/**
 * hide — tooltip を非表示にする。
 */
export function hide() {
  if (_el) {
    _el.style.display    = 'none';
    _el.style.visibility = 'visible'; // 次回表示用にリセット
  }
}

/**
 * destroy — tooltip DOM を body から削除する。
 * 現状呼び出し元なし（このtooltipはアプリ常時存在のため）。
 * 将来的な後始末用に、Phase67 _destroyTooltip()と対称の形でexportしておく。
 */
export function destroy() {
  if (_el) {
    _el.remove();
    _el = null;
  }
}
