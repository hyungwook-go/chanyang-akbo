// 매주 고정곡 — 고정한 곡(fixed)은 새 주의 예배 순서에 자동으로 들어가 있습니다. 차례는 언제든 바꿀 수 있습니다.

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 그 날짜 또는 그 뒤의 첫 주일 (일요일이면 그날)
export function sundayOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return ymd(d);
}

export function sundayName(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}월 ${d}일 주일`;
}

// 예배 순서가 어느 주일 것인지 (예전 순서는 만든 날로 계산)
export function listDate(l) {
  return l.date || sundayOf(new Date(l.created || 0));
}

// 이번 주(가장 가까운 주일) 순서가 아직 없으면 true
// (특별 예배 순서는 세지 않음)
export function needsNewWeek(lists, today = new Date()) {
  const want = sundayOf(today);
  return !lists.some((l) => !l.special && listDate(l) >= want);
}

// 새 순서의 처음 곡들: 고정한 곡 전부. 지난 순서에 있던 곡은 지난주 차례 그대로, 새로 고정한 곡은 그 뒤에.
export function startEntries(songs, prevEntries, uid) {
  const prevPos = new Map();
  (prevEntries || []).forEach((e, i) => { if (!prevPos.has(e.song)) prevPos.set(e.song, i); });
  const pos = (s) => (prevPos.has(s.id) ? prevPos.get(s.id) : Infinity);
  return songs.filter((s) => s.fixed)
    .sort((a, b) => (pos(a) - pos(b)) || ((a.fixedAt || 0) - (b.fixedAt || 0)))
    .map((s) => ({ k: uid('e_'), song: s.id }));
}

// 이번 주가 시작된 시각 (지난 주일 다음 날 0시). 일요일이면 6일 전 월요일.
export function weekStart(today = new Date()) {
  const [y, m, d] = sundayOf(today).split('-').map(Number);
  return new Date(y, m - 1, d - 6).getTime();
}

// 오래된 예배 순서 (기본 8주 넘은 것). 특별 예배는 직접 지울 때까지 남김
export function oldLists(lists, today = new Date(), weeks = 8) {
  const [y, m, d] = sundayOf(today).split('-').map(Number);
  const cut = sundayOf(new Date(y, m - 1, d - weeks * 7));
  return lists.filter((l) => !l.special && listDate(l) < cut).map((l) => l.id);
}
