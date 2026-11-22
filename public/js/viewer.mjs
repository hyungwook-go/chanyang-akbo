// 반주 화면: 악보를 화면 가득 보여 주고, 좌우 터치·밀기·페달(블루투스 키)로 넘깁니다.
import { guardBack } from './back.mjs';
import * as db from './db.mjs';
import * as store from './store.mjs';
import { InkLayer } from './ink.mjs';
import { processFile } from './image.mjs';

const urls = new Map();   // 사진 id → 화면용 주소
const sizes = new Map();  // 사진 id → [w, h]

async function imageURL(id) {
  if (urls.has(id)) return urls.get(id);
  const rec = await db.getImage(id);
  if (!rec) return null;
  const u = URL.createObjectURL(rec.blob);
  urls.set(id, u);
  sizes.set(id, [rec.w, rec.h]);
  if (urls.size > 16) { // 오래된 것부터 정리
    const [k, v] = urls.entries().next().value;
    URL.revokeObjectURL(v); urls.delete(k);
  }
  return u;
}

export function forgetImage(id) {
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id); sizes.delete(id);
}

const ICON = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19z"/></svg>',
  hl: '<svg viewBox="0 0 24 24"><path d="M5 19h14"/><path d="M8 15l7-9 3 2-6 9z"/></svg>',
  eraser: '<svg viewBox="0 0 24 24"><path d="M4 16l8-9 7 6-6 7H8z"/><path d="M12 20h8"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
};

/**
 * pages: [{imgId, title, songIdx, songCount, pageIdx, pageCount}]
 */
