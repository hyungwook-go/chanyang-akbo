// 찬양팀 악보 (배포용) — 화면 (예배 순서 / 악보함 / 등록·편집 / 설정)
import * as store from './store.mjs';
import * as db from './db.mjs';
import { searchSongs, normalize } from './search.mjs';
import { readTitle, warmUp } from './ocr.mjs';
import { processFile, HEAD } from './image.mjs';
import { openViewer, forgetImage } from './viewer.mjs';
import { sundayOf, sundayName, listDate, needsNewWeek, startEntries, oldLists } from './weekly.mjs';
import { guardBack } from './back.mjs';
import { unlocked, askPassword, showInstallOnly } from './gate.mjs';

window.AKBO_VERSION = '1.0.6';
const main = document.getElementById('main');
const LS_TAB = 'chanyang.tab', LS_LIST = 'chanyang.list', LS_INSTALL = 'chanyang.install', LS_WELCOME = 'chanyang.welcome';
let tab = localStorage.getItem(LS_TAB) === 'library' ? 'library' : 'order';
let libQuery = '';
let viewerOpen = false;

const ICON = {
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><path d="M5 8h14M5 12h14M5 16h14"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  play: '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M8 5v14l11-7z"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M9 3h6l-1 7 4 4H6l4-4z"/><path d="M12 14v7"/></svg>',
  photo: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
};

// ---------- 작은 도구 ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
let toastTimer = 0;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
}
function busy(text) {
  const b = el(`<div class="busy"><div class="busybox"><div class="busytext">${esc(text)}</div><div class="bar"><i></i></div></div></div>`);
  document.body.appendChild(b);
  const t = b.querySelector('.busytext'), bar = b.querySelector('.bar i');
  return {
    set: (txt, frac) => { t.textContent = txt; if (frac != null) bar.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%'; },
    done: () => b.remove(),
  };
}

// 악보 사진 크게 보기 (화면 가득, [크게] 누르면 확대해서 밀어 보기)
function openPreview(url, title = '', onClose) {
  const ov = el(`
    <div class="preview">
      <div class="pvbar"><span>${esc(title)}</span>
        <button class="btn" data-act="zoom">크게</button>
        <button class="btn primary" data-act="close">닫기</button></div>
      <div class="pvbody"><img alt=""></div>
    </div>`);
  ov.querySelector('img').src = url;
  const zoomBtn = ov.querySelector('[data-act=zoom]');
  const toggle = () => { const z = ov.classList.toggle('zoomed'); zoomBtn.textContent = z ? '화면에 맞추기' : '크게'; };
  let closed = false;
  const close = () => { if (closed) return; closed = true; release(); ov.remove(); onClose && onClose(); };
  const release = guardBack(close);
  ov.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    else if (act === 'zoom' || e.target.tagName === 'IMG') toggle();
  });
  document.body.appendChild(ov);
}
// 이 기기에 있는 악보 사진 한 장을 크게 보기
async function previewImage(imgId, title) {
  const rec = await db.getImage(imgId);
  if (!rec) return false;
  const u = URL.createObjectURL(rec.blob);
  openPreview(u, title, () => URL.revokeObjectURL(u));
  return true;
}
// 한 곡의 악보를 쪽마다 넘겨 가며 크게 보기 (같은 제목의 다른 악보인지 확인용)
// onAdd가 있으면 위에 [＋ 추가] 버튼을 보여 줌
async function previewSong(s, onAdd) {
  const pages = (s.pages || []).slice();
  if (!pages.length) { toast('이 곡은 아직 사진이 없습니다'); return; }
  const sub = [`${pages.length}쪽`, s.keywords].filter(Boolean).join(' · ');
  const ov = el(`
    <div class="preview">
      <div class="pvbar"><span>${esc(s.title)}<small>${esc(sub)}</small></span>
        ${pages.length > 1 ? `<button class="btn" data-act="prev" aria-label="앞 쪽">‹</button><b class="pvnum"></b><button class="btn" data-act="next" aria-label="다음 쪽">›</button>` : ''}
        <button class="btn" data-act="zoom">크게</button>
        ${onAdd ? `<button class="btn primary" data-act="add">＋ 추가</button>` : ''}
        <button class="btn ${onAdd ? '' : 'primary'}" data-act="close">닫기</button></div>
      <div class="pvbody"><img alt=""></div>
    </div>`);
  const img = ov.querySelector('img'), num = ov.querySelector('.pvnum'), body = ov.querySelector('.pvbody');
  const zoomBtn = ov.querySelector('[data-act=zoom]');
  let i = 0, url = null;
  const show = async (k) => {
    i = Math.max(0, Math.min(pages.length - 1, k));
    if (num) num.textContent = `${i + 1}/${pages.length}`;
    const rec = await db.getImage(pages[i]);
    if (url) URL.revokeObjectURL(url);   // 한 장씩만 열어 기기 메모리를 아낌
    url = rec ? URL.createObjectURL(rec.blob) : null;
    img.src = url || '';
    body.scrollTop = 0; body.scrollLeft = 0;
  };
  let closed = false;
  const close = () => { if (closed) return; closed = true; release(); ov.remove(); if (url) URL.revokeObjectURL(url); };
  const release = guardBack(close);
  ov.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    else if (act === 'prev') show(i - 1);
    else if (act === 'next') show(i + 1);
    else if (act === 'add') { close(); onAdd(); }
    else if (act === 'zoom' || e.target === img) {
      const z = ov.classList.toggle('zoomed'); zoomBtn.textContent = z ? '화면에 맞추기' : '크게';
    }
  });
  document.body.appendChild(ov);
  await show(0);
}
function photoError(err) {
  return err && err.name === 'QuotaExceededError'
    ? '기기 저장 공간이 모자라 사진을 더 넣지 못했습니다. 기기의 사진·앱을 정리하거나, 다 쓴 특별 예배·악보를 지운 뒤 다시 해 보세요.'
    : '사진을 넣지 못했습니다: ' + (err && err.message);
}
function pickPhotos(multiple, onFiles) {
  const input = el(`<input type="file" accept="image/*" ${multiple ? 'multiple' : ''} class="hidden">`);
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const files = [...(input.files || [])];
    input.remove();
    if (files.length) onFiles(files);
  });
  input.addEventListener('cancel', () => input.remove());
  input.click(); // 반드시 터치 처리 안에서 바로 불러야 사진첩이 열립니다
}

// 목록용 작은 그림
const thumbs = new Map();
async function thumbURL(id) {
  if (thumbs.has(id)) return thumbs.get(id);
  const rec = await db.getImage(id);
  const u = rec ? URL.createObjectURL(rec.thumb || rec.blob) : '';
  thumbs.set(id, u);
  return u;
}
function forgetThumb(id) {
  const u = thumbs.get(id);
  if (u) URL.revokeObjectURL(u);
  thumbs.delete(id);
  forgetImage(id);
}
function fillThumbs(root) {
  root.querySelectorAll('[data-thumb]').forEach(async (n) => {
    const u = await thumbURL(n.dataset.thumb);
    if (u) n.style.backgroundImage = `url("${u}")`;
  });
}

