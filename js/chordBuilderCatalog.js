/**
 * Phase148: Chord Builder の候補一覧とコード名生成（DOMなし・データ書込みなしの純粋関数）。
 *
 * 承認済み仕様（docs/Phase148_Technical_Design_Issue116.md）:
 *  - Root／Bass: 異名同音を両方選べる17ラベル（§21.6）。二重変化記号・B♯・C♭・E♯・F♭は含めない。
 *  - Bass: Rootと同じ17ラベル＋「指定なし」（未指定時はスラッシュを付けない）。
 *  - Type: 初期24種。内部ID・表示名・生成suffixは §21.7 の表のとおり。
 *
 * 【未決・変更しないこと】
 *  - 内部保存値の `#`/`b` と Unicode（♯/♭）の方針は B1 が保留中。
 *    ここでは「画面ラベル(label)」と「コード名を組み立てるための文字列(value)」を分けて持つだけで、
 *    保存形式は確定しない。value は現行アプリが使う `#`/`b` 表記（chords.js `_unicodeNorm` と同じ向き）。
 *    B1の結論が出たら、この ACCIDENTAL_VALUE の対応表1か所を差し替える。
 *  - Type の内部ID命名は A2 が未確定のため、§21.7 の表にある文字列をそのまま使う。
 */

// 画面ラベル → コード名を組み立てるための文字列（B1確定まで暫定。上記参照）
const ROOT_LABELS = [
  'C', 'C♯', 'D♭', 'D', 'D♯', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'G♯', 'A♭', 'A', 'A♯', 'B♭', 'B',
];

function labelToValue(label) {
  return label.replace(/♯/g, '#').replace(/♭/g, 'b');
}

export const BUILDER_ROOT_OPTIONS = ROOT_LABELS.map(label => ({ label, value: labelToValue(label) }));

// Bassは「指定なし」（value ''）＋ Rootと同じ17ラベル
export const BUILDER_BASS_OPTIONS = [{ label: '指定なし', value: '' }].concat(
  BUILDER_ROOT_OPTIONS.map(option => ({ label: option.label, value: option.value }))
);

// §21.7 初期Type候補24種（表示順もこの順）
export const BUILDER_TYPE_OPTIONS = [
  { id: 'major', label: '(なし)', suffix: '' },
  { id: 'major7', label: 'Maj7', suffix: 'maj7' },
  { id: 'dominant7', label: '7', suffix: '7' },
  { id: 'sixth', label: '6', suffix: '6' },
  { id: 'add9', label: 'add9', suffix: 'add9' },
  { id: 'sus4', label: 'sus4', suffix: 'sus4' },
  { id: 'dominant7sus4', label: '7sus4', suffix: '7sus4' },
  { id: 'dominant7-sharp5', label: '7(#5)', suffix: '7(#5)' },
  { id: 'dominant7-flat5', label: '7(b5)', suffix: '7(b5)' },
  { id: 'minor', label: 'm', suffix: 'm' },
  { id: 'minor7', label: 'm7', suffix: 'm7' },
  { id: 'minor-major7', label: 'mM7', suffix: 'mM7' },
  { id: 'minor6', label: 'm6', suffix: 'm6' },
  { id: 'minor7-flat5', label: 'm7(b5)', suffix: 'm7(b5)' },
  { id: 'minor7-9', label: 'm7(9)', suffix: 'm7(9)' },
  { id: 'major7-9', label: 'M7(9)', suffix: 'M7(9)' },
  { id: 'sixth-9', label: '6(9)', suffix: '6(9)' },
  { id: 'dominant7-9', label: '7(9)', suffix: '7(9)' },
  { id: 'dominant7-sharp9', label: '7(s9)', suffix: '7(s9)' },
  { id: 'dominant7-flat9', label: '7(b9)', suffix: '7(b9)' },
  { id: 'dominant7-13', label: '7(13)', suffix: '7(13)' },
  { id: 'diminished', label: 'dim', suffix: 'dim' },
  { id: 'augmented', label: 'aug', suffix: 'aug' },
  { id: 'power5', label: '5', suffix: '5' },
];

export const DEFAULT_BUILDER_TYPE_ID = 'major';

// ── 数字コマンド入力の固定番号（digit-command-input-spec v3 §2。確定済み） ──
// 番号と内部値/IDの対応は明示的な表で持つ。配列の位置や表示順から算出しない（並べ替えても番号は変わらない）。
// Root / Bass 共通: 01〜17。00 は別扱い（Root＝未選択／Bass＝指定なし。内部値 ''）。
export const BUILDER_NOTE_NUMBER_TABLE = Object.freeze([
  [1, 'C'], [2, 'C#'], [3, 'Db'], [4, 'D'], [5, 'D#'], [6, 'Eb'], [7, 'E'], [8, 'F'], [9, 'F#'],
  [10, 'Gb'], [11, 'G'], [12, 'G#'], [13, 'Ab'], [14, 'A'], [15, 'A#'], [16, 'Bb'], [17, 'B'],
]);
// Type: 01〜24（設計書 §21.7 の順）。00 は無効。将来の追加は次の未使用番号。無効化した番号は再利用しない。
export const BUILDER_TYPE_NUMBER_TABLE = Object.freeze([
  [1, 'major'], [2, 'major7'], [3, 'dominant7'], [4, 'sixth'], [5, 'add9'], [6, 'sus4'],
  [7, 'dominant7sus4'], [8, 'dominant7-sharp5'], [9, 'dominant7-flat5'], [10, 'minor'], [11, 'minor7'],
  [12, 'minor-major7'], [13, 'minor6'], [14, 'minor7-flat5'], [15, 'minor7-9'], [16, 'major7-9'],
  [17, 'sixth-9'], [18, 'dominant7-9'], [19, 'dominant7-sharp9'], [20, 'dominant7-flat9'],
  [21, 'dominant7-13'], [22, 'diminished'], [23, 'augmented'], [24, 'power5'],
]);

