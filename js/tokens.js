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
 * ════════════════════════════════════════
 * TOKEN SEMANTIC 定義表
 * ════════════════════════════════════════
 *
 * token種別        内部表現                           isXxx関数          tokenToText
 * ──────────────────────────────────────────────────────────────────────────────
 * chord           { chord: 'Am7' }                   isChordToken       → 'Am7'
 * barline         { type: 'barline' }                isSepToken         → '/'
 * barline legacy  { type: 'sep' }                    isSepToken         → '/'  （互換）
 * barline legacy  { chord: '/' }                     isSepToken         → '/'  （互換）
 * simile          { type: 'simile', bars: 1|2 }      isSimileToken      → 'sim.' / 'sim.2'（将来実装）
 * no_chord        { type: 'no_chord' }               isNoChordToken     → 'N.C.'
 *
 * ════════════════════════════════════════
 * TOKEN SEMANTIC ごとの責務分離
 * ════════════════════════════════════════
 *
 * 用途               使用する値              理由
 * ──────────────────────────────────────────────────────────────────────────────
 * display（DOM表示）   tokenToText(c)          no_chord / simile も安全に変換できる
 * lookup（DB検索）     c.chord（raw）           CHORD_DB のキーは raw 文字列
 * transpose（移調）    isChordToken(c) 判定後   no_chord / barline を誤って移調しない
 * serialize（保存）    token object そのまま    変換しない。復元時の互換性を保つ
 *
 * 禁止: tokenToText() を lookup key / compare / storage に使うこと
 * 禁止: tokenToText() の出力から token semantic を逆引きすること（非可逆）
 *
 * ════════════════════════════════════════
 * DISPLAY PROJECTION は非可逆
 * ════════════════════════════════════════
 *
 * tokenToText() は「表示用の投影（projection）」であり、
 * 元の token semantic を復元できない一方向変換である。
 *
 *   { type: 'simile', bars: 2 }  →  '𝄋' または 'sim.2'（将来実装例）
 *   逆方向（表示文字列 → token）は tokenToText() では不可能
 *
 * display projection ≠ persisted semantic
 *
 * この原則により:
 *   - serialize は必ず token object をそのまま保存する
 *   - import / migration は raw 文字列から token を生成する（逆引き禁止）
 *   - 表示文字列を DB lookup key や比較に使ってはならない
 *
 * 将来 simile / Nashville / Roman numeral / slash bass 等が追加されても
 * この原則は変わらない。
 *
 * ════════════════════════════════════════
 * token 種別
 * ════════════════════════════════════════
 *
 * 【token 種別】
 *   chord    : { chord: 'Am7' }  または { type:'chord', chord:'Am7' }
 *   barline  : { type:'barline' }  小節線（canonical、Phase39-4以降）
 *   simile   : { type:'simile', bars:1|2 }  繰り返し省略記号
 *   no_chord : { type:'no_chord' }  音なし（N.C.）（Phase44-Step2以降）
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

/**
 * no_chord token かどうか（N.C. / 音なし）
 *
 * canonical : { type: 'no_chord' }（Phase44-Step2以降の新規生成）
 *
 * 入力時に N / NC / N.C. 等の文字列を即変換して生成する。
 * 内部では文字列 'N.C.' を直接持たない。tokenToText() が表示文字列を返す。
 */
export function isNoChordToken(token) {
  return token?.type === 'no_chord';
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
  if (isSepToken(token))     return '/';
  if (isSimileToken(token))  return token.bars === 2 ? 'sim.2' : 'sim.';
  if (isNoChordToken(token)) return 'N.C.';
  return token.chord ?? '?';
}
