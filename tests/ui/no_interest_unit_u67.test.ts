// U-67(사용자: "이자 한 번 치는 빼 걍", "이자 한 번 버는 거 의미 없어"): 「이자 한 번 치」를 버는 목표로 쓰는 글이 화면에 없다.
// 익절 손절 칩은 넣은 돈의 %, 첫 실전 카드는 +50% −25%, 길잡이와 의뢰도 % 와 돈으로 말한다.
// 정산 막대의 「이자 N + 생활비 N」, 대출 화면의 1분 이자처럼 실제로 나가는 돈은 그대로 둔다.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FT_STEPS, FT_TP_K, FT_SL_K, ftActDone, FT_LEV, FT_PCT, type FtCtx } from '../../src/ui/proto/lite/flyTutSteps';
import { QUESTS, applyClose, newBoard, type CloseInfo } from '../../src/ui/proto/quests';
import { EXIT_PRESETS, journeyOf } from '../../src/ui/proto/stops';
import { burstTier, holdBeat } from '../../src/ui/proto/tension';
import { tradeReaction } from '../../src/ui/proto/react';
import { LITE_STORY } from '../../src/ui/proto/lite/liteText';

/** 「이자 한 번」, 「이자 두 번」, 「이자 n번 치」, 「이자 벌었다」, 「이자의 ±N%」, 「이자 벌기」 */
const BAD = /이자 ?(한|두|세|반|몇|\d+(\.\d+)?|\$\{[^}]*\}) ?번|이자 ?벌었|이자의 |이자 벌기|(이자|생활비) 한 번 치/;

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
/** 주석을 뺀 소스(화면에 나가는 글만 남긴다) */
const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('이자 한 번 치를 버는 목표로 쓰지 않는다 (U-67)', () => {
  it('화면 글(src/ui 의 소스, data 의 json)에 「이자 한 번」 「이자 두 번」 「이자 n번 치」 「이자 벌었다」 「이자의」가 없다', () => {
    const files = [...walk('src/ui'), ...walk('data')].filter((f) => /\.(tsx?|json)$/.test(f));
    const hits = files.flatMap((f) => code(fs.readFileSync(f, 'utf8')).split('\n').filter((l) => BAD.test(l)).map((l) => `${f}: ${l.trim().slice(0, 120)}`));
    expect(hits).toEqual([]);
  });
  it('출구 칩은 넣은 돈의 %: 익절 +20 +50 +100 +200, 손절 −10 −25 −50', () => {
    expect(EXIT_PRESETS.tp.map((k) => Math.round(k * 100))).toEqual([20, 50, 100, 200]);
    expect(EXIT_PRESETS.sl.map((k) => Math.round(k * 100))).toEqual([10, 25, 50]);
    expect(EXIT_PRESETS.tp).toContain(FT_TP_K);
    expect(EXIT_PRESETS.sl).toContain(FT_SL_K);
  });
  it('길잡이: 첫 판 익절 +50% 손절 −25%, 대사에 이자 한 번이 없다', () => {
    expect([FT_TP_K, FT_SL_K]).toEqual([0.5, 0.25]);
    const u = { lev: FT_LEV, pct: FT_PCT, keep: false, tpK: FT_TP_K, slK: FT_SL_K, hasPos: false, closed: false };
    expect(ftActDone('stops', u, true)).toBe(true);
    expect(ftActDone('stops', { ...u, tpK: 1, slK: 1 }, true)).toBe(false);
    const base: FtCtx = { lev: FT_LEV, liqPct: 1.9, interest: 4300, living: 1000, up: true, pc: 'kr', candles: false, net: 500, closed: null, settled: false };
    const kinds = ['tp', 'sl', 'close', 'liq'] as const;
    const lines = [base, ...kinds.map((kind) => ({ ...base, closed: { kind, pnl: kind === 'tp' ? 6000 : -3000 } }))].flatMap((c) => FT_STEPS.map((s) => s.line(c)));
    expect(lines.filter((l) => BAD.test(l))).toEqual([]);
  });
  it('의뢰는 % 로: 숏 +50% 넘게, 롱 +200% 넘게', () => {
    expect(QUESTS.filter((q) => BAD.test(q.title + q.line))).toEqual([]);
    const C = (o: Partial<CloseInfo>): CloseInfo => ({ market: 'DTC', dir: -1, lev: 50, pnl: 5000, roe: 55, heldSec: 40, kind: 'close', claim: 0, fly: false, ...o });
    const b = { ...newBoard(3, 200), slots: [{ id: 'short', prog: 0 }, { id: 'long2', prog: 0 }, { id: 'sl', prog: 0 }] };
    expect(applyClose(b, C({}), 200).finished).toEqual(['short']); // 이자가 0 이어도(빚을 다 갚아도) 된다
    expect(applyClose(b, C({ roe: 40 }), 200).finished).toEqual([]);
    expect(applyClose(b, C({ dir: 1, roe: 210, pnl: 21000 }), 200).finished).toEqual(['long2']);
  });
  it('「이자 벌었다」 등급, 팝, 반응, 속마음, 장부 한 줄에 이자 단위가 없다', () => {
    expect(burstTier(12, 1000)).toBeNull();
    expect(burstTier(600, 1000)!.word).not.toMatch(/이자/);
    expect(journeyOf({ tradeNet: 31_000, claim: 15_500, settles: 14, paid: 85_400, claimWins: 1 }).text).not.toMatch(BAD);
    const ctx = { wheelNet: 0, cashAfter: 50_000, liqs: 0, winStreak: 0, lossStreak: 0, tinyStreak: 0, feesLife: 0, seen: {} };
    const end = { margin: 9000, lev: 50, liq: false, heldSec: 30, fundedBy: null, allIn: false };
    const said = [20_000, -20_000, 60_000].flatMap((pnl) => [1, 2, 3, 4].map((k) => tradeReaction({ ...end, pnl }, { ...ctx, bigWins: k, seen: k > 1 ? { winClaim1: true, bigWin: true } : {} })?.lines.join(' ') ?? ''));
    expect(said.filter((l) => BAD.test(l) || /이자랑 생활비/.test(l))).toEqual([]);
    const hb = holdBeat({ pnl: 16000, roe: 64, peakPnl: 16000, peakRoe: 64, lowRoe: 0, claim: 15500, reach: 'far', heldSec: 10, settles: 0 }, {});
    expect(hb?.key).toBe('big');
    expect(hb!.text).not.toMatch(/이자/);
    const win = LITE_STORY.winClaim!({ first: '거신 돈만큼 버셨네요.', pnl: 16_000, spins: null, stampLeft: null, momLeft: 0 });
    expect(win.map((l) => l.text).filter((t) => BAD.test(t) || /1분 이자를/.test(t))).toEqual([]);
  });
});