/** 欄ごとの 番号→内部値 の Map（'root' | 'bass' | 'type'）。Root/Bass は 0→''（未選択／指定なし）を含む。 */
export function getBuilderNumberMap(field) {
  if (field === 'type') return new Map(BUILDER_TYPE_NUMBER_TABLE);
  if (field === 'root' || field === 'bass') return new Map([[0, '']].concat(BUILDER_NOTE_NUMBER_TABLE));
  return new Map();
}

/** 内部値 → 番号（なければ null）。表示ラベル生成用。 */
export function getBuilderNumberOf(field, value) {
  for (const [number, v] of getBuilderNumberMap(field)) if (v === value) return number;
  return null;
}

/** 2桁・先頭0付きの番号表示（例 3 → '03'）。 */
export function formatBuilderNumber(number) {
  return String(number).padStart(2, '0');
}

/** 将来の Type 追加用: 使用済み・無効化済みの番号より大きい次の番号を返す（再利用しない）。 */
export function nextUnusedTypeNumber(retiredNumbers = []) {
  const all = BUILDER_TYPE_NUMBER_TABLE.map(([n]) => n).concat(retiredNumbers);
  return Math.max(0, ...all) + 1;
}

/**
 * Root / Type / Bass の選択値からコード名を組み立てる。
 * @param {string} rootValue  BUILDER_ROOT_OPTIONS の value（空なら組み立てない）
 * @param {string} typeId     BUILDER_TYPE_OPTIONS の id
 * @param {string} bassValue  BUILDER_BASS_OPTIONS の value（''＝指定なし）
 * @returns {string} 組み立てられなければ ''
 */
export function buildChordName(rootValue, typeId, bassValue) {
  if (!rootValue) return '';
  const type = BUILDER_TYPE_OPTIONS.find(option => option.id === typeId);
  if (!type) return '';
  return rootValue + type.suffix + (bassValue ? '/' + bassValue : '');
}

// ── 既存コードの復元（Phase148 後続：画面表示名 → Root / Type / Bass） ──
// 画面に表示されるコード名（toDisplayChord(toReadableChord(保存値))）を完全一致で解析する純粋関数。
//  - Root・Bass は 17 ラベル（ASCII の #/b と Unicode の ♯/♭ の両方）のいずれかと完全一致。
//    戻り値の value は ASCII（buildChordName と同じ表記）。Unicode は内部値へ変換するだけで、保存値は書き換えない。
//  - Type は 24 種の suffix と完全一致（別名・異名同音・部分一致の推測はしない。空 suffix は major のみ）。
//  - N.C. は文字列が正確に 'N' のときだけ（保存値 N は表示でも N のまま。chartmode.js も display === 'N' のみ N.C. 扱い）。
//    'NC' 'N.C.' 'n' '(N.C)' などは既知の表記ではないため通常の解析に委ね、失敗＝ unsupported になる。
//  - 失敗しても何も変更しない（この関数は読み取りのみ）。
const ROOT_VALUE_BY_TEXT = new Map();
BUILDER_ROOT_OPTIONS.forEach(option => {
  ROOT_VALUE_BY_TEXT.set(option.value, option.value);
  ROOT_VALUE_BY_TEXT.set(option.label, option.value);
});
const TYPE_ID_BY_SUFFIX = new Map(BUILDER_TYPE_OPTIONS.map(option => [option.suffix, option.id]));

/**
 * @param {string} displayName 画面に表示されるコード名
 * @returns {{kind:'ok', root:string, type:string, bass:string} | {kind:'nc'} | {kind:'unsupported'}}
 */
export function parseChordToBuilder(displayName) {
  if (typeof displayName !== 'string') return { kind: 'unsupported' };
  if (displayName === 'N') return { kind: 'nc' };
  const slash = displayName.indexOf('/');
  const main = slash >= 0 ? displayName.slice(0, slash) : displayName;
  const bassText = slash >= 0 ? displayName.slice(slash + 1) : '';
  const match = /^([A-G](?:#|b|♯|♭)?)([\s\S]*)$/.exec(main);
  if (!match) return { kind: 'unsupported' };
  const root = ROOT_VALUE_BY_TEXT.get(match[1]);
  if (root === undefined || !TYPE_ID_BY_SUFFIX.has(match[2])) return { kind: 'unsupported' };
  let bass = '';
  if (slash >= 0) {
    bass = ROOT_VALUE_BY_TEXT.get(bassText);
    if (bass === undefined) return { kind: 'unsupported' };
  }
  return { kind: 'ok', root, type: TYPE_ID_BY_SUFFIX.get(match[2]), bass };
}
