import { useState, type ReactNode } from 'react';
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { comma } from '../../engine/util';
import { Art } from '../common/Art';
import { NPC_ART } from '../assets';
import { lenderModel, friendViews, houseRows, workModel, visitModel, short, TIME_LABEL, signed } from '../vm/village';
import { stampAmount } from '../../engine/loans';
import { houseDefs, lenderById, friendById } from '../../engine/data';
import type { Action } from '../../engine/actions';
import type { LenderId, Res } from '../../engine/types';
import { CapitalFutures } from '../trade/FuturesOpen';

/** 창구 틀: 위 머리(뒤로 + 제목), 안쪽 내용. 맨 안쪽만 스크롤된다(마을·거래 본 화면은 스크롤 없음). */
export function SheetFrame({ title, sub, onBack, children, shake }: { title: string; sub?: string; onBack: () => void; children: ReactNode; shake?: boolean }) {
  return (
    <section className={'sheet' + (shake ? ' shake' : '')} role="dialog" aria-label={title}>
      <div className="head">
        <button className="back" onClick={onBack} aria-label="닫기"><img src="/ui/icons/back.webp" alt="" />닫기</button>
        <h3>{title}{sub && <span className="sub">{sub}</span>}</h3>
      </div>
      <div className="sheet-body">{children}</div>
    </section>
  );
}

/** 행동을 부르고 결과 메시지를 한 줄로 돌려주는 훅. */
function useDo() {
  const act = useGame((s) => s.act);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [stampKey, setStampKey] = useState(0);
  const run = (a: Action, ok?: (r: Res) => string | null): Res => {
    const r = act(a);
    if (!r.ok) setNote({ text: r.msg ?? '할 수 없습니다.', bad: true });
    else {
      const t = ok?.(r) ?? null;
      setNote(t ? { text: t, bad: false } : null);
      if (a.type === 'stamp' || a.type === 'stampFriend') setStampKey((k) => k + 1);
    }
    return r;
  };
  return { run, note, stampKey };
}

const Note = ({ n }: { n: { text: string; bad: boolean } | null }) => (n ? <p className={'note' + (n.bad ? ' bad' : '')} role="status">{n.text}</p> : null);

