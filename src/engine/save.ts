// 저장 v2(GDD_v2 5.1): `fof.save.v2` 한 키. 어댑터로 감싸 localStorage -> Capacitor Preferences 로 바꿀 수 있다(둘 다 비동기 모양).
// 버전 사슬: 없음(0) -> 2. 깨진 저장은 `fof.save.broken`으로 옮기고 새로 시작, v1 저장은 도감 수집분만 가문 장부로 옮긴다.
import { createGame, SAVE_VERSION } from './game';
import { endingById } from './data';
import type { GameState } from './types';

export const SAVE_KEY = 'fof.save.v2';
export const V1_KEY = 'fof.save.v1';
export const BROKEN_KEY = 'fof.save.broken';
export const BROKEN_NOTICE = '저장 데이터를 읽지 못해 새로 시작합니다.';
export const V1_NOTICE = '옛 기록의 도감을 가문 장부로 옮겼습니다. 2세대부터 새로 시작합니다.';

/** Capacitor Preferences(`{get({key}), set({key,value}), remove({key})}`)에 그대로 맞출 수 있는 비동기 모양. */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

export function localStorageAdapter(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): StorageAdapter {
  const ls = () => storage ?? (globalThis as any).localStorage;
  return {
    async get(key) {
      try { return ls().getItem(key); } catch { return null; }
    },
    async set(key, value) {
      try { ls().setItem(key, value); return true; } catch { return false; }
    },
    async remove(key) {
      try { ls().removeItem(key); } catch { /* ignore */ }
    },
  };
}
export function memoryAdapter(): StorageAdapter & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    get: async (k) => (k in data ? data[k] : null),
    set: async (k, v) => ((data[k] = v), true),
    remove: async (k) => void delete data[k],
  };
}
/** Capacitor Preferences 를 같은 모양으로 감싼다(나중에 `import { Preferences } from '@capacitor/preferences'` 를 넘기면 된다). */
export function preferencesAdapter(P: { get(o: { key: string }): Promise<{ value: string | null }>; set(o: { key: string; value: string }): Promise<void>; remove(o: { key: string }): Promise<void> }): StorageAdapter {
  return {
    get: async (key) => (await P.get({ key })).value,
    set: async (key, value) => { await P.set({ key, value }); return true; },
    remove: async (key) => P.remove({ key }),
  };
}

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
/** 기본값에 저장값을 덮는다. 기본값에 있는 키의 객체는 재귀로 채우고, 나머지는 저장값을 그대로 쓴다. */
function fill<T>(def: T, val: any): T {
  if (!isObj(def) || !isObj(val)) return (val === undefined ? def : val) as T;
  const out: Record<string, any> = { ...(def as any) };
  for (const [k, v] of Object.entries(val)) out[k] = k in out && isObj(out[k]) && isObj(v) ? fill(out[k], v) : v;
  return out as T;
}

/** 버전 사슬. 키 = 그 버전에서 다음 버전으로. 0 = 버전 표시가 없는 것(없음). */
const MIGRATIONS: Record<number, (x: any) => any> = {
  0: (x) => ({ ...x, version: 2 }), // 없음 -> v2: 모자란 칸은 아래 normalize 가 기본값으로 채운다
};

function valid(x: any): boolean {
  const r = x?.run;
  return !!(isObj(x) && isObj(r) && typeof r.cash === 'number' && isObj(r.debts) && isObj(r.stats) && isObj(r.friends) && isObj(x.family) && isObj(x.family.ledger) && isObj(x.settings));
}

/** 어느 버전의 저장이든 v2 GameState 로. 읽을 수 없으면 null. */
export function migrate(raw: unknown): GameState | null {
  if (!isObj(raw)) return null;
  let x: any = raw;
  let v = typeof x.version === 'number' ? x.version : 0;
  if (v > SAVE_VERSION) return null;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) return null;
    x = m(x);
    v = x.version;
  }
  if (!valid(x)) return null;
  const base = createGame({ seed: x.run.seed ?? 1, deviceId: x.deviceId });
  const g = fill(base, x) as GameState;
  g.estate = x.estate ?? null;
  g.pendingEnding = x.pendingEnding ?? null;
  g.version = 2;
  return g;
}

export function serialize(g: GameState, now: number): string {
  g.savedAt = now;
  return JSON.stringify(g);
}
export async function saveGame(a: StorageAdapter, g: GameState, now: number): Promise<boolean> {
  return a.set(SAVE_KEY, serialize(g, now));
}

export type LoadSource = 'new' | 'v2' | 'v1' | 'broken';
export interface LoadResult {
  g: GameState;
  source: LoadSource;
  notice: string | null;
}

/** v1 의 도감(`encyclopedia`)을 가문 장부로. 세대 표시는 '옛 기록'(gen 0). */
function fromV1(v1: any, fresh: () => GameState): GameState | null {
  if (!isObj(v1) || !isObj(v1.encyclopedia)) return null;
  const g = fresh();
  for (const [id, e] of Object.entries<any>(v1.encyclopedia)) {
    if (!endingById[id]) continue;
    const count = Math.max(1, Number(e?.count) || 1);
    g.family.ledger[id] = { count, holders: Array.from({ length: count }, () => ({ gen: 0, name: '옛 기록' })), firstAt: 0, scenes: [] };
  }
  return g;
}

export async function loadGame(a: StorageAdapter, fresh: () => GameState = () => createGame()): Promise<LoadResult> {
  const raw = await a.get(SAVE_KEY);
  if (raw !== null) {
    try {
      const g = migrate(JSON.parse(raw));
      if (g) return { g, source: 'v2', notice: null };
    } catch { /* 아래로 */ }
    await a.set(BROKEN_KEY, raw);
    await a.remove(SAVE_KEY);
    return { g: fresh(), source: 'broken', notice: BROKEN_NOTICE };
  }
  const old = await a.get(V1_KEY);
  if (old !== null) {
    try {
      const g = fromV1(JSON.parse(old), fresh);
      if (g) return { g, source: 'v1', notice: V1_NOTICE };
    } catch { /* 깨진 v1 */ }
    await a.set(BROKEN_KEY, old);
    await a.remove(V1_KEY);
    return { g: fresh(), source: 'broken', notice: BROKEN_NOTICE };
  }
  return { g: fresh(), source: 'new', notice: null };
}
