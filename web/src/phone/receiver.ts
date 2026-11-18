// 중계 서버에서 받아 와서 풀고, 휴대폰에 저장한 뒤 서버에서 지운다.
import { itemName, open, packJson, relayClient, seal, unpack } from '../../shared/box.mjs';
import type { FileResult, InboxSource } from '../api';
import { allMessages, fileId, getFile, getMessage, putFile, putMessages, type PairingInfo, type StoredMessage } from './store';

export const RELAY = (import.meta.env.VITE_RELAY as string | undefined) || location.origin;

export function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return '아이폰';
  if (/ipad/i.test(ua)) return '아이패드';
  if (/android/i.test(ua)) {
    const m = /Android[^;]*;\s*([^;)]+?)(?:\s+Build|\))/i.exec(ua);
    return m && !/^K$/.test(m[1]) ? `안드로이드 (${m[1].trim()})` : '안드로이드 휴대폰';
  }
  return '휴대폰';
}

// 안드로이드 앱(APK) 안에서는 브라우저식 내려받기가 안 돼서, 파일을 앱 임시 폴더에 쓰고 한글·PDF 등 그 파일의 앱으로 연다.
type CapPlugins = {
  Filesystem: { writeFile(o: { path: string; data: string; directory: string; recursive?: boolean }): Promise<{ uri: string }> };
  FileOpener: { open(o: { filePath: string; contentType?: string; openWithDefault?: boolean }): Promise<void> };
};
const cap = (window as { Capacitor?: { Plugins?: Partial<CapPlugins> } }).Capacitor?.Plugins;
const MIME: Record<string, string> = { pdf: 'application/pdf', hwp: 'application/x-hwp', hwpx: 'application/hwp+zip', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip' };
const nativeOpen = cap?.Filesystem && cap?.FileOpener ? async (blob: Blob, name: string) => {
  const b = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  const safe = name.replace(/[\\/:*?"<>|]/g, '_');
  const { uri } = await cap.Filesystem!.writeFile({ path: `attachments/${Date.now()}-${safe}`, data: btoa(bin), directory: 'CACHE', recursive: true });
  try { await cap.FileOpener!.open({ filePath: uri, contentType: MIME[name.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream' }); return true; } catch { return false; }
} : null;

export function receiver(p: PairingInfo) {
  const rc = relayClient(RELAY, p.id, p.phoneToken);
  const send = async (obj: unknown) => rc.put('up', itemName('u'), await seal(p.key, await packJson(obj)));
  let busy: Promise<number> | null = null;

  /** 받을 것을 모두 받는다. 새로 받은 쪽지 수를 돌려준다. */
  async function pull(): Promise<number> {
    let added = 0;
    const items = await rc.list('down');
    for (const it of items) {
      const pkg = await unpack(await open(p.key, await rc.get('down', it.name)));
      if (pkg.kind === 'json' && pkg.data?.type === 'msgs') {
        const list = pkg.data.list as StoredMessage[];
        // 이미 읽음으로 본 쪽지는 그대로 두기 위해 기존 것과 합친다
        const merged: StoredMessage[] = [];
        for (const m of list) {
          const old = await getMessage(m.key);
          if (!old) added++;
          // 드라이브 ID는 따로 오므로 예전 것을 이어 받는다
          const files = old ? m.files.map(f => ({ ...f, drive: f.drive ?? old.files.find(o => o.name === f.name)?.drive })) : m.files;
          merged.push(old ? { ...m, files, unread: old.unread && m.unread } : m);
        }
        await putMessages(merged);
      } else if (pkg.kind === 'json' && pkg.data?.type === 'drive') {
        const byKey = new Map<number, { name: string; drive: string }[]>();
        for (const d of pkg.data.list as { key: number; name: string; drive: string }[]) {
          if (!/^[\w-]{10,100}$/.test(d.drive)) continue;
          if (!byKey.has(d.key)) byKey.set(d.key, []);
          byKey.get(d.key)!.push(d);
        }
        const changed: StoredMessage[] = [];
        for (const [key, ds] of byKey) {
          const m = await getMessage(key);
          if (!m) continue;
          changed.push({ ...m, files: m.files.map(f => ({ ...f, drive: ds.find(d => d.name === f.name)?.drive ?? f.drive })) });
        }
        if (changed.length) await putMessages(changed);
      } else if (pkg.kind === 'file') {
        const { key, name, missing, tooBig } = pkg.meta;
        await putFile({ id: fileId(key, name), key, name, blob: missing || tooBig ? null : new Blob([pkg.bytes as BlobPart]), missing, tooBig });
      }
      await rc.del('down', it.name); // 받았으니 서버에서 지운다
    }
    return added;
  }

  const sync = () => (busy ??= pull().finally(() => { busy = null; }));

  const source: InboxSource = {
    load: async () => {
      try { await sync(); } catch (e) { if ((e as { status?: number }).status === 404) throw new Error('unpaired'); /* 인터넷이 안 되면 저장된 것만 */ }
      return (await allMessages()).map(({ html: _h, ...m }) => m);
    },
    body: async key => (await getMessage(key))?.html ?? '',
    openFile: async (key, name): Promise<FileResult> => {
      const f = await getFile(key, name);
      if (f?.blob && nativeOpen) {
        return (await nativeOpen(f.blob, name)) ? 'opened' : 'missing';
      }
      if (f?.blob) {
        const url = URL.createObjectURL(f.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.target = '_blank';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return 'opened';
      }
      // 휴대폰에 없으면 구글 드라이브(학교 PC 백업)에서 바로 연다
      const drive = (await getMessage(key))?.files.find(x => x.name === name)?.drive;
      if (drive) {
        window.open(`https://drive.google.com/file/d/${encodeURIComponent(drive)}/view`, '_blank', 'noopener');
        return 'drive';
      }
      if (f?.tooBig) return 'tooBig';
      if (f?.missing) return 'missing';
      await send({ type: 'file', key, name });
      return 'requested';
    },
    fileArrived: async (key, name) => {
      await sync().catch(() => {});
      return !!(await getFile(key, name));
    },
  };

  return {
    source,
    sync,
    hello: () => send({ type: 'hello', device: deviceName() }),
    resync: () => send({ type: 'resync' }),
    unpair: () => rc.destroy(),
  };
}
