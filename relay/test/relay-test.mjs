// 중계 서버 동작 확인: node test/relay-test.mjs [주소]
import crypto from 'node:crypto';
const BASE = process.argv[2] || 'http://localhost:8787';
const rnd = n => crypto.randomBytes(n).toString('base64url');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const id = rnd(16), pc = rnd(32), phone = rnd(32);
const call = (method, path, token, body) => fetch(BASE + path, { method, headers: token ? { Authorization: 'Bearer ' + token } : {}, body });
const check = (label, cond) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + label); if (!cond) process.exitCode = 1; };

let r = await fetch(BASE + '/r/box', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, pcHash: hash(pc), phoneHash: hash(phone) }) });
check('우편함 만들기 201', r.status === 201);
r = await fetch(BASE + '/r/box', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, pcHash: hash(pc), phoneHash: hash(phone) }) });
check('같은 우편함 또 만들기 409', r.status === 409);

const big = crypto.randomBytes(2_500_000); // 1MB 조각 3개
check('PC가 down에 넣기', (await call('PUT', `/r/box/${id}/down/a1`, pc, big)).status === 201);
check('휴대폰은 down에 못 넣음', (await call('PUT', `/r/box/${id}/down/a2`, phone, 'x')).status === 403);
check('열쇠 없으면 목록 못 봄', (await call('GET', `/r/box/${id}/down`)).status === 403);
check('PC는 down 목록 못 봄', (await call('GET', `/r/box/${id}/down`, pc)).status === 403);
const list = await (await call('GET', `/r/box/${id}/down`, phone)).json();
check('휴대폰이 down 목록 봄', list.items?.length === 1 && list.items[0].size === big.length);
const got = Buffer.from(await (await call('GET', `/r/box/${id}/down/a1`, phone)).arrayBuffer());
check('휴대폰이 꺼낸 내용이 같음 (조각 합치기)', got.equals(big));
check('휴대폰이 지우기', (await call('DELETE', `/r/box/${id}/down/a1`, phone)).status === 200);
check('지운 뒤 목록 비어 있음', (await (await call('GET', `/r/box/${id}/down`, phone)).json()).items.length === 0);

check('휴대폰이 up에 넣기', (await call('PUT', `/r/box/${id}/up/h1`, phone, 'hello')).status === 201);
check('PC가 up 읽기', (await (await call('GET', `/r/box/${id}/up/h1`, pc)).text()) === 'hello');
check('잘못된 이름 거부', (await call('PUT', `/r/box/${id}/up/..%2Fx`, phone, 'x')).status === 400);
check('연결 끊기', (await call('DELETE', `/r/box/${id}`, pc)).status === 200);
check('끊은 뒤 우편함 없음', (await call('GET', `/r/box/${id}/up`, pc)).status === 404);
