// 이 PC에 「Google Drive(PC용)」가 있고 첨부 폴더(문서\CoolMessenger Files)를 백업 중이면,
// 첨부 파일의 구글 드라이브 파일 ID를 찾는다. 휴대폰은 그 ID로 드라이브에서 바로 연다.
// 구글 드라이브 앱의 기록 파일을 읽기 전용으로만 보고, 아무것도 고치지 않는다. 없으면 조용히 null.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function driveFsRoot() {
  if (process.env.COOL_DRIVEFS) return process.env.COOL_DRIVEFS;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || '', 'Google', 'DriveFS');
  return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'DriveFS');
}

/** 계정 폴더마다: 백업 목록(mirror_sqlite.db) + 드라이브 ID(mirror_metadata_sqlite.db) */
function accounts() {
  const root = driveFsRoot();
  let names = [];
  try { names = fs.readdirSync(root); } catch { return []; }
  return names
    .map(n => ({ mirror: path.join(root, n, 'mirror_sqlite.db'), meta: path.join(root, n, 'mirror_metadata_sqlite.db') }))
    .filter(a => fs.existsSync(a.mirror) && fs.existsSync(a.meta));
}

const split = p => p.split(/[\\/]+/).filter(Boolean).map(s => s.toLowerCase());

/**
 * 백업 목록을 한 번 읽어 두고, 파일 경로 → 드라이브 파일 ID를 찾는 함수를 돌려준다.
 * 백업이 없으면 null.
 */
export function driveIndex() {
  const accs = accounts();
  if (!accs.length) return null;
  const loaded = [];
  for (const a of accs) {
    let mirror, meta;
    try {
      mirror = new DatabaseSync(a.mirror, { readOnly: true });
      meta = new DatabaseSync(a.meta, { readOnly: true });
      const rows = mirror.prepare('select local_stable_id l, parent_local_stable_id p, local_filename n, stable_id s from mirror_item').all();
      const pending = new Set(mirror.prepare('select local_stable_id l from pending_uploads').all().map(r => r.l));
      mirror.close();
      const byId = new Map(), byName = new Map();
      for (const r of rows) {
        byId.set(r.l, r);
        const k = String(r.n || '').toLowerCase();
        if (!byName.has(k)) byName.set(k, []);
        byName.get(k).push(r);
      }
      loaded.push({ byId, byName, pending, idOf: meta.prepare('select id from items where stable_id = ? and trashed = 0'), meta });
    } catch {
      try { mirror?.close(); } catch { /* */ }
      try { meta?.close(); } catch { /* */ }
    }
  }
  if (!loaded.length) return null;

  /** 실제 파일 경로(C:\Users\…\Documents\CoolMessenger Files\Received Files\a.hwp) → 드라이브 ID */
  function lookup(filePath) {
    const want = split(filePath);
    for (const acc of loaded) {
      for (const r of acc.byName.get(want.at(-1)) || []) {
        if (acc.pending.has(r.l)) continue; // 아직 올라가는 중
        // 백업 목록에서 위로 따라가며 만든 경로가 실제 경로의 끝부분과 같아야 한다
        let cur = r, i = want.length - 1, ok = true;
        while (cur) {
          if (i < 0 || String(cur.n || '').toLowerCase() !== want[i]) { ok = false; break; }
          i--;
          cur = cur.p > 0 ? acc.byId.get(cur.p) : null;
        }
        if (!ok || want.length - 1 - i < 2) continue; // 폴더 이름까지는 맞아야 한다
        const id = acc.idOf.get(r.s)?.id;
        if (id && !/^local/.test(id)) return id;
      }
    }
    return null;
  }
  lookup.close = () => { for (const a of loaded) try { a.meta.close(); } catch { /* */ } };
  return lookup;
}
