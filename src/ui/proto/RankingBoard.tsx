// 마을 전광판(랭킹, U-45): 지도 한쪽의 나무 게시판 · 환생 화면에서 연다. 판 셋, 위 50, 내 자리는 밝힌다.
// U-59: 빚을 한 번 다 갚기 전에는 자물쇠 판(RankLocked). 처음 다 갚으면 완납 장면의 고르는 줄 위로 큰 축하(RankUnlockCheer)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { marketById } from '../../engine/data';
import { pdev } from './config';
import { play } from './audio';
import { closeBoard, fetchMe, fetchTop, myLedgerNo, openBoard, rankOffReason, setRankName, useRank, type MeRow, type TopRow } from './ranking';
import { BOARDS, BOARD_LABEL, cleanName, detailText, valueText, type Board } from './rankingCore';
import { endCheer, useUnlock } from './rankUnlock';
import { acornSvg } from './art';
import { sprite, BUST_OF } from './sprites';
import { reduced } from './fx';
import { later } from './audio';
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
        <span>장부에 적힌 이름 <b>{name} <small className="rk-no">#{myLedgerNo()}</small></b></span>
        <button className="rk-link" data-rank-rename onClick={() => { setV(name); setEdit(true); }}>고치기</button>
      </div>
    );
  }
  const save = () => { if (setRankName(v)) { play('collector_paid'); setEdit(false); } };
  return (
    <form className={'rk-ask' + (compact ? ' compact' : '')} data-rank-ask onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label htmlFor="rk-name-in">장부에 적을 이름</label>
      <small>전광판에 붙는 이름. 1~12글자, 뒤에 장부 번호 #{myLedgerNo()} 가 붙는다. 나중에 고칠 수 있다.</small>
      <div className="row">
        <input id="rk-name-in" data-rank-input value={v} maxLength={24} autoComplete="off" placeholder="예: 도토리부자" onChange={(e) => setV(e.target.value)} />
        <button type="submit" className={'buy' + (ok ? ' on' : '')} disabled={!ok} data-rank-save><span>적는다</span></button>
      </div>
    </form>
  );
}

/** 지도 위 나무 게시판(전광판을 여는 곳): 마을 빈터 한쪽에 박아 둔 널빤지 */
export function RankSign() {
  const locked = useUnlock((s) => !s.rec);
  return (
    <button className={'rk-sign' + (locked ? ' locked' : '')} data-rank-sign={locked ? 'locked' : 'open'} onClick={(e) => { e.stopPropagation(); play('ui_tap'); openBoard(); }} aria-label={locked ? '마을 전광판, 잠김' : '마을 전광판 보기'}>
      <span className="plank"><b>전광판</b><small>{locked ? '빚 다 갚으면' : '숲의 기록'}</small>{locked && <i className="lock" aria-hidden="true" />}</span>
      <span className="posts" aria-hidden="true"><i /><i /></span>
    </button>
  );
}
/** 환생 화면의 작은 단추 */
export function RankButton() {
  const locked = useUnlock((s) => !s.rec);
  return <button className={'rk-open' + (locked ? ' locked' : '')} data-rank-open={locked ? 'locked' : 'open'} onClick={() => { play('ui_tap'); openBoard(); }}>{locked ? '마을 전광판 (잠김)' : '마을 전광판 보기'}</button>;
}

export const LOCK_TEASER = '빚을 한 번 다 갚은 자만 전광판에 이름을 올린다';
/** 잠긴 전광판: 자물쇠 판 하나 */
function RankLocked() {
  return (
    <div className="pr-notice pr-rank" role="dialog" aria-label="마을 전광판, 잠김" data-rank-board="locked" onClick={closeBoard}>
      <div className="box rk-lockbox" onClick={(e) => e.stopPropagation()}>
        <div className="rk-mast"><b>마을 전광판</b><span>잠김</span></div>
        <div className="rk-plaque" data-rank-locked>
          <i className="lock big" aria-hidden="true" />
          <b>{LOCK_TEASER}</b>
          <small>어느 생이든 장부의 빚을 0 으로 만드는 날 자물쇠가 풀린다. 한 번 풀리면 다음 생에도 열려 있다.</small>
          <small>그 전에 낸 기록은 올라가지 않는다.</small>
        </div>
        <ul className="rk-tease" aria-label="열리면 붙는 판">
          {BOARDS.map((b) => <li key={b}>{BOARD_LABEL[b].tab}</li>)}
        </ul>
        <button className="buy on wide" data-rank-close onClick={closeBoard}><span>접는다</span></button>
      </div>
    </div>
  );
}

