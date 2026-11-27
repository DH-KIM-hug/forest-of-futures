// 마을 전광판(랭킹, U-45): 지도 한쪽의 나무 게시판 · 환생 화면에서 연다. 판 셋, 위 50, 내 자리는 밝힌다.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { marketById } from '../../engine/data';
import { pdev } from './config';
import { play } from './audio';
import { closeBoard, fetchMe, fetchTop, openBoard, rankOffReason, setRankName, useRank, type MeRow, type TopRow } from './ranking';
import { BOARDS, BOARD_LABEL, cleanName, detailText, valueText, type Board } from './rankingCore';
import './ranking.css';

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const mName = (id: string) => marketById[id]?.name ?? id;

// ── 화면 확인용 가짜 줄(&pdev=rank). 서버에 보내는 길과 닿지 않는다 ─────────
const FAKE_NAMES = ['도토리부자', '숏의달인', '쳇바퀴장인', '엄마미안해', '200배인생', '밤더리움러', '잣스닥야근', '청산은없다', '멍도토킹', '오소리단골', '알바왕', '숲속개미'];
function fakeRows(board: Board): TopRow[] {
  const now = Date.now();
  return Array.from({ length: 50 }, (_, i) => {
    const k = 50 - i;
    const m = ['DTC', 'BTH', 'MDT', 'SMS', 'JQQ'][i % 5];
    const value = board === 'networth' ? Math.round(2_400_000 * (k / 50) ** 2.2 + 12_000) : board === 'roe' ? +(1840 * (k / 50) ** 2.4 + 11).toFixed(2) : Math.round(910_000 * (k / 50) ** 2.3 + 4_000);
    const detail = board === 'networth' ? { lifeNo: 1 + (i % 7), settles: 12 + ((i * 37) % 140) } : { market: m, lev: [200, 100, 50, 25, 125][i % 5], dir: i % 3 ? 1 : -1, entryTs: now - 600_000, exitTs: now - 600_000 + (45 + ((i * 53) % 900)) * 1000 };
    return { rank: i + 1, name: FAKE_NAMES[i % FAKE_NAMES.length] + (i >= FAKE_NAMES.length ? String(i) : ''), value, detail, at: now };
  });
}
const fakeMe = (rows: TopRow[]): MeRow => ({ ...rows[6], name: q.get('pname') ?? rows[6].name });

/** 이름 적기(1~12글자). "장부에 적을 이름" */
export function RankNameAsk({ compact }: { compact?: boolean }) {
  const name = useRank((s) => s.name);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(name ?? '');
  const ok = !!cleanName(v);
  if (name && !edit) {
    return (
      <div className="rk-name" data-rank-name>
        <span>장부에 적힌 이름 <b>{name}</b></span>
        <button className="rk-link" data-rank-rename onClick={() => { setV(name); setEdit(true); }}>고치기</button>
      </div>
    );
  }
  const save = () => { if (setRankName(v)) { play('collector_paid'); setEdit(false); } };
  return (
    <form className={'rk-ask' + (compact ? ' compact' : '')} data-rank-ask onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label htmlFor="rk-name-in">장부에 적을 이름</label>
      <small>전광판에 붙는 이름. 1~12글자, 나중에 고칠 수 있다.</small>
      <div className="row">
        <input id="rk-name-in" data-rank-input value={v} maxLength={24} autoComplete="off" placeholder="예: 도토리부자" onChange={(e) => setV(e.target.value)} />
        <button type="submit" className={'buy' + (ok ? ' on' : '')} disabled={!ok} data-rank-save><span>적는다</span></button>
      </div>
    </form>
  );
}

/** 지도 위 나무 게시판(전광판을 여는 곳): 마을 빈터 한쪽에 박아 둔 널빤지 */
export function RankSign() {
  return (
    <button className="rk-sign" data-rank-sign onClick={(e) => { e.stopPropagation(); play('ui_tap'); openBoard(); }} aria-label="마을 전광판 보기">
      <span className="plank"><b>전광판</b><small>숲의 기록</small></span>
      <span className="posts" aria-hidden="true"><i /><i /></span>
    </button>
  );
}
/** 환생 화면의 작은 단추 */
export function RankButton() {
  return <button className="rk-open" data-rank-open onClick={() => { play('ui_tap'); openBoard(); }}>마을 전광판 보기</button>;
}

