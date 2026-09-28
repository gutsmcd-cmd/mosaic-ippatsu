# モザイク一発（mosaic-ippatsu）

写真の顔・名前・住所・ナンバーなどを、指でなぞってモザイク／ぼかし／塗りつぶしで隠す PWA。処理はすべてブラウザの Canvas 上で行い、画像は端末から出ません。

**無料・広告なし・ログイン不要・通信なし・アナリティクスなし。** 一度開けばオフラインで動きます。UI は日本語が初期設定で、右上で 日本語 / English を切り替えられます（`mosaic-ippatsu-lang`）。

## 主な機能

- 写真を開く：ファイル選択・貼り付け・ドロップ・Android の共有メニュー（Web Share Target）
- タッチで範囲をドラッグ → リアルタイムでプレビュー
- モザイク／ぼかし／塗りつぶし、強さ 1〜10
- 元に戻す・すべて解除
- PNG / JPEG で保存、または共有（Web Share API）
- 書き出しは Canvas で再エンコードするため EXIF（位置情報・機種など）は含まれません
- 設定（モード・強さ・形式）だけ localStorage（`mosaic-ippatsu:prefs`）に保存

## 共有メニューから開く（Web Share Target）

ホーム画面に追加（インストール）すると、Android Chrome ではギャラリーやスクショの「共有」先にこのアプリが表示されます。共有された画像は Service Worker が端末内の Cache Storage に一時保存し、アプリが読み込んだらすぐ削除します（`public/share-target-sw.js`）。未インストール時や iOS ではファイル選択をお使いください。

## 使い方（開発）

```bash
npm install
npm run dev       # Vite 開発サーバー
npm run build     # 型チェック + 本番ビルド → dist/
npm run preview   # 本番ビルドのプレビュー
```

## デプロイ

GitHub Pages：`.github/workflows/pages.yml`（npm ci → build → `dist` をアップロード → deploy-pages）。`base: './'` なのでサブパス（`/mosaic-ippatsu/`）でも動きます。

## プライバシー

データはすべてこの端末のブラウザ内にだけ保存されます。サーバー・外部 API・トラッキング・広告は一切ありません。

---

## English

**Mosaic Now** — Hide faces, names, addresses or number plates by dragging over them. Everything happens on a canvas in your browser; images never leave the device.

Free, no ads, no login, no network calls, no analytics. Works fully offline once loaded and can be installed to the home screen as a PWA. The UI defaults to Japanese; switch 日本語 / English at the top right.

- Open via file picker, paste, drag-and-drop, or Android’s share sheet (Web Share Target)
- Drag rectangles with a finger, with live preview
- Pixelate, blur or solid fill, strength 1–10
- Undo and clear all
- Save or share as PNG / JPEG
- Exports are re-encoded from the canvas, so EXIF (GPS, camera, etc.) is stripped
- Only preferences are stored (localStorage `mosaic-ippatsu:prefs`)

### Share target

Once installed on Android Chrome, the app appears in the share sheet. The shared image is held briefly in Cache Storage on the device by the service worker (`public/share-target-sw.js`) and removed as soon as the app picks it up. Otherwise use the file picker.

Tech: Vite + vanilla TypeScript + `vite-plugin-pwa` (`registerType: 'autoUpdate'`, `base: './'`). Deploys to GitHub Pages via `.github/workflows/pages.yml`.
