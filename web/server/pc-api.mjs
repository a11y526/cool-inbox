// PC 프로그램 화면이 쓰는 API (/api/pc/...). PC 앱(Electron)과 개발 서버가 같이 쓴다.
const sendJson = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

export async function handlePcApi(req, res, { sync, info, restart }) {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/pc/status') return sendJson(res, 200, { ...info(), sync: sync.summary() });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
    if (u.pathname === '/api/pc/pair') return sendJson(res, 200, { link: await sync.startPairing() });
    if (u.pathname === '/api/pc/unpair') { await sync.removePairing(u.searchParams.get('id')); return sendJson(res, 200, { ok: true }); }
    if (u.pathname === '/api/pc/sync') { sync.runOnce(); return sendJson(res, 200, { ok: true }); }
    if (u.pathname === '/api/pc/restart') { sendJson(res, 200, { ok: true }); restart?.(); return; }
    sendJson(res, 404, { error: 'unknown' });
  } catch (e) {
    sendJson(res, 500, { error: String(e?.message || e) });
  }
}
