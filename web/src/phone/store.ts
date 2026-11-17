// 휴대폰 안 저장소 (IndexedDB). 받은 쪽지와 첨부는 여기에 계속 남는다.
import type { Message } from '../api';

export type StoredMessage = Message & { html: string };
export type StoredFile = { id: string; key: number; name: string; blob: Blob | null; missing?: boolean; tooBig?: number };

const DB_NAME = 'cool-inbox-phone';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('messages', { keyPath: 'key' });
      d.createObjectStore('files', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
async function store(name: 'messages' | 'files', mode: IDBTransactionMode) {
  return (await db()).transaction(name, mode).objectStore(name);
}

export async function putMessages(list: StoredMessage[]) {
  const tx = (await db()).transaction('messages', 'readwrite');
  const s = tx.objectStore('messages');
  for (const m of list) s.put(m);
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
export async function allMessages(): Promise<StoredMessage[]> {
  const list = await req((await store('messages', 'readonly')).getAll() as IDBRequest<StoredMessage[]>);
  return list.sort((a, b) => b.key - a.key);
}
export async function getMessage(key: number): Promise<StoredMessage | undefined> {
  return req((await store('messages', 'readonly')).get(key) as IDBRequest<StoredMessage | undefined>);
}
export const fileId = (key: number, name: string) => `${key}/${name}`;
export async function putFile(f: StoredFile) {
  await req((await store('files', 'readwrite')).put(f));
}
export async function getFile(key: number, name: string): Promise<StoredFile | undefined> {
  return req((await store('files', 'readonly')).get(fileId(key, name)) as IDBRequest<StoredFile | undefined>);
}
export async function clearAll() {
  const d = await db();
  const tx = d.transaction(['messages', 'files'], 'readwrite');
  tx.objectStore('messages').clear();
  tx.objectStore('files').clear();
  await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); });
}

/** 연결 정보 (우편함, 휴대폰 열쇠, 암호 열쇠) */
const PAIR_KEY = 'cool-inbox-pairing-v1';
export type PairingInfo = { id: string; phoneToken: string; key: string; pairedAt: number };
export function loadPairing(): PairingInfo | null {
  try { return JSON.parse(localStorage.getItem(PAIR_KEY) || 'null'); } catch { return null; }
}
export function savePairing(p: PairingInfo | null) {
  try { p ? localStorage.setItem(PAIR_KEY, JSON.stringify(p)) : localStorage.removeItem(PAIR_KEY); } catch { /* 저장 공간이 막힌 브라우저 */ }
}
