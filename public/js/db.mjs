// 이 기기 안의 저장소 (IndexedDB)
//   items  : 곡·곡별 사진 목록·예배 순서·표시 {id, kind, data, updated, deleted}
//   images : 사진첩에서 고른 악보 사진의 사용 중 사본 {id, blob, thumb, w, h}

// GitHub Pages는 같은 계정의 여러 사이트가 저장 공간을 함께 쓰므로 이름을 따로 붙입니다
const NAME = 'chanyang-akbo';
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function req(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function allItems() { return req((await store('items')).getAll()); }
export async function getItem(id) { return req((await store('items')).get(id)); }
export async function putItems(list) {
  const db = await open();
  const tx = db.transaction('items', 'readwrite');
  const s = tx.objectStore('items');
  for (const it of list) s.put(it);
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}

export async function deleteItems(ids) {
  const db = await open();
  const tx = db.transaction('items', 'readwrite');
  const s = tx.objectStore('items');
  for (const id of ids) s.delete(id);
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}

export async function getImage(id) { return req((await store('images')).get(id)); }
export async function putImage(rec) { return req((await store('images', 'readwrite')).put(rec)); }
export async function deleteImage(id) { return req((await store('images', 'readwrite')).delete(id)); }
export async function imageIds() { return req((await store('images')).getAllKeys()); }