function nextSundayName() { return sundayName(sundayOf()); }
function latestList() {
  return store.all('list').filter((l) => !l.special).sort((a, b) => listDate(b).localeCompare(listDate(a)) || (b.created || 0) - (a.created || 0))[0] || null;
}

// ---------- 데이터 ----------
// 곡 정보와 그 곡의 사진 목록('g_곡id')을 합쳐 씁니다
function pagesOf(id) { return store.get('g_' + id)?.pages || []; }
function song(id) { const s = store.get(id); return s ? { id, ...s, pages: pagesOf(id) } : null; }
function allSongs() { return store.all('song').map((s) => ({ ...s, pages: pagesOf(s.id) })); }
async function setPages(id, ids) {
  if (ids.length) await store.save('g_' + id, 'pages', { pages: ids, at: Date.now() });
  else await store.remove('g_' + id);
}
// 앱이 가지고 있던 사진 사본과 그 위의 표시를 지웁니다 (사진첩 원본은 그대로)
async function dropImages(ids) {
  for (const p of ids) {
    await db.deleteImage(p);
    forgetThumb(p);
    if (store.get('i_' + p)) await store.remove('i_' + p);
  }
}
async function importFiles(files) {
  const b = busy('사진 준비 중…');
  const ids = [];
  try {
    for (let i = 0; i < files.length; i++) {
      b.set(`사진 준비 중… ${i + 1}/${files.length}`, i / files.length);
      const r = await processFile(files[i]);
      const id = store.uid('p_');
      await db.putImage({ id, ...r });
      ids.push(id);
      b.set(`사진 준비 중… ${i + 1}/${files.length}`, (i + 1) / files.length);
    }
  } catch (err) {
    alert(photoError(err));
  }
  b.done();
  return ids;
}
// 사진첩에서 이 곡 악보 사진을 바로 고르기 (전에 고른 사진은 바꿈). 반드시 터치 처리 안에서 바로 부릅니다.
function quickPick(songId) {
  pickPhotos(true, async (files) => {
    const ids = await importFiles(files);
    if (!ids.length) return;
    const old = pagesOf(songId);
    await setPages(songId, ids);
    await dropImages(old);
    toast(`악보 사진 ${ids.length}장을 넣었습니다`);
    if (!viewerOpen && !sheets.length) render();
  });
}

function currentList() {
  let id = localStorage.getItem(LS_LIST);
  let l = id && store.get(id);
  if (!l) {
    const lists = store.all('list').sort((a, b) => (!!a.special - !!b.special) || (b.created || 0) - (a.created || 0));
    if (!lists.length) return null;
    id = lists[0].id;   // 매주 순서를 먼저
    l = store.get(id);
    localStorage.setItem(LS_LIST, id);
  }
  return { id, ...l, entries: (l.entries || []).slice() };
}
async function saveList(l) {
  const { id, name, entries, created, date, special } = l;
  await store.save(id, 'list', special ? { name, entries, created, special: true } : { name, entries, created, date: date || listDate(l) });
}
async function newList() {
  const id = store.uid('l_');
  const prev = latestList();
  const data = { name: nextSundayName(), date: sundayOf(), entries: startEntries(allSongs(), prev && prev.entries, store.uid), created: Date.now() };
  await store.save(id, 'list', data);
  localStorage.setItem(LS_LIST, id);
  return { id, ...data };
}
async function ensureList() { return currentList() || newList(); }

// 특별 예배: 매주 순서와 따로. 자동으로 만들거나 지우지 않고, 예배가 끝나면 직접 지웁니다.
async function newSpecial() {
  const name = prompt('특별 예배 이름 (예: 부활절 예배, 결혼식, 수련회)', '특별 예배');
  if (name == null) return;
  const id = store.uid('l_');
  await store.save(id, 'list', { name: name.trim() || '특별 예배', special: true, entries: [], created: Date.now() });
  localStorage.setItem(LS_LIST, id);
  tab = 'order';
  render();
  toast('특별 예배 순서를 만들었습니다 — 곡 추가로 곡을 넣으세요');
}
// 이번 주 매주 순서로 돌아가기 (없으면 만듦)
async function toWeekList() {
  const want = sundayOf();
  const l = store.all('list').filter((x) => !x.special && listDate(x) >= want).sort((a, b) => listDate(a).localeCompare(listDate(b)))[0];
  if (l) localStorage.setItem(LS_LIST, l.id); else await newList();
  render();
}
async function deleteSpecial(id) {
  const l = store.get(id);
  if (!l) return false;
  if (!confirm(`‘${l.name}’ 특별 예배 순서를 지울까요?\n악보함의 곡은 그대로 남습니다.`)) return false;
  await store.remove(id);
  if (localStorage.getItem(LS_LIST) === id) { localStorage.removeItem(LS_LIST); await toWeekList(); }
  toast('특별 예배 순서를 지웠습니다');
  return true;
}
async function addToList(songId) {
  const l = await ensureList();
  l.entries.push({ k: store.uid('e_'), song: songId });
  await saveList(l);
  return l.entries.length;
}

// 주가 바뀌면: 고정곡을 넣은 이번 주 순서를 만들고, 오래된 순서(8주)를 정리합니다.
// 악보함 곡의 사진은 저절로 지우지 않습니다 (곡을 지우거나 사진을 바꿀 때만 지움).
async function weekTick() {
  if (viewerOpen || sheets.length) return;   // 반주 중이거나 등록 중에는 건드리지 않음
  let made = null;
  const lists = store.all('list');
  if ((lists.length || allSongs().some((s) => s.fixed)) && needsNewWeek(lists)) {
    const keepSpecial = currentList()?.special ? localStorage.getItem(LS_LIST) : null;
    made = await newList();
    if (keepSpecial) localStorage.setItem(LS_LIST, keepSpecial);   // 특별 예배를 준비 중이면 그 화면 그대로
  }

  for (const id of oldLists(store.all('list'))) {
    await store.remove(id);
    if (localStorage.getItem(LS_LIST) === id) localStorage.removeItem(LS_LIST);
  }
  // 어느 곡에도 쓰이지 않는 사진 사본과 표시 (지운 곡의 남은 찌꺼기)
  const used = new Set();
  for (const s of allSongs()) for (const p of s.pages) used.add(p);
  for (const id of await db.imageIds()) if (!used.has(id)) { await db.deleteImage(id); forgetThumb(id); }
  for (const it of store.all('ink')) if (!used.has(it.id.slice(2))) await store.remove(it.id);

  if (made) render();
  if (made) toast(`${made.name} 순서를 만들었습니다` + (made.entries.length ? ` · 고정곡 ${made.entries.length}곡` : ''));
}

