// 사용자 결정(2026-11-28): 크게 딴 판의 장면(다로미 「첫 판 끝났을 땐 갚으려고 했는데.」, [갚으러 간다] [쥐고 있는다])과 그 곁의 반응은
// 「다음 정산의 이자 + 생활비」(claim)가 아니라 넣은 돈에 견준 %(ROE)로 정한다. 장면은 +100%(넣은 돈만큼 넘게, 두 배) 이상에서만.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REACT_ROE, closeScene, isBigLoss, isBigWin, isTiny, madeTimes, nextBigRun, offersRepay, roeOf, settleRemark, tradeReaction, worthCertificate, type BigRun, type TradeCtx, type TradeEnd } from '../../src/ui/proto/react';
import { burstTier, heroMood } from '../../src/ui/proto/tension';
import { STORY } from '../../src/ui/proto/text';
import { LITE_STORY } from '../../src/ui/proto/lite/liteText';

const T = (o: Partial<TradeEnd> = {}): TradeEnd => ({ pnl: 0, margin: 25_000, lev: 200, liq: false, heldSec: 40, fundedBy: null, allIn: false, ...o });
const C = (o: Partial<TradeCtx> = {}): TradeCtx => ({ wheelNet: 0, cashAfter: 80_000, liqs: 0, winStreak: 0, lossStreak: 0, tinyStreak: 0, feesLife: 0, seen: {}, ...o });
/** 넣은 돈 m 에 ROE r% 인 판 */
const at = (r: number, m = 25_000): TradeEnd => T({ margin: m, pnl: (m * r) / 100 });
const R0: BigRun = { winRun: 0, lossRun: 0, runSum: 0 };

describe('문턱은 넣은 돈에 견준 % (ROE)', () => {
  it('큰 판 +100%, 아주 큰 판 +300%, 크게 잃은 판 −50%, 본전치기 ±5% 안, 첫 한마디 ±10%, 인증서 +50%', () => {
    expect(REACT_ROE).toEqual({ big: 100, huge: 300, bigLoss: -50, tiny: 5, first: 10, cert: 50 });
  });
  it('ROE 는 수수료까지 넣은 손익 ÷ 넣은 돈, 청산이면 −100', () => {
    expect(roeOf({ pnl: 25_000, margin: 25_000 })).toBe(100);
    expect(roeOf({ pnl: -1, margin: 25_000, liq: true })).toBe(-100);
    expect(isBigWin(100)).toBe(true); expect(isBigWin(99.9)).toBe(false);
    expect(isBigLoss(-50)).toBe(true); expect(isBigLoss(-49.9)).toBe(false); expect(isBigLoss(roeOf({ pnl: -25_000, margin: 25_000, liq: true }))).toBe(true);
    expect(isTiny(4.9)).toBe(true); expect(isTiny(-4.9)).toBe(true); expect(isTiny(5)).toBe(false); expect(isTiny(-5)).toBe(false);
  });
  it('반응 함수들은 정산 청구액을 받지 않는다', () => {
    expect(isTiny.length).toBe(1);
    expect(worthCertificate.length).toBe(2);
    expect(burstTier.length).toBe(2);
    expect(Object.keys(C())).not.toContain('claim');
  });
});

