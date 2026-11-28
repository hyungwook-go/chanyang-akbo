// 곡 찾기: 제목·검색어에서 띄어쓰기 무시, 초성(ㅈㄱㅎ)과 섞어 쓰기(주ㄱ) 지원

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

export function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFC').replace(/[\s.,·!?'"“”‘’()\[\]\-_/~:;]+/g, '');
}

function choOf(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return CHO[Math.floor((c - 0xac00) / 588)];
  return null;
}

// 한 글자 비교: 같거나, 검색 글자가 초성이고 대상 글자의 초성이 같으면 맞음
function charMatch(q, t) {
  if (q === t) return true;
  if (CHO.includes(q)) return choOf(t) === q;
  return false;
}

// q가 t 안에 나오는 첫 위치 (없으면 -1)
export function findIn(t, q) {
  if (!q) return 0;
  outer: for (let i = 0; i + q.length <= t.length; i++) {
    for (let j = 0; j < q.length; j++) if (!charMatch(q[j], t[i + j])) continue outer;
    return i;
  }
  return -1;
}

// 점수: 제목 시작 3, 제목 안 2, 검색어 안 1, 없으면 0
export function score(song, query) {
  const q = normalize(query);
  if (!q) return 1;
  const title = normalize(song.title);
  const pos = findIn(title, q);
  if (pos === 0) return 3;
  if (pos > 0) return 2;
  if (findIn(normalize(song.keywords), q) >= 0) return 1;
  return 0;
}

export function searchSongs(songs, query) {
  const scored = [];
  for (const s of songs) {
    const sc = score(s, query);
    if (sc > 0) scored.push([sc, s]);
  }
  scored.sort((a, b) => b[0] - a[0] || String(a[1].title).localeCompare(String(b[1].title), 'ko'));
  return scored.map((x) => x[1]);
}

// ---- 글자 인식으로 읽은 제목을 악보함의 곡과 맞추기 ----
// 글자 인식은 한두 글자씩 틀리게 읽는 일이 많으므로, 한글을 자모(ㄱ+ㅏ…)로 풀어 얼마나 비슷한지 봅니다.
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export function jamo(s) {
  let out = '';
  for (const ch of normalize(s)) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c >= 0 && c < 11172) out += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
    else out += ch;
  }
  return out;
}

// 두 글자열이 다른 정도 (고치기 횟수)
function dist(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// t가 긴 글 x 안 어딘가에 (조금 틀리게라도) 들어 있는 정도: 가장 잘 맞는 부분과의 고치기 횟수
function distIn(t, x) {
  let prev = new Array(x.length + 1).fill(0);
  for (let i = 1; i <= t.length; i++) {
    const cur = [i];
    for (let j = 1; j <= x.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (t[i - 1] === x[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.min(...prev);
}

// read: { title: 제목으로 고른 줄, text: 사진 위쪽에서 읽은 글 전부 }
// 가장 비슷한 곡을 { song, sim } 으로 돌려줌 (확실하지 않으면 null)
// prefer(song): 먼저 고를 곡(예: 사진이 없는 곡)이면 true
export function matchSong(read, songs, prefer = () => false) {
  const tAll = jamo(read.title);
  // 한글 제목을 영어·기호로 잘못 읽은 찌꺼기(예: '주님의 엉광 LIE')는 한글 곡과 비교할 때 뺌
  const tKo = jamo(String(read.title || '').replace(/[^가-힣\s]/g, ''));
  const xj = jamo(read.text || read.title);
  if (tAll.length < 2 && xj.length < 2) return null;
  let best = null, second = 0;
  for (const s of songs) {
    const sj = jamo(s.title);
    if (sj.length < 2) continue;
    const tj = /[가-힣]/.test(s.title) && tKo.length >= 2 ? tKo : tAll;
    // 1) 제목 줄 전체가 곡 제목과 비슷한지
    let sim = tj ? 1 - dist(tj, sj) / Math.max(tj.length, sj.length) : 0;
    // 2) 제목의 앞이나 일부만 읽혔을 때: 읽은 조각이 곡 제목 안에 (조금 틀리게라도) 들어 있는지. 세 글자 이상만
    if (sim < 0.6 && tj.length >= 9 && tj.length < sj.length) sim = Math.max(sim, (1 - distIn(tj, sj) / tj.length) * 0.9);
    // 3) 제목 줄을 잘못 골랐을 때: 읽은 글 어딘가에 곡 제목이 들어 있는지.
    //    '주의 은혜'가 '주의 은혜라' 안에 들어 있는 것처럼 우연히 맞지 않게, 짧은 제목은 빼고 점수도 낮춤
    if (sim < 0.6 && sj.length >= 8) sim = Math.max(sim, (1 - distIn(sj, xj) / sj.length) * 0.9);
    if (prefer(s)) sim += 0.03;
    if (!best || sim > best.sim) { second = best ? Math.max(second, best.sim) : second; best = { song: s, sim }; }
    else if (sim > second) second = sim;
  }
  if (!best) return null;
  if (best.sim >= 0.85 || (best.sim >= 0.6 && best.sim - second >= 0.06)) return best;
  return null;
}

// ---- 제목 칸 아래에 보여 줄 '악보함의 이 곡인가요?' 후보 ----
function lcsLen(a, b) {
  let prev = new Uint16Array(b.length + 1), cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

// 읽은 글자와 제목이 얼마나 비슷한지 0~1 (자모로 풀어 가장 긴 공통 부분으로 비교)
export function similarity(read, title) {
  const a = jamo(read), b = jamo(title);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const l = lcsLen(a, b);
  if (!l) return 0;
  const p = l / a.length, r = l / b.length;
  return (2 * p * r) / (p + r);
}

// 읽은 글자와 비슷한 곡들 (비슷한 순)
export function closestSongs(read, songs, n = 3, min = 0.35) {
  return songs.map((s) => ({ s, sim: similarity(read, s.title) }))
    .filter((x) => x.sim >= min)
    .sort((x, y) => y.sim - x.sim)
    .slice(0, n);
}
