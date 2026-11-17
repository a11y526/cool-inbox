// 휴대폰 홈 화면 아이콘(PNG) 만들기
import sharp from 'sharp';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const svg = fs.readFileSync(new URL('../public/icon.svg', import.meta.url));
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)));
}
console.log('icons made');
