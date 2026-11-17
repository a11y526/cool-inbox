// 학교 PC → 휴대폰 보내기.
// 휴대폰마다 우편함이 하나씩 있다. 1분마다(쿨메신저 쪽지 파일이 바뀌면 바로):
//   1) 휴대폰이 보낸 것(up) 확인: 연결 인사, 첨부 요청, 전체 다시 받기
//   2) 아직 안 보낸 쪽지를 암호화해서 넣기(down)
//   3) 연결한 뒤에 온 쪽지의 첨부는 자동으로, 그 전 쪽지의 첨부는 휴대폰이 요청할 때 보내기
import fs from 'node:fs';
import path from 'node:path';
import { createBox, itemName, newPairing, packFile, packJson, pairingLink, relayClient, seal, open, unpack } from '../shared/box.mjs';
import { attachmentPath, findDb, getBody, listMessages } from './cool.mjs';

const BATCH = 80; // 쪽지 묶음 크기
const MAX_FILE = 25 * 1024 * 1024; // 이보다 큰 첨부는 보내지 않는다(중계 서버 한도)
const PENDING_MS = 30 * 60 * 1000; // QR을 30분 안에 안 찍으면 그 연결은 버린다

export function createSync({ relay, stateFile, log = () => {} }) {
  let state = { pairings: [] };
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* 처음 */ }
  state.pairings ||= [];
  const status = { running: false, lastRun: null, lastError: null };
  const save = () => {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state));
    fs.renameSync(stateFile + '.tmp', stateFile);
  };

  async function startPairing() {
    // 아직 안 찍은 연결은 하나만 둔다
    state.pairings = state.pairings.filter(p => p.pairedAt);
    const p = newPairing();
    await createBox(relay, p);
    const link = pairingLink(relay, p);
    // 휴대폰 열쇠는 QR에만 필요하다. 연결이 끝나면 지운다.
    state.pairings.push({ id: p.id, pcToken: p.pcToken, phoneToken: p.phoneToken, key: p.key, createdAt: Date.now(), pairedAt: null, device: null, sent: [], sentFiles: [], wanted: [], lastSync: null });
    save();
    return link;
  }

  async function removePairing(id) {
    const p = state.pairings.find(x => x.id === id);
    if (!p) return;
    try { await relayClient(relay, p.id, p.pcToken).destroy(); } catch (e) { log('destroy failed', e.message); }
    state.pairings = state.pairings.filter(x => x.id !== id);
    save();
  }

  async function handleUp(p, rc) {
    for (const it of await rc.list('up')) {
      try {
        const pkg = await unpack(await open(p.key, await rc.get('up', it.name)));
        const d = pkg.kind === 'json' ? pkg.data : null;
        if (d?.type === 'hello' && !p.pairedAt) {
          p.pairedAt = Date.now();
          p.device = String(d.device || '휴대폰').slice(0, 40);
          delete p.phoneToken;
        } else if (d?.type === 'hello') {
          p.device = String(d.device || p.device || '휴대폰').slice(0, 40);
        } else if (d?.type === 'file' && d.key != null && d.name) {
          const want = `${d.key}/${d.name}`;
          if (!p.wanted.includes(want)) p.wanted.push(want);
          p.sentFiles = p.sentFiles.filter(x => x !== want); // 다시 달라고 하면 다시 보낸다
        } else if (d?.type === 'resync') {
          p.sent = [];
          p.sentFiles = [];
        }
      } catch (e) {
        log('bad up item', e.message);
      }
      await rc.del('up', it.name);
    }
  }

  async function sendMessages(p, rc, list) {
    const sent = new Set(p.sent);
    const todo = list.filter(m => !sent.has(m.key)).reverse(); // 오래된 것부터
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH).map(m => ({ ...m, html: getBody(m.key) ?? '' }));
      await rc.put('down', itemName('m'), await seal(p.key, await packJson({ type: 'msgs', list: chunk }, true)));
      for (const m of chunk) p.sent.push(m.key);
      save();
    }
  }

  async function sendFile(p, rc, m, f) {
    const id = `${m.key}/${f.name}`;
    const fp = attachmentPath(m.key, f.name);
    let meta = { key: m.key, name: f.name };
    let bytes = new Uint8Array(0);
    if (!fp) meta.missing = true;
    else {
      const size = fs.statSync(fp).size;
      if (size > MAX_FILE) meta.tooBig = size;
      else bytes = new Uint8Array(fs.readFileSync(fp));
    }
    await rc.put('down', itemName('f'), await seal(p.key, packFile(meta, bytes)));
    p.sentFiles.push(id);
    p.wanted = p.wanted.filter(x => x !== id);
    save();
  }

  async function sendFiles(p, rc, list) {
    const done = new Set(p.sentFiles);
    const since = new Date(p.pairedAt - 24 * 3600 * 1000); // 연결 하루 전부터 온 쪽지의 첨부는 자동으로
    for (const m of list) {
      for (const f of m.files) {
        const id = `${m.key}/${f.name}`;
        if (done.has(id)) continue;
        const auto = m.at && new Date(m.at) >= since && (f.size == null || f.size <= MAX_FILE);
        if (auto || p.wanted.includes(id)) await sendFile(p, rc, m, f);
      }
    }
  }

  async function runOnce() {
    if (status.running) return;
    status.running = true;
    try {
      // 오래돼서 안 찍힌 연결 정리
      const now = Date.now();
      for (const p of state.pairings.filter(x => !x.pairedAt && now - x.createdAt > PENDING_MS)) await removePairing(p.id);
      if (!state.pairings.length) return;
      const res = listMessages();
      for (const p of state.pairings) {
        const rc = relayClient(relay, p.id, p.pcToken);
        try {
          await handleUp(p, rc);
          if (!p.pairedAt) continue;
          if (res.ok) {
            await sendMessages(p, rc, res.list);
            await sendFiles(p, rc, res.list);
          }
          p.lastSync = Date.now();
          p.error = null;
        } catch (e) {
          p.error = e.status === 404 ? 'no-box' : e.message;
          if (e.status === 404) state.pairings = state.pairings.filter(x => x !== p); // 휴대폰에서 연결을 끊음
          log('sync failed', p.id, e.message);
        }
        save();
      }
      status.lastError = res.ok ? null : res.error;
    } catch (e) {
      status.lastError = e.message;
      log('sync error', e.message);
    } finally {
      status.running = false;
      status.lastRun = Date.now();
    }
  }

  // 쿨메신저 쪽지 파일이 바뀌면 곧바로 보낸다
  let watcher = null, soon = null;
  function watch() {
    const db = findDb();
    if (!db || watcher) return;
    try {
      watcher = fs.watch(path.dirname(db), () => { clearTimeout(soon); soon = setTimeout(runOnce, 3000); });
    } catch { /* 감시가 안 되면 1분마다 확인으로 충분 */ }
  }

  function start(intervalMs = 60_000) {
    watch();
    runOnce();
    setInterval(() => { watch(); runOnce(); }, intervalMs);
    // QR을 띄워 둔 동안에는 휴대폰 인사를 3초마다 확인한다
    setInterval(() => { if (state.pairings.some(p => !p.pairedAt)) runOnce(); }, 3000);
  }

  function summary() {
    return {
      dbFound: !!findDb(),
      lastRun: status.lastRun,
      lastError: status.lastError,
      phones: state.pairings.filter(p => p.pairedAt).map(p => ({ id: p.id, device: p.device, pairedAt: p.pairedAt, lastSync: p.lastSync, sent: p.sent.length, error: p.error || null })),
      pending: state.pairings.filter(p => !p.pairedAt && p.phoneToken).map(p => ({ id: p.id, createdAt: p.createdAt, link: pairingLink(relay, p) }))[0] || null,
    };
  }

  return { startPairing, removePairing, runOnce, start, summary };
}
