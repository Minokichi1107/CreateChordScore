/**
 * ════════════════════════════════════════
 * tokens.js — Musical Token Stream Utilities
 * ════════════════════════════════════════
 *
 * 【責務】
 *   - musical token の分類（isXxxToken）
 *   - token → 表示文字列変換（tokenToText）
 *
 * 【使用箇所】
 *   editor / modals / perform / export など全モジュールが参照する
 *   domain-level token utility。
 *
 * 【token 種別】
 *   chord   : { chord: 'Am7' }  または { type:'chord', chord:'Am7' }
 *   barline : { type:'barline' }  小節線（canonical、Phase39-4以降）
 *   simile  : { type:'simile', bars:1|2 }  繰り返し省略記号
 *
 * 【barline token の表現形式】
 *   canonical : { type: 'barline' }          ← 新規生成はこれ
 *   legacy    : { type: 'sep' }              ← deprecated（isSepToken で吸収）
 *   legacy    : { chord: '/' }               ← deprecated（isSepToken で吸収）
 *   storage migration はまだ行わない。旧データは isSepToken() で透過的に扱う。
 *
 * 【設計方針】
 *   - 値の truthy 判定ではなくプロパティ存在判定を使う
 *   - barline の判定は必ず isSepToken() を経由する（直参照禁止）
 *   - 新 token 追加時は isXxxToken を追加し tokenToText を拡張する
 */

// ────────────────────────────────────────
// 分類ヘルパー
// ────────────────────────────────────────

/**
 * chord token かどうか
 * - 明示的な type:'chord'
 * - または chord プロパティを持ち type が未設定（legacy形式）
 */
export function isChordToken(token) {
  return token?.type === 'chord'
      || ('chord' in (token || {}) && !token?.type);
}

/**
 * barline（小節線）token かどうか
 *
 * canonical : type:'barline'（Phase39-4以降の新規生成）
 * legacy    : type:'sep'（deprecated・storage互換維持）
 * legacy    : chord:'/'（旧形式・storage互換維持）
 *
 * barline token の直参照は禁止。必ずこの関数を経由すること。
 */
export function isSepToken(token) {
  return token?.type === 'barline'
      || token?.type === 'sep'
      || token?.chord === '/';
}

/**
 * simile token かどうか
 */
export function isSimileToken(token) {
  return token?.type === 'simile';
}

// ────────────────────────────────────────
// 表示変換
// ────────────────────────────────────────

/**
 * token → 表示テキスト変換
 *
 * @param {object} token
 * @param {object} opts
 * @param {string} opts.simileStyle - 'text'（デフォルト）| 'ascii' | 'unicode' | 'svg'
 * @returns {string}
 */
export function tokenToText(token, opts = {}) {
  if (isSepToken(token))    return '/';
  if (isSimileToken(token)) return token.bars === 2 ? 'sim.2' : 'sim.';
  return token.chord ?? '?';
}
