/**
 * ════════════════════════════════════════
 * chartmode.js — Chart Mode UI / GridViewModel
 * ════════════════════════════════════════
 *
 * 【責務】
 *   - buildGridViewModel: analysis → GridViewModel（onset-only canonical）
 *   - expandCarryForward: render時のみの表示継続補完（保存禁止）
 *   - resolveCollision:   同一スロット複数 onset の解決（render時）
 *   - Chart Mode UI の開閉・描画
 *
 * 【GridViewModel 設計原則】
 *   - onset-only: chord が始まるスロットのみ記録する
 *   - carry-forward は render 時のみ（GridViewModel への保存禁止）
 *   - onsets は常に配列（将来の collision 対応のため単一値化しない）
 *   - インデックスはすべて 0-based（UI表示時のみ +1）
 *
 * 【collision 解決優先順位（render時）】
 *   1. confidence が高い方
 *   2. duration が長い方（短時間ノイズ排除）
 *   3. time が遅い方（後勝ち）
 *
 * 【依存】
 *   - timing.js（createTimingModel）
 *   - app.js から initChartMode() で依存を注入する
 *
 * 【Chart Mode が触らないもの】
 *   project.lines / editor.js / perform.js / tapmode.js
 *
 * 【display projection について】
 *   capo 移調（表示用コード変換）は現在 editor.js / perform.js / chartmode.js
 *   それぞれで個別に行っている。
 *   analysis.raw / project.lines は常に canonical（移調なし）のまま保持すること。
 *   NOTE: chord display projection (capo transpose) is currently performed
 *   per-renderer. Future phases may centralize this into a shared display layer
 *   when N.C. / simile / slash bass / Roman numeral 等が加わる段階で統合を検討する。
 */

import { createTimingModel } from './timing.js';



// ────────────────────────────────────────
// GridViewModel 構築
// ────────────────────────────────────────

/**
 * buildGridViewModel
 *
 * project.analysis から GridViewModel（onset-only canonical）を生成する。
 *
 * 【onset-only 規約】
 *   全スロットに chord を埋めない。
 *   onset のあるスロットのみ記録する。
 *   carry-forward（継続補完）は render 時のみ行う。
 *
 * @param {object} analysis  - project.analysis（loadAnalysis 済み）
 * @param {number} [audioDuration]
 * @returns {{ model: TimingModel, measures: object[] } | null}
 */
export function buildGridViewModel(analysis, audioDuration = null) {
  if (!analysis) return null;

  const { beats, downbeats, timeSignature, chords } = analysis;

  const model = createTimingModel({
    beats,
    downbeats,
    timeSignature,
    resolutionPerBeat:  2,
    quantizeMode:       'nearest',
    anticipationWindow: 0.5,
    audioDuration,
  });

  // fallback モード: コード列のみ（グリッドなし）
  if (model.mode === 'fallback') {
    return { model, measures: [] };
  }

  const slotsPerMeasure = model.slotsPerMeasure;

  // 小節配列を初期化（onset-only: slots は空配列でスタート）
  const measures = Array.from({ length: model.measureCount }, (_, mi) => ({
    index:      mi,           // 0-based
    startTime:  model.getMeasure(mi).startTime,
    confidence: model.getMeasure(mi).confidence,
    slots:      [],           // { slotIndex, onsets[] } onset ありのみ追加
  }));

  // N / 空コードを除外してから quantize
  const validChords = (chords || []).filter(c =>
    c.chord && c.chord !== 'N' && c.chord.length > 0
  );

  for (const c of validChords) {
    const q = model.quantize(c.start);

    if (q.measure < 0 || q.measure >= measures.length) continue;

    const measure = measures[q.measure];
    const slotIndex = q.slot;  // 0-based, within measure

    if (slotIndex < 0 || slotIndex >= slotsPerMeasure) continue;

    // 既存 slot を探す
    let slot = measure.slots.find(s => s.slotIndex === slotIndex);
    if (!slot) {
      slot = { slotIndex, onsets: [] };
      measure.slots.push(slot);
    }

    // onset を追加（collision 対応: 常に配列で持つ）
    slot.onsets.push({
      chord:      c.chord,
      time:       c.start,
      duration:   c.end - c.start,
      confidence: q.confidence,
    });
  }

  // slots を slotIndex 順にソート
  for (const measure of measures) {
    measure.slots.sort((a, b) => a.slotIndex - b.slotIndex);
  }

  return { model, measures };
}

