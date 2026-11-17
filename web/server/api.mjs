// 화면이 쓰는 API. PC 앱(Electron)과 개발 서버(Vite)가 같은 코드를 쓴다.
//   GET /api/messages                 받은 쪽지 목록
//   GET /api/messages/:key/body       쪽지 본문 HTML
//   GET /api/files/:key/:name         첨부 파일 내려받기
import fs from 'node:fs';
import path from 'node:path';
import { listMessages, getBody, attachmentPath } from './cool.mjs';

const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

/** 처리했으면 true. /api/로 시작하지 않으면 false를 돌려 다음 처리기로 넘긴다. */
export function handleApi(req, res) {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== 'api') return false;
  if (req.method !== 'GET') { json(res, 405, { error: 'method' }); return true; }
  try {
    if (parts[1] === 'messages' && parts.length === 2) {
      json(res, 200, listMessages());
    } else if (parts[1] === 'messages' && parts[3] === 'body' && parts.length === 4) {
      const html = getBody(parts[2]);
      html == null ? json(res, 404, { error: 'not-found' }) : json(res, 200, { html });
    } else if (parts[1] === 'files' && parts.length === 4) {
      const p = attachmentPath(parts[2], parts[3]);
      if (!p) { json(res, 404, { error: 'file-missing' }); return true; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.basename(p))}`,
      });
      fs.createReadStream(p).pipe(res);
    } else {
      json(res, 404, { error: 'unknown' });
    }
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) });
  }
  return true;
}
