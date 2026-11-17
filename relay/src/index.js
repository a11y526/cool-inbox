// 쿨메신저 쪽지함 중계 서버 (Cloudflare Worker + D1).
//
// 학교 PC와 휴대폰 사이의 "우편함"만 맡는다.
// - 오가는 내용은 전부 PC·휴대폰에서 암호화된 상태로만 들어온다. 서버는 열쇠가 없어서 읽을 수 없다.
// - 휴대폰이 받아 가면 바로 지운다(DELETE). 받아 가지 않은 것만 잠시 남는다.
//
// 우편함 하나 = PC 하나 ↔ 휴대폰 하나. 방향은 둘:
//   down: PC → 휴대폰 (쪽지, 첨부)      쓰기 = PC 열쇠,   읽기·지우기 = 휴대폰 열쇠
//   up:   휴대폰 → PC (연결 인사, 첨부 요청)  쓰기 = 휴대폰 열쇠, 읽기·지우기 = PC 열쇠
//
// API (모두 /r/ 아래):
//   POST   /r/box                       { id, pcHash, phoneHash }  우편함 만들기 (PC가 연결할 때)
//   GET    /r/box/:id/:dir              받을 것 목록  [{ name, size }]
//   PUT    /r/box/:id/:dir/:name        넣기 (암호화된 바이트)
//   GET    /r/box/:id/:dir/:name        꺼내기
//   DELETE /r/box/:id/:dir/:name        지우기
//   DELETE /r/box/:id                   우편함 통째로 지우기 (연결 끊기)
// 열쇠는 Authorization: Bearer <token>. 서버에는 열쇠의 SHA-256만 저장한다.

const MAX_ITEM = 30 * 1024 * 1024; // 한 번에 30MB까지
const MAX_ITEMS = 5000; // 한 방향에 쌓일 수 있는 최대 개수
const ID_RE = /^[A-Za-z0-9_-]{22,64}$/;
const CHUNK = 1_000_000; // D1 한 줄 크기 제한 때문에 1MB씩 나눠 담는다
const NAME_RE = /^[A-Za-z0-9_.-]{1,80}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
const err = (status, error) => json({ error }, status);

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function loadMeta(env, id) {
  const r = await env.DB.prepare('SELECT pc_hash AS pcHash, phone_hash AS phoneHash FROM boxes WHERE id = ?').bind(id).first();
  return r || null;
}

/** 이 요청이 dir 방향에 대해 할 수 있는 일: 'write' | 'read' | null */
async function role(req, meta, dir) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const h = await sha256hex(token);
  const isPc = timingSafeEqual(h, meta.pcHash);
  const isPhone = timingSafeEqual(h, meta.phoneHash);
  if (dir === 'down') return isPc ? 'write' : isPhone ? 'read' : null;
  if (dir === 'up') return isPhone ? 'write' : isPc ? 'read' : null;
  if (dir === '*') return isPc || isPhone ? 'owner' : null;
  return null;
}

async function listItems(env, box, dir) {
  const r = await env.DB.prepare('SELECT name, size FROM items WHERE box = ? AND dir = ? ORDER BY name LIMIT ?').bind(box, dir, MAX_ITEMS).all();
  return r.results;
}
async function removeItem(env, box, dir, name) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM chunks WHERE box = ? AND dir = ? AND name = ?').bind(box, dir, name),
    env.DB.prepare('DELETE FROM items WHERE box = ? AND dir = ? AND name = ?').bind(box, dir, name),
  ]);
}

