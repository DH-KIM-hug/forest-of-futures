// 라이트 모드의 만화 읽기: 한 컷씩 탭으로 넘긴다. 세로 화면에서는 한 쪽에 컷이 쌓이고(지난 컷은 어두워진다), 새 컷은 하얀 섬광과 함께 쾅 박힌다.
// 움직임 줄이기면 그냥 바뀐다. 글은 그림의 빈 풍선 자리에 얹는다(manga.ts). 인트로(LiteManga), 빚의 유혹 같은 짧은 시퀀스(LiteSeqHost)가 같이 쓴다.
import { useEffect, useRef, useState } from 'react';
import { introPanels, type Balloon, type Panel, type Spread } from './manga';
import { NotePaper } from './LeverageNote';
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

/** 표제 로고: 「선물의 숲」 + 심전도 한 줄 + 부제 */
export function TitleLogo({ sub }: { sub: string }) {
  return (
    <div className="lm-logo" aria-label={`선물의 숲, ${sub}`}>
      <b>선물의 숲</b>
      <svg viewBox="0 0 120 16" aria-hidden="true"><path d="M0 9 H40 L46 9 L50 2 L55 15 L59 6 L62 9 H120" fill="none" stroke="#E23B3B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>
      <small>{sub}</small>
    </div>
  );
}

/** 절망의 표제지 위에 얹는 글: 세로 기도 두 줄, 해설 두 칸, 하아, 로고(파산이면 진짜 숫자 상자) */
function SpreadWords({ s }: { s: Spread }) {
  return (
    <>
      <b className="lm-vpray l">{s.left}</b>
      <b className="lm-vpray r">{s.right}</b>
      <p className="lm-nar a">{s.nar[0]}</p>
      <p className="lm-nar b">{s.nar[1]}</p>
      {s.huffs.map((h, i) => <b key={i} className="lm-huff" style={{ left: `${h.x}%`, top: `${h.y}%`, animationDelay: `${0.3 + i * 0.25}s` }} aria-hidden="true">하아</b>)}
      <TitleLogo sub={s.sub} />
    </>
  );
}

function PanelView({ p, cur, k }: { p: Panel; cur: boolean; k: number }) {
  if (p.card) return <div className={'lm-panel lm-card' + (cur ? ' cur' : ' past')} data-panel={p.id}><span>{p.card}</span></div>;
  if (p.note !== undefined) return <div className={'lm-panel note' + (cur ? ' cur' : ' past')} data-panel={p.id}><NotePaper page={p.note} />{cur && <i key={k} className="lm-flash" aria-hidden="true" />}</div>;
  return (
    <div className={'lm-panel' + (cur ? ' cur' : ' past') + (p.spread ? ' spread' : '')} data-panel={p.id} aria-hidden={cur ? undefined : true}>
      <img src={p.src} alt={cur ? p.alt : ''} draggable={false} />
      {p.balloons.map((b, bi) => <Words key={bi} b={b} i={cur ? bi : -2} />)}
      {p.sfx?.map((s, si) => <b key={'s' + si} className="lm-sfx" style={{ left: `${s.x}%`, top: `${s.y}%`, ['--rot' as string]: `${s.rot ?? 0}deg`, ['--fs' as string]: `${s.fs ?? 4}cqw`, animationDelay: `${0.15 + si * 0.1}s` }} aria-hidden="true">{s.text}</b>)}
      {p.spread && <SpreadWords s={p.spread} />}
      {cur && <i key={k} className="lm-flash" aria-hidden="true" />}
    </div>
  );
}

export function MangaReader({ panels, onDone, canSkip, label, endHint = '눌러서 시작', id }: { panels: Panel[]; onDone: () => void; canSkip: boolean; label: string; endHint?: string; id?: string }) {
  const [i, setI] = useState(0);
  const [k, setK] = useState(0);
  const at = useRef(performance.now());
  const page = useRef<HTMLDivElement>(null);
  const p = panels[i];
  const last = i === panels.length - 1;
  useEffect(() => { at.current = performance.now(); play(panels[i]?.spread ? 'liq_gavel' : 'ui_tap'); }, [i, panels]);
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
      <p className="lm-hint" aria-hidden="true">{last ? endHint : '눌러서 넘기기'}</p>
    </div>
  );
}

/** 도입 만화(콜드 오픈 → 사흘 전 → 장부 → 쳇바퀴 → 유혹 셋 → 배율 공책 둘 → 200배의 꿈 → FRX) */
export function LiteManga({ onDone, canSkip }: { onDone: () => void; canSkip: boolean }) {
  const [panels] = useState(introPanels);
  return <MangaReader panels={panels} onDone={onDone} canSkip={canSkip} label="만화 인트로" id="intro" />;
}

/** 짧은 시퀀스(빚의 유혹, 파산의 표제지)를 띄운다 */
export function LiteSeqHost() {
  const seq = useLite((s) => s.seq);
  if (!seq) return null;
  return <MangaReader key={seq.k} panels={seq.panels} onDone={endSeq} canSkip label={seq.label} endHint="눌러서 닫기" id={seq.id} />;
}
