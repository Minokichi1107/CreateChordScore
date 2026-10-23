/**
 * Phase148: モーダルをタイトル領域のドラッグで動かす（背後のチャートを確認するための一時的な移動）。
 *
 * - 位置は #modal-box の CSS transform（translate）だけで動かす。中央配置（flex）・レイアウトは変えない。
 * - 位置は保存しない。モーダルを開き直すと中央へ戻る。曲データ・設定・Undo 履歴には触れない。
 * - 移動量は「ドラッグ開始時のポインタ位置」との差分。開始時に位置が飛ばない。
 * - 枠は常に画面内へ収める（clampTranslate）。ウィンドウサイズ変更時も再調整する。
 * - Pointer Events（マウス・タッチ・ペン共通）。ポインタキャプチャでタイトルの外へ出ても追従し、離したら終了する。
 * - ボタン・入力欄などの上から始まった操作はドラッグにしない（× ボタンのクリックが妨げられない）。
 */

/**
 * 移動量を画面内に収める（純粋関数）。
 * @param {{x:number,y:number}} t 希望する移動量（translate）
 * @param {{left:number,top:number}} base 移動量 0 のときの枠の左上
 * @param {{width:number,height:number}} size 枠の大きさ
 * @param {{width:number,height:number}} viewport 表示領域
 * @returns {{x:number,y:number}}
 */
export function clampTranslate({ t, base, size, viewport }) {
  const one = (value, basePos, length, limit) => {
    const a = -basePos;                    // 左（上）端が画面の端に来る位置
    const b = limit - length - basePos;    // 右（下）端が画面の端に来る位置
    return Math.min(Math.max(value, Math.min(a, b)), Math.max(a, b));
  };
  return { x: one(t.x, base.left, size.width, viewport.width), y: one(t.y, base.top, size.height, viewport.height) };
}

const INTERACTIVE = 'button, input, select, textarea, a, [contenteditable]';
let activeDrag = null;

/**
 * @param {object} o
 * @param {HTMLElement} o.handle ドラッグの取っ手（タイトル要素）
 * @param {HTMLElement} o.box 動かす枠（#modal-box）
 * @param {() => boolean} [o.enabled] false のとき操作を無視する（モーダルが閉じているとき）
 * @param {() => void} [o.onStart] ドラッグ開始時に呼ぶ（番号表TIPを閉じるなど）
 * @returns {{destroy: () => void, reset: () => void, translate: () => {x:number,y:number}}}
 */
export function attachModalDrag({ handle, box, enabled = () => true, onStart = () => {}, win = globalThis.window }) {
  if (activeDrag) activeDrag.destroy();   // 共有の枠に古い取っ手の処理を残さない
  let t = { x: 0, y: 0 };
  let drag = null;

  const apply = () => { box.style.transform = (t.x || t.y) ? 'translate(' + t.x + 'px, ' + t.y + 'px)' : ''; };
  const viewport = () => ({ width: win.innerWidth, height: win.innerHeight });
  const geometry = () => {
    const rect = box.getBoundingClientRect();
    return { base: { left: rect.left - t.x, top: rect.top - t.y }, size: { width: rect.right - rect.left, height: rect.bottom - rect.top } };
  };
  const classes = box.classList;

  const end = () => {
    if (!drag) return;
    const { pointerId } = drag;
    drag = null;
    if (classes) classes.remove('is-dragging');
    try { if (typeof handle.releasePointerCapture === 'function') handle.releasePointerCapture(pointerId); } catch { /* 既に解放済み */ }
  };

  const onDown = event => {
    if (!enabled() || drag) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;   // 主ボタンのみ
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest(INTERACTIVE)) return;
    const geo = geometry();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startT: { ...t }, ...geo };
    try { if (typeof handle.setPointerCapture === 'function') handle.setPointerCapture(event.pointerId); } catch { /* キャプチャ不可でも続行 */ }
    if (classes) classes.add('is-dragging');
    onStart();
    event.preventDefault();   // タイトル文字の選択・フォーカス移動を起こさない（入力中の欄を保つ）
  };
  const onMove = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    t = clampTranslate({
      t: { x: drag.startT.x + event.clientX - drag.startX, y: drag.startT.y + event.clientY - drag.startY },
      base: drag.base, size: drag.size, viewport: viewport(),
    });
    apply();
  };
  const onUp = event => { if (drag && event.pointerId === drag.pointerId) end(); };
  const onResize = () => {
    if (!t.x && !t.y) return;
    const { base, size } = geometry();
    t = clampTranslate({ t, base, size, viewport: viewport() });
    apply();
  };

  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
  handle.addEventListener('lostpointercapture', onUp);
  if (win && win.addEventListener) win.addEventListener('resize', onResize);
  apply();   // 開くたびに中央から始める

  const api = {
    translate: () => ({ ...t }),
    reset: () => { end(); t = { x: 0, y: 0 }; apply(); },
    destroy() {
      end();
      handle.removeEventListener('pointerdown', onDown);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      handle.removeEventListener('lostpointercapture', onUp);
      if (win && win.removeEventListener) win.removeEventListener('resize', onResize);
      t = { x: 0, y: 0 };
      apply();
      if (activeDrag === api) activeDrag = null;
    },
  };
  activeDrag = api;
  return api;
}
