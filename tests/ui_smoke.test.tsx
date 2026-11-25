import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import App from '../src/App';
import { useGame } from '../src/store/gameStore';
import { Archive } from '../src/ui/overlays/Archive';
import { Board } from '../src/ui/overlays/Board';
import { EndingScreen } from '../src/ui/overlays/Ending';
import { fresh, setPrice } from './engine/helpers';
import { openPosition, processPrice } from '../src/engine/trading';

// 서버 렌더는 zustand 의 초기 상태를 읽으므로, 테스트에서는 현재 상태를 돌려주도록 바꾼다.
const put = (p: Record<string, unknown>) => {
  useGame.setState(p as any);
  Object.assign(useGame.getInitialState(), p);
};

const html = () => renderToString(createElement(App));

describe('UI 렌더 스모크(서버 렌더)', () => {
  it('모든 마을 건물 패널과 거래 탭이 오류 없이 그려진다', () => {
    const g = fresh();
    g.settings.prologueSeen = true;
    g.run.stats.odTotal = 1;
    put({ g, ui: { ...useGame.getState().ui, overlay: null } });
    for (const loc of ['work', 'home', 'capital', 'shark1', 'shark2', 'bank', 'friends', 'archive', 'board']) {
      const g2 = structuredClone(useGame.getState().g);
      g2.run.view = { tab: 'village', location: loc };
      put({ g: g2 });
      const out = html();
      expect(out).toContain('마을');
      expect(out).toContain('거래');
    }
    const g3 = structuredClone(useGame.getState().g);
    g3.run.view.tab = 'trade';
    openPosition(g3, { market: 'DTC', dir: 1, lev: 25, marginPct: 25, sl: -25, tp: 50 });
    put({ g: g3 });
    const out = html();
    expect(out).toContain('정리하기');
    expect(out).toContain('추가 진입');
    expect(out).not.toMatch(/도토리 줍기|도장|대출/);
  });

  it('도감 200칸, 전광판, 엔딩 화면', () => {
    const g = fresh();
    setPrice(g, 'DTC', 68000);
    openPosition(g, { market: 'DTC', dir: 1, lev: 200, marginPct: 100 });
    processPrice(g, 'DTC', 60000, true, 68000);
    put({ g });
    expect((renderToString(createElement(Archive)).match(/END-\d{3}/g) ?? []).length).toBeGreaterThanOrEqual(200);
    expect(renderToString(createElement(Board))).toContain('독사 대부');
    expect(renderToString(createElement(EndingScreen))).toContain('새 인생 시작');
  });
});
