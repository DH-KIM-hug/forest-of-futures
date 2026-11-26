import { describe, it, expect } from 'vitest';
import { A, bare, tickN } from './helpers';
import { declareBankruptcy } from '../../src/engine/bankruptcy';
import { BROKEN_KEY, BROKEN_NOTICE, SAVE_KEY, V1_KEY, loadGame, localStorageAdapter, memoryAdapter, migrate, preferencesAdapter, saveGame, serialize } from '../../src/engine/save';
import { statement } from '../../src/engine/generation';
import { createGame } from '../../src/engine/game';
import { endings } from '../../src/engine/data';

describe('N. 저장 v2', () => {
  it('AC-v2-148 엔딩 카드나 재산 명세서 도중에 껐다 켜면 그 화면에서 이어진다', async () => {
    const g = bare();
    g.run.cash = 0;
    declareBankruptcy(g, { lastLender: 'shark1', shortfall: 1000 });
    const a = memoryAdapter();
    await saveGame(a, g, 1000);
    let r = await loadGame(a);
    expect(r.source).toBe('v2');
    expect(r.g.estate!.step).toBe('card');
    expect(r.g.pendingEnding!.id).toBe(g.pendingEnding!.id);
    expect(r.g.run.over).toBe(true);
    // 명세서 단계
    A(r.g, { type: 'estateNext' });
    await saveGame(a, r.g, 2000);
    r = await loadGame(a);
    expect(r.g.estate!.step).toBe('statement');
    expect(statement(r.g).cards.length).toBe(3);
    // 갈래를 고른 뒤 트리 단계에서 꺼도 이어진다
    A(r.g, { type: 'inherit', branch: 'renounce' });
    await saveGame(a, r.g, 3000);
    r = await loadGame(a);
    expect(r.g.estate!.step).toBe('tree');
    expect(A(r.g, { type: 'nextGeneration' }).ok).toBe(true);
    expect(r.g.estate).toBeNull();
    expect(r.g.run.over).toBe(false);
  });

  it('AC-v2-149 깨진 저장은 fof.save.broken 으로 옮기고 새로 시작 + 안내 한 줄', async () => {
    const a = memoryAdapter();
    a.data[SAVE_KEY] = '{ 이건 json 이 아니다';
    const r = await loadGame(a);
    expect(r.source).toBe('broken');
    expect(r.notice).toBe(BROKEN_NOTICE);
    expect(a.data[BROKEN_KEY]).toBe('{ 이건 json 이 아니다');
    expect(SAVE_KEY in a.data).toBe(false);
    expect(r.g.family.generation).toBe(2);
    // 모양이 틀린 JSON 도 같다
    const b = memoryAdapter();
    b.data[SAVE_KEY] = JSON.stringify({ version: 2, run: { cash: 'x' } });
    expect((await loadGame(b)).source).toBe('broken');
  });

  it('AC-v2-149 v1 저장이면 도감 수집분이 가문 장부로 옮겨지고 2세대로 시작한다', async () => {
    const a = memoryAdapter();
    const ids = endings.slice(0, 3).map((e) => e.id);
    a.data[V1_KEY] = JSON.stringify({ version: 1, encyclopedia: { [ids[0]]: { count: 2 }, [ids[1]]: { count: 1 }, 'END-없음': { count: 9 } }, life: {}, run: {} });
    const r = await loadGame(a);
    expect(r.source).toBe('v1');
    expect(Object.keys(r.g.family.ledger).sort()).toEqual([ids[0], ids[1]].sort());
    expect(r.g.family.ledger[ids[0]].count).toBe(2);
    expect(r.g.family.ledger[ids[0]].holders[0]).toEqual({ gen: 0, name: '옛 기록' });
    expect(r.g.family.generation).toBe(2);
    expect(r.notice).toBeTruthy();
  });

  it('저장은 버전이 있고 없음(0) -> v2 로 옮겨지며, 모자란 칸은 기본값으로 채워진다', () => {
    const g = bare();
    const x = JSON.parse(serialize(g, 123));
    expect(x.version).toBe(2);
    expect(x.savedAt).toBe(123);
    delete x.version;
    delete x.family.chainBroken;
    delete x.estate;
    delete x.run.upkeepArrears;
    const m = migrate(x)!;
    expect(m.version).toBe(2);
    expect(m.family.chainBroken).toBe(false);
    expect(m.run.upkeepArrears).toBe(0);
    expect(m.estate).toBeNull();
    expect(migrate({ version: 99 })).toBeNull();
    expect(migrate(null)).toBeNull();
    expect(migrate({ foo: 1 })).toBeNull();
  });

  it('저장했다 읽어도 같은 입력에서 같은 결과(진행 중 판 포함)', async () => {
    const g = createGame({ seed: 7 });
    tickN(g, 400);
    const a = memoryAdapter();
    await saveGame(a, g, 5);
    const r = await loadGame(a);
    const x = JSON.parse(serialize(g, 0));
    const y = JSON.parse(serialize(r.g, 0));
    expect(y).toEqual(x);
    // 400틱(정산 2회)을 가만히 두면 엄마의 쳇바퀴가 압류된다. 읽어 와도 시작 쳇바퀴가 되살아나지 않는다(U-29).
    expect(Object.keys(g.run.coinWheels)).toEqual([]);
    expect(Object.keys(r.g.run.coinWheels)).toEqual([]);
  });

  it('잃은 쳇바퀴를 뺀 채 저장한 옛 판도 쳇바퀴 없이 읽힌다(없는 칸만 기본값으로)', () => {
    const g = createGame({ seed: 3 });
    const raw = JSON.parse(serialize(g, 0));
    raw.run.coinWheels = {};
    raw.run.wallet = {};
    delete raw.run.sellFrac;
    const m = migrate(raw)!;
    expect(Object.keys(m.run.coinWheels)).toEqual([]);
    expect(m.run.sellFrac).toBe(0);
  });

  it('어댑터: localStorage 모양과 Capacitor Preferences 모양 둘 다 같은 인터페이스', async () => {
    const store: Record<string, string> = {};
    const ls = localStorageAdapter({ getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => void (store[k] = v), removeItem: (k) => void delete store[k] });
    await ls.set('a', '1');
    expect(await ls.get('a')).toBe('1');
    await ls.remove('a');
    expect(await ls.get('a')).toBeNull();
    const pref: Record<string, string> = {};
    const p = preferencesAdapter({
      get: async ({ key }) => ({ value: key in pref ? pref[key] : null }),
      set: async ({ key, value }) => void (pref[key] = value),
      remove: async ({ key }) => void delete pref[key],
    });
    await saveGame(p, bare(), 1);
    expect((await loadGame(p)).source).toBe('v2');
  });
});
