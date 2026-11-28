// 라이트 모드의 만화 읽기. 프롤로그(LiteManga)는 패러디 일곱 쪽을 한 쪽씩 화면에 맞춰 띄우고 탭으로 넘긴다(넓은 펼침면은 세로 화면에서 천천히 훑는다).
// 짧은 시퀀스(LiteSeqHost: 빚의 유혹, 파산의 표제지, 환생)는 한 컷씩, 세로 화면에서는 컷이 쌓인다. 움직임 줄이기면 그냥 바뀐다.
// 글은 그림의 빈 풍선 자리에 얹는다(manga.ts).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { prologuePages, type Balloon, type Panel, type Word } from './manga';
import { useLite, endSeq } from './liteStore';
import { play } from '../audio';
import { reduced } from '../fx';
import './lite.css';

function Words({ b, i }: { b: Balloon; i: number }) {
  return (
    <div className={'lm-b ' + (b.kind ?? 'say')} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, ['--fs' as string]: `${b.fs ?? 2.4}cqw`, animationDelay: i < 0 ? '0s' : `${0.25 + i * 0.32}s` }}>
      <span>{b.text}</span>
    </div>
  );
}

/** 표제 로고: 작은 영문 줄 + 심전도 + 「선물의 숲」 + 부제 */
export function TitleLogo({ sub, style }: { sub: string; style?: CSSProperties }) {
  return (
    <div className="lp-logo" style={style} aria-label={`선물의 숲, ${sub}`}>
      <i>FRX Fighter DAROMI</i>
      <svg viewBox="0 0 120 16" aria-hidden="true"><path d="M0 9 H40 L46 9 L50 2 L55 15 L59 6 L62 9 H120" fill="none" stroke="#E23B3B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>
      <b>선물의 숲</b>
      <small>{sub}</small>
    </div>
  );
}