// 매주 고정 켜기/끄기: 고정한 곡은 다음 주 새 순서에도 자동으로 들어가 있습니다.
// 고정할 때 이번 주 순서에 없으면 맨 끝에 넣어 줍니다.
async function setFixed(s, on) {
  const cur = store.get(s.id);
  if (!cur) return;
  const data = { ...cur };
  if (on) { data.fixed = true; data.fixedAt = Date.now(); } else { delete data.fixed; delete data.fixedAt; }
  await store.save(s.id, 'song', data);
  if (!on) return;
  const l = currentList();
  if (!l || listDate(l) < sundayOf() || l.entries.some((e) => e.song === s.id)) return;
  l.entries.push({ k: store.uid('e_'), song: s.id });
  await saveList(l);
}

function buildPages(entries) {
  const valid = [];
  entries.forEach((e, i) => {
    const s = song(e.song);
    if (s && s.pages && s.pages.length) valid.push({ i, s });
  });
  const pages = [];
  valid.forEach((x, si) => x.s.pages.forEach((imgId, pi) => pages.push({
    imgId, title: x.s.title, songIdx: si, songCount: valid.length, pageIdx: pi, pageCount: x.s.pages.length,
  })));
  return { pages, valid };
}

function play(entries, startEntry = 0) {
  const { pages, valid } = buildPages(entries);
  const missing = entries.filter((e) => { const s = song(e.song); return s && !s.pages.length; }).length;
  if (!pages.length) { toast(missing ? '곡 옆의 [사진 고르기]로 사진첩에서 악보를 고르세요' : '보여 줄 악보가 없습니다'); return; }
  if (missing) toast(`사진을 고르지 않은 ${missing}곡은 건너뜁니다`);
  let si = valid.findIndex((v) => v.i >= startEntry);
  if (si < 0) si = 0;
  const start = pages.findIndex((p) => p.songIdx === si);
  viewerOpen = true;
  openViewer(pages, Math.max(0, start), () => { viewerOpen = false; render(); });
}

async function deleteSong(s) {
  await dropImages(s.pages || []);
  await store.remove('g_' + s.id);
  for (const l of store.all('list')) {
    const left = (l.entries || []).filter((e) => e.song !== s.id);
    if (left.length !== (l.entries || []).length) await saveList({ ...l, entries: left });
  }
  await store.remove(s.id);
}

// ---------- 위 막대 ----------
function renderTop() {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
}

document.querySelector('.top').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; localStorage.setItem(LS_TAB, tab); render(); window.scrollTo(0, 0); return; }
  if (e.target.closest('[data-act=settings]')) openSettings();
});

// ---------- 화면 그리기 ----------
function render() {
  renderTop();
  if (tab === 'order') renderOrder(); else renderLibrary();
}

function songRow(s, opts = {}) {
  const pages = (s.pages || []).length;
  const sub = [opts.num == null && s.fixed ? '📌 매주 고정' : '', pages ? `${pages}쪽` : '사진 없음', s.keywords].filter(Boolean).join(' · ');
  if (!pages && opts.pick !== false) {
    opts = { ...opts, tapAct: 'pick-photos', right: `<button class="addbtn" data-act="pick-photos">${ICON.photo} 사진 고르기</button>` + (opts.right || '') };
  }
  return `
    <div class="row" data-id="${esc(s.id)}" ${opts.key ? `data-key="${esc(opts.key)}"` : ''}>
      ${opts.num != null ? `<span class="iconbtn handle" aria-label="순서 옮기기">${ICON.grip}</span><span class="num">${opts.num}</span>` : ''}
      <span class="thumb" ${s.pages && s.pages[0] ? `data-thumb="${esc(s.pages[0])}"` : ''}></span>
      <button class="title" data-act="${opts.tapAct || 'view'}"><b>${esc(s.title)}</b><span>${esc(sub)}</span></button>
      ${opts.right || ''}
    </div>`;
}

function renderOrder() {
  const l = currentList();
  if (!l) {
    main.innerHTML = `
      <div class="empty">
        <p>아직 예배 순서가 없습니다.</p>
        <button class="btn primary big" data-act="new-list">${ICON.plus} 새 예배 순서 만들기</button>
      </div>`;
    return;
  }
  const rows = l.entries.map((e, i) => {
    const s = song(e.song);
    if (!s) return `<div class="row" data-key="${esc(e.k)}"><span class="iconbtn handle">${ICON.grip}</span><span class="num">${i + 1}</span><span class="title muted">지워진 악보</span><button class="iconbtn" data-act="remove-entry" aria-label="빼기">${ICON.close}</button></div>`;
    const pin = `<button class="iconbtn pin ${s.fixed ? 'on' : ''}" data-act="pin" aria-label="매주 고정">${ICON.pin}</button>`;
    return songRow(s, { num: i + 1, key: e.k, tapAct: 'play-from', right: pin + `<button class="iconbtn" data-act="remove-entry" aria-label="빼기">${ICON.close}</button>` });
  }).join('');
  const canPlay = buildPages(l.entries).pages.length > 0;
  main.innerHTML = `
    <div class="listhead">${l.special ? `
      <button class="listname" data-act="rename-list"><span class="badge">특별 예배</span>${esc(l.name)}<small>이름 바꾸기</small></button>
      <button class="btn" data-act="to-week">이번 주 순서로</button>
      <button class="btn danger" data-act="del-special">예배 끝 · 지우기</button>` : `
      <button class="listname" data-act="rename-list">${esc(l.name)}<small>이름 바꾸기</small></button>
      <button class="btn" data-act="lists">지난 순서</button>
      <button class="btn" data-act="new-special">★ 특별 예배</button>`}
    </div>
    <div class="rows" id="orderRows">${rows || '<div class="empty card">아래 <b>곡 추가</b>를 눌러 이번 예배에 칠 곡을 넣으세요.</div>'}</div>
    <div class="orderactions">
      <button class="btn primary" data-act="add-songs">${ICON.plus} 곡 추가</button>
    </div>
    <div class="startbar"><button class="btn primary big" data-act="play" ${canPlay ? '' : 'disabled'}>${ICON.play} 반주 시작</button></div>`;
  fillThumbs(main);
  enableDrag(main.querySelector('#orderRows'), async (from, to) => {
    const cur = currentList();
    const [m] = cur.entries.splice(from, 1);
    cur.entries.splice(to, 0, m);
    await saveList(cur);
    render();
  });
}

function renderLibrary() {
  if (!main.querySelector('#libResults')) {
    main.innerHTML = `
      <div class="libtools">
        <label class="search">${ICON.search}<input id="libSearch" type="search" placeholder="곡 제목 · 초성(ㅈㄱㅎ) · 찬송가 번호" autocomplete="off" autocorrect="off" spellcheck="false"></label>
        <button class="btn primary" data-act="new-song">${ICON.plus} 새 악보 등록</button>
      </div>
      <div class="count" id="libCount"></div>
      <div class="rows" id="libResults"></div>`;
    const input = main.querySelector('#libSearch');
    input.value = libQuery;
    input.addEventListener('input', () => { libQuery = input.value; renderLibResults(); });
  }
  renderLibResults();
}

