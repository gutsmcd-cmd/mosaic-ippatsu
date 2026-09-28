import './style.css';
import { lang, switchLang, t, type Lang } from './i18n';
import { baseName, canvasToBlob, fileToCanvas, MAX_DIM, shareFile, takeSharedFile } from './image-io';
import { downloadBlob, esc, registerPwa, showToast } from './ui';

type Mode = 'pixel' | 'blur' | 'fill';
type Format = 'png' | 'jpeg';

interface Op {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: Mode;
  strength: number;
}

interface Prefs {
  mode: Mode;
  strength: number;
  format: Format;
}

const PREFS_KEY = 'mosaic-ippatsu:prefs';
const app = document.querySelector<HTMLDivElement>('#app')!;

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>;
    return {
      mode: p.mode === 'blur' || p.mode === 'fill' ? p.mode : 'pixel',
      strength: typeof p.strength === 'number' && p.strength >= 1 && p.strength <= 10 ? p.strength : 5,
      format: p.format === 'jpeg' ? 'jpeg' : 'png',
    };
  } catch {
    return { mode: 'pixel', strength: 5, format: 'png' };
  }
}

const prefs = loadPrefs();
function savePrefs(): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

let base: HTMLCanvasElement | null = null; // original (orientation applied)
let committed: HTMLCanvasElement | null = null; // base + ops
let view: HTMLCanvasElement | null = null; // on-screen
let ops: Op[] = [];
let fileName = 'image';
let drag: { id: number; x0: number; y0: number; x1: number; y1: number } | null = null;
let rafPending = false;

const supportsFilter = (() => {
  const c = document.createElement('canvas').getContext('2d');
  if (!c || !('filter' in c)) return false;
  c.filter = 'blur(2px)';
  return c.filter === 'blur(2px)';
})();

// ---------- effects ----------
function blockSize(strength: number, W: number, H: number): number {
  return Math.max(4, Math.round(Math.max(W, H) * strength * 0.004));
}

function applyOp(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, op: Op): void {
  const x = Math.max(0, Math.floor(op.x));
  const y = Math.max(0, Math.floor(op.y));
  const w = Math.min(src.width - x, Math.ceil(op.w));
  const h = Math.min(src.height - y, Math.ceil(op.h));
  if (w < 1 || h < 1) return;
  const s = blockSize(op.strength, src.width, src.height);
  if (op.mode === 'fill') {
    ctx.fillStyle = '#111111';
    ctx.fillRect(x, y, w, h);
    return;
  }
  if (op.mode === 'pixel') {
    const sw = Math.max(1, Math.ceil(w / s));
    const sh = Math.max(1, Math.ceil(h / s));
    const tmp = document.createElement('canvas');
    tmp.width = sw;
    tmp.height = sh;
    const tctx = tmp.getContext('2d')!;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(src, x, y, w, h, 0, 0, sw, sh);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, sw, sh, x, y, w, h);
    ctx.restore();
    return;
  }
  // blur
  const r = Math.max(3, Math.round(s * 0.8));
  const pad = r * 2;
  const rx = Math.max(0, x - pad);
  const ry = Math.max(0, y - pad);
  const rw = Math.min(src.width, x + w + pad) - rx;
  const rh = Math.min(src.height, y + h + pad) - ry;
  const tmp = document.createElement('canvas');
  tmp.width = rw;
  tmp.height = rh;
  const tctx = tmp.getContext('2d')!;
  if (supportsFilter) {
    // draw an edge-extended copy first so borders don't fade to transparent
    tctx.drawImage(src, rx, ry, rw, rh, 0, 0, rw, rh);
    tctx.filter = `blur(${r}px)`;
    tctx.drawImage(src, rx, ry, rw, rh, 0, 0, rw, rh);
    tctx.filter = 'none';
  } else {
    // Fallback (e.g. Safari): downscale + smooth upscale, twice.
    const f = Math.max(2, Math.round(r / 1.5));
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(rw / f));
    small.height = Math.max(1, Math.round(rh / f));
    const sctx = small.getContext('2d')!;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, rx, ry, rw, rh, 0, 0, small.width, small.height);
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(small, 0, 0, rw, rh);
    sctx.drawImage(tmp, 0, 0, small.width, small.height);
    tctx.drawImage(small, 0, 0, rw, rh);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(tmp, rx, ry);
  ctx.restore();
}

function applyClipped(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, op: Op): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(Math.floor(op.x), Math.floor(op.y), Math.ceil(op.w), Math.ceil(op.h));
  ctx.clip();
  applyOp(ctx, src, op);
  ctx.restore();
}

function rebuild(): void {
  if (!base || !committed) return;
  const ctx = committed.getContext('2d')!;
  ctx.clearRect(0, 0, committed.width, committed.height);
  ctx.drawImage(base, 0, 0);
  for (const op of ops) {
    // each op reads the current (already processed) pixels
    const snapshot = snapshotOf(committed);
    applyClipped(ctx, snapshot, op);
  }
  paint();
}