describe('크게 딴 판의 장면(winClaim1)은 +100% 이상에서만', () => {
  it('+100% 면 이번 생 처음 장면, +99% 면 장면이 아니다', () => {
    const hit = tradeReaction(at(100), C());
    expect(hit).toMatchObject({ key: 'winClaim1', scene: true, once: true });
    expect(closeScene(hit, nextBigRun(R0, at(100).pnl, 100), {})).toBe('winClaim1');
    const miss = tradeReaction(at(99), C());
    expect(miss?.key).not.toBe('winClaim1');
    expect(miss?.key).toBe('firstWin'); // 작은 한마디는 그대로(+10% 넘게)
    expect(closeScene(miss, nextBigRun(R0, at(99).pnl, 99), {})).toBeNull();
  });
  it('넣은 돈이 크든 작든 같은 %에서 뜬다(돈의 크기, 빚의 크기와 상관없다)', () => {
    for (const m of [1_000, 9_000, 25_000, 300_000]) {
      expect(tradeReaction(at(100, m), C())?.key).toBe('winClaim1');
      expect(tradeReaction(at(99, m), C())?.key).not.toBe('winClaim1');
    }
  });
  it('예전 문턱(정산 청구액)만 넘은 판에는 뜨지 않는다: 넣은 돈 2.5만, 200배에서 +5,000(+20%)', () => {
    expect(tradeReaction(T({ pnl: 5_000 }), C())?.key).toBe('firstWin');
    expect(tradeReaction(T({ pnl: 5_000 }), C({ seen: { firstWin: true } }))).toBeNull();
  });
  it('한 번 본 뒤의 큰 판은 번갈아 한 줄(장면이 아니다)', () => {
    const seen = { winClaim1: true };
    const xs = [2, 3, 4].map((k) => tradeReaction(at(150), C({ seen, bigWins: k }))!);
    expect(xs.map((r) => r.key)).toEqual(['winClaim', 'winClaimC', 'winClaimH']);
    expect(xs.every((r) => !r.scene)).toBe(true);
    expect(tradeReaction(at(99), C({ seen, bigWins: 2 }))?.key ?? null).not.toMatch(/^winClaim/);
  });
  it('+300% 이상은 오소리 대부가 먼저(한 생에 한 번), 그다음 큰 판이 winClaim1', () => {
    expect(tradeReaction(at(300), C())?.key).toBe('bigWin');
    expect(tradeReaction(at(299), C())?.key).toBe('winClaim1');
    expect(tradeReaction(at(300), C({ seen: { bigWin: true } }))?.key).toBe('winClaim1');
  });
  it('[갚으러 간다] [쥐고 있는다]는 오소리 빚이 남았을 때만. 다 갚았으면 장면은 줄만', () => {
    expect(offersRepay(1)).toBe(true);
    expect(offersRepay(0)).toBe(false);
    const lines = STORY.winClaim({ first: '거신 돈만큼 버셨네요. 종 칠 때 들를게요.', pnl: 25_000, spins: null, stampLeft: null, momLeft: 0 });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map((l) => l.text).join(' ')).not.toMatch(/도장|도토코인까지/);
  });
  it('첫마디는 넣은 돈의 몇 배인지라 돈이 작아도 참이다(넣은 돈 1,000 에 +1,000 이어도)', () => {
    expect(madeTimes(100)).toBe('거신 돈만큼');
    expect(madeTimes(299)).toBe('거신 돈의 두 배를');
    expect(madeTimes(300)).toBe('거신 돈의 세 배를');
    expect(madeTimes(1_250)).toBe('거신 돈의 12배를');
    expect(tradeReaction(at(100, 1_000), C())!.lines[0]).toBe('거신 돈만큼 버셨네요. 종 칠 때 들를게요.');
    expect(tradeReaction(at(450), C())!.lines[0]).toBe('거신 돈의 네 배를 버셨네요. 그중에 얼마쯤 장부에서 지워 드릴까요?');
    expect(tradeReaction(at(450), C({ seen: { bigWin: true } }))!.lines[0]).toBe('거신 돈의 네 배를 버셨네요. 종 칠 때 들를게요.');
  });
  it('오소리 빚을 다 갚았으면 갚으라는 줄은 빠진다: 대부의 장면, 대부의 한 줄, 「지금 갚으면」, 연달아 딴 장면', () => {
    expect(tradeReaction(at(300), C({ debt: 0 }))?.key).toBe('winClaim1');
    expect(tradeReaction(at(300), C({ debt: 1 }))?.key).toBe('bigWin');
    const seen = { winClaim1: true, bigWin: true };
    expect(tradeReaction(at(150), C({ seen, bigWins: 2, debt: 0 }))?.key).toBe('winClaimH');
    expect(tradeReaction(at(150), C({ seen, bigWins: 2, debt: 5_000 }))?.key).toBe('winClaim');
    let r = nextBigRun(R0, 25_000, 100);
    r = nextBigRun(r, 30_000, 120);
    expect(closeScene(null, r, { winClaim1: true }, offersRepay(0))).toBeNull();
    expect(closeScene(null, r, { winClaim1: true }, offersRepay(1))).toBe('winRun');
    for (const lines of [STORY.winClaim({ first: 'x', pnl: 25_000, spins: null, stampLeft: null, momLeft: 0 }), LITE_STORY.winClaim!({ first: 'x', pnl: 25_000, spins: null, stampLeft: null, momLeft: 0 })])
      expect(lines.map((l) => l.text).join(' ')).not.toMatch(/갚|빚/);
  });
  it('라이트에는 금박 도장이 없다: 남은 오소리 빚을 그대로 말한다', () => {
    const t = LITE_STORY.winClaim!({ first: 'x', pnl: 25_000, spins: null, stampLeft: 20_000, momLeft: 300_000 }).map((l) => l.text);
    expect(t).toContain('오소리 빚 300,000 남았다.');
    expect(t.join(' ')).not.toMatch(/도장/);
  });
});

