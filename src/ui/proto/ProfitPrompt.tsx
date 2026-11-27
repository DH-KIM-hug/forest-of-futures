import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useProto } from './protoStore';
import { renderCard, saveCard } from './shareCard';
import { comma } from '../../engine/util';
import { play } from './audio';
import { useBeatOver } from './CutIn';

type Stage = 'ask' | 'busy' | 'done';

/** 이익으로 닫았을 때 뜨는 스티커형 물음(U-49: 카드를 먼저 그려 미리보기로 보여 주고, [자랑하기] 한 번에 공유 창, 공유가 안 되면 이미지로 저장). */
export function ProfitPrompt() {
  const p = useProto((s) => s.profit);
  const [stage, setStage] = useState<Stage>('ask');
  const [thumb, setThumb] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { setStage('ask'); setThumb(null); setNote(''); cvRef.current = null; }, [p]);
  // 장면(이긴 판의 고르기 등)이 떠 있는 동안에는 기다린다(U-42): 고르는 단추 위에 겹쳐 뜨지 않게. 장면이 끝나면 그때부터 15초
  const talking = useProto((s) => s.scenes.length > 0);
  const free = useBeatOver();
  useEffect(() => {
    if (!p || stage !== 'ask' || talking) return;
    const t = window.setTimeout(() => useProto.getState().patch({ profit: null }), 15000);
    return () => window.clearTimeout(t);
  }, [p, stage, talking]);
  // 폰 탭에서는 차트 위에 얹는다(차트 아래 끝에 맞춰 위로 자란다): 배율·증거금·주문 단추를 가리지 않는다.
  const box = useRef<HTMLDivElement>(null);
  const tab = useProto((s) => s.tab);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const chart = tab === 'phone' ? document.querySelector('.pt-chart') : null;
    const root = el.offsetParent as HTMLElement | null;
    if (!chart || !root) { el.style.top = ''; el.style.bottom = ''; return; }
    el.style.top = 'auto';
    el.style.bottom = `${root.getBoundingClientRect().bottom - chart.getBoundingClientRect().bottom + 2}px`;
  });
  // 뜨자마자 카드를 그려 둔다: 무엇을 자랑하게 될지 미리 보이고, 누르면 바로 공유 창이 열린다(공유 창은 누른 직후에만 열린다)
  const shown = !!p && !talking && free;
  useEffect(() => {
    if (!shown || !p || cvRef.current) return;
    let live = true;
    renderCard(p).then((cv) => { if (!live) return; cvRef.current = cv; setThumb(cv.toDataURL('image/png')); (window as unknown as { __lastCard?: string }).__lastCard = cv.toDataURL('image/png'); }).catch(() => { /* 누를 때 다시 그린다 */ });
    return () => { live = false; };
  }, [shown, p]);
  if (!p || !shown) return null;
  const close = () => useProto.getState().patch({ profit: null });
  const save = async () => {
    setStage('busy');
    try {
      const cv = cvRef.current ?? await renderCard(p);
      if (!cvRef.current) { cvRef.current = cv; setThumb(cv.toDataURL('image/png')); (window as unknown as { __lastCard?: string }).__lastCard = cv.toDataURL('image/png'); }
      // 회차 14: 공유 창이 끝나지 않는 기기에서 「그리는 중」에 영원히 멈췄다 — 10초면 놓는다
      const r = await Promise.race([saveCard(cv, p.date), new Promise<'cancelled'>((res) => window.setTimeout(() => res('cancelled'), 10_000))]);
      if (r !== 'cancelled') play('shutter');
      setNote(r === 'shared' ? '자랑했어요' : r === 'downloaded' ? '이미지로 저장했어요' : '보내지 않았어요');
    } catch { setNote('그림을 만들지 못했어요'); }
    setStage('done');
  };
  return (
    <div ref={box} className={'pr-profit' + (p.gold ? ' gold' : '')} data-gold={p.gold ? '1' : undefined} role="dialog" aria-label="수익 인증서">
      {stage === 'done' && thumb ? (
        <>
          <img className="th" src={thumb} alt="수익 인증서 미리보기" />
          <div className="tx"><b>{note}</b><small>카드 아래 QR 코드로 게임을 열 수 있어요</small></div>
          <div className="bt"><button className="no" onClick={close} aria-label="닫기">닫기</button></div>
        </>
      ) : (
        <>
          {thumb && <img className="th" src={thumb} alt="수익 인증서 미리보기" data-card-thumb />}
          <div className="tx"><b>{p.gold ? '금테 수익 인증서 나왔어요' : '수익 인증서 나왔어요'}</b><small>{p.coin} {p.dir === 1 ? '롱' : '숏'} {p.lev}배, +{comma(Math.round(p.pnl))} 도토리</small></div>
          <div className="bt">
            <button className="yes" data-brag onClick={save} disabled={stage === 'busy'}>{stage === 'busy' ? '그리는 중' : '자랑하기'}</button>
            <button className="no" onClick={close}>건너뛰기</button>
          </div>
        </>
      )}
    </div>
  );
}
