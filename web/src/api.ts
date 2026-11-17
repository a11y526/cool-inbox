// 쪽지 데이터. PC 앱·개발 서버·(나중에) 휴대폰이 모두 같은 /api를 쓴다.

export type Attachment = { name: string; size: number | null };
export type Message = {
  key: number;
  title: string;
  from: string;
  at: string; // "2026-11-02T11:04:22"
  unread: boolean;
  files: Attachment[];
};

type DesktopBridge = { openAttachment: (key: number, name: string) => Promise<boolean> };
declare global { interface Window { desktop?: DesktopBridge } }

export async function fetchMessages(): Promise<Message[]> {
  const r = await fetch('api/messages', { cache: 'no-store' });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error === 'no-db' ? 'no-db' : 'read-failed');
  return data.list;
}

export async function fetchBody(key: number): Promise<string> {
  const r = await fetch(`api/messages/${key}/body`, { cache: 'no-store' });
  if (!r.ok) throw new Error('body-failed');
  return (await r.json()).html as string;
}

/** PC 앱이면 그 파일의 프로그램(한글 등)으로 열고, 아니면 브라우저에서 연다. */
export async function openAttachment(key: number, name: string): Promise<boolean> {
  if (window.desktop) return window.desktop.openAttachment(key, name);
  const url = `api/files/${key}/${encodeURIComponent(name)}`;
  const head = await fetch(url, { method: 'GET' });
  if (!head.ok) return false;
  window.open(url, '_blank', 'noopener');
  return true;
}

/** 읽음 표시는 이 앱 안에서만 기억한다(쿨메신저 파일은 절대 고치지 않는다). */
const SEEN_KEY = 'cool-inbox-seen-v1';
export function loadSeen(): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
}
export function saveSeen(seen: Set<number>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* 저장 못 해도 화면은 그대로 */ }
}

/** 받은 쪽지 화면이 쓰는 데이터. PC(개발용)는 /api, 휴대폰은 휴대폰 안 저장소. */
export type FileResult = 'opened' | 'requested' | 'missing' | 'tooBig';
export type InboxSource = {
  /** 새로 받아 오기(휴대폰: 중계 서버에서) 후 목록 */
  load: () => Promise<Message[]>;
  body: (key: number) => Promise<string>;
  openFile: (key: number, name: string) => Promise<FileResult>;
  /** 요청한 첨부가 도착했는지 (휴대폰만) — 새로 받아 온 뒤 확인 */
  fileArrived?: (key: number, name: string) => Promise<boolean>;
};
export const pcSource: InboxSource = {
  load: fetchMessages,
  body: fetchBody,
  openFile: async (key, name) => ((await openAttachment(key, name).catch(() => false)) ? 'opened' : 'missing'),
};
