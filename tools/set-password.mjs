// 앱을 처음 열 때 묻는 비밀번호 정하기 / 바꾸기
// 쉬운 방법: 폴더의 "비밀번호 바꾸기.cmd" 를 더블클릭
// 명령으로: npm run password            (물어봄)
//          npm run password -- "새 비밀번호"
// public/js/pass.mjs 에는 비밀번호 자체가 아니라 알아볼 수 없게 바꾼 값만 저장합니다.
// 앱 버전(sw.js 의 VERSION, app.mjs 의 window.AKBO_VERSION)도 자동으로 하나 올립니다.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

let pw = process.argv.slice(2).join(' ');
if (!pw.trim()) {
  const rl = createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q) => { process.stdout.write(q); const r = await lines.next(); return r.done ? '' : r.value; };
  pw = await ask('새 비밀번호를 넣고 Enter: ');
  const again = await ask('한 번 더 넣고 Enter: ');
  rl.close();
  if (pw !== again) { console.error('두 번 넣은 비밀번호가 다릅니다. 바꾸지 않았습니다.'); process.exit(1); }
}
if (!pw.trim()) { console.error('비밀번호가 비어 있습니다. 바꾸지 않았습니다.'); process.exit(1); }

const SALT = 'chanyang-' + randomBytes(16).toString('hex');
const ITER = 300000;
const { hashPass } = await import('../public/js/gate.mjs');
const HASH = await hashPass(pw, SALT, ITER);
writeFileSync(new URL('../public/js/pass.mjs', import.meta.url),
  `// 처음 열 때 묻는 비밀번호의 확인값 (tools/set-password.mjs 로 만듦 — 직접 고치지 마세요)
export const SALT = '${SALT}';
export const ITER = ${ITER};
export const HASH = '${HASH}';
`);

// 버전 올리기 (1.0.2 → 1.0.3): 팀원 기기가 새 파일을 받게 함
const appUrl = new URL('../public/js/app.mjs', import.meta.url);
const swUrl = new URL('../public/sw.js', import.meta.url);
const app = readFileSync(appUrl, 'utf8');
const m = app.match(/window\.AKBO_VERSION = '(\d+)\.(\d+)\.(\d+)';/);
if (m) {
  const next = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
  writeFileSync(appUrl, app.replace(m[0], `window.AKBO_VERSION = '${next}';`));
  const sw = readFileSync(swUrl, 'utf8');
  writeFileSync(swUrl, sw.replace(/const VERSION = PREFIX \+ 'v[\d.]+';/, `const VERSION = PREFIX + 'v${next}';`));
  console.log(`비밀번호를 바꿨습니다. 앱 버전 v${next}`);
} else {
  console.log('비밀번호를 바꿨습니다. (버전 표시를 찾지 못해 버전은 그대로입니다)');
}
console.log('이제 GitHub에 다시 올리면 적용됩니다. 이미 쓰고 있는 팀원은 그대로 쓰고, 새로 설치하는 사람만 새 비밀번호를 넣습니다.');
