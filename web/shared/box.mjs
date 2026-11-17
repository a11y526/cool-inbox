// 학교 PC와 휴대폰이 함께 쓰는 우편함 규칙과 암호화. (Node 24와 브라우저 둘 다 Web Crypto를 쓴다)
//
// 연결 링크: <중계 주소>/#p=<우편함ID>.<휴대폰 열쇠>.<암호 열쇠>
//   '#' 뒤는 브라우저가 서버로 보내지 않는다 → 암호 열쇠는 중계 서버에 절대 닿지 않는다.
//
// 꾸러미(암호화 전) 첫 바이트가 종류:
//   0 = JSON 그대로        (휴대폰 → PC: 인사, 첨부 요청)
//   1 = deflate-raw JSON   (PC → 휴대폰: 쪽지 묶음)
//   2 = 파일               [4바이트 메타 길이][메타 JSON][파일 바이트]
// 암호화: AES-256-GCM, [12바이트 nonce][암호문]

const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = {
  from(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  to(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  },
};

export const randomToken = (n = 32) => b64u.from(crypto.getRandomValues(new Uint8Array(n)));

export async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 새 연결: PC가 만든다. */
export function newPairing() {
  return { id: randomToken(16), pcToken: randomToken(32), phoneToken: randomToken(32), key: randomToken(32) };
}
export function pairingLink(relay, p) {
  return `${relay.replace(/\/$/, '')}/#p=${p.id}.${p.phoneToken}.${p.key}`;
}
export function parsePairingHash(hash) {
  const m = /[#&]p=([A-Za-z0-9_-]{22,64})\.([A-Za-z0-9_-]{40,64})\.([A-Za-z0-9_-]{40,64})/.exec(hash || '');
  return m ? { id: m[1], phoneToken: m[2], key: m[3] } : null;
}

const keyCache = new Map();
function importKey(keyB64) {
  if (!keyCache.has(keyB64)) keyCache.set(keyB64, crypto.subtle.importKey('raw', b64u.to(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']));
  return keyCache.get(keyB64);
}
export async function seal(keyB64, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(keyB64), plain));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}
export async function open(keyB64, sealed) {
  const b = new Uint8Array(sealed);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, await importKey(keyB64), b.subarray(12)));
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** 꾸러미 만들기 */
export async function packJson(obj, compress = false) {
  const body = enc.encode(JSON.stringify(obj));
  const data = compress ? await pipe(body, new CompressionStream('deflate-raw')) : body;
  const out = new Uint8Array(1 + data.length);
  out[0] = compress ? 1 : 0;
  out.set(data, 1);
  return out;
}
export function packFile(meta, bytes) {
  const m = enc.encode(JSON.stringify(meta));
  const out = new Uint8Array(1 + 4 + m.length + bytes.length);
  out[0] = 2;
  new DataView(out.buffer).setUint32(1, m.length);
  out.set(m, 5);
  out.set(bytes, 5 + m.length);
  return out;
}
/** 꾸러미 풀기 → { kind: 'json', data } | { kind: 'file', meta, bytes } */
export async function unpack(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0) return { kind: 'json', data: JSON.parse(dec.decode(b.subarray(1))) };
  if (b[0] === 1) return { kind: 'json', data: JSON.parse(dec.decode(await pipe(b.subarray(1), new DecompressionStream('deflate-raw')))) };
  if (b[0] === 2) {
    const len = new DataView(b.buffer, b.byteOffset).getUint32(1);
    return { kind: 'file', meta: JSON.parse(dec.decode(b.subarray(5, 5 + len))), bytes: b.subarray(5 + len) };
  }
  throw new Error('unknown-package');
}

/** 꾸러미 이름: 시간순으로 정렬되게 */
export const itemName = prefix => `${prefix}-${Date.now().toString(36).padStart(9, '0')}-${randomToken(6)}`;

/** 중계 서버 호출 */
export function relayClient(relay, id, token) {
  const base = `${relay.replace(/\/$/, '')}/r/box/${id}`;
  const h = { Authorization: `Bearer ${token}` };
  const ok = async r => { if (!r.ok) { const e = new Error(`relay-${r.status}`); e.status = r.status; throw e; } return r; };
  return {
    list: async dir => (await (await ok(await fetch(`${base}/${dir}`, { headers: h, cache: 'no-store' }))).json()).items,
    get: async (dir, name) => new Uint8Array(await (await ok(await fetch(`${base}/${dir}/${name}`, { headers: h, cache: 'no-store' }))).arrayBuffer()),
    put: async (dir, name, bytes) => { await ok(await fetch(`${base}/${dir}/${name}`, { method: 'PUT', headers: h, body: bytes })); },
    del: async (dir, name) => { await ok(await fetch(`${base}/${dir}/${name}`, { method: 'DELETE', headers: h })); },
    destroy: async () => { await ok(await fetch(base, { method: 'DELETE', headers: h })); },
  };
}
export async function createBox(relay, p) {
  const r = await fetch(`${relay.replace(/\/$/, '')}/r/box`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: p.id, pcHash: await sha256hex(p.pcToken), phoneHash: await sha256hex(p.phoneToken) }),
  });
  if (!r.ok) throw new Error(`relay-${r.status}`);
}
