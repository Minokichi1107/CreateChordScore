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
