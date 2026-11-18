// 쿨메신저 젠투가 이 PC에 저장한 받은 쪽지를 읽는다. 읽기 전용으로만 열고, 절대 고치지 않는다.
// 위치: %LOCALAPPDATA%\CoolMessenger\Memo\<이름>.udb (SQLite, 받은 쪽지 = tbl_recv)
// 형식은 NOTES-coolmessenger.md 참고.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const utf8 = new TextDecoder('utf-8', { fatal: true });
const euckr = new TextDecoder('euc-kr');

/** 글자 칸: 대개 UTF-8, 가끔 EUC-KR */
function text(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try { return utf8.decode(v); } catch { return euckr.decode(v); }
}

/** 본문: "{COMP}" + base64(zlib) → UTF-16LE HTML. 접두어가 없으면 그대로. */
function body(v) {
  const s = text(v);
  if (!s.startsWith('{COMP}')) return s;
  try {
    return zlib.inflateSync(Buffer.from(s.slice(6), 'base64')).toString('utf16le').replace(/^\uFEFF/, '');
  } catch {
    return '';
  }
}

/** "2026/11/02 11:04:22 (월)" → "2026-11-02T11:04:22" */
function when(v) {
  const m = text(v).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return '';
  const p = s => s.padStart(2, '0');
  return `${m[1]}-${p(m[2])}-${p(m[3])}T${p(m[4])}:${m[5]}:${m[6] || '00'}`;
}

/** 첨부: "|개수|id들|폴더|파일이름|크기|폴더|파일이름|크기|" — 드라이브 경로(C:\…) 다음 칸이 파일 이름 */
function files(v) {
  const parts = text(v).split('|');
  const out = [];
  for (let i = 0; i < parts.length - 1; i++) {
    if (/^[A-Za-z]:\\/.test(parts[i]) && parts[i + 1]) {
      const size = Number(parts[i + 2]);
      out.push({ name: parts[i + 1], dir: parts[i], size: Number.isFinite(size) ? size : null });
    }
  }
  return out;
}

/** 쪽지 파일 찾기: COOL_DB가 있으면 그것, 아니면 Memo 폴더에서 가장 최근에 바뀐 .udb */
export function findDb() {
  if (process.env.COOL_DB) return fs.existsSync(process.env.COOL_DB) ? process.env.COOL_DB : null;
  const dir = path.join(process.env.LOCALAPPDATA || '', 'CoolMessenger', 'Memo');
  let best = null;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!/\.udb$/i.test(f)) continue;
      const p = path.join(dir, f);
      const t = Math.max(fs.statSync(p).mtimeMs, fs.existsSync(p + '-wal') ? fs.statSync(p + '-wal').mtimeMs : 0);
      if (!best || t > best.t) best = { p, t };
    }
  } catch {}
  return best?.p ?? null;
}

function open() {
  const p = findDb();
  if (!p) return null;
  return new DatabaseSync(p, { readOnly: true });
}

/** 받은 쪽지 목록 (본문 빼고). 지운 쪽지는 뺀다. */
export function listMessages() {
  const db = open();
  if (!db) return { ok: false, error: 'no-db' };
  try {
    const rows = db.prepare(`select MessageKey k, cast(Title as blob) t, cast(Sender as blob) s, cast(ReceiveDate as blob) d,
        IsUnRead u, cast(FilePath as blob) f
      from tbl_recv where DeletedDate is null or DeletedDate = '' order by MessageKey desc`).all();
    const list = rows.map(r => ({
      key: Number(r.k), title: text(r.t), from: text(r.s), at: when(r.d), unread: !!r.u,
      files: files(r.f).map(({ name, size }) => ({ name, size })),
    }));
    return { ok: true, list };
  } finally {
    db.close();
  }
}

/** 쪽지 하나의 본문 HTML */
export function getBody(key) {
  const db = open();
  if (!db) return null;
  try {
    const r = db.prepare('select MessageBody b from tbl_recv where MessageKey = ?').get(Number(key));
    return r ? body(r.b) : null;
  } finally {
    db.close();
  }
}

/** 쿨메신저 받은 파일 폴더 후보: 쪽지에 적힌 폴더가 실제와 다를 수 있어서(문서 폴더 위치 변경·OneDrive 등) 여러 곳을 본다 */
function receivedDirs(recorded) {
  const home = process.env.USERPROFILE || os.homedir();
  const sub = path.join('CoolMessenger Files', 'Received Files');
  const dirs = [recorded];
  for (const docs of [path.join(home, 'Documents'), path.join(home, 'OneDrive', 'Documents'), path.join(home, 'OneDrive', '문서'), path.join(home, '문서')]) dirs.push(path.join(docs, sub));
  if (process.env.OneDrive) dirs.push(path.join(process.env.OneDrive, 'Documents', sub), path.join(process.env.OneDrive, '문서', sub));
  return [...new Set(dirs)];
}

// 폴더 목록은 잠깐(10초) 기억해 둔다: 첨부 여러 개를 한꺼번에 찾을 때 폴더를 매번 다시 읽지 않게
const dirCache = new Map();
function listDir(dir) {
  const c = dirCache.get(dir);
  if (c && Date.now() - c.at < 10_000) return c.list;
  let list = [];
  try { list = fs.readdirSync(dir); } catch { /* 없는 폴더 */ }
  dirCache.set(dir, { at: Date.now(), list });
  return list;
}

/** 이름이 같은 파일, 없으면 쿨메신저가 겹친 이름에 붙이는 "이름 (1).확장자" 중 크기가 같은 것 */
function findIn(dir, name, size) {
  const exact = path.join(dir, name);
  if (fs.existsSync(exact)) return exact;
  if (size == null) return null;
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length).normalize('NFC');
  for (const f of listDir(dir)) {
    const nf = f.normalize('NFC');
    if (!nf.startsWith(base + ' (') || !nf.endsWith(ext)) continue;
    if (!/^ \(\d+\)$/.test(nf.slice(base.length, nf.length - ext.length))) continue;
    try { if (fs.statSync(path.join(dir, f)).size === size) return path.join(dir, f); } catch { /* */ }
  }
  return null;
}

/** 첨부 파일의 실제 경로. 그 쪽지에 적힌 첨부만, 실제로 있는 파일만. */
export function attachmentPath(key, name) {
  const db = open();
  if (!db) return null;
  try {
    const r = db.prepare('select cast(FilePath as blob) f from tbl_recv where MessageKey = ?').get(Number(key));
    const hit = r && files(r.f).find(x => x.name === name);
    if (!hit) return null;
    if (process.env.COOL_FILES_ROOT) return findIn(process.env.COOL_FILES_ROOT, hit.name, hit.size);
    for (const dir of receivedDirs(hit.dir.replace(/\\/g, path.sep))) {
      const p = findIn(dir, hit.name, hit.size);
      if (p) return p;
    }
    return null;
  } finally {
    db.close();
  }
}