export function openViewer(pages, start = 0, onClose) {
  const root = document.createElement('div');
  root.className = 'viewer';
  root.innerHTML = `
    <div class="stage">
      <div class="page"><img alt=""><canvas class="ink"></canvas></div>
      <div class="missing hidden">
        <p>이 기기에 이 악보 사진이 없습니다.</p>
        <button class="btn primary" data-act="relink">사진첩에서 다시 고르기</button>
      </div>
    </div>
    <div class="vbar vtop">
      <button class="vbtn" data-act="close">${ICON.close}<span>닫기</span></button>
      <div class="vinfo"></div>
      <button class="vbtn" data-act="mark">${ICON.pen}<span>표시</span></button>
    </div>
    <div class="vbar vbottom"><div class="chips"></div></div>
    <div class="inkbar hidden">
      <button class="tool" data-tool="pen" data-color="#e53935"><i style="background:#e53935"></i>빨강</button>
      <button class="tool" data-tool="pen" data-color="#1e63d6"><i style="background:#1e63d6"></i>파랑</button>
      <button class="tool" data-tool="pen" data-color="#111"><i style="background:#111"></i>검정</button>
      <button class="tool" data-tool="hl">${ICON.hl}형광펜</button>
      <button class="tool" data-tool="eraser">${ICON.eraser}지우개</button>
      <span class="sep"></span>
      <button class="tool" data-act="undo">${ICON.undo}되돌리기</button>
      <button class="tool" data-act="clear">${ICON.trash}모두 지우기</button>
      <span class="sep"></span>
      <button class="tool" data-act="prev">${ICON.prev}</button>
      <span class="inkpage"></span>
      <button class="tool" data-act="next">${ICON.next}</button>
      <button class="tool done" data-act="done">완료</button>
    </div>
    <div class="songtoast hidden"></div>
    <input type="file" accept="image/*" class="hidden" data-role="relink">`;
  document.body.appendChild(root);
  document.body.classList.add('viewing');

  const $ = (s) => root.querySelector(s);
  const stage = $('.stage'), pageEl = $('.page'), img = $('.page img'), canvas = $('.ink');
  const missing = $('.missing'), info = $('.vinfo'), chips = $('.chips'), inkbar = $('.inkbar');
  const toast = $('.songtoast'), inkpage = $('.inkpage'), relinkInput = $('[data-role=relink]');

  let idx = Math.max(0, Math.min(start, pages.length - 1));
  let marking = false;
  let saveTimer = 0, pendingSave = null;
  let barsTimer = 0, toastTimer = 0;
  let wake = null;

  const ink = new InkLayer(canvas, (strokes) => {
    const id = pages[idx].imgId;
    pendingSave = { id, strokes };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushInk, 600);
  });
  ink.enable(false);

  function flushInk() {
    clearTimeout(saveTimer);
    if (!pendingSave) return;
    const { id, strokes } = pendingSave;
    pendingSave = null;
    store.save('i_' + id, 'ink', { s: strokes });
  }

  // 노래 칩 (다른 곡으로 바로 가기)
  const firstPageOfSong = [];
  pages.forEach((p, i) => { if (p.pageIdx === 0) firstPageOfSong[p.songIdx] = i; });
  chips.innerHTML = firstPageOfSong.map((pi, si) =>
    `<button class="chip" data-song="${si}"><b>${si + 1}</b> ${esc(pages[pi].title)}</button>`).join('');

  function layout() {
    const p = pages[idx];
    const sz = sizes.get(p.imgId) || [img.naturalWidth || 1, img.naturalHeight || 1];
    const W = stage.clientWidth, H = stage.clientHeight;
    const k = Math.min(W / sz[0], H / sz[1]);
    const w = Math.round(sz[0] * k), h = Math.round(sz[1] * k);
    pageEl.style.width = w + 'px';
    pageEl.style.height = h + 'px';
    pageEl.style.left = Math.round((W - w) / 2) + 'px';
    pageEl.style.top = Math.round((H - h) / 2) + 'px';
    ink.resize(w, h);
  }

  let showToken = 0;
  async function show(i) {
    flushInk();
    idx = Math.max(0, Math.min(i, pages.length - 1));
    const p = pages[idx];
    const token = ++showToken;
    const u = await imageURL(p.imgId);
    if (token !== showToken) return;
    if (!u) {
      pageEl.classList.add('hidden');
      missing.classList.remove('hidden');
    } else {
      missing.classList.add('hidden');
      pageEl.classList.remove('hidden');
      if (img.getAttribute('src') !== u) {
        const pre = new Image();
        pre.src = u;
        try { await pre.decode(); } catch (e) { /* 그대로 진행 */ }
        if (token !== showToken) return;
        img.src = u;
      }
      const inkData = store.get('i_' + p.imgId);
      ink.setStrokes(inkData && inkData.s);
      layout();
    }
    info.textContent = `${p.songIdx + 1}/${p.songCount}  ${p.title}  ·  ${p.pageIdx + 1}/${p.pageCount}쪽`;
    inkpage.textContent = `${p.pageIdx + 1}/${p.pageCount}쪽`;
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.song) === p.songIdx));
    // 다음 장 미리 불러오기
    for (const j of [idx + 1, idx + 2, idx - 1]) {
      if (pages[j]) imageURL(pages[j].imgId).then((pu) => { if (pu) { const im = new Image(); im.src = pu; } });
    }
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 1600);
  }

  function next() { if (idx < pages.length - 1) show(idx + 1); else showToast('마지막 장입니다'); }
  function prev() { if (idx > 0) show(idx - 1); else showToast('첫 장입니다'); }

  function bars(on) {
    root.classList.toggle('bars', on);
    clearTimeout(barsTimer);
    if (on) barsTimer = setTimeout(() => root.classList.remove('bars'), 4000);
  }

  function setMarking(on) {
    marking = on;
    root.classList.toggle('marking', on);
    inkbar.classList.toggle('hidden', !on);
    ink.enable(on);
    if (on) { bars(false); selectTool(ink.tool.t, ink.tool.c); } else flushInk();
  }

  function selectTool(t, c) {
    ink.tool = { t, c: c || ink.tool.c };
    inkbar.querySelectorAll('[data-tool]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tool === t && (t !== 'pen' || b.dataset.color === ink.tool.c));
    });
  }

  // ---- 터치: 왼쪽 = 이전, 오른쪽 = 다음, 가운데 = 메뉴, 좌우로 밀기 ----
  let down = null;
  stage.addEventListener('pointerdown', (e) => {
    if (marking) return;
    down = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
  });
  stage.addEventListener('pointerup', (e) => {
    if (marking || !down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down = null;
    if (e.target.closest('.missing')) return;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { dx < 0 ? next() : prev(); return; }
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const fx = e.clientX / stage.clientWidth;
    if (fx < 0.33) prev();
    else if (fx > 0.67) next();
    else bars(!root.classList.contains('bars'));
  });
  stage.addEventListener('pointercancel', () => { down = null; });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const act = b.dataset.act;
    if (b.dataset.song != null) { show(firstPageOfSong[Number(b.dataset.song)]); bars(true); return; }
    if (b.dataset.tool) { selectTool(b.dataset.tool, b.dataset.color); return; }
    if (act === 'close') close();
    else if (act === 'mark') setMarking(true);
    else if (act === 'done') setMarking(false);
    else if (act === 'undo') ink.undo();
    else if (act === 'clear') { if (confirm('이 장의 표시를 모두 지울까요?')) ink.clear(); }
    else if (act === 'prev') prev();
    else if (act === 'next') next();
    else if (act === 'relink') relinkInput.click();
  });

  relinkInput.addEventListener('change', async () => {
    const f = relinkInput.files && relinkInput.files[0];
    relinkInput.value = '';
    if (!f) return;
    const id = pages[idx].imgId;
    const r = await processFile(f);
    await db.putImage({ id, ...r });
    forgetImage(id);
    show(idx);
  });

  function onKey(e) {
    if (marking && !['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp'].includes(e.key)) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  async function lockScreen() {
    try { if (navigator.wakeLock && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
  }
  const onVis = () => { if (document.visibilityState === 'visible') lockScreen(); else flushInk(); };
  document.addEventListener('visibilitychange', onVis);
  lockScreen();

  let closed = false, fsMine = false;
  function close() {
    if (closed) return;
    closed = true;
    release();
    flushInk();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    document.removeEventListener('visibilitychange', onVis);
    try { wake && wake.release(); } catch (e) { /* 무시 */ }
    if (fsMine && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.body.classList.remove('viewing');
    root.remove();
    onClose && onClose();
  }

  const release = guardBack(close);
  // 안드로이드: 위 상태 막대·아래 버튼 줄까지 숨겨 악보를 최대한 크게 (아이패드·아이폰은 홈 화면 앱이면 이미 꽉 참)
  const android = /Android/i.test(navigator.userAgent);
  if (android && document.fullscreenEnabled && !document.fullscreenElement) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => { fsMine = true; }).catch(() => {});
  }
  show(idx);
  bars(true);
  return { close };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