// ────────────────────────────────────────
// collision 解決（render時）
// ────────────────────────────────────────

/**
 * resolveCollision
 *
 * 同一スロットに複数の onset がある場合に表示する1つを選ぶ。
 *
 * 優先順位:
 *   1. confidence が 'high' の方
 *   2. duration が長い方（短時間ノイズ排除）
 *   3. time が遅い方（後勝ち）
 *
 * @param {object[]} onsets
 * @returns {object}  選ばれた onset
 */
export function resolveCollision(onsets) {
  if (onsets.length === 1) return onsets[0];

  return onsets.reduce((best, current) => {
    // 1. confidence 優先
    if (best.confidence === 'high' && current.confidence !== 'high') return best;
    if (current.confidence === 'high' && best.confidence !== 'high') return current;
    // 2. duration 優先（長い方）
    if (current.duration !== best.duration) {
      return current.duration > best.duration ? current : best;
    }
    // 3. time 優先（後勝ち）
    return current.time > best.time ? current : best;
  });
}

// ────────────────────────────────────────
// carry-forward（render時のみ・保存禁止）
// ────────────────────────────────────────

/**
 * expandCarryForward
 *
 * GridViewModel（onset-only）を render 用に展開する。
 * 各スロットに表示する chord を決定し、flat な配列として返す。
 *
 * 【設計上の注意】
 *   この関数の戻り値を GridViewModel に保存しないこと。
 *   render 時のたびに生成する。
 *
 * @param {object[]} measures  - GridViewModel.measures
 * @param {number}   slotsPerMeasure
 * @returns {{ measureIndex: number, slotIndex: number, chord: string | null }[]}
 */
export function expandCarryForward(measures, slotsPerMeasure) {
  const result = [];
  let lastChord = null;

  for (const measure of measures) {
    // onset インデックスを SlotIndex → onset のマップに変換
    const onsetMap = new Map(
      measure.slots.map(s => [s.slotIndex, resolveCollision(s.onsets)])
    );

    for (let si = 0; si < slotsPerMeasure; si++) {
      const onset = onsetMap.get(si);
      if (onset) {
        lastChord = onset.chord;
      }
      result.push({
        measureIndex: measure.index,
        slotIndex:    si,
        chord:        lastChord,  // null = 曲頭でまだ chord が現れていない
      });
    }
  }

  return result;
}

// ────────────────────────────────────────
// Chart Mode UI state
// ────────────────────────────────────────

// コード名 compact 表示の文字数閾値（layout heuristic）
const COMPACT_CHORD_LENGTH = 8;

export const chartState = {
  active:   false,
  viewModel: null,  // buildGridViewModel の戻り値
  lastScrolledMeasure: -1,
};

// ────────────────────────────────────────
// 注入依存
// ────────────────────────────────────────

let _getAnalysis      = null;  // () => project.analysis
let _getAudioEl       = null;  // () => aEl
let _getAudioDuration = null;  // () => aEl.duration
let _getCapo          = null;  // () => number（カポ値）
let _transposeChord   = null;  // (chord, semitones) => string

/**
 * initChartMode
 *
 * app.js から依存を注入する。
 *
 * @param {object} deps
 * @param {Function} deps.getAnalysis      - () => project.analysis
 * @param {Function} deps.getAudioEl       - () => aEl
 * @param {Function} deps.getAudioDuration - () => aEl.duration
 * @param {Function} deps.getCapo          - () => number（現在のカポ値）
 * @param {Function} deps.transposeChord   - (chord, semitones) => string
 */
