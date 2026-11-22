// 악보 둘레의 빈 여백을 찾아 잘라낼 범위를 계산합니다 (화면에 악보가 더 크게 보이도록).
// lum: 밝기(0~255) 배열, w×h. 돌려주는 값은 같은 크기 기준의 {x0, y0, x1, y1} (x1, y1은 포함 안 함).

export function findContentBox(lum, w, h) {
  const full = { x0: 0, y0: 0, x1: w, y1: h };
  if (w < 20 || h < 20) return full;

  // 바탕 밝기 = 바깥 테두리 띠의 중앙값
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const border = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < band || x >= w - band || y < band || y >= h - band) border.push(lum[y * w + x]);
    }
  }
  border.sort((a, b) => a - b);
  const bg = border[border.length >> 1];
  if (bg < 120) return full; // 어두운 바탕은 자르지 않음
  const thr = Math.min(bg - 45, 200);

  const rows = new Uint32Array(h);
  const cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (lum[y * w + x] < thr) { rows[y]++; cols[x]++; }
    }
  }
  const rowMin = Math.max(2, Math.round(w * 0.004));
  const colMin = Math.max(2, Math.round(h * 0.004));
  let y0 = 0; while (y0 < h && rows[y0] < rowMin) y0++;
  let y1 = h; while (y1 > y0 && rows[y1 - 1] < rowMin) y1--;
  let x0 = 0; while (x0 < w && cols[x0] < colMin) x0++;
  let x1 = w; while (x1 > x0 && cols[x1 - 1] < colMin) x1--;
  if (y0 >= y1 || x0 >= x1) return full;

  const pad = Math.round(Math.max(w, h) * 0.02);
  const box = {
    x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad),
    x1: Math.min(w, x1 + pad), y1: Math.min(h, y1 + pad),
  };
  // 거의 안 줄면 그대로 둠
  const kept = ((box.x1 - box.x0) * (box.y1 - box.y0)) / (w * h);
  return kept > 0.96 ? full : box;
}
