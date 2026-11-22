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
