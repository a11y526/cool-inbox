// 학교 PC ↔ 휴대폰 연결.
// 학교 네트워크(랜선·와이파이)에서 휴대폰이 접속할 수 있는 작은 서버를 연다.
// 지금은 "연결 테스트"만 한다: 쪽지는 아직 보내지 않는다(암호화·연결 승인 없이 쪽지를 네트워크에 열지 않기 위해).
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

export const LAN_PORT = 47810;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

const state = { lanError: null, phones: [] }; // phones: [{ at, ip, device }]

/** 이 PC의 학교 네트워크 주소들 (IPv4, 내부망만). 랜선이 먼저 오도록 정렬. */
export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue; // 연결 안 된 어댑터
      const virtual = /virtual|vmware|vbox|hyper-v|vethernet|loopback|docker|wsl|tailscale|zerotier/i.test(name);
      out.push({ ip: a.address, name, virtual });
    }
  }
  return out.sort((x, y) => Number(x.virtual) - Number(y.virtual));
}

function deviceName(ua = '') {
  if (/iphone/i.test(ua)) return '아이폰';
  if (/ipad/i.test(ua)) return '아이패드';
  if (/android/i.test(ua)) return '안드로이드 휴대폰';
  return '기기';
}

/** PC 화면이 쓰는 상태 */
export function pcStatus(extra = {}) {
  const addrs = lanAddresses();
  const main = addrs[0]?.ip ?? null;
  return {
    port: LAN_PORT,
    addresses: addrs,
    testUrl: main ? `http://${main}:${LAN_PORT}/?phone=1` : null,
    lanError: state.lanError,
    phones: state.phones,
    ...extra,
  };
}

/** 휴대폰이 접속하는 서버. dist(화면 파일)와 연결 테스트 API만 연다. */
export function startLanServer(distDir) {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/phone/hello' && req.method === 'POST') {
      const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      state.phones = [{ at: new Date().toISOString(), ip, device: deviceName(req.headers['user-agent']) }, ...state.phones].slice(0, 5);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ ok: true, pc: os.hostname() }));
      return;
    }
    if (url.pathname.startsWith('/api/')) { res.writeHead(404).end(); return; }
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const fp = path.join(distDir, p);
    if (!fp.startsWith(distDir)) { res.writeHead(403).end(); return; }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
    });
  });
  srv.on('error', e => { state.lanError = e.code === 'EADDRINUSE' ? 'port-in-use' : String(e.code || e.message); });
  srv.listen(LAN_PORT, '0.0.0.0', () => { state.lanError = null; });
  return srv;
}