function renderLibResults() {
  const box = main.querySelector('#libResults');
  if (!box) return;
  const songs = allSongs();
  const found = searchSongs(songs, libQuery);
  main.querySelector('#libCount').textContent = libQuery ? `${found.length}곡 찾음 (전체 ${songs.length}곡)` : `악보 ${songs.length}곡`;
  box.innerHTML = found.length
    ? found.map((s) => songRow(s, { right: `<button class="addbtn" data-act="add-one">＋ 순서에</button><button class="iconbtn" data-act="song-menu" aria-label="더보기">${ICON.more}</button>` })).join('')
    : `<div class="empty card">${songs.length ? '찾는 곡이 없습니다. <b>새 악보 등록</b>으로 추가하세요.' : '담당자가 <b>카카오톡</b>으로 보낸 악보 사진을 먼저 <b>사진첩(갤러리)에 저장</b>하세요.<br>그다음 <b>새 악보 등록</b>을 눌러 여러 장을 한꺼번에 고르면 제목을 자동으로 읽어 넣습니다.'}</div>`;
  fillThumbs(box);
}

// 화면 안 버튼들
main.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const row = b.closest('.row');
  if (act === 'new-list') { await newList(); tab = 'order'; render(); toast('새 예배 순서를 만들었습니다'); }
  else if (act === 'rename-list') {
    const l = currentList();
    const name = prompt('예배 순서 이름', l.name);
    if (name && name.trim()) { l.name = name.trim(); await saveList(l); render(); }
  }
  else if (act === 'lists') openLists();
  else if (act === 'new-special') newSpecial();
  else if (act === 'to-week') toWeekList();
  else if (act === 'del-special') deleteSpecial(currentList().id);
  else if (act === 'add-songs') openAddSongs();
  else if (act === 'play') play(currentList().entries);
  else if (act === 'play-from') {
    const l = currentList();
    play(l.entries, l.entries.findIndex((x) => x.k === row.dataset.key));
  }
  else if (act === 'remove-entry') {
    const l = currentList();
    l.entries = l.entries.filter((x) => x.k !== row.dataset.key);
    await saveList(l);
    render();
  }
  else if (act === 'view') { const s = song(row.dataset.id); if (s) play([{ k: 'x', song: s.id }]); }
  else if (act === 'add-one') {
    const n = await addToList(row.dataset.id);
    toast(`예배 순서 ${n}번째에 넣었습니다`);
  }
  else if (act === 'song-menu') openSongMenu(song(row.dataset.id));
  else if (act === 'pick-photos') quickPick(row.dataset.id);
  else if (act === 'pin') {
    const s = song(row.dataset.id);
    if (!s) return;
    await setFixed(s, !s.fixed);
    render();
    toast(s.fixed ? '고정을 풀었습니다' : '📌 고정했습니다 — 다음 주에도 자동으로 들어갑니다');
  }
  else if (act === 'new-song') startNewSongs();
});

// 순서 끌어 옮기기 (☰ 손잡이)
function enableDrag(rowsEl, onMove) {
  if (!rowsEl) return;
  rowsEl.addEventListener('pointerdown', (e) => {
    const hd = e.target.closest('.handle');
    if (!hd) return;
    e.preventDefault();
    const row = hd.closest('.row');
    const rows = [...rowsEl.querySelectorAll('.row')];
    const from = rows.indexOf(row);
    const step = row.offsetHeight + 8;
    const y0 = e.clientY;
    let to = from;
    row.classList.add('dragging');
    hd.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const dy = ev.clientY - y0;
      row.style.transform = `translateY(${dy}px)`;
      to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / step)));
      rows.forEach((r, i) => {
        if (r === row) return;
        let s = 0;
        if (from < to && i > from && i <= to) s = -step;
        if (from > to && i < from && i >= to) s = step;
        r.style.transition = 'transform .12s';
        r.style.transform = s ? `translateY(${s}px)` : '';
      });
    };
    const up = () => {
      hd.removeEventListener('pointermove', mv);
      hd.removeEventListener('pointerup', up);
      hd.removeEventListener('pointercancel', up);
      rows.forEach((r) => { r.style.transform = ''; r.style.transition = ''; });
      row.classList.remove('dragging');
      if (to !== from) onMove(from, to);
    };
    hd.addEventListener('pointermove', mv);
    hd.addEventListener('pointerup', up);
    hd.addEventListener('pointercancel', up);
  });
}

// ---------- 아래에서 올라오는 창 ----------
const sheets = [];
function openSheet(title, bodyHTML, footHTML) {
  const wrap = el(`
    <div class="sheetwrap">
      <div class="sheet" role="dialog">
        <div class="sheethead"><h2>${esc(title)}</h2><button class="iconbtn" data-close aria-label="닫기">${ICON.close}</button></div>
        <div class="sheetbody">${bodyHTML}</div>
        ${footHTML ? `<div class="sheetfoot">${footHTML}</div>` : ''}
      </div>
    </div>`);
  const api = {
    root: wrap,
    body: wrap.querySelector('.sheetbody'),
    $: (s) => wrap.querySelector(s),
    onClose: null,
    closed: false,
    close() {
      if (api.closed) return;
      api.closed = true;
      release();
      wrap.remove();
      sheets.splice(sheets.indexOf(api), 1);
      api.onClose && api.onClose();
      render();
    },
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) api.close();
  });
  document.body.appendChild(wrap);
  sheets.push(api);
  const release = guardBack(() => api.close());
  return api;
}

// 곡 추가 (예배 순서에서)
function openAddSongs() {
  const sh = openSheet('곡 추가', `
    <label class="search">${ICON.search}<input type="search" placeholder="곡 제목 · 초성(ㅈㄱㅎ) · 찬송가 번호" autocomplete="off" autocorrect="off" spellcheck="false"></label>
    <div class="rows" style="margin-top:12px"></div>`,
    `<button class="btn" data-act="new-song">${ICON.plus} 새 악보 등록</button><span class="grow"></span><button class="btn primary" data-close>완료</button>`);
  const input = sh.$('input'), box = sh.$('.rows');
  const draw = () => {
    const found = searchSongs(allSongs(), input.value);
    box.innerHTML = found.length
      ? found.map((s) => songRow(s, { tapAct: 'peek', pick: false, right: `<button class="addbtn" data-act="add">＋ 추가</button>` })).join('')
      : `<div class="empty">${allSongs().length ? '찾는 곡이 없습니다.' : '등록된 악보가 없습니다.'}<br><b>새 악보 등록</b>으로 사진첩(갤러리)에서 넣으세요.</div>`;
    fillThumbs(box);
  };
  input.addEventListener('input', draw);
  const add = async (row) => {
    const noPhoto = !pagesOf(row.dataset.id).length;
    if (noPhoto) quickPick(row.dataset.id);   // 사진이 없으면 바로 사진첩을 엶
    const n = await addToList(row.dataset.id);
    row.classList.add('added');
    toast(noPhoto ? `${n}번째로 넣었습니다 — 사진첩에서 악보를 고르세요` : `${n}번째로 넣었습니다`);
  };
  sh.root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    const row = e.target.closest('.row');
    // [＋ 추가] 버튼만 순서에 넣고, 곡 줄의 다른 곳(그림·제목)은 악보를 크게 보여 줌
    if (b && b.dataset.act === 'add') { add(row); return; }
    if (row && (!b || b.dataset.act === 'peek')) { previewSong(song(row.dataset.id), () => add(row)); return; }
    if (!b) return;
    if (b.dataset.act === 'new-song') {
      startNewSongs({ onSaved: async (ids) => { for (const id of ids) await addToList(id); toast(`${ids.length}곡을 등록하고 순서에 넣었습니다`); draw(); } });
    }
  });
  draw();
}