/** 처음 다 갚은 순간(U-59): 축하합니다! 도토리 비, 팡파르, 추심원이 장부를 덮는 한마디, 그리고 전광판이 열렸다 */
export const CHEER_LINES = {
  title: '축하합니다!',
  collector: '장부를 덮겠습니다. 덮을 일이 없을 줄 알고 풀칠해 뒀는데, 뜯느라 혼났어요.',
  collector2: '이제 이름 석 자는 장부 말고 전광판에 적으세요.',
  open: '숲 전광판이 열렸다',
  sub: '빚을 다 갚은 자만 이름을 올리는 판. 지금부터 낸 기록이 붙는다.',
};
export function RankUnlockCheer() {
  const on = useUnlock((s) => s.cheer);
  const named = useRank((s) => !!s.name);
  const calm = reduced();
  const rain = useMemo(() => Array.from({ length: calm ? 0 : 40 }, (_, i) => ({
    x: 3 + ((i * 41) % 94), d: (i % 10) * 0.16 + (i > 20 ? 1.4 : 0), s: 16 + ((i * 7) % 16), r: (i % 2 ? -1 : 1) * (200 + ((i * 53) % 300)), t: 1.6 + ((i * 13) % 9) / 10,
  })), [on]);
  useEffect(() => {
    if (!on) return;
    play('win_jackpot');
    later(450, () => play('win_coins'));
    later(1700, () => play('win_fanfare'));
  }, [on]);
  if (!on) return null;
  const col = sprite(BUST_OF.collector ?? 'collector');
  const go = () => { play('ui_tap'); endCheer(); openBoard('roe'); };
  const close = () => { play('ui_tap'); endCheer(); };
  return (
    <div className={'rk-cheer' + (calm ? ' calm' : '')} role="dialog" aria-label="축하합니다, 숲 전광판이 열렸다" data-rank-cheer>
      <div className="rain" aria-hidden="true">
        {rain.map((a, i) => <span key={i} style={{ left: `${a.x}%`, width: a.s, height: a.s, animationDelay: `${a.d}s`, animationDuration: `${a.t}s`, ['--rot' as string]: `${a.r}deg` }} dangerouslySetInnerHTML={{ __html: acornSvg(a.s) }} />)}
      </div>
      <h2 className="rk-cheer-t" data-cheer-title>{CHEER_LINES.title}</h2>
      <div className="rk-cheer-col">
        {col && <img src={col.src} alt="" draggable={false} />}
        <p className="say"><b>추심원</b>「{CHEER_LINES.collector}」<br />「{CHEER_LINES.collector2}」</p>
      </div>
      <div className="rk-cheer-open" data-cheer-open>
        <i className="lock open" aria-hidden="true" />
        <b>{CHEER_LINES.open}</b>
        <small>{CHEER_LINES.sub}</small>
        <button className="buy on wide" data-cheer-board onClick={go}><span>전광판 보기</span>{!named && <small>이름부터 적는다</small>}</button>
        <button className="rk-link" data-cheer-close onClick={close}>나중에 본다</button>
      </div>
    </div>
  );
}

export function RankBoard() {
  const open = useRank((s) => s.open);
  const tab = useRank((s) => s.tab);
  const rejected = useRank((s) => s.rejected);
  const named = useRank((s) => !!s.name);
  const net = useGame((s) => s.net);
  const fake = pdev === 'rank';
  const locked = useUnlock((s) => !s.rec);
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [me, setMe] = useState<MeRow | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { if (!fake) return; if (q.get('pname')) useRank.setState({ name: q.get('pname') }); openBoard((q.get('prank') as Board) || undefined); }, []);
  useEffect(() => {
    if (!open || (locked && !fake)) return;
    let live = true;
    setRows(null); setErr(false);
    if (fake) { const r = fakeRows(tab); setRows(r); setMe(fakeMe(r)); return; }
    Promise.all([fetchTop(tab, 50), fetchMe(tab).catch(() => null)])
      .then(([r, m]) => { if (live) { setRows(r); setMe(m); } })
      .catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [open, tab, locked]);
  // 내 줄이 있으면 목록 가운데로 굴려 둔다
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current, row = el?.querySelector<HTMLElement>('.rk-row.me');
    if (el && row) el.scrollTop = Math.max(0, row.offsetTop - el.offsetTop - el.clientHeight / 2 + row.clientHeight / 2);
  }, [rows, me]);
  if (!open) return null;
  if (locked && !fake) return <RankLocked />;
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
  const locked = useUnlock((s) => !s.rec);
  const ask = !named && !locked && (rankOffReason(net) === null || pdev === 'rebirth' || pdev === 'tree');
  return (
    <div className="rk-rebirth" data-rank-rebirth>
      {ask && <RankNameAsk compact />}
      <RankButton />
    </div>
  );
}