export function RankBoard() {
  const open = useRank((s) => s.open);
  const tab = useRank((s) => s.tab);
  const rejected = useRank((s) => s.rejected);
  const named = useRank((s) => !!s.name);
  const net = useGame((s) => s.net);
  const fake = pdev === 'rank';
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [me, setMe] = useState<MeRow | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { if (!fake) return; if (q.get('pname')) useRank.setState({ name: q.get('pname') }); openBoard((q.get('prank') as Board) || undefined); }, []);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setRows(null); setErr(false);
    if (fake) { const r = fakeRows(tab); setRows(r); setMe(fakeMe(r)); return; }
    Promise.all([fetchTop(tab, 50), fetchMe(tab).catch(() => null)])
      .then(([r, m]) => { if (live) { setRows(r); setMe(m); } })
      .catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [open, tab]);
  // 내 줄이 있으면 목록 가운데로 굴려 둔다
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current, row = el?.querySelector<HTMLElement>('.rk-row.me');
    if (el && row) el.scrollTop = Math.max(0, row.offsetTop - el.offsetTop - el.clientHeight / 2 + row.clientHeight / 2);
  }, [rows, me]);
  if (!open) return null;
  const off = fake ? null : rankOffReason(net);
  const meIn = me && me.rank <= (rows?.length ?? 0);
  return (
    <div className="pr-notice pr-rank" role="dialog" aria-label="마을 전광판" data-rank-board onClick={closeBoard}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <div className="rk-mast"><b>마을 전광판</b><span>실제 시세로 낸 기록만 붙는다</span></div>
        {!named && <RankNameAsk />}
        <div className="rk-tabs" role="tablist">
          {BOARDS.map((b) => (
            <button key={b} role="tab" aria-selected={tab === b} className={tab === b ? 'on' : ''} data-rank-tab={b} onClick={() => { play('ui_tap'); useRank.setState({ tab: b }); }}>{BOARD_LABEL[b].tab}</button>
          ))}
        </div>
        <p className="rk-title">{BOARD_LABEL[tab].title}</p>
        <div className="rk-list" role="list" data-rank-list ref={list}>
          {!rows && !err && <p className="rk-empty">게시판을 읽는 중…</p>}
          {err && <p className="rk-empty">전광판까지 가는 길이 끊겼다. 조금 있다 다시 본다.</p>}
          {rows && rows.length === 0 && <p className="rk-empty">아직 붙은 기록이 없다. 첫 줄이 비어 있다.</p>}
          {rows?.map((r) => (
            <div key={r.rank} role="listitem" className={'rk-row' + (r.rank <= 3 ? ' top' + r.rank : '') + (meIn && me!.rank === r.rank ? ' me' : '')} data-rank-row={r.rank}>
              <i className="no">{r.rank}</i>
              <span className="who"><b>{r.name}{meIn && me!.rank === r.rank && <em>나</em>}</b><small>{detailText(tab, r.detail, mName)}</small></span>
              <b className="val">{valueText(tab, r.value)}</b>
            </div>
          ))}
        </div>
        {me && !meIn && rows && (
          <div className="rk-row me mine" data-rank-me={me.rank}>
            <i className="no">{me.rank}</i>
            <span className="who"><b>{me.name}<em>나</em></b><small>{detailText(tab, me.detail, mName)}</small></span>
            <b className="val">{valueText(tab, me.value)}</b>
          </div>
        )}
        {!me && rows && !fake && <p className="rk-fine" data-rank-none>내 기록은 아직 이 판에 없다.</p>}
        {named && <RankNameAsk />}
        {off === 'sim' && <p className="rk-fine warn" data-rank-off="sim">지금은 연습 시세다. 연습 시세로 낸 기록은 전광판에 올라가지 않는다.</p>}
        {off === 'dev' && <p className="rk-fine warn" data-rank-off="dev">개발 판이라 기록을 올리지 않는다.</p>}
        {rejected > 0 && <p className="rk-fine" data-rank-rejected={rejected}>검증되지 않아 올라가지 않은 기록 {rejected}개</p>}
        <button className="buy on wide" data-rank-close onClick={closeBoard}><span>접는다</span></button>
      </div>
    </div>
  );
}

/** 환생 화면 한 줄: 이름을 아직 안 적었고 실제 시세 판이면 이름을 묻고(막지 않는다), 전광판 단추를 둔다 */
export function RankRebirth() {
  const named = useRank((s) => !!s.name);
  const net = useGame((s) => s.net);
  const ask = !named && (rankOffReason(net) === null || pdev === 'rebirth' || pdev === 'tree');
  return (
    <div className="rk-rebirth" data-rank-rebirth>
      {ask && <RankNameAsk compact />}
      <RankButton />
    </div>
  );
}
