import { SAVE_VERSION } from '../engine/game';
import { clock } from '../engine/clock';
import type { GameState } from '../engine/types';

export const SAVE_KEY = 'fof.save.v1';
export const BROKEN_KEY = 'fof.save.broken';
export const BROKEN_NOTICE = '저장 데이터를 읽지 못해 새로 시작합니다.';

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

/** localStorage 위의 얇은 어댑터. 나중에 Capacitor Preferences 로 바꿀 자리. */
export function localStorageAdapter(): StorageAdapter {
  return {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function memoryAdapter(): StorageAdapter & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    get: (k) => (k in data ? data[k] : null),
    set: (k, v) => ((data[k] = v), true),
    remove: (k) => void delete data[k],
  };
}

export function saveGame(a: StorageAdapter, g: GameState): boolean {
  g.savedAt = clock.now();
  return a.set(SAVE_KEY, JSON.stringify(g));
}

function valid(x: any): x is GameState {
  return (
    x &&
    typeof x === 'object' &&
    x.version === SAVE_VERSION &&
    x.run && typeof x.run.cash === 'number' && x.run.markets && x.run.debts && x.run.stats && x.run.friends &&
    x.life && typeof x.life.lifeRuns === 'number' &&
    x.encyclopedia && typeof x.encyclopedia === 'object' &&
    Array.isArray(x.records) &&
    x.settings && typeof x.settings.name === 'string'
  );
}

export interface LoadResult {
  state: GameState | null;
  notice?: string;
}

export function loadGame(a: StorageAdapter): LoadResult {
  const raw = a.get(SAVE_KEY);
  if (raw === null) return { state: null };
  try {
    const parsed = JSON.parse(raw);
    if (valid(parsed)) return { state: parsed };
  } catch {
    /* fallthrough */
  }
  a.set(BROKEN_KEY, raw);
  a.remove(SAVE_KEY);
  return { state: null, notice: BROKEN_NOTICE };
}
