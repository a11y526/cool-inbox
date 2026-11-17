// 중계 서버 주소. 이 파일을 relay-url.mjs로 복사하고 주소를 넣는다 (relay-url.mjs는 git에 올리지 않는다).
export const RELAY_URL = process.env.COOL_RELAY || 'https://cool-inbox.<계정>.workers.dev';
