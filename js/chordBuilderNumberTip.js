/**
 * Phase148: Chord Builder の番号表TIP（Root・Type の番号と選択肢の対応を、必要なときだけ参照する浮動表示）。
 * DOMなしの純粋関数。番号表は chordBuilderCatalog.js の正規の対応表から作る（TIP用の独立した一覧は持たない）。
 * 表示・操作の実行は chartChordEditModal.js が行う。TIP は曲データ・builder・baseline・canDecide() に触れない。
 */
import { getBuilderNumberMap, formatBuilderNumber } from './chordBuilderCatalog.js';

/** TIPが扱う欄（Bass は対象外）。 */
export const TIP_FIELDS = ['root', 'type'];

/**
 * 番号表の行。number 昇順。
 * @param {'root'|'type'} field
 * @param {(field:string, value:string)=>string} labelOf 内部値 → 画面上のラベル
 * @returns {{number:string, value:string, label:string}[]}
 */
export function buildNumberTipRows(field, labelOf) {
  if (!TIP_FIELDS.includes(field)) return [];
  return [...getBuilderNumberMap(field).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, value]) => ({ number: formatBuilderNumber(number), value, label: labelOf(field, value) }));
}

// ── 状態（visible: 表示中／pinned: ホバーではなく ? キー・クリックで固定表示／section: 'root'|'type'|'both'） ──
export const TIP_CLOSED = Object.freeze({ visible: false, pinned: false, section: null });

/** 表示する欄の一覧（'both' は Root と Type の両方）。 */
export function tipSections(section) {
  return section === 'both' ? TIP_FIELDS.slice() : TIP_FIELDS.includes(section) ? [section] : [];
}

/**
 * 状態遷移。イベント: hover / leave-timeout / toggle-key / click-section / escape / destroy
 *  - hover: 固定表示中は変えない。
 *  - leave-timeout: 固定表示中は閉じない（ホバーだけの表示を閉じる）。
 *  - toggle-key（? キー）: 両方を固定表示。両方を固定表示中に再度押すと閉じる。
 *  - click-section: その欄を固定表示（タッチ環境用）。同じ欄が固定表示中なら閉じる。
 *  - escape / destroy: 閉じる。
 */
export function reduceTip(state, event) {
  switch (event.type) {
    case 'hover':
      return state.pinned ? state : { visible: true, pinned: false, section: event.section };
    case 'leave-timeout':
      return state.pinned ? state : TIP_CLOSED;
    case 'toggle-key':
      return state.visible && state.pinned && state.section === 'both'
        ? TIP_CLOSED : { visible: true, pinned: true, section: 'both' };
    case 'click-section':
      return state.visible && state.pinned && state.section === event.section
        ? TIP_CLOSED : { visible: true, pinned: true, section: event.section };
    case 'escape':
    case 'destroy':
      return TIP_CLOSED;
    default:
      return state;
  }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * TIP の表示位置（position: fixed 用）。モーダルを覆わない位置を優先する。
 *  1. モーダルの右側に収まるなら右  2. 左側に収まるなら左
 *  3. どちらも収まらない狭い画面では、画面内に収めて anchor の下（なければ上）に重ねる
 * @param {{anchor:object, modal:object, tip:{width:number,height:number}, viewport:{width:number,height:number}, margin?:number}} p
 *   anchor / modal は {left, top, right, bottom}
 * @returns {{left:number, top:number, placement:'right'|'left'|'overlay'}}
 */
export function computeTipPosition({ anchor, modal, tip, viewport, margin = 8 }) {
  const width = Math.min(tip.width, viewport.width - margin * 2);
  const height = Math.min(tip.height, viewport.height - margin * 2);
  const maxTop = viewport.height - height - margin;
  if (viewport.width - modal.right - margin * 2 >= width) {
    return { left: modal.right + margin, top: clamp(anchor.top - 4, margin, maxTop), placement: 'right' };
  }
  if (modal.left - margin * 2 >= width) {
    return { left: modal.left - margin - width, top: clamp(anchor.top - 4, margin, maxTop), placement: 'left' };
  }
  const left = clamp((viewport.width - width) / 2, margin, viewport.width - width - margin);
  const below = anchor.bottom + margin;
  const top = below + height <= viewport.height - margin ? below
    : anchor.top - margin - height >= margin ? anchor.top - margin - height : margin;
  return { left, top: clamp(top, margin, maxTop), placement: 'overlay' };
}
