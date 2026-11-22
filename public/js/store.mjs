// 앱 데이터: 모두 이 기기(아이패드·아이폰·안드로이드 태블릿) 안에만 저장합니다.
// 서버로는 아무것도 보내지 않습니다. 인터넷이 없어도 그대로 씁니다.
import * as db from './db.mjs';

const items = new Map();
const listeners = new Set();

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(what) { for (const fn of listeners) fn(what); }

export async function load() {
  for (const it of await db.allItems()) items.set(it.id, it);
  // 지운 흔적은 남길 필요가 없음
  const gone = [...items.values()].filter((it) => it.deleted).map((it) => it.id);
  for (const id of gone) items.delete(id);
  if (gone.length) await db.deleteItems(gone);
}

export function uid(prefix) {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + r[0].toString(36) + r[1].toString(36).slice(0, 3);
}

export function get(id) {
  const it = items.get(id);
  return it && !it.deleted ? it.data : null;
}

export function all(kind) {
  const out = [];
  for (const it of items.values()) if (it.kind === kind && !it.deleted) out.push({ id: it.id, ...it.data, _updated: it.updated });
  return out;
}

export async function save(id, kind, data) {
  const prev = items.get(id);
  const it = { id, kind, data, updated: Math.max(Date.now(), prev ? prev.updated + 1 : 0), deleted: 0 };
  items.set(id, it);
  await db.putItems([it]);
  emit(kind);
}

export async function remove(id) {
  const prev = items.get(id);
  if (!prev || prev.deleted) return;
  items.delete(id);
  await db.deleteItems([id]);
  emit(prev.kind);
}