function snapshotOf(c: HTMLCanvasElement): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = c.width;
  s.height = c.height;
  s.getContext('2d')!.drawImage(c, 0, 0);
  return s;
}

function currentDragOp(): Op | null {
  if (!drag) return null;
  const x = Math.min(drag.x0, drag.x1);
  const y = Math.min(drag.y0, drag.y1);
  return { x, y, w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0), mode: prefs.mode, strength: prefs.strength };
}

function paint(): void {
  if (!view || !committed) return;
  const ctx = view.getContext('2d')!;
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.drawImage(committed, 0, 0);
  const op = currentDragOp();
  if (op && op.w > 1 && op.h > 1) {
    applyClipped(ctx, committed, op); // live preview
    const k = cssToImage();
    ctx.save();
    ctx.lineWidth = 2 * k;
    ctx.setLineDash([6 * k, 4 * k]);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(op.x, op.y, op.w, op.h);
    ctx.lineDashOffset = 5 * k;
    ctx.strokeStyle = '#a78bfa';
    ctx.strokeRect(op.x, op.y, op.w, op.h);
    ctx.restore();
  }
}

function cssToImage(): number {
  if (!view) return 1;
  const r = view.getBoundingClientRect();
  return r.width ? view.width / r.width : 1;
}

function toImage(e: PointerEvent): { x: number; y: number } {
  const r = view!.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * view!.width;
  const y = ((e.clientY - r.top) / r.height) * view!.height;
  return { x: Math.max(0, Math.min(view!.width, x)), y: Math.max(0, Math.min(view!.height, y)) };
}

function schedulePaint(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    paint();
  });
}

// ---------- loading ----------
async function loadFile(file: File | Blob, name = 'image'): Promise<void> {
  if (file.type && !file.type.startsWith('image/')) {
    showToast(t('loadFailed'));
    return;
  }
  try {
    const c = await fileToCanvas(file);
    base = c;
    committed = snapshotOf(c);
    ops = [];
    fileName = baseName(name);
    render();
    // very large photos are scaled down to MAX_DIM on the long edge to stay within phone memory
    if (Math.max(c.width, c.height) === MAX_DIM) showToast(t('resized', { w: c.width, h: c.height }));
  } catch {
    showToast(t('loadFailed'));
  }
}

function openPicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) void loadFile(f, f.name);
  });
  input.click();
}

// ---------- export ----------
async function exportBlob(): Promise<{ blob: Blob; name: string } | null> {
  if (!committed) return null;
  const type = prefs.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await canvasToBlob(committed, type);
  return { blob, name: `${fileName}-mosaic.${prefs.format === 'jpeg' ? 'jpg' : 'png'}` };
}

async function doSave(): Promise<void> {
  const r = await exportBlob();
  if (!r) return;
  downloadBlob(r.blob, r.name);
  showToast(t('saved'));
}

async function doShare(): Promise<void> {
  const r = await exportBlob();
  if (!r) return;
  const res = await shareFile(new File([r.blob], r.name, { type: r.blob.type }), t('appTitle'));
  if (res === 'shared') showToast(t('shared'));
  if (res === 'unsupported') showToast(t('shareUnsupported'));
}

// ---------- render ----------
function headerHtml(): string {
  const l = lang();
  return `
  <header>
    <div class="header-row">
      <div class="titles">
        <img class="logo" src="./icons/icon-192.png" alt="" />
        <div>
          <h1>${t('appTitle')}</h1>
          <p class="sub">${t('appSub')}</p>
        </div>
      </div>
      <div class="lang-toggle" role="group" aria-label="Language">
        <button type="button" data-lang="ja" class="${l === 'ja' ? 'active' : ''}">日本語</button>
        <button type="button" data-lang="en" class="${l === 'en' ? 'active' : ''}">English</button>
      </div>
    </div>
  </header>`;
}