/** 쪽 위의 글 하나(그림 % 자리) */
function WordView({ w }: { w: Word }) {
  const box: CSSProperties = { left: `${w.x}%`, top: `${w.y}%`, width: `${w.w}%`, height: `${w.h}%`, animationDelay: `${w.d ?? 0}s` };
  if (w.k === 'logo') return <TitleLogo sub={w.t} style={{ ...box, ['--fs' as string]: `${w.fs}cqw` }} />;
  if (w.k === 'wave') {
    return (
      <svg className="lp-wave" style={box} viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M10 0 C2 6 18 12 10 18 C2 24 18 30 10 36 C2 42 18 48 10 54 C2 60 18 66 10 72 C2 78 18 84 10 90 L10 100" fill="none" stroke="#1d1b19" strokeWidth="2.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  const cls = 'lp-w ' + w.k + (w.v ? ' v' : '') + (w.cls ? ' ' + w.cls : '');
  return <b className={cls} style={{ ...box, ['--fs' as string]: `${w.fs}cqw`, ['--rot' as string]: `${w.rot ?? 0}deg`, ...(w.c ? { color: w.c } : {}) }} aria-hidden="true">{w.t}</b>;
}

function PanelView({ p, cur, k }: { p: Panel; cur: boolean; k: number }) {
  if (p.card) return <div className={'lm-panel lm-card' + (cur ? ' cur' : ' past')} data-panel={p.id}><span>{p.card}</span></div>;
  const ar = p.ar ? { aspectRatio: String(p.ar), width: `min(100%, calc((100dvh - 150px) * ${p.ar}))` } : undefined;
  return (
    <div className={'lm-panel' + (cur ? ' cur' : ' past')} style={ar} data-panel={p.id} aria-hidden={cur ? undefined : true}>
      <img src={p.src} alt={cur ? p.alt : ''} draggable={false} />
      {p.balloons.map((b, bi) => <Words key={bi} b={b} i={cur ? bi : -2} />)}
      {p.sfx?.map((s, si) => <b key={'s' + si} className="lm-sfx" style={{ left: `${s.x}%`, top: `${s.y}%`, ['--rot' as string]: `${s.rot ?? 0}deg`, ['--fs' as string]: `${s.fs ?? 4}cqw`, animationDelay: `${0.15 + si * 0.1}s` }} aria-hidden="true">{s.text}</b>)}
      {p.words?.map((w, wi) => <WordView key={'w' + wi} w={w} />)}
      {cur && <i key={k} className="lm-flash" aria-hidden="true" />}
    </div>
  );
}

export function MangaReader({ panels, onDone, canSkip, label, endHint = '눌러서 시작', id, endBtn }: { panels: Panel[]; onDone: () => void; canSkip: boolean; label: string; endHint?: string; id?: string; endBtn?: string }) {
  const [i, setI] = useState(0);
  const [k, setK] = useState(0);
  const at = useRef(performance.now());
  const page = useRef<HTMLDivElement>(null);
  const p = panels[i];
  const last = i === panels.length - 1;
  useEffect(() => { at.current = performance.now(); play(panels[i]?.id === 'x' ? 'liq_gavel' : 'ui_tap'); }, [i, panels]);
  // 새 컷이 보이게 맨 밑으로
  useEffect(() => { const el = page.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' }); }, [i]);
  // 다음 컷 그림을 미리 받아 둔다(넘기는 순간 빈 칸이 보이지 않게)
  useEffect(() => { const n = panels[i + 1]; if (n?.src) { const im = new Image(); im.src = n.src; } }, [i, panels]);
  const next = () => {
    if (performance.now() - at.current < 380) return; // 연타가 컷을 건너뛰지 않게
    if (last) { onDone(); return; }
    setI((x) => x + 1); setK((x) => x + 1);
  };
  if (!p) return null;
  return (
    <div className={'lite-manga' + (reduced() ? ' calm' : '')} role="dialog" aria-label={label} data-manga={p.id} data-seq={id} onClick={next}>
      <div className="lm-top">
        <span className="lm-no" aria-live="polite">{panels.length > 1 ? `${i + 1} / ${panels.length}` : ''}</span>
        {panels.length > 3 && (canSkip || i >= 3) && <button className="lm-skip" data-manga-skip onClick={(e) => { e.stopPropagation(); onDone(); }}>건너뛰기</button>}
      </div>
      <div className="lm-page" ref={page}>
        {panels.slice(Math.max(0, i - 2), i + 1).map((pp, j, arr) => <PanelView key={pp.id} p={pp} cur={j === arr.length - 1} k={k} />)}
      </div>
      {last && endBtn ? <button className="lm-endbtn" data-manga-end onClick={(e) => { e.stopPropagation(); if (performance.now() - at.current < 380) return; onDone(); }}>{endBtn}</button>
        : <p className="lm-hint" aria-hidden="true">{last ? endHint : '눌러서 넘기기'}</p>}
    </div>
  );
}

/** 프롤로그: 패러디 일곱 쪽(6 1 2 7 5 4 3)을 한 쪽씩. 끝나면 바로 첫 거래(튜토리얼). [건너뛰기]는 두 번째로 볼 때부터 */
export function LiteManga({ onDone, canSkip }: { onDone: () => void; canSkip: boolean }) {
  const [pages] = useState(prologuePages);
  const [i, setI] = useState(0);
  const at = useRef(performance.now());
  const p = pages[i];
  const last = i === pages.length - 1;
  useEffect(() => { at.current = performance.now(); play(pages[i]?.id === 'x' ? 'liq_gavel' : 'ui_tap'); }, [i, pages]);
  // 다음 쪽 그림을 미리 받아 둔다
  useEffect(() => { const n = pages[i + 1]; if (n?.src) { const im = new Image(); im.src = n.src; } }, [i, pages]);
  const next = () => {
    if (performance.now() - at.current < 380) return; // 연타가 쪽을 건너뛰지 않게
    if (last) { onDone(); return; }
    setI((x) => x + 1);
  };
  if (!p) return null;
  const ar = p.ar ?? 1.5;
  const wide = ar > 1.2;
  return (
    <div className={'lite-manga pages' + (reduced() ? ' calm' : '')} role="dialog" aria-label="만화 프롤로그" data-manga={p.id} data-seq="intro" onClick={next}>
      <div className="lm-top">
        <span className="lm-no" aria-live="polite">{`${i + 1} / ${pages.length}`}</span>
        {canSkip && <button className="lm-skip" data-manga-skip onClick={(e) => { e.stopPropagation(); onDone(); }}>건너뛰기</button>}
      </div>
      <div className={'lp-stage' + (wide ? ' wide' : '')}>
        <div key={p.id} className={'lp-sheet' + (wide ? ' wide' : '')} style={{ ['--ar' as string]: String(ar) }} data-panel={p.id}>
          <img src={p.src} alt={p.alt} draggable={false} />
          {p.words?.map((w, wi) => <WordView key={wi} w={w} />)}
          <i className="lm-flash" aria-hidden="true" />
          {last && <b className="lp-start" data-game-start aria-hidden="true"><span>GAME</span><span>START!</span></b>}
        </div>
      </div>
      <p className="lm-hint" aria-hidden="true">{last ? '눌러서 첫 거래' : '눌러서 넘기기'}</p>
    </div>
  );
}

/** 짧은 시퀀스(빚의 유혹, 파산의 표제지)를 띄운다 */
export function LiteSeqHost() {
  const seq = useLite((s) => s.seq);
  if (!seq) return null;
  return <MangaReader key={seq.k} panels={seq.panels} onDone={endSeq} canSkip label={seq.label} endHint="눌러서 닫기" id={seq.id} endBtn={seq.endBtn} />;
}
