export type Pairing = { id: string; phoneToken: string; key: string };
export const b64u: { from(b: Uint8Array): string; to(s: string): Uint8Array };
export function randomToken(n?: number): string;
export function parsePairingHash(hash: string): Pairing | null;
export function seal(key: string, plain: Uint8Array): Promise<Uint8Array>;
export function open(key: string, sealed: Uint8Array): Promise<Uint8Array>;
export function packJson(obj: unknown, compress?: boolean): Promise<Uint8Array>;
export function unpack(buf: Uint8Array): Promise<{ kind: 'json'; data: any } | { kind: 'file'; meta: any; bytes: Uint8Array }>;
export function itemName(prefix: string): string;
export function relayClient(relay: string, id: string, token: string): {
  list(dir: 'up' | 'down'): Promise<{ name: string; size: number }[]>;
  get(dir: 'up' | 'down', name: string): Promise<Uint8Array>;
  put(dir: 'up' | 'down', name: string, bytes: Uint8Array): Promise<void>;
  del(dir: 'up' | 'down', name: string): Promise<void>;
  destroy(): Promise<void>;
};
