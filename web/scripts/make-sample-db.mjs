// 개발용 가짜 쪽지 파일(sample/sample.udb)을 만든다. 실제 쿨메신저 형식과 같은 구조, 내용은 전부 지어낸 것.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..', 'sample');
const filesDir = path.join(root, 'files');
fs.mkdirSync(filesDir, { recursive: true });
const dbPath = path.join(root, 'sample.udb');
for (const s of ['', '-wal', '-shm']) fs.rmSync(dbPath + s, { force: true });

const db = new DatabaseSync(dbPath);
db.exec(`create table tbl_recv (MessageKey integer primary key, Title text, Sender text, ReceiveDate text,
  IsUnRead integer, FilePath text, MessageBody text, DeletedDate text)`);

const comp = html => '{COMP}' + zlib.deflateSync(Buffer.from('\uFEFF' + html, 'utf16le')).toString('base64');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const stamp = (daysAgo, h, m) => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(h)}:${p(m)}:00 (${WD[d.getDay()]})`;
};
const DIR = 'C:\\Users\\teacher\\Documents\\CoolMessenger Files\\Received Files';
const attach = names => names.length
  ? `|${names.length}|${names.map((_, i) => 100 + i).join(',')}|` + names.map(n => `${DIR}|${n}|${1024 * (n.length + 3)}`).join('|') + '|'
  : '';

const msgs = [
  [0, 8, 42, 1, '교무부', '[안내] 다음 주 학년 협의회 일정', ['협의회_안건.txt'],
    '<p>선생님들께,</p><p>다음 주 목요일 7교시 후 <b>학년 협의회</b>가 있습니다. 첨부한 안건을 미리 읽어 와 주세요.</p><table border="1"><tr><th>시간</th><th>장소</th></tr><tr><td>15:10</td><td>2층 회의실</td></tr></table>'],
  [0, 7, 55, 1, '행정실', '방과후 강사료 서류 제출 요청', [], '<p>이번 달 방과후 강사료 정산 서류를 금요일까지 행정실로 보내 주세요.</p>'],
  [1, 16, 20, 0, '학생부', '생활기록부 출결 특기사항 점검', ['점검표.csv'], '<p>학기 말 전에 출결 특기사항을 한 번씩 점검해 주세요.</p><ul><li>결석계 제출 여부</li><li>체험학습 보고서</li></ul>'],
  [3, 12, 5, 0, '정보부', '교실 컴퓨터 업데이트 안내', [], '<p>이번 주 수요일 점심시간에 교실 컴퓨터 업데이트가 있습니다. 켜 둔 채로 두시면 됩니다.</p>'],
  [6, 9, 30, 0, '교감', '학부모 상담 주간 운영 계획', ['상담주간_계획.txt', '상담신청서_양식.txt'], '<p>다음 달 학부모 상담 주간 계획을 보내드립니다. <a href="https://example.com">학교 홈페이지</a>에도 올려 두었습니다.</p>'],
  [12, 14, 0, 0, '교무부', '[필독] 2학기 시험 문항 검토 일정', [], '<p>2학기 시험 문항 검토는 아래 일정으로 진행합니다.</p><p>1차: 다음 주 화요일<br>2차: 그다음 주 목요일</p>'],
  [40, 10, 10, 0, '보건실', '독감 예방접종 희망 조사', [], '<p>교직원 독감 예방접종 희망 여부를 이번 주까지 알려 주세요.</p>'],
];
const ins = db.prepare('insert into tbl_recv values (?,?,?,?,?,?,?,?)');
msgs.forEach(([days, h, m, unread, from, title, att, html], i) => {
  ins.run(1000 + msgs.length - i, title, from, stamp(days, h, m), unread, attach(att), comp(html), null);
  for (const n of att) fs.writeFileSync(path.join(filesDir, n), `예시 첨부 파일: ${n}\n`);
});
// 지운 쪽지 — 목록에 나오면 안 됨
ins.run(1, '지운 쪽지', '테스트', stamp(2, 9, 0), 0, '', comp('<p>삭제됨</p>'), stamp(1, 9, 0));
db.close();
console.log('made', dbPath);
