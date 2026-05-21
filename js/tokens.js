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
 *   chord  : { chord: 'Am7' }  または { type:'chord', chord:'Am7' }
 *   sep    : { type:'sep' }    小節線（bar line）
 *   simile : { type:'simile', bars:1|2 }  繰り返し省略記号
 *
 * 【設計方針】
 *   - 値の truthy 判定ではなくプロパティ存在判定を使う
 *   - 旧形式互換（c.chord === '/'）は isSepToken で吸収し段階的に排除
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
 * sep（小節線）token かどうか
 * - type:'sep'
 * - または chord:'/' の旧形式（互換維持・徐々に排除）
 */
export function isSepToken(token) {
  return token?.type === 'sep'
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
