// 사진첩에서 고른 사진을 악보용으로 다듬어 이 기기에 보관할 크기로 만듭니다.
import { findContentBox } from './trim.mjs';

const LONG = 2400;   // 긴 변 최대 픽셀 (아이패드 화면보다 조금 큼)
const THUMB = 240;   // 목록용 작은 그림 너비
export const HEAD = 0.28;   // 제목 부분: 사진 위쪽 28%
const HEADW = 1400;  // 제목 부분 사본의 너비 (화면 표시·제목 읽기용, 아이패드 메모리 절약)

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 열 수 없습니다')); };
    img.src = url;
  });
}

function toBlob(canvas, q) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('사진을 저장할 수 없습니다'))), 'image/jpeg', q);
  });
}

function free(canvas) { canvas.width = 0; canvas.height = 0; }

export async function processFile(file) {
  const img = await loadImage(file);
  const sw = img.naturalWidth, sh = img.naturalHeight;

  // 1) 여백 찾기: 작게 줄인 흑백으로 계산
  const sc = Math.min(1, 500 / Math.max(sw, sh));
  const tw = Math.max(1, Math.round(sw * sc)), th = Math.max(1, Math.round(sh * sc));
  const t = document.createElement('canvas');
  t.width = tw; t.height = th;
  const tctx = t.getContext('2d', { willReadFrequently: true });
  tctx.drawImage(img, 0, 0, tw, th);
  const px = tctx.getImageData(0, 0, tw, th).data;
  const lum = new Uint8Array(tw * th);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (px[j] * 299 + px[j + 1] * 587 + px[j + 2] * 114) / 1000;
  free(t);
  const b = findContentBox(lum, tw, th);
  const cx = b.x0 / sc, cy = b.y0 / sc;
  const cw = Math.min(sw - cx, (b.x1 - b.x0) / sc), ch = Math.min(sh - cy, (b.y1 - b.y0) / sc);

  // 2) 잘라서 줄이기
  const k = Math.min(1, LONG / Math.max(cw, ch));
  const w = Math.round(cw * k), h = Math.round(ch * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cx, cy, cw, ch, 0, 0, w, h);
  const blob = await toBlob(c, 0.85);

  // 3) 목록용 작은 그림
  const m = document.createElement('canvas');
  m.width = THUMB; m.height = Math.round((h / w) * THUMB);
  const mctx = m.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(c, 0, 0, m.width, m.height);
  const thumb = await toBlob(m, 0.7);

  // 4) 제목 부분만 작게 (여러 장을 한꺼번에 등록해도 아이패드 메모리가 모자라지 않게)
  const hk = Math.min(1, HEADW / w), hh = Math.max(1, Math.round(h * HEAD));
  const hc = document.createElement('canvas');
  hc.width = Math.round(w * hk); hc.height = Math.max(1, Math.round(hh * hk));
  const hctx = hc.getContext('2d');
  hctx.imageSmoothingQuality = 'high';
  hctx.drawImage(c, 0, 0, w, hh, 0, 0, hc.width, hc.height);
  const head = await toBlob(hc, 0.85);
  free(c); free(m); free(hc);

  return { blob, thumb, head, w, h };
}
