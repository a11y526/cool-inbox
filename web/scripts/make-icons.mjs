// 아이콘(PNG) 만들기: 휴대폰 홈 화면 + Windows 프로그램·알림 영역(트레이)
import sharp from 'sharp';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const svg = fs.readFileSync(new URL('../public/icon.svg', import.meta.url));
const out = rel => fileURLToPath(new URL(rel, import.meta.url));
for (const [size, file] of [
  [192, '../public/icon-192.png'], [512, '../public/icon-512.png'], [180, '../public/apple-touch-icon.png'],
  [512, '../build/icon.png'], // 설치 파일·exe 아이콘 (electron-builder가 .ico로 바꾼다)
  [16, '../electron/tray.png'], [32, '../electron/tray@2x.png'], [48, '../electron/tray@3x.png'], // 알림 영역
]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out(file));
}
console.log('icons made');
