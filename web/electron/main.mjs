// PC 앱: 이 PC 안에서만 접속되는 작은 서버(127.0.0.1)로 화면과 API를 띄우고, 창 하나로 보여 준다.
// 컴퓨터를 켜면 알림 영역에 조용히 켜지고, 창을 닫아도 알림 영역에 남는다.
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, net, shell } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import updater from 'electron-updater';
import { handleApi } from '../server/api.mjs';
import { attachmentPath } from '../server/cool.mjs';
import { createSync } from '../server/sync.mjs';
import { handlePcApi } from '../server/pc-api.mjs';
import { RELAY_URL } from '../server/relay-url.mjs';

const { autoUpdater } = updater;

const DIST = path.join(import.meta.dirname, '..', 'dist');
const DEV_URL = process.env.VITE_DEV_URL; // 개발 중엔 Vite 서버를 그대로 쓴다
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const APP_NAME = '쿨메신저 쪽지함';
const STARTED_BY_LOGIN = process.argv.includes('--autostart');
const CAN_AUTOSTART = app.isPackaged && process.platform === 'win32';

let win = null;
let tray = null;
let url = '';
let quitting = false;
// 자동 업데이트 상태: idle | checking | downloading | ready | latest | error
const update = { state: 'idle', version: null, error: null };

// 이미 켜져 있으면 새로 켜지 말고 그 창을 보여 준다
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      if (req.url.startsWith('/api/pc/')) { pcApi(req, res); return; }
      if (handleApi(req, res)) return;
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const fp = path.join(DIST, p);
      if (!fp.startsWith(DIST)) { res.writeHead(403).end(); return; }
      fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' }).end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${srv.address().port}`));
  });
}

// ---------- 자동 실행 ----------
// 처음 설치하고 켰을 때 한 번 켜 두고, 그다음부터는 알림 영역 메뉴에서 바꾼 대로 둔다.
const PREF = () => path.join(app.getPath('userData'), 'autostart-set');
function isAutostart() {
  return CAN_AUTOSTART && app.getLoginItemSettings({ args: ['--autostart'] }).openAtLogin;
}
function setAutostart(on) {
  if (!CAN_AUTOSTART) return;
  app.setLoginItemSettings({ openAtLogin: on, args: ['--autostart'] });
  try { fs.writeFileSync(PREF(), on ? 'on' : 'off'); } catch { /* 다음에 다시 켜질 뿐 */ }
  updateTray();
}
function autostartFirstRun() {
  if (!CAN_AUTOSTART) return;
  let pref = null;
  try { pref = fs.readFileSync(PREF(), 'utf8').trim(); } catch { /* 처음 켬 */ }
  // 처음 켰거나 켜 둔 상태면 매번 다시 등록한다 (업데이트로 실행 파일 위치·이름이 바뀌어도 자동 실행이 이어지게)
  if (pref !== 'off') setAutostart(true);
}

// ---------- 창 ----------
function createWindow() {
  win = new BrowserWindow({
    width: 560, height: 760, minWidth: 380, minHeight: 520,
    title: APP_NAME, autoHideMenuBar: true, show: false, icon: path.join(import.meta.dirname, 'tray@3x.png'),
    webPreferences: { preload: path.join(import.meta.dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  // 쪽지 본문의 링크는 브라우저로
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/.test(u) && !u.startsWith(url)) shell.openExternal(u);
    return { action: 'deny' };
  });
  // 닫기 = 알림 영역으로 숨기기 (완전히 끄려면 알림 영역 메뉴의 「끝내기」)
  win.on('close', e => {
    if (quitting || !tray) return;
    e.preventDefault();
    win.hide();
  });
  win.loadURL(url);
}
function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ---------- 알림 영역 ----------
async function createTray() {
  // 알림 영역 아이콘은 같이 넣은 그림 파일로 (exe에서 꺼내 쓰면 빈 아이콘이 되어 안 보일 수 있다)
  let icon = nativeImage.createFromPath(path.join(import.meta.dirname, 'tray.png'));
  if (icon.isEmpty()) icon = await app.getFileIcon(process.execPath, { size: 'small' }).catch(() => nativeImage.createEmpty());
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  updateTray();
}
function updateTray() {
  if (!tray) return;
  const items = [{ label: '쪽지함 열기', click: showWindow }];
  if (CAN_AUTOSTART) {
    items.push({ type: 'separator' }, { label: '컴퓨터 켜면 자동 실행', type: 'checkbox', checked: isAutostart(), click: m => setAutostart(m.checked) });
  }
  items.push({ type: 'separator' }, { label: '끝내기', click: () => { quitting = true; app.quit(); } });
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// 첨부 열기: 이 PC에서는 한글·엑셀 등 그 파일의 프로그램으로 바로 연다
ipcMain.handle('open-attachment', async (_e, key, name) => {
  const p = attachmentPath(key, String(name || ''));
  if (!p) return false;
  return (await shell.openPath(p)) === '';
});

// ---------- 휴대폰으로 보내기 ----------
let sync = null;
function pcApi(req, res) {
  return handlePcApi(req, res, {
    sync,
    info: () => ({ version: app.getVersion(), update, relay: RELAY_URL }),
    restart: () => { if (update.state === 'ready') { quitting = true; autoUpdater.quitAndInstall(true, true); } },
  });
}

// ---------- 자동 업데이트 (GitHub Releases) ----------
// 새 버전을 조용히 받아 두고, 프로그램이 다음에 다시 켜질 때(예: 컴퓨터를 다시 켤 때) 설치한다.
function setupUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => { if (update.state !== 'ready') update.state = 'checking'; });
  autoUpdater.on('update-available', i => { update.state = 'downloading'; update.version = i.version; });
  autoUpdater.on('update-not-available', () => { if (update.state !== 'ready') update.state = 'latest'; });
  autoUpdater.on('update-downloaded', i => { update.state = 'ready'; update.version = i.version; });
  autoUpdater.on('error', e => {
    update.error = String(e?.message || e).split('\n')[0].slice(0, 200);
    if (update.state !== 'ready') update.state = 'error';
    // 업데이트가 안 될 때 원인을 볼 수 있게 남겨 둔다
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'update.log'), `${new Date().toISOString()} ${String(e?.stack || e)}\n`); } catch { /* 무시 */ }
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 3 * 60 * 60 * 1000); // 3시간마다
}

app.whenReady().then(async () => {
  // 중계 서버 연결은 크롬과 같은 통신 방식으로: Windows의 프록시·인증서 설정(학교 망 보안 장비 등)을 그대로 따른다.
  globalThis.fetch = (input, init) => net.fetch(input, init);
  url = DEV_URL || (await startServer());
  sync = createSync({ relay: RELAY_URL, stateFile: path.join(app.getPath('userData'), 'phones.json'), log: (...a) => console.log('[sync]', ...a) });
  sync.start();
  setupUpdater();
  console.log('[cool-inbox] serving', url);
  autostartFirstRun();
  await createTray();
  createWindow();
  // 컴퓨터 켜며 자동으로 켜진 거면 창은 띄우지 않는다
  if (!STARTED_BY_LOGIN) win.once('ready-to-show', showWindow);
});
app.on('before-quit', () => { quitting = true; });
// 창을 닫아도 알림 영역에 남아 있으므로, 창이 모두 닫혀도 끝내지 않는다
app.on('window-all-closed', () => { if (!tray) app.quit(); });
