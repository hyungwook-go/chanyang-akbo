// 악보 위 간단한 표시: 펜, 형광펜, 지우개(선 단위), 되돌리기
// 선 좌표는 그림 크기 기준 0~1 값으로 저장해 기기·화면 크기가 달라도 같은 자리에 보입니다.

export const PEN_W = 0.0035;   // 그림 너비 대비
export const HL_W = 0.022;

const r4 = (v) => Math.round(v * 10000) / 10000;

export function drawStrokes(ctx, strokes, W, H) {
  for (const s of strokes) drawStroke(ctx, s, W, H);
}

function drawStroke(ctx, s, W, H) {
  const p = s.p;
  if (!p || p.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.c;
  ctx.lineWidth = Math.max(1, s.w * W);
  if (s.t === 'hl') { ctx.globalAlpha = 0.35; ctx.lineCap = 'butt'; }
  ctx.beginPath();
  ctx.moveTo(p[0] * W, p[1] * H);
  if (p.length === 2) ctx.lineTo(p[0] * W + 0.01, p[1] * H);
  for (let i = 2; i + 3 < p.length; i += 2) {
    const mx = ((p[i] + p[i + 2]) / 2) * W, my = ((p[i + 1] + p[i + 3]) / 2) * H;
    ctx.quadraticCurveTo(p[i] * W, p[i + 1] * H, mx, my);
  }
  if (p.length >= 4) ctx.lineTo(p[p.length - 2] * W, p[p.length - 1] * H);
  ctx.stroke();
  ctx.restore();
}

// 점(px)에서 선까지 거리가 r 이하인가
export function hitStroke(s, x, y, W, H, r) {
  const p = s.p;
  const rr = r + (s.w * W) / 2;
  for (let i = 0; i < p.length; i += 2) {
    const ax = p[i] * W, ay = p[i + 1] * H;
    const bx = (i + 2 < p.length ? p[i + 2] : p[i]) * W, by = (i + 3 < p.length ? p[i + 3] : p[i + 1]) * H;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ex = ax + t * dx - x, ey = ay + t * dy - y;
    if (ex * ex + ey * ey <= rr * rr) return true;
  }
  return false;
}

export class InkLayer {
  constructor(canvas, onChange) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = onChange;
    this.strokes = [];
    this.undoStack = [];
    this.tool = { t: 'pen', c: '#e53935' };
    this.on = false;
    this.penSeen = false;
    this.cur = null;
    this.W = 1; this.H = 1;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
  }

  setStrokes(strokes) {
    this.strokes = strokes ? strokes.slice() : [];
    this.undoStack = [];
    this.cur = null;
    this.render();
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.W = w; this.H = h;
    this.c.width = Math.round(w * dpr);
    this.c.height = Math.round(h * dpr);
    this.c.style.width = w + 'px';
    this.c.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  render() {
    this.ctx.clearRect(0, 0, this.W, this.H);
    drawStrokes(this.ctx, this.strokes, this.W, this.H);
    if (this.cur) drawStroke(this.ctx, this.cur, this.W, this.H);
  }

  enable(on) {
    this.on = on;
    this.c.style.pointerEvents = on ? 'auto' : 'none';
    if (!on) this.cur = null;
  }

  pos(e) {
    const r = this.c.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  snapshot() {
    this.undoStack.push(this.strokes.slice());
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  changed() { this.render(); this.onChange && this.onChange(this.strokes.slice()); }

  down(e) {
    if (!this.on) return;
    if (e.pointerType === 'pen') this.penSeen = true;
    else if (this.penSeen && e.pointerType === 'touch') return; // 펜슬을 쓰면 손바닥 터치는 무시
    e.preventDefault();
    this.c.setPointerCapture(e.pointerId);
    this.pid = e.pointerId;
    const [x, y] = this.pos(e);
    if (this.tool.t === 'eraser') { this.erasing = false; this.eraseAt(x, y); return; }
    this.cur = { t: this.tool.t, c: this.tool.t === 'hl' ? '#ffd600' : this.tool.c, w: this.tool.t === 'hl' ? HL_W : PEN_W, p: [r4(x / this.W), r4(y / this.H)] };
    this.render();
  }

  move(e) {
    if (!this.on || e.pointerId !== this.pid) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = this.pos(ev);
      if (this.tool.t === 'eraser') { this.eraseAt(x, y); continue; }
      if (!this.cur) continue;
      const p = this.cur.p;
      const lx = p[p.length - 2] * this.W, ly = p[p.length - 1] * this.H;
      if ((x - lx) ** 2 + (y - ly) ** 2 < 4) continue;
      p.push(r4(x / this.W), r4(y / this.H));
    }
    this.render();
  }

  up(e) {
    if (e.pointerId !== this.pid) return;
    this.pid = null;
    if (this.tool.t === 'eraser') { this.erasing = false; return; }
    if (!this.cur) return;
    this.snapshot();
    this.strokes.push(this.cur);
    this.cur = null;
    this.changed();
  }

  eraseAt(x, y) {
    const keep = this.strokes.filter((s) => !hitStroke(s, x, y, this.W, this.H, 10));
    if (keep.length === this.strokes.length) return;
    if (!this.erasing) { this.snapshot(); this.erasing = true; }
    this.strokes = keep;
    this.changed();
  }

  undo() {
    if (!this.undoStack.length) return;
    this.strokes = this.undoStack.pop();
    this.changed();
  }

  clear() {
    if (!this.strokes.length) return;
    this.snapshot();
    this.strokes = [];
    this.changed();
  }
}
