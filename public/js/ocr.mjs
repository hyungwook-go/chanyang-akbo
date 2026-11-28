// 악보 사진 맨 위의 곡 제목을 아이패드 안에서 글자 인식으로 읽습니다.
// 사진은 어디로도 보내지 않습니다. 글자 인식 도구(Tesseract)만 처음 쓸 때 한 번 인터넷에서 받아 옵니다.
const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const TOP = 0.25;      // 사진 위쪽 몇 %에서 제목을 찾을지
const WIDTH = 1600;    // 글자 인식용 너비 (크게 키울수록 작은 제목도 잘 읽음)

let workerP = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('글자 인식 도구를 받지 못했습니다'));
    document.head.appendChild(s);
  });
}

function getWorker() {
  if (!workerP) {
    workerP = (async () => {
      if (!window.Tesseract) await loadScript(LIB);
      const w = await window.Tesseract.createWorker(['kor', 'eng'], 1);
      await w.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '11' });   // 11: 흩어진 글자 찾기 (짧은 제목도 잘 읽음)
      return w;
    })();
    workerP.catch(() => { workerP = null; });   // 실패하면 다음에 다시 시도
  }
  return workerP;
}

// 사진을 고르는 동안 미리 받아 두기
export function warmUp() { getWorker().catch(() => {}); }

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 열 수 없습니다')); };
    img.src = url;
  });
}

// 악보 사진(여백을 잘라 낸 것)에서 제목을 읽어 돌려줍니다. 못 읽으면 ''.
// frac: 그림의 위쪽 몇 %를 볼지 (제목 부분 사본을 줄 때는 그에 맞춰 더 크게)
export async function readTitle(blob, frac = TOP) {
  return (await readHead(blob, frac)).title;
}

// 제목 줄과, 사진 위쪽에서 읽은 글 전부 { title, text } (악보함의 곡과 맞출 때 씀)
export async function readHead(blob, frac = TOP) {
  const worker = await getWorker();
  const img = await loadImage(blob);
  const sw = img.naturalWidth, sh = Math.max(1, Math.round(img.naturalHeight * Math.min(1, frac)));
  const k = Math.min(2, WIDTH / sw);
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, sw, sh, 0, 0, c.width, c.height);
  const original = ctx.getImageData(0, 0, c.width, c.height);
  try {
    // 1차: 그림자·누런 바탕·오선을 걷어 낸 흑백 사진으로 읽기
    ctx.putImageData(cleanImage(original), 0, 0);
    let lines = linesOf((await worker.recognize(c)).data);
    let title = pickTitle(lines);
    let text = lines.map((l) => l.text || '').join(' ');
    // 2차: 못 읽었으면 원래 사진으로 한 번 더
    if (!title) {
      ctx.putImageData(original, 0, 0);
      lines = linesOf((await worker.recognize(c)).data);
      title = pickTitle(lines);
      text += ' ' + lines.map((l) => l.text || '').join(' ');
    }
    return { title, text: text.slice(0, 300) };
  } finally {
    c.width = 0; c.height = 0;
  }
}

// 사진(ImageData)을 글자 인식이 잘 되는 흑백으로 바꿔 새 ImageData로 돌려줍니다.
function cleanImage(src) {
  const { width: w, height: h, data } = src;
  const gray = new Uint8Array(w * h);
  // 빨강·파랑 글씨도 진하게 보이도록 세 색 중 가장 어두운 값을 씀
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = Math.min(data[j], data[j + 1], data[j + 2]);
  const bw = binarize(gray, w, h);
  const out = new ImageData(w, h);
  const o = out.data;
  for (let i = 0, j = 0; i < bw.length; i++, j += 4) { o[j] = o[j + 1] = o[j + 2] = bw[i]; o[j + 3] = 255; }
  return out;
}

function linesOf(data) {
  if (data.lines && data.lines.length) return data.lines;
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) out.push(l);
  return out;
}

// ---- 아래는 화면과 상관없는 계산 (테스트함) ----

// 흑백 값(0~255) 배열을 글자는 검정(0), 바탕은 흰색(255)으로 나눕니다.
// - 주변 밝기와 비교해서 나누므로 그림자나 누런 종이도 바탕으로 처리됨
// - 바탕이 어둡고 글씨가 흰 경우는 뒤집음
// - 오선·밑줄처럼 가로로 길게 이어진 선은 지움 (글자로 잘못 읽히지 않게)
export function binarize(gray, w, h) {
  const n = w * h;
  let total = 0;
  for (let i = 0; i < n; i++) total += gray[i];
  if (total / n < 70) gray = gray.map((v) => 255 - v);   // 바탕이 아주 어두우면(흰 글씨) 뒤집어서 읽음 — 그림자 정도로는 뒤집지 않음
  const sum = new Float64Array((w + 1) * (h + 1));   // 누적 합 (빠르게 주변 평균 구하기)
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.max(w, h) / 16));   // 주변 범위 (굵은 제목 글씨보다 넓게)
  const out = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const s = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
      const v = gray[y * w + x];
      const isInk = v * area < s * 0.85 && v < 200;   // 주변보다 15% 넘게 어두우면 글씨
      out[y * w + x] = isInk ? 0 : 255;
    }
  }
  const long = Math.max(20, Math.round(w * 0.3));
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const ink = x < w && out[y * w + x] === 0;
      if (ink && start < 0) start = x;
      if (!ink && start >= 0) {
        if (x - start >= long) out.fill(255, y * w + start, y * w + x);
        start = -1;
      }
    }
  }
  return out;
}

// 인식된 글줄 하나를 제목다운 글자로 다듬기
export function cleanTitle(t) {
  let s = String(t || '')
    .replace(/[^\p{L}\p{N} ,.'!?&()\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s,.\-'!?&()]+|[\s,.\-'&(]+$/g, '');
  // 한글이 '주 하 나 님'처럼 한 글자씩 띄어 읽히면 붙임
  const parts = s.split(' ');
  const single = parts.filter((p) => /^[가-힣]$/.test(p)).length;
  if (parts.length >= 3 && single / parts.length >= 0.7) s = parts.join('');
  return s;
}

const META = /작사|작곡|편곡|작시|번역|Words|Music|Lyrics|Arr\b|Arranged|Composed|Key\s*[=:]|Capo|Tempo|BPM|=\s*\d/i;

// 글줄들 중 글자가 가장 큰 줄을 제목으로 고름 (악보 제목은 보통 맨 위의 가장 큰 글씨)
export function pickTitle(lines) {
  let best = null;
  for (const l of lines || []) {
    const text = cleanTitle(l.text);
    const letters = (text.match(/[가-힣A-Za-z]/g) || []).length;
    if (letters < 2) continue;
    if (META.test(text) || META.test(String(l.text || ''))) continue;   // 작사·작곡·조성 같은 줄은 제목이 아님
    const conf = l.confidence == null ? 60 : l.confidence;
    if (conf < 45) continue;
    const h = l.bbox ? l.bbox.y1 - l.bbox.y0 : 0;
    const score = h * (0.5 + conf / 200);
    if (!best || score > best.score) best = { text, score };
  }
  return best ? best.text.slice(0, 40).trim() : '';
}