describe('정산 때 추심원이 흘끗 보는 포지션도 넣은 돈에 견준다', () => {
  const S = { interest: 14_500, other: 0, net: -6_000, cashAfter: 80_000, nextClaim: 15_500, nextNet: -6_000, overdue: false, posOpen: true, negStreak: 1, firstPositive: false };
  it('+25% 부터 숫자로, 이자가 크든 작든 같다', () => {
    expect(settleRemark({ ...S, posPnl: 7_500, posMargin: 30_000 })).toContain('걸어 두신 건 아직 +7,500이네요.');
    expect(settleRemark({ ...S, posPnl: 7_400, posMargin: 30_000 })).not.toContain('걸어 두신 건');
    expect(settleRemark({ ...S, interest: 500, posPnl: 900, posMargin: 30_000 })).not.toContain('걸어 두신 건'); // 예전: 이자의 3할(150)을 넘어 숫자로 말했다
    expect(settleRemark({ ...S, interest: 900_000, posPnl: 24_000, posMargin: 30_000 })).toContain('걸어 두신 건 아직 +24,000이네요.'); // 예전: 이자가 커서 흘끗
  });
});

describe('크게 잃은 판, 본전치기, 연달아', () => {
  it('−50% 면 추심원 한 줄, −49% 면 첫 손실 한마디', () => {
    expect(tradeReaction(at(-50), C())?.key).toBe('lossClaim');
    expect(tradeReaction(at(-49), C())?.key).toBe('firstLoss');
    expect(tradeReaction(at(-9), C())).toBeNull(); // 첫 한마디는 −10% 넘게
  });
  it('본전치기(±5% 안)에는 아무도 말하지 않는다', () => {
    expect(tradeReaction(at(4.9), C())).toBeNull();
    expect(tradeReaction(at(-4.9), C())).toBeNull();
  });
  it('크게 딴 판 → 본전치기 → 크게 딴 판 = 두 판째(본전치기는 끊지 않는다)', () => {
    let r = nextBigRun(R0, 25_000, 100);
    expect(r).toMatchObject({ bigWin: true, winRun: 1, runSum: 25_000 });
    r = nextBigRun(r, 500, 2);
    expect(r).toMatchObject({ tiny: true, winRun: 1, runSum: 25_000 });
    r = nextBigRun(r, 30_000, 120);
    expect(r).toMatchObject({ winRun: 2, runSum: 55_000 });
    const re = tradeReaction(at(120), C({ seen: { winClaim1: true }, bigWins: 2 }));
    expect(closeScene(re, r, { winClaim1: true })).toBe('winRun');
    expect(closeScene(re, r, { winClaim1: true, react_winRun: true })).toBeNull(); // 이번 생 한 번
  });
  it('+99% 판은 이어지지 않고 끊는다(+5% 넘게 움직였다)', () => {
    let r = nextBigRun(R0, 25_000, 100);
    r = nextBigRun(r, 24_750, 99);
    expect(r).toMatchObject({ bigWin: false, tiny: false, winRun: 0, runSum: 0 });
  });
  it('크게 잃은 판(청산 포함) 두 판째에 장면', () => {
    let r = nextBigRun(R0, -15_000, -60);
    r = nextBigRun(r, -300, -1.2);
    expect(r).toMatchObject({ lossRun: 1, runSum: -15_000 });
    r = nextBigRun(r, -25_000, roeOf({ pnl: -25_000, margin: 25_000, liq: true }));
    expect(r).toMatchObject({ bigLoss: true, lossRun: 2, runSum: -40_000 });
    expect(closeScene(null, r, {})).toBe('lossRun');
    expect(closeScene(null, nextBigRun(nextBigRun(R0, -15_000, -60), -12_000, -48), {})).toBeNull();
  });
});