async function handleApi(req, env, parts) {
  // parts: ['r','box', id?, dir?, name?]
  if (parts[1] !== 'box') return err(404, 'unknown');

  if (req.method === 'POST' && parts.length === 2) {
    const body = await req.json().catch(() => null);
    if (!body || !ID_RE.test(body.id || '') || !HASH_RE.test(body.pcHash || '') || !HASH_RE.test(body.phoneHash || '')) return err(400, 'bad-request');
    const r = await env.DB.prepare('INSERT OR IGNORE INTO boxes (id, pc_hash, phone_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(body.id, body.pcHash, body.phoneHash, Date.now()).run();
    if (!r.meta.changes) return err(409, 'exists');
    return json({ ok: true }, 201);
  }

  const id = parts[2];
  if (!ID_RE.test(id || '')) return err(400, 'bad-id');
  const meta = await loadMeta(env, id);
  if (!meta) return err(404, 'no-box');

  // 우편함 통째로 지우기
  if (req.method === 'DELETE' && parts.length === 3) {
    if (!(await role(req, meta, '*'))) return err(403, 'forbidden');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM chunks WHERE box = ?').bind(id),
      env.DB.prepare('DELETE FROM items WHERE box = ?').bind(id),
      env.DB.prepare('DELETE FROM boxes WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  }

  const dir = parts[3];
  if (dir !== 'down' && dir !== 'up') return err(400, 'bad-dir');
  const can = await role(req, meta, dir);
  if (!can) return err(403, 'forbidden');
  if (parts.length === 4 && req.method === 'GET') {
    if (can !== 'read') return err(403, 'forbidden');
    return json({ items: await listItems(env, id, dir) });
  }

  const name = parts[4];
  if (parts.length !== 5 || !NAME_RE.test(name || '')) return err(400, 'bad-name');

  if (req.method === 'PUT') {
    if (can !== 'write') return err(403, 'forbidden');
    const len = Number(req.headers.get('Content-Length') || 0);
    if (!len || len > MAX_ITEM) return err(413, 'too-large');
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE box = ? AND dir = ?').bind(id, dir).first('n');
    if (count >= MAX_ITEMS) return err(507, 'box-full');
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.length > MAX_ITEM) return err(413, 'too-large');
    await removeItem(env, id, dir, name); // 같은 이름으로 다시 보내면 덮어쓴다
    const stmts = [];
    for (let i = 0, idx = 0; i < buf.length; i += CHUNK, idx++) {
      stmts.push(env.DB.prepare('INSERT INTO chunks (box, dir, name, idx, data) VALUES (?, ?, ?, ?, ?)').bind(id, dir, name, idx, buf.subarray(i, i + CHUNK)));
    }
    // 내용을 다 넣은 뒤에 목록에 올린다: 받는 쪽이 반쯤 들어간 꾸러미를 보지 않게
    stmts.push(env.DB.prepare('INSERT INTO items (box, dir, name, size, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, dir, name, buf.length, Date.now()));
    await env.DB.batch(stmts);
    return json({ ok: true }, 201);
  }
  if (req.method === 'GET') {
    if (can !== 'read') return err(403, 'forbidden');
    const item = await env.DB.prepare('SELECT size FROM items WHERE box = ? AND dir = ? AND name = ?').bind(id, dir, name).first();
    if (!item) return err(404, 'no-item');
    const rows = (await env.DB.prepare('SELECT data FROM chunks WHERE box = ? AND dir = ? AND name = ? ORDER BY idx').bind(id, dir, name).all()).results;
    const out = new Uint8Array(item.size);
    let off = 0;
    for (const r of rows) { const d = new Uint8Array(r.data); out.set(d, off); off += d.length; }
    return new Response(out, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', ...cors } });
  }
  if (req.method === 'DELETE') {
    if (can !== 'read') return err(403, 'forbidden');
    await removeItem(env, id, dir, name);
    return json({ ok: true });
  }
  return err(405, 'method');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'r') {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      try {
        return await handleApi(req, env, parts);
      } catch (e) {
        return err(500, 'server');
      }
    }
    // 안드로이드 앱 내려받기 (학교 PC 화면의 1단계 QR)
    if (url.pathname === '/android') {
      return Response.redirect('https://github.com/a11y526/cool-inbox/releases/download/android/CoolInbox-Android.apk', 302);
    }
    // 그 밖의 주소는 휴대폰 웹앱 화면 파일
    return env.ASSETS.fetch(req);
  },
};