// 곡 메뉴 (악보함 ⋯)
function openSongMenu(s) {
  if (!s) return;
  const sh = openSheet(s.title, `
    <div class="menu">
      <button class="btn" data-act="view">악보 보기 · 표시하기</button>
      <button class="btn" data-act="add">예배 순서에 넣기</button>
      <button class="btn" data-act="fix">${s.fixed ? '📌 매주 고정 풀기' : '📌 매주 고정 (다음 주에도 자동으로 불러오기)'}</button>
      <button class="btn" data-act="repick">사진첩에서 악보 사진 새로 고르기</button>
      <button class="btn" data-act="edit">제목 · 사진 고치기</button>
      <button class="btn danger" data-act="del">이 악보 지우기</button>
    </div>`);
  sh.root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    const act = btn?.dataset.act;
    if (!act) return;
    if (act === 'fix') {
      await setFixed(s, !s.fixed);
      sh.close();
      toast(s.fixed ? '고정을 풀었습니다' : '📌 고정했습니다 — 다음 주에도 자동으로 들어갑니다');
    }
    else if (act === 'view') { sh.close(); play([{ k: 'x', song: s.id }]); }
    else if (act === 'add') { const n = await addToList(s.id); sh.close(); toast(`예배 순서 ${n}번째에 넣었습니다`); }
    else if (act === 'edit') { sh.close(); openEditor(s); }
    else if (act === 'repick') { sh.close(); quickPick(s.id); }
    else if (act === 'del') {
      if (!confirm(`‘${s.title}’ 악보를 지울까요?\n예배 순서에서도 빠집니다. (사진첩의 원본 사진은 그대로 있습니다)`)) return;
      await deleteSong(s);
      sh.close();
      toast('지웠습니다');
    }
  });
}

// 새 악보 등록: 사진 여러 장을 한꺼번에. 사진마다 맨 위의 제목을 자동으로 읽어 넣습니다.
// 같은 제목의 곡이 이미 있으면 새 곡을 만들지 않고 그 곡의 사진만 바꿉니다.
function startNewSongs(opts = {}) {
  pickPhotos(true, (files) => openBatch(files, opts));   // 터치 처리 안에서 바로 사진첩을 엶
  warmUp();
}

