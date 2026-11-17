-- 우편함: 열쇠는 SHA-256만 저장
CREATE TABLE IF NOT EXISTS boxes (
  id TEXT PRIMARY KEY,
  pc_hash TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- 아직 받아 가지 않은 암호화된 꾸러미
CREATE TABLE IF NOT EXISTS items (
  box TEXT NOT NULL,
  dir TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (box, dir, name)
);
-- 꾸러미 내용 (D1 한 줄 크기 제한 때문에 1MB씩 나눠 담는다)
CREATE TABLE IF NOT EXISTS chunks (
  box TEXT NOT NULL,
  dir TEXT NOT NULL,
  name TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (box, dir, name, idx)
);
