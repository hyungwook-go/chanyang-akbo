import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchSongs, score, normalize } from '../public/js/search.mjs';
import { findContentBox } from '../public/js/trim.mjs';
import { hitStroke } from '../public/js/ink.mjs';

const songs = [
  { id: 'a', title: '주 하나님 지으신 모든 세계', keywords: '찬송가 79장, How Great Thou Art' },
  { id: 'b', title: '나 같은 죄인 살리신', keywords: '찬송가 305장' },
  { id: 'c', title: '은혜 아니면', keywords: '' },
  { id: 'd', title: '하나님의 은혜', keywords: 'G키' },
];

test('띄어쓰기 무시하고 제목으로 찾기', () => {
  assert.deepEqual(searchSongs(songs, '나같은').map((s) => s.id), ['b']);
  assert.equal(normalize(' 주 하나님 '), '주하나님');
});

test('초성과 섞어 쓰기', () => {
  assert.deepEqual(searchSongs(songs, 'ㅇㅎㅇㄴㅁ').map((s) => s.id), ['c']);
  assert.deepEqual(searchSongs(songs, '주ㅎㄴ').map((s) => s.id), ['a']);
});

test('찬송가 번호·영어 제목은 검색어로 찾기', () => {
  assert.deepEqual(searchSongs(songs, '305').map((s) => s.id), ['b']);
  assert.deepEqual(searchSongs(songs, 'how great').map((s) => s.id), ['a']);
});

test('제목이 검색어로 시작하는 곡이 먼저', () => {
  assert.deepEqual(searchSongs(songs, '은혜').map((s) => s.id), ['c', 'd']);
  assert.equal(score(songs[2], '은혜'), 3);
  assert.equal(score(songs[3], '은혜'), 2);
});

test('빈 검색은 전체를 가나다 순으로', () => {
  assert.deepEqual(searchSongs(songs, '').map((s) => s.id), ['b', 'c', 'a', 'd']);
});

function page(w, h, bg, box, ink = 0) {
  const lum = new Uint8Array(w * h).fill(bg);
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) if ((x + y) % 3 === 0) lum[y * w + x] = ink;
  return lum;
}

test('흰 여백을 잘라내고 조금 남김', () => {
  const b = findContentBox(page(200, 300, 255, { x0: 40, y0: 60, x1: 160, y1: 250 }), 200, 300);
  const pad = Math.round(300 * 0.02);
  assert.deepEqual(b, { x0: 40 - pad, y0: 60 - pad, x1: 160 + pad, y1: 250 + pad });
});

test('회색빛 사진 바탕도 바탕으로 봄', () => {
  const b = findContentBox(page(200, 300, 185, { x0: 30, y0: 30, x1: 120, y1: 200 }, 60), 200, 300);
  assert.ok(b.x1 < 140 && b.y1 < 220);
});

test('여백이 거의 없으면 그대로', () => {
  const b = findContentBox(page(200, 300, 255, { x0: 2, y0: 2, x1: 198, y1: 298 }), 200, 300);
  assert.deepEqual(b, { x0: 0, y0: 0, x1: 200, y1: 300 });
});

test('지우개: 선 가까이만 지움', () => {
  const s = { t: 'pen', w: 0.004, p: [0.1, 0.1, 0.5, 0.1] };
  assert.equal(hitStroke(s, 60, 22, 200, 200, 4), true);
  assert.equal(hitStroke(s, 60, 60, 200, 200, 4), false);
});

import { sundayOf, needsNewWeek, startEntries, listDate } from '../public/js/weekly.mjs';

test('주일 계산: 일요일은 그날, 평일은 다음 일요일', () => {
  assert.equal(sundayOf(new Date(2026, 10, 22)), '2026-11-22'); // 일
  assert.equal(sundayOf(new Date(2026, 10, 20)), '2026-11-22'); // 금
  assert.equal(sundayOf(new Date(2026, 10, 23)), '2026-11-29'); // 월
});

test('주가 바뀌면 새 순서가 필요', () => {
  const lists = [{ date: '2026-11-22' }];
  assert.equal(needsNewWeek(lists, new Date(2026, 10, 22)), false);
  assert.equal(needsNewWeek(lists, new Date(2026, 10, 23)), true);
  assert.equal(listDate({ created: new Date(2026, 10, 18).getTime() }), '2026-11-22');
});

test('새 순서: 고정곡이 자동으로 들어가고, 지난주 차례를 따름', () => {
  let n = 0; const uid = () => 'e' + n++;
  const songs = [
    { id: 'bless', fixed: true, fixedAt: 1 },
    { id: 'open', fixed: true, fixedAt: 5 },
    { id: 'call', fixed: true, fixedAt: 9 },
    { id: 'x' },
  ];
  const prev = [{ song: 'call' }, { song: 'x' }, { song: 'bless' }];
  assert.deepEqual(startEntries(songs, prev, uid).map((e) => e.song), ['call', 'bless', 'open']);
  assert.deepEqual(startEntries(songs, [], uid).map((e) => e.song), ['bless', 'open', 'call']);
  // 예전 형식('front'/'end')도 고정으로 봄
  assert.deepEqual(startEntries([{ id: 'a', fixed: 'end' }], [], uid).map((e) => e.song), ['a']);
});

import { oldLists, weekStart } from '../public/js/weekly.mjs';