function openBatch(files, opts = {}) {
  const cards = files.map(() => ({ id: null, title: '', touched: false, join: false, dropped: false, done: false }));
  let saved = false, closed = false;
  const sh = openSheet(`새 악보 등록 · 사진 ${files.length}장`, `
    <p class="small muted" style="margin:0 0 12px">사진 맨 위의 제목을 자동으로 읽어 넣습니다. 틀린 제목은 눌러서 고쳐 주세요.
    2쪽 이상인 곡은 둘째 장에서 <b>앞 곡에 이어 붙이기</b>를 누르세요.</p>
    <div class="bprog"><div class="bprogtext">사진 준비 중…</div><div class="bar"><i></i></div></div>
    <div class="batch">${cards.map((c, i) => `
      <div class="bcard" data-i="${i}">
        <button class="bstrip hidden" data-act="preview" aria-label="크게 보기"><span>눌러서 크게 보기</span></button>
        <div class="brow">
        <button class="bthumb" data-act="preview" aria-label="크게 보기"></button>
        <div class="bmain">
          <div class="bjoin hidden">↑ 앞 곡의 다음 쪽</div>
          <input class="btitle" placeholder="사진 준비 중…" autocomplete="off" autocorrect="off" spellcheck="false">
          <div class="bnote small muted"></div>
        </div>
        <div class="bside">
          ${i > 0 ? '<button class="btn small" data-act="join">앞 곡에 이어 붙이기</button>' : ''}
          <button class="iconbtn" data-act="drop" aria-label="빼기">${ICON.close}</button>
        </div>
        </div>
      </div>`).join('')}
    </div>`,
    `<button class="btn" data-close>취소</button><span class="grow"></span><button class="btn primary" data-act="save" disabled>저장</button>`);
  const cardEl = (i) => sh.$(`.bcard[data-i="${i}"]`);
  const saveBtn = sh.$('[data-act=save]');
  const progText = sh.$('.bprogtext'), progBar = sh.$('.bprog .bar i');
  const setProg = (t, f) => { progText.textContent = t; progBar.style.width = Math.round(f * 100) + '%'; };

  function existingFor(title) {
    const n = normalize(title);
    return n ? allSongs().find((s) => normalize(s.title) === n) : null;
  }
  // 이어 붙인 장은 앞 곡의 쪽으로, 나머지는 각각 한 곡
  function heads() {
    const out = [];
    cards.forEach((c, i) => {
      if (c.dropped) return;
      if (c.join && out.length) out[out.length - 1].pages.push(i);
      else out.push({ i, pages: [i] });
    });
    return out;
  }
  function refresh() {
    const hs = heads();
    const headOf = new Map();
    hs.forEach((h) => h.pages.forEach((i) => headOf.set(i, h)));
    cards.forEach((c, i) => {
      const el = cardEl(i);
      if (c.dropped) { el.classList.add('hidden'); return; }
      const h = headOf.get(i);
      const isHead = h.i === i;
      el.classList.toggle('joined', !isHead);
      el.querySelector('.bstrip').classList.toggle('hidden', !isHead || !c.url);
      el.querySelector('.btitle').classList.toggle('hidden', !isHead);
      el.querySelector('.bjoin').classList.toggle('hidden', isHead);
      const jb = el.querySelector('[data-act=join]');
      if (jb) jb.textContent = isHead ? '앞 곡에 이어 붙이기' : '따로 떼기';
      const note = el.querySelector('.bnote');
      if (!isHead) { note.textContent = ''; return; }
      if (!c.done) { note.textContent = ''; return; }
      const ex = existingFor(c.title);
      const pages = h.pages.length > 1 ? ` · ${h.pages.length}쪽` : '';
      note.textContent = !c.title.trim() ? '제목을 입력해 주세요' : ex ? `이미 있는 곡 — 사진만 새 것으로 바꿉니다${pages}` : `새 곡${pages}`;
      note.classList.toggle('upd', !!ex);
    });
    const left = cards.filter((c) => !c.dropped && !c.done).length;
    saveBtn.disabled = left > 0 || !hs.length;
    saveBtn.textContent = hs.length ? `${hs.length}곡 저장` : '저장';
  }

  sh.root.addEventListener('input', (e) => {
    const el = e.target.closest('.bcard');
    if (!el || !e.target.classList.contains('btitle')) return;
    const c = cards[Number(el.dataset.i)];
    c.title = e.target.value;
    c.touched = true;
    refresh();
  });
  sh.root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const el = b.closest('.bcard');
    const i = el ? Number(el.dataset.i) : -1;
    if (b.dataset.act === 'preview') {
      const c = cards[i];
      if (c.blob) { const u = URL.createObjectURL(c.blob); openPreview(u, c.title || `사진 ${i + 1}`, () => URL.revokeObjectURL(u)); }
    }
    else if (b.dataset.act === 'join') { cards[i].join = !cards[i].join; refresh(); }
    else if (b.dataset.act === 'drop') { cards[i].dropped = true; refresh(); }
    else if (b.dataset.act === 'save') save();
  });

  async function run() {
    let ocrOK = true;
    for (let i = 0; i < files.length; i++) {
      if (closed) return;
      const c = cards[i], el = cardEl(i), input = el.querySelector('.btitle');
      setProg(`사진 ${i + 1}/${files.length} 준비 중…`, i / files.length);
      let r;
      try {
        r = await processFile(files[i]);
        const id = store.uid('p_');
        await db.putImage({ id, ...r });
        c.id = id;
      } catch (err) {
        c.dropped = true; c.done = true;
        toast('사진을 열지 못해 뺐습니다');
        refresh();
        continue;
      }
      if (closed) { await db.deleteImage(c.id); return; }
      c.thumbUrl = URL.createObjectURL(r.thumb || r.blob);
      c.blob = r.blob;                                  // 원본은 크게 볼 때만 엶
      c.url = URL.createObjectURL(r.head || r.blob);    // 화면에는 제목 부분 작은 사본
      el.querySelector('.bthumb').style.backgroundImage = `url("${c.thumbUrl}")`;
      const strip = el.querySelector('.bstrip');
      strip.style.backgroundImage = `url("${c.url}")`;
      strip.style.aspectRatio = `${r.w} / ${Math.max(1, Math.round(r.h * 0.28))}`;
      refresh();
      if (!c.touched) input.placeholder = '제목 읽는 중…';
      let title = '';
      if (ocrOK) {
        setProg(i === 0 ? '제목 읽는 중… (처음 한 번은 조금 걸립니다)' : `제목 읽는 중… ${i + 1}/${files.length}`, (i + 0.5) / files.length);
        try { title = await readTitle(r.head || r.blob, r.head ? 1 : undefined); } catch (err) { ocrOK = false; toast('제목 자동 읽기를 못 했습니다 — 직접 입력해 주세요'); }
      }
      if (closed) return;
      if (!c.touched) {
        c.title = title;
        input.value = title;
        input.placeholder = '곡 제목을 입력하세요';
        // 앞 장과 제목이 같으면 같은 곡의 다음 쪽으로 봄
        const prevHead = heads().filter((h) => h.i < i).pop();
        if (title && prevHead && normalize(cards[prevHead.i].title) === normalize(title)) c.join = true;
      }
      c.done = true;
      refresh();
    }
    setProg(`다 읽었습니다 (${files.length}장) — 제목을 확인하고 저장하세요. 사진을 누르면 크게 보입니다.`, 1);
    sh.$('.bprog').classList.add('finished');
    refresh();
  }

  async function save() {
    const hs = heads();
    const emptyAt = hs.find((h) => !cards[h.i].title.trim());
    if (emptyAt) {
      alert('제목이 비어 있는 곡이 있습니다. 입력해 주세요.');
      cardEl(emptyAt.i).querySelector('.btitle').focus();
      return;
    }
    const ids = [];
    let nNew = 0, nUpd = 0;
    const b = busy(`저장 중… 0/${hs.length}곡`);
    b.set(`저장 중… 0/${hs.length}곡`, 0);
    for (const h of hs) {
      b.set(`저장 중… ${ids.length + 1}/${hs.length}곡`, ids.length / hs.length);
      const title = cards[h.i].title.trim();
      const pages = h.pages.map((i) => cards[i].id);
      const ex = existingFor(title);
      if (ex) {
        await setPages(ex.id, pages);
        await dropImages(ex.pages.filter((p) => !pages.includes(p)));
        ids.push(ex.id); nUpd++;
      } else {
        const id = store.uid('s_');
        await store.save(id, 'song', { title, keywords: '', created: Date.now() });
        await setPages(id, pages);
        ids.push(id); nNew++;
      }
    }
    for (const c of cards) if (c.dropped && c.id) await db.deleteImage(c.id);
    b.set(`저장했습니다 ${hs.length}/${hs.length}곡`, 1);
    await new Promise((r) => setTimeout(r, 400));
    b.done();
    saved = true;
    sh.close();
    toast([nNew ? `새 곡 ${nNew}곡 등록` : '', nUpd ? `${nUpd}곡 사진 바꿈` : ''].filter(Boolean).join(' · '));
    if (opts.onSaved) opts.onSaved(ids);
  }

  sh.onClose = async () => {
    closed = true;
    for (const c of cards) { if (c.url) URL.revokeObjectURL(c.url); if (c.thumbUrl) URL.revokeObjectURL(c.thumbUrl); }
    if (saved) return;
    for (const c of cards) if (c.id) await db.deleteImage(c.id);
  };
  refresh();
  run();
}