export function initChartMode({ getAnalysis, getAudioEl, getAudioDuration, getCapo, transposeChord }) {
  _getAnalysis      = getAnalysis;
  _getAudioEl       = getAudioEl;
  _getAudioDuration = getAudioDuration;
  _getCapo          = getCapo;
  _transposeChord   = transposeChord;

  // ツールチップ要素を body 直下に生成（overflow: hidden を突き抜けるため）
  if (!document.getElementById('chart-tooltip')) {
    const tip = document.createElement('div');
    tip.id = 'chart-tooltip';
    document.body.appendChild(tip);
  }

  // compact コード名のホバーイベントを chart-grid に委譲
  const grid = document.getElementById('chart-grid');
  if (grid) {
    grid.addEventListener('mousemove', e => {
      const el = e.target.closest('.chart-chord-name--compact');
      const tip = document.getElementById('chart-tooltip');
      if (!tip) return;
      if (!el) {
        tip.style.display = 'none';
        return;
      }
      tip.textContent = el.dataset.chord;
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 8) + 'px';
      tip.style.top  = (e.clientY - 28) + 'px';
    });
    grid.addEventListener('mouseleave', () => {
      const tip = document.getElementById('chart-tooltip');
      if (tip) tip.style.display = 'none';
    });
  }
}

// ────────────────────────────────────────
// Chart Mode 開閉
// ────────────────────────────────────────

/**
 * openChartMode
 *
 * Chart Mode オーバーレイを開く。
 * buildGridViewModel を実行して chartState.viewModel をセットする。
 */
export function openChartMode() {
  const analysis = _getAnalysis?.();
  if (!analysis) return;

  const duration = _getAudioDuration?.() || null;
  chartState.viewModel = buildGridViewModel(analysis, duration);

  chartState.active = true;
  const overlay = document.getElementById('chart-overlay');
  if (overlay) {
    overlay.hidden = false;
  }

  _buildTransport();
  // 描画は呼び出し元（app.js）が renderChartMode を責務として持つ
}

/**
 * closeChartMode
 */
export function closeChartMode() {
  chartState.active = false;
  chartState.lastScrolledMeasure = -1;
  const overlay = document.getElementById('chart-overlay');
  if (overlay) {
    overlay.hidden = true;
  }
}

// ────────────────────────────────────────
// Chart Mode 描画
// ────────────────────────────────────────

/**
 * renderChartMode
 *
 * Chart Mode の全体を描画する。
 * mode に応じて full / beat-only / fallback の表示を切り替える。
 *
 * @param {{ measuresPerRow?: number }} [options]
 */
export function renderChartMode({ measuresPerRow = 3 } = {}) {
  if (!chartState.active) return;

  const vm = chartState.viewModel;
  const analysis = _getAnalysis?.();

  _renderChartHeader(vm, analysis);
  _renderChartGrid(vm, analysis, { measuresPerRow });
}

/**
 * _renderChartHeader
 *
 * ヘッダー（曲情報・mode警告）を描画する。
 */
function _renderChartHeader(vm, analysis) {
  const el = document.getElementById('chart-header-info');
  if (!el) return;

  if (!analysis) {
    el.innerHTML = '<span class="chart-warn">⚠️ 解析データがありません</span>';
    return;
  }

  const mode = vm?.model?.mode ?? 'fallback';
  const bpm  = analysis.bpm ? `BPM: ${Math.round(analysis.bpm)}` : '';
  const ts   = analysis.timeSignature
    ? `${analysis.timeSignature.numerator}/${analysis.timeSignature.denominator}`
    : '';

  const modeWarning = {
    'full':      '',
    'beat-only': '<span class="chart-warn">⚠️ 小節線は推定です</span>',
    'fallback':  '<span class="chart-warn">⚠️ タイミング解析不可</span>',
  }[mode] ?? '';

  el.innerHTML = [bpm, ts, modeWarning].filter(Boolean).join(' &nbsp;|&nbsp; ');
}

/**
 * _renderChartGrid
 *
 * コードグリッドを描画する。
 * full / beat-only: 小節グリッド
 * fallback:         コード列（均等配置・小節線なし）
 */
