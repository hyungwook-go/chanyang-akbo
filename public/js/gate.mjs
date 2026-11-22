// 처음 한 번 비밀번호 확인. 맞게 넣으면 이 기기에 기억해 두고 다음부터는 절대 묻지 않습니다.
// 앱에는 비밀번호 자체가 아니라 PBKDF2로 바꾼 값(pass.mjs)만 들어 있습니다.
// 비밀번호를 바꿔도(npm run password) 이미 쓰고 있는 기기는 그대로 열리고, 새로 설치하는 기기만 새 비밀번호를 묻습니다.
import { SALT, ITER, HASH } from './pass.mjs';

const LS = 'chanyang.unlock';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hashPass(pw, salt = SALT, iter = ITER) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pw).normalize('NFC').trim()), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return hex(bits);
}

export function unlocked() {
  try { return !!localStorage.getItem(LS); } catch (e) { return false; }
}

// 아이패드·아이폰 Safari: Safari와 홈 화면 앱은 저장 공간이 따로라, 비밀번호는 홈 화면 앱에서만 한 번 묻습니다.
// Safari에서는 홈 화면에 추가하는 방법만 보여 줍니다.
export function showInstallOnly() {
  const box = document.createElement('div');
  box.className = 'gate';
  box.innerHTML = `
    <div class="gatebox">
      <img src="icons/icon-192.png" alt="" width="72" height="72">
      <h1>찬양팀 악보</h1>
      <p>이 앱은 <b>홈 화면에 추가</b>해서 씁니다.</p>
      <ol class="howto" style="text-align:left">
        <li>Safari의 <b>공유 버튼</b>(네모에 위쪽 화살표)을 누릅니다.</li>
        <li><b>홈 화면에 추가</b> → <b>추가</b>를 누릅니다.</li>
        <li>홈 화면의 초록색 <b>찬양팀 악보</b> 아이콘으로 열고, 비밀번호를 한 번 넣습니다.</li>
      </ol>
      <p class="small">카카오톡 안에서 열렸다면 오른쪽 아래 메뉴 → <b>Safari로 열기</b>를 먼저 누르세요.</p>
      <footer>© 2026 HM KOREA Lyoo Hyung Wook. All Rights Reserved.</footer>
    </div>`;
  document.body.appendChild(box);
}

// 비밀번호 화면을 띄우고, 맞게 넣으면 끝남
export function askPassword() {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'gate';
    box.innerHTML = `
      <form class="gatebox" autocomplete="off">
        <img src="icons/icon-192.png" alt="" width="72" height="72">
        <h1>찬양팀 악보</h1>
        <p>처음 한 번만 비밀번호를 넣어 주세요.<br>비밀번호는 찬양팀 담당자에게 물어보세요.</p>
        <input type="text" class="masked" name="team-code" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="비밀번호" aria-label="비밀번호">
        <label class="gateshow"><input type="checkbox"> 비밀번호 보이기</label>
        <div class="gatemsg" role="alert"></div>
        <button class="btn primary big" type="submit">확인</button>
        <footer>© 2026 HM KOREA Lyoo Hyung Wook. All Rights Reserved.</footer>
      </form>`;
    const form = box.querySelector('form');
    // 아이패드·아이폰은 type=password 칸에서 한글 자판을 막으므로, 일반 글자 칸에 점(●)으로 가려 보이게 함
    const input = box.querySelector('input.masked');
    const msg = box.querySelector('.gatemsg');
    const btn = box.querySelector('button');
    box.querySelector('.gateshow input').addEventListener('change', (e) => { input.classList.toggle('masked', !e.target.checked); });
    let tries = 0;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!input.value.trim()) { msg.textContent = '비밀번호를 넣어 주세요.'; return; }
      btn.disabled = true;
      msg.textContent = '확인 중…';
      const ok = (await hashPass(input.value)) === HASH;
      if (ok) {
        localStorage.setItem(LS, String(Date.now()));
        box.remove();
        resolve();
        return;
      }
      tries++;
      msg.textContent = '비밀번호가 맞지 않습니다. 띄어쓰기·대소문자·기호를 확인해 주세요.';
      // 여러 번 틀리면 조금씩 기다리게 함
      const wait = tries >= 5 ? Math.min(30, (tries - 4) * 5) : 0;
      if (wait) {
        msg.textContent += ` (${wait}초 뒤 다시)`;
        await new Promise((r) => setTimeout(r, wait * 1000));
      }
      btn.disabled = false;
      input.select();
    });
    document.body.appendChild(box);
    input.focus();
  });
}