// 새 악보 등록 / 고치기
function openEditor(s, opts = {}) {
  const isNew = !s;
  const pages = s ? (s.pages || []).map((id) => ({ id, fresh: false })) : [];
  const added = [];   // 이번에 새로 넣은 사진 id (취소하면 지움)
  let saved = false;

  const sh = openSheet(isNew ? '새 악보 등록' : '악보 고치기', `
    <label class="field"><span>곡 제목</span><input data-f="title" value="${esc(s ? s.title : '')}" placeholder="예: 주 하나님 지으신 모든 세계" autocomplete="off"></label>
    <button class="bstrip hidden" data-act="preview-first" aria-label="크게 보기" style="margin-top:4px"><span>눌러서 크게 보기</span></button>
    <label class="field"><span>검색어 (선택) — 찬송가 번호, 다른 제목, 키 등</span><input data-f="keywords" value="${esc(s ? s.keywords || '' : '')}" placeholder="예: 찬송가 79장, How Great Thou Art, G키" autocomplete="off"></label>
    <div class="small muted" style="margin:18px 0 8px">악보 사진 (넘기는 순서대로) — 원본은 사진첩에 그대로 두고, 앱이 사본을 가지고 있습니다. 주가 바뀌어도 지우지 않고, 곡을 지우거나 사진을 바꿀 때만 지웁니다. 둘레의 빈 여백은 자동으로 잘라 크게 보이게 합니다.</div>
    <div class="pages"></div>`,
    `<button class="btn" data-close>취소</button><span class="grow"></span><button class="btn primary" data-act="save">저장</button>`);
  const grid = sh.$('.pages');

  async function addFiles(files) {
    const b = busy('사진 준비 중…');
    try {
      for (let i = 0; i < files.length; i++) {
        b.set(`사진 준비 중… ${i + 1}/${files.length}`, i / files.length);
        const r = await processFile(files[i]);
        const id = store.uid('p_');
        await db.putImage({ id, ...r });
        added.push(id);
        pages.push({ id, fresh: true });
      }
    } catch (err) {
      alert(photoError(err));
    }
    b.done();
    draw();
  }

  async function relink(i, files) {
    const b = busy('사진 준비 중…');
    try {
      const r = await processFile(files[0]);
      await db.putImage({ id: pages[i].id, ...r });
      forgetThumb(pages[i].id);
    } catch (err) { alert(photoError(err)); }
    b.done();
    draw();
  }

  function draw() {
    grid.innerHTML = pages.map((p, i) => `
      <div class="pg" data-i="${i}">
        <button class="pimg" data-thumb="${esc(p.id)}" data-act="preview" aria-label="크게 보기"></button>
        <div class="pbar">
          <button class="iconbtn" data-act="relink" aria-label="사진 바꾸기">${ICON.photo}</button>
          <button class="iconbtn" data-act="left" ${i === 0 ? 'disabled' : ''} aria-label="앞으로">${ICON.left}</button>
          <span class="pnum">${i + 1}</span>
          <button class="iconbtn" data-act="right" ${i === pages.length - 1 ? 'disabled' : ''} aria-label="뒤로">${ICON.right}</button>
          <button class="iconbtn" data-act="drop" aria-label="빼기">${ICON.close}</button>
        </div>
      </div>`).join('') + `<button class="pgadd" data-act="more">${ICON.photo}<br>사진첩에서<br>사진 추가</button>`;
    grid.querySelectorAll('[data-thumb]').forEach(async (n) => {
      const u = await thumbURL(n.dataset.thumb);
      if (u) n.style.backgroundImage = `url("${u}")`;
      else n.innerHTML = '이 기기에 사진 없음<br>눌러서 다시 고르기';
    });
    drawStrip();
  }

  // 1쪽 맨 위(제목 부분)를 크게 보여 줌 — 제목을 보면서 고칠 수 있게
  let stripUrl = '';
  async function drawStrip() {
    const strip = sh.$('.bstrip');
    const rec = pages[0] ? await db.getImage(pages[0].id) : null;
    if (stripUrl) { URL.revokeObjectURL(stripUrl); stripUrl = ''; }
    if (!rec) { strip.classList.add('hidden'); return; }
    stripUrl = URL.createObjectURL(rec.head || rec.blob);
    strip.style.backgroundImage = `url("${stripUrl}")`;
    strip.style.aspectRatio = `${rec.w} / ${Math.max(1, Math.round(rec.h * 0.28))}`;
    strip.classList.remove('hidden');
  }

  sh.root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const i = Number(b.closest('.pg')?.dataset.i);
    if (act === 'more') pickPhotos(true, addFiles);
    else if (act === 'relink') pickPhotos(false, (f) => relink(i, f));
    else if (act === 'preview') {
      const title = sh.$('[data-f=title]').value.trim();
      if (!(await previewImage(pages[i].id, `${title} · ${i + 1}쪽`))) pickPhotos(false, (f) => relink(i, f));
    }
    else if (act === 'preview-first' && pages[0]) previewImage(pages[0].id, sh.$('[data-f=title]').value.trim());
    else if (act === 'left' && i > 0) { [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]]; draw(); }
    else if (act === 'right' && i < pages.length - 1) { [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]]; draw(); }
    else if (act === 'drop') { pages.splice(i, 1); draw(); }
    else if (act === 'save') {
      const title = sh.$('[data-f=title]').value.trim();
      const keywords = sh.$('[data-f=keywords]').value.trim();
      if (!title) { alert('곡 제목을 넣어 주세요.'); return; }
      if (!pages.length) { alert('악보 사진을 한 장 이상 넣어 주세요.'); return; }
      const id = s ? s.id : store.uid('s_');
      const ids = pages.map((p) => p.id);
      const keep = s && s.fixed ? { fixed: s.fixed, fixedAt: s.fixedAt } : {};
      await store.save(id, 'song', { title, keywords, created: s ? s.created || Date.now() : Date.now(), ...keep });
      await setPages(id, ids);
      // 뺀 사진 정리
      await dropImages((s ? s.pages || [] : []).filter((old) => !ids.includes(old)));
      saved = true;
      sh.close();
      toast(isNew ? `‘${title}’ 등록했습니다` : '고쳤습니다');
      if (opts.onSaved) opts.onSaved(id);
    }
  });

  sh.onClose = async () => {
    if (stripUrl) URL.revokeObjectURL(stripUrl);
    if (saved) return;
    for (const id of added) { await db.deleteImage(id); forgetThumb(id); }
  };

  draw();
  if (opts.pick) pickPhotos(true, addFiles);
}

// 지난 예배 순서
function openLists() {
  const sh = openSheet('예배 순서 목록', '<div class="rows lists"></div>',
    `<button class="btn" data-act="new-special">★ 특별 예배</button><span class="grow"></span><button class="btn primary" data-act="new">${ICON.plus} 새 순서</button>`);
  const box = sh.$('.rows');
  const draw = () => {
    const cur = currentList();
    const lists = store.all('list').sort((a, b) => (!!b.special - !!a.special) || (b.created || 0) - (a.created || 0));
    box.innerHTML = lists.map((l) => {
      const names = (l.entries || []).map((e) => song(e.song)?.title).filter(Boolean);
      return `<div class="row ${cur && cur.id === l.id ? 'current' : ''}" data-id="${esc(l.id)}">
        <button class="title" data-act="open"><b>${l.special ? '<span class="badge">특별</span>' : ''}${esc(l.name)}</b><span>${names.length}곡 ${esc(names.slice(0, 4).join(', '))}${names.length > 4 ? ' …' : ''}</span></button>
        ${l.special ? '' : '<button class="btn" data-act="copy">복사</button>'}
        <button class="iconbtn" data-act="del" aria-label="지우기">${ICON.close}</button>
      </div>`;
    }).join('') || '<div class="empty">예배 순서가 없습니다.</div>';
  };
  sh.root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('.row')?.dataset.id;
    if (b.dataset.act === 'open') { localStorage.setItem(LS_LIST, id); sh.close(); }
    else if (b.dataset.act === 'new') { await newList(); sh.close(); }
    else if (b.dataset.act === 'new-special') { sh.close(); newSpecial(); }
    else if (b.dataset.act === 'copy') {
      const src = store.get(id);
      const nid = store.uid('l_');
      await store.save(nid, 'list', { name: nextSundayName(), date: sundayOf(), entries: (src.entries || []).map((x) => ({ k: store.uid('e_'), song: x.song })), created: Date.now() });
      localStorage.setItem(LS_LIST, nid);
      sh.close();
      toast('복사해서 새 순서를 만들었습니다');
    }
    else if (b.dataset.act === 'del') {
      const l = store.get(id);
      if (l && l.special) { if (await deleteSpecial(id)) draw(); return; }
      if (!confirm(`‘${l.name}’ 예배 순서를 지울까요? (악보는 그대로 남습니다)`)) return;
      await store.remove(id);
      if (localStorage.getItem(LS_LIST) === id) localStorage.removeItem(LS_LIST);
      draw();
    }
  });
  draw();
}