function _renderChartGrid(vm, analysis, { measuresPerRow = 3 } = {}) {
  const container = document.getElementById('chart-grid');
  if (!container) return;
  container.innerHTML = '';

  if (!vm || !analysis) {
    _renderFallbackGrid(container, analysis);
    return;
  }

  const { model, measures } = vm;

  if (model.mode === 'fallback') {
    _renderFallbackGrid(container, analysis);
    return;
  }

  // full / beat-only: measuresPerRow 小節ずつ行に並べる
  const MEASURES_PER_ROW = measuresPerRow;
  const expanded = expandCarryForward(measures, model.slotsPerMeasure);

  // expanded を measure ごとにグループ化
  const byMeasure = new Map();
  for (const cell of expanded) {
    if (!byMeasure.has(cell.measureIndex)) {
      byMeasure.set(cell.measureIndex, []);
    }
    byMeasure.get(cell.measureIndex).push(cell);
  }

  // 行ごとに描画
  for (let rowStart = 0; rowStart < measures.length; rowStart += MEASURES_PER_ROW) {
    const rowEl = document.createElement('div');
    rowEl.className = 'chart-row';

    for (let mi = rowStart; mi < Math.min(rowStart + MEASURES_PER_ROW, measures.length); mi++) {
      const measureEl = document.createElement('div');
      measureEl.className = 'chart-measure';
      if (model.mode === 'beat-only') {
        measureEl.classList.add('chart-measure--estimated');
      }
      measureEl.dataset.measureIndex = mi;

      // 小節番号（UI表示は 1-based）
      const numEl = document.createElement('div');
      numEl.className = 'chart-measure-num';
      numEl.textContent = mi + 1;
      measureEl.appendChild(numEl);

      // ビートカーソル（render時に1回だけ生成・参照を保持）
      // playback中は left% のみを更新する（DOM再生成しない）
      const cursorEl = document.createElement('div');
      cursorEl.className = 'chart-beat-cursor';
      measureEl.appendChild(cursorEl);
      measureEl._beatCursorEl = cursorEl;

      // スロット
      const slotsEl = document.createElement('div');
      slotsEl.className = 'chart-slots';

      const cells = byMeasure.get(mi) ?? [];
      for (const cell of cells) {
        const slotEl = document.createElement('div');
        slotEl.className = 'chart-slot';
        slotEl.dataset.slotIndex = cell.slotIndex;

        // beat頭スロット（slotIndex % resolutionPerBeat === 0）に区切り線
        if (cell.slotIndex % 2 === 0) {
          slotEl.classList.add('chart-slot--beat');
        }

        // onset 判定（carry-forward との区別に使用、将来のdebug overlay用に保持）
        const measureData = measures[mi];
        const hasOnset = measureData?.slots.some(s => s.slotIndex === cell.slotIndex);

        if (cell.chord) {
          const chordEl = document.createElement('span');
          chordEl.className = 'chart-chord-name';

          // display projection: capo 移調を表示時のみ適用
          // analysis.raw / GridViewModel の chord は canonical のまま保持する
          // （analysis は regeneratable artifact のため保存時に変換しないこと）
          const capo = _getCapo?.() ?? 0;
          const display = (capo !== 0 && _transposeChord)
            ? _transposeChord(cell.chord, -capo)
            : cell.chord;
          chordEl.textContent = display;

          // 長いコード名は compact 表示（行高を変えずに収める）
          if (display.length >= COMPACT_CHORD_LENGTH) {
            chordEl.classList.add('chart-chord-name--compact');
            chordEl.dataset.chord = display;  // ホバーツールチップ用
          }

          // carry-forward（onset なし）は薄く表示
          if (!hasOnset) {
            chordEl.classList.add('chart-chord--carried');
          }

          // 複数コードが1小節内にある場合、slotIndex比率で水平位置を決定
          // slotIndex=0 は left:6px、それ以外は小節幅に対する比率で配置
          const leftPct = (cell.slotIndex / model.slotsPerMeasure) * 100;
          if (cell.slotIndex > 0) {
            chordEl.style.left = `calc(${leftPct}% + 2px)`;
          }

          slotEl.appendChild(chordEl);
        }

        slotsEl.appendChild(slotEl);
      }

      measureEl.appendChild(slotsEl);
      rowEl.appendChild(measureEl);
    }

    container.appendChild(rowEl);
  }
}

