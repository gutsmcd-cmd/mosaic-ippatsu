export type Lang = 'ja' | 'en';

const LANG_KEY = 'mosaic-ippatsu-lang';

export function getLang(): Lang {
  const v = localStorage.getItem(LANG_KEY);
  if (v === 'en' || v === 'ja') return v;
  return 'ja';
}

export function setLang(lang: Lang): void {
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang;
}

type Dict = Record<string, string>;

let current: Lang = getLang();

export function lang(): Lang {
  return current;
}

export function switchLang(l: Lang): void {
  current = l;
  setLang(l);
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = dictionaries[current][key] ?? dictionaries.ja[key] ?? key;
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.split(`{${k}}`).join(String(v)),
    raw,
  );
}

const ja: Dict = {
  appTitle: 'モザイク一発',
  appSub: '写真の一部をサッと隠す',
  open: '写真を開く',
  openHint: 'ギャラリーから選ぶ・共有メニューから送る・貼り付け・ドロップ',
  point1: '顔・名前・住所・ナンバーを指でなぞって隠す',
  point2: '処理はすべてこの端末のブラウザ内',
  point3: '保存時に位置情報などのEXIFを削除',
  dragHint: '隠したい範囲を指でなぞってください',
  mosaic: 'モザイク',
  blur: 'ぼかし',
  fill: '塗りつぶし',
  strength: '強さ',
  undo: '元に戻す',
  clear: 'すべて解除',
  newPhoto: '別の写真',
  format: '形式',
  save: '保存',
  share: '共有',
  saved: '保存しました',
  shared: '共有しました',
  shareUnsupported: 'この端末では共有できません。保存をお使いください',
  loadFailed: '画像を読み込めませんでした',
  areas: '{n}か所',
  noAreas: 'まだ範囲がありません',
  resized: '大きな画像のため {w}×{h} に縮小しました',
  confirmNew: '編集中の写真を閉じますか？',
  exifNote: '書き出し画像には位置情報などのメタデータは含まれません',
  footer: '画像はこの端末から出ません · 無料 · 広告なし · ログイン不要',
};

const en: Dict = {
  appTitle: 'Mosaic Now',
  appSub: 'Hide parts of a photo in seconds',
  open: 'Open a photo',
  openHint: 'Pick from gallery · share to this app · paste · drop',
  point1: 'Drag over faces, names, addresses or plates to hide them',
  point2: 'Everything is processed in this browser, on this device',
  point3: 'EXIF data such as location is removed on export',
  dragHint: 'Drag over the area you want to hide',
  mosaic: 'Pixelate',
  blur: 'Blur',
  fill: 'Fill',
  strength: 'Strength',
  undo: 'Undo',
  clear: 'Clear all',
  newPhoto: 'New photo',
  format: 'Format',
  save: 'Save',
  share: 'Share',
  saved: 'Saved',
  shared: 'Shared',
  shareUnsupported: 'Sharing isn’t available here — use Save instead',
  loadFailed: 'Could not load that image',
  areas: '{n} area(s)',
  noAreas: 'No areas yet',
  resized: 'Large image scaled to {w}×{h}',
  confirmNew: 'Close the current photo?',
  exifNote: 'Exported images contain no location or other metadata',
  footer: 'Images never leave this device · free · no ads · no login',
};

const dictionaries: Record<Lang, Dict> = { ja, en };