// 처음 쓰는 방법 (처음 한 번 자동으로 보여 주고, 설정에서 다시 볼 수 있음)
const HOWTO = `
    <ol class="howto">
      <li>담당자가 <b>카카오톡</b>으로 이번 주 악보 사진을 보내면, 사진을 눌러 <b>저장</b>해 사진첩(안드로이드는 갤러리)에 넣습니다.</li>
      <li>이 앱의 <b>악보함 → 새 악보 등록</b>을 누르고, 저장한 사진을 <b>여러 장 한꺼번에</b> 고릅니다. 곡 제목은 자동으로 읽어 넣으니 틀린 것만 고치세요.</li>
      <li><b>예배 순서 → 곡 추가</b>로 칠 곡을 넣고 <b>반주 시작</b>을 누르면 악보가 화면 가득 나옵니다. 좌우를 누르거나 밀어서 넘깁니다.</li>
    </ol>
    <p class="small muted">악보와 예배 순서는 <b>이 기기 안에만</b> 저장되고 어디로도 보내지 않습니다. 인터넷이 없어도 됩니다 (제목 자동 읽기만 처음 한 번 인터넷이 필요합니다).</p>`;

function openWelcome() {
  const sh = openSheet('찬양팀 악보 — 이렇게 씁니다', HOWTO, '<span class="grow"></span><button class="btn primary" data-act="ok">시작</button>');
  sh.onClose = () => localStorage.setItem(LS_WELCOME, '1');
  sh.root.addEventListener('click', (e) => { if (e.target.closest('[data-act=ok]')) sh.close(); });
}

// 설정
function openSettings() {
  const sh = openSheet('설정', `
    <div class="verline"><span>앱 버전</span><b>v${window.AKBO_VERSION || ''}</b></div>
    <p class="small muted" style="margin:0 0 12px">© 2026 HM KOREA Lyoo Hyung Wook. All Rights Reserved.</p>
    <p style="margin-top:0">예배 순서·표시·악보 사진은 모두 <b>이 기기 안</b>에만 저장합니다. 서버로는 아무것도 보내지 않습니다.
    악보 사진의 원본은 <b>사진첩(갤러리)</b>에 두고, 앱이 사본을 가지고 있습니다. 악보함의 곡과 사진은 <b>주가 바뀌어도 지우지 않습니다</b> (곡을 지울 때만 지움). 예배 순서는 8주가 지나면 정리되지만 곡은 악보함에 남습니다.</p>
    <h3 style="margin:24px 0 6px;font-size:17px">쓰는 방법</h3>
    ${HOWTO}
    <h3 style="margin:24px 0 6px;font-size:17px">반주 중 화면이 꺼지지 않게</h3>
    <p class="small" style="margin:0">반주 화면에서는 앱이 화면을 켜 두려고 합니다. 그래도 꺼지면<br>
    아이패드·아이폰: <b>설정 → 디스플레이 및 밝기 → 자동 잠금 → 안 함</b><br>
    안드로이드: <b>설정 → 디스플레이 → 화면 자동 꺼짐</b>을 길게 (예배 뒤 다시 바꿔 두세요)</p>
    <h3 style="margin:24px 0 6px;font-size:17px">앱이 지금 가지고 있는 악보 사진 사본</h3>
    <p class="small" style="margin:0" data-f="usage">계산 중…</p>`,
    '<span class="grow"></span><button class="btn primary" data-close>닫기</button>');

  const usage = sh.$('[data-f=usage]');
  db.imageIds().then(async (ids) => {
    let est = '';
    try {
      const e = await navigator.storage.estimate();
      const mb = (n) => (n / 1048576 >= 1024 ? (n / 1073741824).toFixed(1) + 'GB' : Math.round(n / 1048576) + 'MB');
      est = ` · 약 ${mb(e.usage)} 사용` + (e.quota ? ` (쓸 수 있는 공간 약 ${mb(e.quota)})` : '');
    } catch (err) { /* 지원 안 함 */ }
    let kept = '';
    try { if (navigator.storage.persisted && !(await navigator.storage.persisted())) kept = ' · 홈 화면 앱으로 쓰면 기기가 사진 사본을 임의로 지우지 않습니다'; } catch (err) { /* 지원 안 함 */ }
    usage.textContent = `사진 ${ids.length}장${est}${kept}`;
  });
}

// ---------- 시작 ----------
store.onChange(() => {
  if (viewerOpen) return;
  if (tab === 'library') renderLibResults(); else if (!sheets.length) renderOrder();
});

document.querySelector('[data-act=hide-install]').addEventListener('click', () => {
  localStorage.setItem(LS_INSTALL, '1');
  document.querySelector('.install').classList.add('hidden');
});

// 홈 화면에 추가 안내: 아이패드·아이폰(사파리)과 안드로이드(크롬)가 방법이 다름
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {   // 안드로이드 크롬: [앱 설치] 버튼으로 바로 설치
  e.preventDefault();
  installPrompt = e;
  const btn = document.querySelector('[data-act=install-now]');
  if (btn) btn.classList.remove('hidden');
});
window.addEventListener('appinstalled', () => document.querySelector('.install').classList.add('hidden'));
document.querySelector('[data-act=install-now]').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  try { await installPrompt.userChoice; } catch (e) { /* 무시 */ }
  installPrompt = null;
});

function showInstallHint() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
  if (standalone || localStorage.getItem(LS_INSTALL)) return;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(navigator.userAgent);
  if (!ios && !android) return;
  const box = document.querySelector('.install');
  box.querySelector('.install-text').innerHTML = ios
    ? 'Safari의 <b>공유 버튼</b>(네모에 화살표) → <b>홈 화면에 추가</b>를 누른 뒤, 홈 화면의 <b>찬양팀 악보</b> 아이콘으로 여세요. Safari에서 연 것과 홈 화면 앱은 저장 공간이 따로라서, 악보 등록은 꼭 홈 화면 앱에서 하세요.'
    : '크롬 오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b>(또는 <b>앱 설치</b>)를 누른 뒤, 홈 화면의 <b>찬양팀 악보</b> 아이콘으로 여세요. 반드시 <b>크롬</b>에서 열어야 합니다 (카카오톡 안에서 열렸다면 오른쪽 위 메뉴의 <b>다른 브라우저로 열기</b>).';
  box.classList.remove('hidden');
}

async function start() {
  if (!unlocked()) {
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !standalone) { showInstallOnly(); return; }   // 아이폰·아이패드는 홈 화면 앱에서만 한 번 묻기
    await askPassword();   // 처음 한 번만 비밀번호
  }
  showInstallHint();

  await store.load();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* 지원 안 함 */ }
  render();

  try { await weekTick(); } catch (e) { /* 다음에 */ }
  if (!localStorage.getItem(LS_WELCOME)) openWelcome();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') weekTick().catch(() => {});
  });

  if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
}
start();