/**
 * _renderFallbackGrid
 *
 * fallback モード: コード列を均等配置で表示する。
 * 小節線なし・timing semantic なし。
 */
function _renderFallbackGrid(container, analysis) {
  if (!analysis?.chords?.length) {
    container.innerHTML = '<div class="chart-empty">コードデータがありません</div>';
    return;
  }

  const validChords = analysis.chords.filter(c => c.chord && c.chord !== 'N');
  const listEl = document.createElement('div');
  listEl.className = 'chart-fallback-list';

  // display projection: capo 移調を表示時のみ適用（canonical は変更しない）
  const capo = _getCapo?.() ?? 0;

  for (const c of validChords) {
    const el = document.createElement('div');
    el.className = 'chart-fallback-chord';
    el.textContent = (capo !== 0 && _transposeChord)
      ? _transposeChord(c.chord, -capo)
      : c.chord;
    listEl.appendChild(el);
  }

  container.appendChild(listEl);
}

// ────────────────────────────────────────
// 再生同期（playback highlight）
// ────────────────────────────────────────

/**
 * updateChartPlayback
 *
 * 再生時刻に応じて現在の小節・スロットをハイライトする。
 * aEl の timeupdate から呼ばれる。
 *
 * @param {number} currentTime
 */
export function updateChartPlayback(currentTime) {
  if (!chartState.active || !chartState.viewModel) return;

  const { model } = chartState.viewModel;
  if (model.mode === 'fallback') return;

  const q = model.quantize(currentTime);

  // 既存ハイライトを解除
  document.querySelectorAll('.chart-measure--active').forEach(el => {
    el.classList.remove('chart-measure--active');
  });
  document.querySelectorAll('.chart-slot--active').forEach(el => {
    el.classList.remove('chart-slot--active');
  });

  // 現在の小節をハイライト
  const measureEl = document.querySelector(
    `.chart-measure[data-measure-index="${q.measure}"]`
  );
  if (measureEl) {
    // 順序: active class 付与 → cursor left 更新（逆順だとチラつく）
    measureEl.classList.add('chart-measure--active');

    // ビートカーソル位置を更新（left% のみ。DOM再生成しない）
    // getBeatPosition: timing authority が 0.0〜1.0 を返す
    // chartmode はそれを left% に変換するだけ（timing interpretation をしない）
    // 停止時: timeupdate が止まるため cursor はその位置に静止したまま残る（仕様A）
    if (measureEl._beatCursorEl && model.getBeatPosition) {
      const pos = model.getBeatPosition(currentTime);
      measureEl._beatCursorEl.style.left = `${pos * 100}%`;
    }

    // 現在のスロットをハイライト
    const slotEl = measureEl.querySelector(
      `.chart-slot[data-slot-index="${q.slot}"]`
    );
    if (slotEl) {
      slotEl.classList.add('chart-slot--active');
    }

    // ★ 小節が変わった時だけ中央スクロール
    if (q.measure !== chartState.lastScrolledMeasure) {
      chartState.lastScrolledMeasure = q.measure;
      measureEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  _updateTransport(currentTime);

}

// ════════════════════════════════════════
// MINI TRANSPORT
// ════════════════════════════════════════

// seek 競合防止フラグ
let _isSeeking = false;

/**
 * _buildTransport
 * #chart-header 直後に mini transport を生成する。
 * 既存 transport がある場合は重複生成しない。
 */
function _buildTransport() {
  if (document.getElementById('chart-transport')) return;

  const transport = document.createElement('div');
  transport.id = 'chart-transport';

  transport.innerHTML = `
    <button id="chart-play-btn" class="chart-play-btn" title="再生 / 一時停止">▶</button>
    <div id="chart-seek-wrap" class="chart-seek-wrap">
      <div id="chart-seek-track" class="chart-seek-track">
        <div id="chart-seek-fill" class="chart-seek-fill"></div>
      </div>
      <input id="chart-seek-in" class="chart-seek-in" type="range"
             min="0" max="1000" value="0" step="1">
    </div>
    <span id="chart-time-display" class="chart-time-display">0:00 / 0:00</span>
    <div class="chart-speed-cluster">
      <input id="chart-speed-sel" class="chart-speed-sel" type="range"
             min="50" max="150" value="100" step="1">
      <span id="chart-speed-label" class="chart-speed-label">100%</span>
    </div>
  `;

  const header = document.getElementById('chart-header');
  header.insertAdjacentElement('afterend', transport);

  _setupTransportEvents(transport);
}

/**
 * _setupTransportEvents
 * transport のイベントハンドラーを登録する。
 * aEl の play/pause listener は持たない（_updateTransport で polling）。
 */
function _setupTransportEvents(transport) {
  const aEl = _getAudioEl();

  // ── 再生 / 一時停止 ──
  const playBtn = transport.querySelector('#chart-play-btn');
  playBtn.addEventListener('click', () => {
    if (aEl.paused) aEl.play();
    else            aEl.pause();
  });

  // ── シークバー ──
  const seekIn   = transport.querySelector('#chart-seek-in');
  const seekFill = transport.querySelector('#chart-seek-fill');

  seekIn.addEventListener('pointerdown', () => { _isSeeking = true; });

  seekIn.addEventListener('input', () => {
    if (!aEl.duration) return;
    const pct            = seekIn.value / 1000;
    aEl.currentTime      = pct * aEl.duration;
    seekFill.style.width = `${pct * 100}%`;   // ドラッグ中も fill を追従
  });

  const endSeeking = () => { _isSeeking = false; };
  seekIn.addEventListener('pointerup',     endSeeking);
  seekIn.addEventListener('pointercancel', endSeeking);
  seekIn.addEventListener('change',        endSeeking);
  seekIn.addEventListener('blur',          endSeeking);

  // ── 速度スライダー ──
  const speedSel     = transport.querySelector('#chart-speed-sel');
  const speedLabel   = transport.querySelector('#chart-speed-label');
  const mainSpeedSel = document.getElementById('speed-sel');

  // メイン画面の現在速度を初期値として反映
  if (mainSpeedSel) {
    speedSel.value = Math.round(parseFloat(mainSpeedSel.value) * 100);
  }
  speedLabel.textContent = `${speedSel.value}%`;

  speedSel.addEventListener('input', () => {
    aEl.playbackRate       = parseInt(speedSel.value) / 100;
    speedLabel.textContent = `${speedSel.value}%`;
    if (mainSpeedSel) mainSpeedSel.value = speedSel.value;  // ✅ 整数同士で同期
  });
}

/**
 * _updateTransport
 * updateChartPlayback() から毎フレーム呼ばれる。
 * 再生アイコンを polling で更新。isSeeking 中はシークバー位置を更新しない。
 */
function _updateTransport(currentTime) {
  const aEl = _getAudioEl();
  if (!aEl || !aEl.duration) return;

  // 再生アイコン（polling 方式）
  const playBtn = document.getElementById('chart-play-btn');
  if (playBtn) {
    playBtn.textContent = aEl.paused ? '▶' : '⏸';
  }

  // シークバー（isSeeking 中はスキップ）
  if (!_isSeeking) {
    const pct      = currentTime / aEl.duration;
    const seekIn   = document.getElementById('chart-seek-in');
    const seekFill = document.getElementById('chart-seek-fill');
    if (seekIn)   seekIn.value         = Math.round(pct * 1000);
    if (seekFill) seekFill.style.width = `${pct * 100}%`;
  }

  // 時刻表示
  const timeDisplay = document.getElementById('chart-time-display');
  if (timeDisplay) {
    timeDisplay.textContent = `${_fmt(currentTime)} / ${_fmt(aEl.duration)}`;
  }
}

/**
 * _fmt — 秒数を "M:SS" 形式に変換
 */
function _fmt(sec) {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}