describe('인증서, 주인공의 몸', () => {
  it('수익 인증서는 +50% 이상에서만(청구액 갈래 없음)', () => {
    expect(worthCertificate(12_499, 25_000)).toBe(false);
    expect(worthCertificate(12_500, 25_000)).toBe(true);
    expect(worthCertificate(5_000, 100_000)).toBe(false);
  });
  it('주인공이 들썩이고 서성이는 것도 ROE ±25%', () => {
    const o = { hasPos: true, pnl: 50_000, reach: 'far' as const, nearLiq: false };
    expect(heroMood({ ...o, roe: 24 })).toBe('phone');
    expect(heroMood({ ...o, roe: 25 })).toBe('hop');
    expect(heroMood({ ...o, roe: -25, pnl: -50_000 })).toBe('pace');
  });
});

describe('장면의 글에 이자 단위가 없다', () => {
  const BAD = /이자 ?(한|두|세|반|몇|\d+(\.\d+)?) ?번|이자 ?벌었|이자의 |이자 벌기|(이자|생활비) 한 번 치|이자와 생활비/;
  it('winClaim, winRun, lossRun(보통, 라이트)', () => {
    const lines = [
      ...STORY.winClaim({ first: '거신 돈만큼 버셨네요. 종 칠 때 들를게요.', pnl: 25_000, spins: 3, stampLeft: 20_000, momLeft: 300_000 }),
      ...LITE_STORY.winClaim!({ first: '거신 돈만큼 버셨네요. 종 칠 때 들를게요.', pnl: 25_000, spins: null, stampLeft: 20_000, momLeft: 300_000 }),
      ...STORY.winRun({ sum: 55_000, stampPct: null }),
      ...STORY.lossRun({ sum: 40_000, spins: null, cash: 2_000, due: 3_100 }),
      ...LITE_STORY.lossRun!({ sum: 40_000, spins: null, cash: 9_000, due: 3_100 }),
    ].map((l) => l.text);
    expect(lines.filter((t) => BAD.test(t) || /·/.test(t))).toEqual([]);
    expect(STORY.winRun({ sum: 55_000, stampPct: null }).map((l) => l.text)).toContain('첫 판 끝났을 땐 갚으려고 했는데.');
  });
});

describe('반응을 정하는 곳에서 손익을 정산 청구액에 견주지 않는다', () => {
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  /** 주석을 뺀 소스 */
  const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  // 청구액, 이번 이자(정산 한 줄의 c.interest 도 같은 단위다)
  const CLAIM = String.raw`(?:Math\.max\(1,\s*)?(?:[a-z]\.)?(?:c|c0|cl|claim|claimTotal|nextClaim|interest)\b(?!\s*:)`;
  // 손익(끝난 판의 pnl, 들고 있는 판의 peakPnl, posPnl, 그것을 받은 p)
  const PNL = String.raw`\b(?:pnl|peakPnl|posPnl|p)\)?`;
  const PATS: [string, RegExp][] = [
    ['손익 대 청구액', new RegExp(PNL + String.raw`\s*(?:>=|<=|>|<)\s*-?\s*` + CLAIM)],
    ['손익 ÷ 청구액', new RegExp(PNL + String.raw`\s*\/\s*` + CLAIM)],
    ['돈으로 본 본전치기', /isTiny\(\s*[a-z.]*pnl/i],
    ['인증서에 청구액', /worthCertificate\([^)]*,[^)]*,/],
    ['등급에 청구액', /burstTier\([^)]*,[^)]*,/],
    ['잔치에 청구액', /cheerOn\([^)]*\/\s*(?:c|c0|claim)\b/],
    ['화면 글의 「이자와 생활비 … 치」', /이자와 생활비[^\n]*치/],
  ];
  it('src/ui 에 그런 줄이 없다', () => {
    const files = walk('src/ui').filter((f) => /\.tsx?$/.test(f));
    const hits = files.flatMap((f) => code(fs.readFileSync(f, 'utf8')).split('\n').flatMap((l, i) => PATS.filter(([, p]) => p.test(l)).map(([k]) => `${f}:${i + 1} ${k}: ${l.trim().slice(0, 100)}`)));
    expect(hits).toEqual([]);
  });
  it('claim(prev) 는 의뢰 사례금(forestClose)에만 넘긴다', () => {
    const src = code(fs.readFileSync('src/ui/proto/watch.ts', 'utf8')).split('\n').filter((l) => /claim\(prev\)/.test(l));
    expect(src.every((l) => l.includes('forestClose('))).toBe(true);
  });
});