function Cells({ n, max }: { n: number; max: number }) {
  return (
    <span className="cells" aria-label={`연체 ${n}/${max}`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );
}

// ── 금융 4곳 ────────────────────────────────────────────────────────────
export function LenderSheet({ id }: { id: LenderId }) {
  const g = useGame((s) => s.g);
  const close = useUI((s) => s.close);
  const m = lenderModel(g, id);
  const { run, note, stampKey } = useDo();
  const [mult, setMult] = useState<1 | 10 | 'all'>(1);
  const [terms, setTerms] = useState(false);
  const [consent, setConsent] = useState(false);
  const cash = g.run.cash;
  const amt = stampAmount(cash, m.principal, m.stampUnit, mult);

  if (m.locked) {
    return (
      <SheetFrame title="어두운 골목" onBack={close}>
        <div className="lockedmsg">
          <img src="/ui/icons/lock.webp" alt="" />
          <p>아직 갈 일이 없는 골목입니다.</p>
          <p className="sub">연체가 생기거나 빚이 50만을 넘으면 길이 보입니다.</p>
        </div>
      </SheetFrame>
    );
  }
  const closed = m.closed;
  const got = Math.floor(m.unit * (1 - m.upfront));
  return (
    <SheetFrame title={m.name} sub={m.npc} onBack={close}>
      <div className="npc">
        <Art id={NPC_ART[id]} className="bust" alt={m.npc} />
        <div className="bubble"><span>{m.line}</span></div>
      </div>
      {id === 'capital' && <CapitalFutures />}
      <div className="ledger">
        <div className="row sb">
          <span className="stat">원금 <b>{comma(m.principal)}</b></span>
          <span className="stat sm">한도 {short(m.limit)}</span>
        </div>
        <div className="row sb">
          <span className="sub">정산 이자 {(m.rate * 100).toFixed(0)}% = <b className="mono">{comma(m.interest)}</b></span>
          <span className="sub">연체 <Cells n={m.overdue} max={m.maxOverdue} /> {m.overdue > 0 && <span className="od-tag">연체 {m.overdue}/{m.maxOverdue}</span>}</span>
        </div>
        {m.tagged && <div className="sub"><span className="od-tag">가압류 딱지</span> 이 채권처의 딱지가 붙어 있습니다.</div>}
        {m.inherited > 0 && <div className="sub">물려받은 몫 {comma(m.inherited)}</div>}
        {m.grudge && <div className="sub">원한을 품은 채권처입니다. 한도가 깎였습니다.</div>}
        {m.tie && <div className="sub">집안 연줄이 있는 채권처입니다.</div>}
      </div>
      {id === 'shark2' && <p className="sub">받는 돈 {comma(got)} / 장부 {comma(m.unit)} (선이자 {Math.round(m.upfront * 100)}%)</p>}
      {closed && <p className="note bad">영업시간이 끝났습니다. 내일 아침에 오십시오.</p>}
      <div className="chips">
        {([1, 10, 'all'] as const).map((x) => (
          <button key={String(x)} className={'chip' + (mult === x ? ' on' : '')} aria-pressed={mult === x} onClick={() => setMult(x)}>
            {x === 'all' ? '전부' : `×${x}`}
          </button>
        ))}
      </div>
      {m.needsContacts && (
        <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />지인 연락처 제출에 동의합니다</label>
      )}
      <div className="btns">
        <button className="act stamp" disabled={closed || m.principal <= 0} onClick={() => run({ type: 'stamp', lender: id, mult }, (r) => (r.cleared ? '완납' : `−${comma(r.paid ?? 0)} 갚았습니다`))}>
          도장 {amt > 0 ? `−${short(amt)}` : ''}
        </button>
        <button disabled={closed} onClick={() => run({ type: 'borrow', lender: id, consent }, (r) => `+${comma(r.amount ?? 0)} 받았습니다`)}>
          빌리기 +{short(got)}
        </button>
      </div>
      {m.canRollover && (
        <button className="wide" disabled={closed} onClick={() => run({ type: 'rollover', lender: id }, () => '이번 이자를 미뤘습니다. 원금에 10%가 얹힙니다.')}>이자 미루기</button>
      )}
      <Note n={note} />
      {stampKey > 0 && <span key={stampKey} className="stampmark" aria-hidden="true"><img src="/ui/icons/paid.webp" alt="" /></span>}
      {m.tax && (
        <div className="ledger tax">
          <b>세무서 창구</b>
          <div className="row sb"><span className="stat">세금 <b>{comma(m.tax.principal)}</b></span><span className="sub">기한 {m.tax.dueIn ?? '-'}회 남음</span></div>
          {m.tax.closed && <span className="note bad">영업이 끝났습니다.</span>}
          <button className="act stamp" disabled={m.tax.closed} onClick={() => run({ type: 'stamp', lender: 'tax', mult }, (r) => (r.cleared ? '납부 완료' : `−${comma(r.paid ?? 0)} 납부`))}>납부 도장</button>
        </div>
      )}
      <button className="terms-btn" onClick={() => { setTerms(!terms); if (id === 'shark2' && !terms) run({ type: 'visit', place: 'terms.shark2' }); }}>
        <img src="/ui/icons/terms.webp" alt="" />약관 보기
      </button>
      {terms && <p className="terms">{m.terms}</p>}
    </SheetFrame>
  );
}

// ── 친구네 골목 ─────────────────────────────────────────────────────────
export function FriendsSheet() {
  const g = useGame((s) => s.g);
  const close = useUI((s) => s.close);
  const views = friendViews(g);
  const [sel, setSel] = useState(views[0].id);
  const { run, note } = useDo();
  const f = views.find((v) => v.id === sel)!;
  const def = friendById[sel];
  const cash = g.run.cash;
  const amt = stampAmount(cash, f.debt, f.stampUnit, 1);
  return (
    <SheetFrame title="친구네 골목" sub="문 다섯 개" onBack={close}>
      <div className="fchips" role="tablist">
        {views.map((v) => (
          <button key={v.id} role="tab" aria-selected={v.id === sel} className={v.id === sel ? 'on' : ''} onClick={() => setSel(v.id)} aria-label={`${v.name}${v.broken ? ' 닫힌 문' : ''}`}>
            <Art id={NPC_ART[v.id]} className="face" label={v.species} />
            <span className="mini"><i style={{ width: Math.min(100, v.trust) + '%' }} /></span>
            {v.broken && <span className="x">×</span>}
          </button>
        ))}
      </div>
      <div className="npc">
        <Art id={NPC_ART[sel]} className="bust" alt={f.name} />
        <div className="bubble"><span>{f.broken ? def.breakLine : f.canBorrow ? `${f.name}: 필요하면 말해.` : "더는 빌려줄 수 없어."}</span></div>
      </div>
      <div className="ledger">
        <div className="row sb"><span className="stat">빌린 돈 <b>{comma(f.debt)}</b></span><span className="sub">한도 {short(f.maxLoan)}</span></div>
        <div className="row sb"><span className="sub">신뢰 {f.trust}</span>{f.dueIn !== null && f.debt > 0 && <span className="sub">갚기로 한 날까지 {f.dueIn}회</span>}</div>
      </div>
      <div className="btns">
        <button className="act stamp" disabled={f.broken || f.debt <= 0} onClick={() => run({ type: 'stampFriend', friend: sel }, (r) => `−${comma(r.paid ?? 0)} 갚았습니다`)}>갚기 {amt > 0 ? `−${short(amt)}` : ''}</button>
        <button disabled={f.broken} onClick={() => run({ type: 'borrowFriend', friend: sel }, (r) => `+${comma(r.amount ?? 0)} 받았습니다`)}>빌리기 +{short(f.unit)}</button>
      </div>
      <Note n={note} />
    </SheetFrame>
  );
}

// ── 내 집(매물 게시판) ──────────────────────────────────────────────────
export function HomeSheet() {
  const g = useGame((s) => s.g);
  const close = useUI((s) => s.close);
  const rows = houseRows(g);
  const { run, note } = useDo();
  return (
    <SheetFrame title="내 집" sub="매물 게시판" onBack={close}>
      <div className="houselist">
        {rows.map((h) => (
          <div key={h.stage} className={'hr' + (h.current ? ' cur' : '')}>
            <span className="n">{h.name}<span className="sub block">생활비 {comma(h.living)} · {h.current ? '지금 사는 곳' : h.cost < 0 ? `팔면 +${comma(-h.cost)}` : `드는 돈 ${short(h.cost)}`}{h.reason && !h.current ? ` · ${h.reason}` : ''}</span></span>
            {!h.current && <button className={h.stage > g.run.house ? 'act' : ''} disabled={!!h.reason} onClick={() => run({ type: 'move', to: h.stage }, () => `${houseDefs[h.stage].name}(으)로 이사했습니다`)}>이사</button>}
          </div>
        ))}
      </div>
      <Note n={note} />
    </SheetFrame>
  );
}

// ── 일터 패널(지갑 · 설비 · 업그레이드) ─────────────────────────────────
export function WorkSheet({ tab: initial }: { tab?: 'wallet' | 'equip' | 'upgrade' }) {
  const g = useGame((s) => s.g);
  const close = useUI((s) => s.close);
  const [tab, setTab] = useState<'wallet' | 'equip' | 'upgrade'>(initial ?? 'wallet');
  const { run, note } = useDo();
  const w = workModel(g);
  const hold = useHold();
  return (
    <SheetFrame title="일터" sub={TIME_LABEL[g.run.settleNo % 4]} onBack={close}>
      <div className="chips tabs" role="tablist">
        {([['wallet', '지갑'], ['equip', '설비'], ['upgrade', '업그레이드']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
            {l}{k === 'upgrade' && w.affordableDot && <i className="dot" />}
          </button>
        ))}
      </div>
      {tab === 'wallet' && (
        <div className="list">
          {w.wallet.rows.length === 0 && <p className="sub">쳇바퀴가 없어서 지갑이 비어 있습니다.</p>}
          {w.wallet.rows.map((r) => (
            <div key={r.coin} className="item">
              <div className="row sb">
                <b className="nm">{r.name}</b>
                <span className="mono">{r.qty.toFixed(6)}개 = {comma(r.value)}</span>
              </div>
              <div className="row sb">
                <span className={'sub ' + (r.pct < 0 ? 'down' : 'up')}>{r.pct >= 0 ? '▲' : '▼'}{Math.abs(r.pct).toFixed(1)}% 세대 시작 대비</span>
                <span className="inl">
                  <button onClick={() => run({ type: 'sell', coin: r.coin, part: 'half' })}>절반</button>
                  <button className="act" onClick={() => run({ type: 'sell', coin: r.coin, part: 'all' })}>전부 팔기</button>
                </span>
              </div>
              <label className="check"><input type="checkbox" checked={r.autoSell} onChange={(e) => run({ type: 'autoSell', coin: r.coin, on: e.target.checked })} />캐는 즉시 팔기 (수수료 0.5%)</label>
              <label className="check"><input type="checkbox" checked={g.run.coinWheels[r.coin].on} onChange={(e) => run({ type: 'toggleWheel', coin: r.coin, on: e.target.checked })} />쳇바퀴 켜짐</label>
            </div>
          ))}
          <p className="sub">{w.wallet.concentration.text}</p>
        </div>
      )}
      {tab === 'equip' && (
        <div className="list">
          <b className="h">종목 쳇바퀴</b>
          {w.slots.map((s) => (
            <div key={s.coin} className="item row sb">
              <span className="nm">{s.name}{s.owned && ' ✓'}<span className="sub block">{s.owned ? '가동 중' : s.reason ? s.reason : '살 수 있습니다'}{!s.owned && s.progress && s.reason ? ` — 지금 ${comma(s.progress.current)}` : ''}</span></span>
              {!s.owned && <button className="act" disabled={!s.canBuy} onClick={() => run({ type: 'buyWheel', coin: s.coin })}>{short(s.cost)}</button>}
            </div>
          ))}
          <b className="h">설비 사다리</b>
          {w.tiers.map((t) => (
            <div key={t.id} className="item">
              <div className="row sb"><span className="nm">{t.name} <span className="sub">{t.units}/{t.max}</span></span><span className="mono">{t.nextCost === null ? '최대' : short(t.nextCost)}</span></div>
              <div className="chips wrap">
                {t.targets.length === 0 && <span className="sub">종목 쳇바퀴가 필요합니다.</span>}
                {t.targets.map((x) => (
                  <button key={x.coin} disabled={!!x.reason} title={x.reason ?? ''} onClick={() => run({ type: 'buyEquip', tier: t.id, coin: x.coin })}>{x.short}에 붙이기</button>
                ))}
              </div>
              {t.targets.length > 0 && t.targets.every((x) => x.reason) && <span className="sub">{t.targets[0].reason}</span>}
            </div>
          ))}
          {w.equipment.length > 0 && <b className="h">붙어 있는 설비</b>}
          {w.equipment.map((u) => (
            <div key={u.uid} className="item row sb">
              <span className="nm">{u.name} · {u.coinShort}<span className="sub block">순수입 {signed(Math.round(u.net))}{u.reverse ? ' · 역마진' : ''}{u.tagBy ? ' · 딱지' : ''}</span></span>
              <span className="inl">
                <button onClick={() => run({ type: 'toggleEquip', uid: u.uid })}>{u.on ? '끄기' : '켜기'}</button>
                <button onClick={() => run({ type: 'sellEquip', uid: u.uid })}>팔기</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {tab === 'upgrade' && (
        <div className="list">
          {w.upgrades.map((u) => (
            <div key={u.key} className="item row sb">
              <span className="nm">{u.name}{u.targetLabel && <span className="sub"> · {u.targetLabel}</span>}<span className="sub block">{u.level}/{u.max}단계 · {u.effect}</span></span>
              <span className="inl">
                {u.afford && <i className="dot" />}
                <button
                  className={u.afford ? 'act' : ''}
                  disabled={!u.can || !u.afford}
                  {...hold(() => run({ type: 'upgrade', track: u.track, target: u.target }))}
                >
                  {u.cost === null ? '최고' : short(u.cost)}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <Note n={note} />
    </SheetFrame>
  );
}

/** 길게 누르면 연속 구매. */
function useHold() {
  return (fn: () => void) => {
    let t: number | undefined;
    let iv: number | undefined;
    const stop = () => { window.clearTimeout(t); window.clearInterval(iv); };
    return {
      onPointerDown: () => { t = window.setTimeout(() => { iv = window.setInterval(fn, 120); }, 450); },
      onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
      onClick: fn,
    };
  };
}

// ── 채권자의 방문 ───────────────────────────────────────────────────────
export function VisitSheet() {
  const g = useGame((s) => s.g);
  const v = visitModel(g);
  const dismiss = useUI((s) => s.dismissVisit);
  const { run, note } = useDo();
  if (!v) return null;
  return (
    <SheetFrame title={v.name} sub="일터 앞에 와 있습니다" onBack={() => dismiss(v.key)}>
      <div className="npc">
        <Art id={NPC_ART[v.by] ?? 'npc_weasel'} className="bust" alt={v.name} />
        <div className="bubble">{v.text}</div>
      </div>
      <div className="btns">
        <button className="act" onClick={() => { const r = run({ type: 'acceptOffer', id: v.id }); if (r.ok) dismiss(v.key); }}>{v.accept}</button>
        <button onClick={() => { run({ type: 'declineOffer', id: v.id }); dismiss(v.key); }}>{v.decline}</button>
      </div>
      <Note n={note} />
    </SheetFrame>
  );
}
export { lenderById };
