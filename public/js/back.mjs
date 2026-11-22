// 안드로이드 '뒤로' 버튼(또는 뒤로 밀기)으로 앱이 닫히지 않고, 맨 위에 열린 창(악보 보기·크게 보기·아래 창)만 닫히게 합니다.
// 창을 열 때 guardBack(닫는 함수)을 부르고, 버튼으로 닫을 때는 돌려받은 함수를 부릅니다.
const stack = [];
let skip = 0, pending = 0;

// 창이 열린 채로 앱을 다시 열었을 때 남은 표시를 지움
if (history.state && history.state.layer) history.replaceState(null, '');

window.addEventListener('popstate', () => {
  if (skip > 0) { skip--; return; }
  const top = stack.pop();
  if (top) top.close();
});

// 버튼으로 여러 창을 한꺼번에 닫아도 방문 기록은 한 번에 되돌림
function flush() {
  const n = pending;
  pending = 0;
  if (n) { skip++; history.go(-n); }
}

export function guardBack(close) {
  const entry = { close };
  stack.push(entry);
  history.pushState({ layer: stack.length }, '');
  return function release() {
    const i = stack.indexOf(entry);
    if (i < 0) return;   // 이미 '뒤로'로 닫힘
    stack.splice(i, 1);
    if (++pending === 1) setTimeout(flush, 0);
  };
}