function render(): void {
  if (!base || !committed) {
    view = null;
    app.innerHTML = `
      ${headerHtml()}
      <main class="landing">
        <button type="button" class="drop card" data-open>
          <span class="drop-art" aria-hidden="true"><img src="./icons/icon-192.png" alt="" /></span>
          <span class="btn primary big">${t('open')}</span>
          <span class="muted small">${t('openHint')}</span>
        </button>
        <ul class="points">
          <li><span>🫥</span>${t('point1')}</li>
          <li><span>📱</span>${t('point2')}</li>
          <li><span>🧹</span>${t('point3')}</li>
        </ul>
      </main>
      <footer class="note">${t('footer')}</footer>`;
    return;
  }
  const modes: [Mode, string][] = [
    ['pixel', t('mosaic')],
    ['blur', t('blur')],
    ['fill', t('fill')],
  ];
  app.innerHTML = `
    ${headerHtml()}
    <main class="editor">
      <div class="stage"><canvas id="view" aria-label="${esc(t('dragHint'))}"></canvas></div>
      <p class="hint">${ops.length ? t('areas', { n: ops.length }) : t('dragHint')}</p>
      <section class="panel card">
        <div class="seg-group full" role="group">
          ${modes.map(([m, label]) => `<button type="button" class="seg ${prefs.mode === m ? 'active' : ''}" data-mode="${m}">${label}</button>`).join('')}
        </div>
        <label class="slider ${prefs.mode === 'fill' ? 'disabled' : ''}">
          <span>${t('strength')}</span>
          <input type="range" id="strength" min="1" max="10" step="1" value="${prefs.strength}" ${prefs.mode === 'fill' ? 'disabled' : ''} />
          <output id="strength-val">${prefs.strength}</output>
        </label>
        <div class="row">
          <button type="button" class="btn small" data-undo ${ops.length ? '' : 'disabled'}>↶ ${t('undo')}</button>
          <button type="button" class="btn small ghost" data-clear ${ops.length ? '' : 'disabled'}>${t('clear')}</button>
          <span class="spacer"></span>
          <button type="button" class="btn small ghost" data-new>${t('newPhoto')}</button>
        </div>
      </section>
      <section class="export">
        <div class="seg-group" role="group" aria-label="${t('format')}">
          <button type="button" class="seg ${prefs.format === 'png' ? 'active' : ''}" data-format="png">PNG</button>
          <button type="button" class="seg ${prefs.format === 'jpeg' ? 'active' : ''}" data-format="jpeg">JPEG</button>
        </div>
        <button type="button" class="btn" data-share>${t('share')}</button>
        <button type="button" class="btn primary grow" data-save>⬇ ${t('save')}</button>
      </section>
      <p class="muted tiny">${t('exifNote')}</p>
    </main>
    <footer class="note">${t('footer')}</footer>`;
  view = app.querySelector<HTMLCanvasElement>('#view')!;
  view.width = committed.width;
  view.height = committed.height;
  bindCanvas(view);
  app.querySelector<HTMLInputElement>('#strength')!.addEventListener('input', (e) => {
    prefs.strength = Number((e.target as HTMLInputElement).value);
    app.querySelector('#strength-val')!.textContent = String(prefs.strength);
    savePrefs();
  });
  paint();
}

function bindCanvas(c: HTMLCanvasElement): void {
  c.addEventListener('pointerdown', (e) => {
    if (drag) return;
    c.setPointerCapture(e.pointerId);
    const p = toImage(e);
    drag = { id: e.pointerId, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    e.preventDefault();
  });
  c.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = toImage(e);
    drag.x1 = p.x;
    drag.y1 = p.y;
    schedulePaint();
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const op = currentDragOp();
    drag = null;
    const k = cssToImage();
    if (op && op.w > 10 * k && op.h > 10 * k && committed) {
      ops.push(op);
      applyClipped(committed.getContext('2d')!, snapshotOf(committed), op);
      updateAfterOps();
    }
    paint();
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.id) {
      drag = null;
      paint();
    }
  });
}

function updateAfterOps(): void {
  const hint = app.querySelector('.hint');
  if (hint) hint.textContent = ops.length ? t('areas', { n: ops.length }) : t('dragHint');
  app.querySelectorAll<HTMLButtonElement>('[data-undo],[data-clear]').forEach((b) => (b.disabled = !ops.length));
}

app.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const l = target.closest<HTMLElement>('[data-lang]')?.dataset.lang as Lang | undefined;
  if (l) {
    switchLang(l);
    render();
    return;
  }
  if (target.closest('[data-open]')) return openPicker();
  const m = target.closest<HTMLElement>('[data-mode]')?.dataset.mode as Mode | undefined;
  if (m) {
    prefs.mode = m;
    savePrefs();
    app.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.mode === m));
    const s = app.querySelector<HTMLInputElement>('#strength');
    if (s) s.disabled = m === 'fill';
    app.querySelector('.slider')?.classList.toggle('disabled', m === 'fill');
    return;
  }
  const f = target.closest<HTMLElement>('[data-format]')?.dataset.format as Format | undefined;
  if (f) {
    prefs.format = f;
    savePrefs();
    app.querySelectorAll('[data-format]').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.format === f));
    return;
  }
  if (target.closest('[data-undo]')) {
    ops.pop();
    rebuild();
    updateAfterOps();
    return;
  }
  if (target.closest('[data-clear]')) {
    ops = [];
    rebuild();
    updateAfterOps();
    return;
  }
  if (target.closest('[data-new]')) {
    if (ops.length && !confirm(t('confirmNew'))) return;
    openPicker();
    return;
  }
  if (target.closest('[data-save]')) return void doSave();
  if (target.closest('[data-share]')) return void doShare();
});

// paste & drop
window.addEventListener('paste', (e) => {
  const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
  const f = item?.getAsFile();
  if (f) {
    e.preventDefault();
    void loadFile(f, f.name || 'pasted');
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = Array.from(e.dataTransfer?.files ?? []).find((x) => x.type.startsWith('image/'));
  if (f) void loadFile(f, f.name);
});
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && ops.length) {
    ops.pop();
    rebuild();
    updateAfterOps();
  }
});

document.documentElement.lang = lang();
render();
void takeSharedFile().then((f) => {
  if (f) void loadFile(f, f.name);
});
registerPwa();