test('주가 바뀌어도 악보함 곡의 사진은 저절로 지우지 않음', async () => {
  const w = await import('../public/js/weekly.mjs');
  assert.equal(w.photosToDrop, undefined);
  const app = readFileSync(new URL('../public/js/app.mjs', import.meta.url), 'utf8');
  const tick = app.slice(app.indexOf('async function weekTick'), app.indexOf('async function setFixed'));
  assert.ok(!/dropImages|remove\('g_'/.test(tick));   // 주 바뀜 처리에서 곡 사진을 지우지 않음
  assert.equal(weekStart(new Date(2026, 10, 22)), new Date(2026, 10, 16).getTime());
});

test('8주 넘은 예배 순서는 정리', () => {
  const lists = [{ id: 'x', date: '2026-09-27' }, { id: 'y', date: '2026-10-04' }, { id: 'z', date: '2026-11-22' }];
  assert.deepEqual(oldLists(lists, new Date(2026, 10, 24)), ['x']);
});

import { pickTitle, cleanTitle } from '../public/js/ocr.mjs';

test('제목 고르기: 가장 큰 글씨 줄, 낮은 확신·기호 줄은 뺌', () => {
  const lines = [
    { text: 'Key=G  ♩=72', confidence: 80, bbox: { y0: 10, y1: 30 } },
    { text: '주 하나님 지으신 모든 세계\n', confidence: 88, bbox: { y0: 40, y1: 100 } },
    { text: '작사 작곡 홍길동', confidence: 90, bbox: { y0: 110, y1: 135 } },
    { text: '이상한 큰 글씨', confidence: 30, bbox: { y0: 0, y1: 200 } },
  ];
  assert.equal(pickTitle(lines), '주 하나님 지으신 모든 세계');
  assert.equal(pickTitle([{ text: '| — ~', confidence: 90, bbox: { y0: 0, y1: 99 } }]), '');
  assert.equal(pickTitle([]), '');
  // 제목을 못 읽었을 때 작사·작곡 줄을 제목으로 잡지 않음 (빈칸이 틀린 제목보다 나음)
  assert.equal(pickTitle([{ text: '작사 작곡 김00', confidence: 90, bbox: { y0: 0, y1: 40 } }, { text: 'Key=G J=72', confidence: 85, bbox: { y0: 0, y1: 30 } }]), '');
});

test('제목 다듬기: 한 글자씩 띄어 읽힌 한글은 붙이고, 영어 제목은 그대로', () => {
  assert.equal(cleanTitle('은 혜 아 니 면'), '은혜아니면');
  assert.equal(cleanTitle('“How Great Thou Art”'), 'How Great Thou Art');
  assert.equal(cleanTitle('- 나 같은 죄인 살리신 -'), '나 같은 죄인 살리신');
});

test('특별 예배: 매주 순서 계산·8주 정리에서 빠지고, 그 곡 사진은 남김', () => {
  const today = new Date(2026, 10, 24);
  const special = { id: 'sp', special: true, created: new Date(2026, 5, 1).getTime(), entries: [{ song: 'e' }] };
  assert.equal(needsNewWeek([special], today), true);                 // 특별 예배만 있으면 이번 주 순서는 따로 필요
  assert.deepEqual(oldLists([special], today), []);                   // 오래돼도 자동으로 지우지 않음
  const old = new Date(2026, 10, 1).getTime();
});

import { binarize } from '../public/js/ocr.mjs';

test('사진 다듬기: 그림자 진 바탕은 흰색, 글씨는 검정, 긴 가로선(오선)은 지움', () => {
  const w = 200, h = 60;
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 230 - x * 0.6;   // 오른쪽으로 갈수록 어두운 그림자
  for (let y = 10; y < 30; y++) for (let x = 150; x < 160; x++) g[y * w + x] = 40;        // 그림자 속 글씨 한 획
  for (let x = 0; x < w; x++) g[45 * w + x] = 60;                                          // 오선 한 줄
  const bw = binarize(g, w, h);
  assert.equal(bw[20 * w + 155], 0);     // 글씨
  assert.equal(bw[20 * w + 180], 255);   // 그림자 진 바탕
  assert.equal(bw[5 * w + 10], 255);     // 밝은 바탕
  assert.equal(bw[45 * w + 100], 255);   // 오선은 지워짐
});

test('사진 다듬기: 어두운 바탕에 흰 글씨는 뒤집어서 검정 글씨로', () => {
  const w = 100, h = 40;
  const g = new Uint8Array(w * h).fill(30);
  for (let y = 10; y < 30; y++) for (let x = 40; x < 50; x++) g[y * w + x] = 240;
  const bw = binarize(g, w, h);
  assert.equal(bw[20 * w + 45], 0);
  assert.equal(bw[5 * w + 5], 255);
});

import { readdirSync, readFileSync } from 'node:fs';
test('배포용: 앱 코드에 서버 요청이 없음 (정적 파일과 Tesseract만)', () => {
  const dir = new URL('../public/js/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\/api\//, f);
    for (const m of src.matchAll(/https?:\/\/[^'"`\s)]+/g)) assert.match(m[0], /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js@/, f + ': ' + m[0]);
  }
});

test('처음 비밀번호: 정해져 있고, 같은 비밀번호는 같은 값·다른 비밀번호는 다른 값', async () => {
  const { SALT, ITER, HASH } = await import('../public/js/pass.mjs');
  const { hashPass } = await import('../public/js/gate.mjs');
  assert.match(HASH, /^[0-9a-f]{64}$/);
  assert.ok(SALT.length > 10 && ITER >= 100000);
  const a = await hashPass('찬양 2026', 'salt-x', 1000);
  assert.equal(a, await hashPass(' 찬양 2026 ', 'salt-x', 1000));
  assert.notEqual(a, await hashPass('찬양 2027', 'salt-x', 1000));
  // 앱 파일 어디에도 비밀번호가 그대로 들어 있지 않음 (확인값만)
  const dir = new URL('../public/js/', import.meta.url);
  for (const f of readdirSync(dir)) assert.doesNotMatch(readFileSync(new URL(f, dir), 'utf8'), /password\s*[:=]\s*['"]/i, f);
});
