// 임시 디버그 화면(M1). 상태를 보여 주고 줍기/채굴/구매/팔기/대출/도장을 눌러 볼 수 있다. 화면 설계는 M7 에서.
import { useGame } from './store/gameStore';
import { COINS, coinWheelDefs, tierDefs, lenderDefs, friendDefs, houseDefs, wheelByCoin } from './engine/data';
import { netWorth, stage, totalDebt, walletValueOf } from './engine/selectors';
import { forecast } from './engine/settlement';
import { wheelStatus } from './engine/progression';
import { comma, abbrev, timeOfDay } from './engine/util';
import { affordableUpgrades } from './engine/upgrades';
import { upgradeTracks } from './engine/data';
import { previewEnding } from './engine/endings';
import { futuresGate } from './engine/progression';
import { levCapNow, roePct, liqPrice } from './engine/futures';
import { statement, treeStatus, canRetire } from './engine/generation';
import { legacy } from './engine/data';

const TIME = ['아침', '낮', '저녁', '밤'];

export default function App() {
  const { g, act, advance, reset, speed, setSpeed } = useGame();
  const run = g.run;
  const f = forecast(g);
  const btn = { margin: 2, padding: '6px 8px', minHeight: 36 } as const;
  return (
    <div style={{ padding: 12, fontFamily: 'sans-serif', fontSize: 14, maxWidth: 760 }}>
      <h1 style={{ fontSize: 18 }}>선물의 숲 — 엔진 디버그 (GDD v2 M1)</h1>
      <Inheritance />
      <p>
        단계 {stage(run)} · {TIME[timeOfDay(run)]} · 정산 {run.settleNo}회 (다음까지 {run.settleIn}초) · 현금 {comma(run.cash)} · 순자산 {comma(netWorth(run))} · 총부채 {comma(totalDebt(run))}
        {run.over && <b style={{ color: 'crimson' }}> · 파산 {run.bankruptcy?.cause}</b>}
      </p>
      <p>
        다음 정산: 캔 값 +{comma(f.mined)} / 전기세 −{comma(f.power)} / 이자 −{comma(f.interest)} / 생활비 −{comma(f.living)} = {f.net >= 0 ? '+' : ''}{comma(f.net)}
      </p>
      <div>
        <button style={btn} onClick={() => act({ type: 'tap' })}>{stage(run) === 0 ? '도토리 줍기 (+27)' : `채굴 탭 (${run.riding})`}</button>
        <button style={btn} onClick={() => advance(10)}>10초</button>
        <button style={btn} onClick={() => advance(180)}>정산(3분)</button>
        <button style={btn} onClick={() => setSpeed(speed === 1 ? 20 : 1)}>배속 x{speed}</button>
        <button style={btn} onClick={reset}>새로 시작</button>
        <span> 줍기 {run.acornTaps}회 · 누적 채굴 {comma(run.minedValue)}어치</span>
      </div>
      <h3>쳇바퀴·지갑</h3>
      {coinWheelDefs.map((w) => {
        const s = wheelStatus(g, w.coin as any);
        const c = w.coin as any;
        return (
          <div key={w.id}>
            {w.name} {s.owned ? (
              <>
                지갑 {(run.wallet[c]?.qty ?? 0).toFixed(6)}개 = {comma(walletValueOf(run, c))}
                <button style={btn} onClick={() => act({ type: 'ride', coin: c })}>{run.riding === c ? '타는 중' : '올라타기'}</button>
                <button style={btn} onClick={() => act({ type: 'sell', coin: c, part: 'all' })}>전부 팔기</button>
                <button style={btn} onClick={() => act({ type: 'autoSell', coin: c, on: !run.coinWheels[c].autoSell })}>즉시 팔기 {run.coinWheels[c].autoSell ? 'ON' : 'OFF'}</button>
                <button style={btn} onClick={() => act({ type: 'toggleWheel', coin: c })}>{run.coinWheels[c].on ? '끄기' : '켜기'}</button>
              </>
            ) : s.visible ? (
              <button style={btn} disabled={!s.canBuy} onClick={() => act({ type: 'buyWheel', coin: c })}>{comma(w.cost)} 구매 {s.reason ? `(${s.reason})` : ''}</button>
            ) : <i>아직 안 보임</i>}
            {' '}현재가 {run.prices[c].toFixed(2)} (시작가 대비 {((run.prices[c] / run.refPrice[c] - 1) * 100).toFixed(1)}%)
          </div>
        );
      })}
      <h3>설비 ({run.equipment.length})</h3>
      {tierDefs.map((t) => (
        <div key={t.id}>
          {t.name} {comma(t.cost)}~{' '}
          {COINS.filter((c) => run.coinWheels[c]).map((c) => (
            <button key={c} style={btn} onClick={() => act({ type: 'buyEquip', tier: t.id, coin: c })}>{wheelByCoin[c].name.replace(' 쳇바퀴', '')}에 붙이기</button>
          ))}
        </div>
      ))}
      {run.equipment.map((u) => (
        <div key={u.uid}>
          {u.tier}@{u.coin} {u.on ? 'ON' : 'OFF'} {u.tagBy ? `[딱지:${u.tagBy}]` : ''}
          <button style={btn} onClick={() => act({ type: 'toggleEquip', uid: u.uid })}>끄기/켜기</button>
          <button style={btn} onClick={() => act({ type: 'sellEquip', uid: u.uid })}>팔기</button>
        </div>
      ))}
      <h3>업그레이드 (살 수 있는 것 {affordableUpgrades(run).length}개)</h3>
      {upgradeTracks.filter((t) => t.scope === 'body' || t.scope === 'run').map((t) => (
        <button key={t.id} style={btn} onClick={() => act({ type: 'upgrade', track: t.id })}>{t.id} Lv{(run.upgrades.body[t.id] ?? run.upgrades.run[t.id] ?? 0)}</button>
      ))}
      {COINS.filter((c) => run.coinWheels[c]).map((c) => ['oil', 'spokes', 'power'].map((t) => (
        <button key={c + t} style={btn} onClick={() => act({ type: 'upgrade', track: t, target: c })}>{c}:{t} Lv{run.upgrades.coinWheel[c]?.[t] ?? 0}</button>
      )))}
      <h3>빚</h3>
      {lenderDefs.map((l) => (
        <div key={l.id}>
          {l.name} 원금 {abbrev(run.debts[l.id as 'bank'].principal)} 연체 {run.debts[l.id as 'bank'].overdue}/{l.maxOverdue}
          {l.id !== 'tax' && <button style={btn} onClick={() => act({ type: 'borrow', lender: l.id as any, consent: true })}>빌리기</button>}
          <button style={btn} onClick={() => act({ type: 'stamp', lender: l.id as any })}>도장</button>
        </div>
      ))}
      <div>
        친구: {friendDefs.map((fr) => (
          <span key={fr.id}>
            <button style={btn} onClick={() => act({ type: 'borrowFriend', friend: fr.id })}>{fr.name} 빌리기(신뢰 {run.friends[fr.id].trust}{run.friends[fr.id].broken ? ' 절교' : ''})</button>
          </span>
        ))}
      </div>
      <div>
        집 {houseDefs[run.house].name}:{' '}
        {houseDefs.map((h) => (
          <button key={h.stage} style={btn} onClick={() => act({ type: 'move', to: h.stage })}>{h.name}</button>
        ))}
      </div>
      <h3>선물 {run.futures.open ? `(상한 ${levCapNow(run)}배, 끝난 거래 ${run.futures.closedTrades})` : '(계좌 없음)'}</h3>
      {!run.futures.open && (
        <div>
          {futuresGate(g).conditions.map((c) => <span key={c.id}>{c.id} {c.met ? 'O' : 'X'} {c.current}/{c.need} · </span>)}
          <button style={btn} onClick={() => act({ type: 'eduPage' })}>사전교육 ({run.futures.edu}/3)</button>
          <button style={btn} onClick={() => act({ type: 'mockTrade' })}>모의거래</button>
          <button style={btn} onClick={() => act({ type: 'openAccount' })}>계좌 개설</button>
        </div>
      )}
      {run.futures.open && (
        <div>
          {['DTC', 'BTH', 'SMS', 'MDT', 'JQQ'].map((m) => (
            <div key={m}>
              {m} {run.prices[m].toFixed(2)}{' '}
              <button style={btn} onClick={() => act({ type: 'open', market: m, dir: 1, lev: 10, marginPct: 25 })}>롱 10x</button>
              <button style={btn} onClick={() => act({ type: 'open', market: m, dir: -1, lev: 10, marginPct: 25 })}>숏 10x</button>
              {run.positions[m] && (
                <>
                  {run.positions[m].dir === 1 ? '롱' : '숏'} {run.positions[m].lev}x 증거금 {comma(run.positions[m].margin)} ROE {roePct(run.positions[m], run.prices[m]).toFixed(1)}% 청산가 {liqPrice(run.positions[m]).toFixed(2)}
                  <button style={btn} onClick={() => act({ type: 'close', market: m })}>정리</button>
                </>
              )}
            </div>
          ))}
          <button style={btn} onClick={() => act({ type: 'signWaiver' })}>확인서 도장</button>
        </div>
      )}
      <h3>엔딩</h3>
      {run.over && g.pendingEnding ? (
        <div>
          <b>{g.pendingEnding.id} {g.pendingEnding.title}</b> ({g.pendingEnding.cause}, {g.pendingEnding.isNew ? '새 엔딩' : `${g.pendingEnding.nth}번째`}) — {g.pendingEnding.line}
          <div>마지막 세 장면: {g.pendingEnding.lastThree.map((e) => e.text).join(' / ')}</div>
          <div>한 끗 차이: {g.pendingEnding.nearMisses.map((m) => `${m.id}(${m.missing})`).join(', ') || '없음'}</div>
          <div>다음 세대에 남는 것: {g.pendingEnding.nextGen.trait} · {g.pendingEnding.nextGen.trace}</div>
        </div>
      ) : (
        <div>이대로 가면 → {previewEnding(g).ending.id} {previewEnding(g).lantern ? '(등불 켜짐: ' + previewEnding(g).ending.clue + ')' : '(이미 수집)'}</div>
      )}
      <h3>속보·기록</h3>
      <ul>{run.notices.slice(-5).reverse().map((n, i) => <li key={i}>{n.text}</li>)}</ul>
      <ul style={{ color: '#666' }}>{run.eventLog.slice().reverse().map((e, i) => <li key={i}>{e.kind} {e.text} {e.amount ?? ''}</li>)}</ul>
    </div>
  );
}

/** 세대 끝 -> 엔딩 카드 -> 재산 명세서(세 갈래) -> 가문 특성 트리 -> 다음 세대. 임시 디버그 버튼(M9 에서 화면으로). */
function Inheritance() {
  const { g, act } = useGame();
  const btn = { margin: 2, padding: '6px 8px', minHeight: 36 } as const;
  const e = g.estate;
  const f = g.family;
  const treeBox = (
    <div>
      <b>가문 특성 트리</b> — 가진 {legacy.currency.name} {f.han} (쓴 {f.hanSpent})
      {treeStatus(g).map((t) => (
        <div key={t.id}>
          {t.name} {t.level}/{t.max} {t.cost !== null && <button style={btn} disabled={!t.canBuy} onClick={() => act({ type: 'buyTree', id: t.id })}>{t.cost} 사기</button>}
        </div>
      ))}
    </div>
  );
  if (!g.run.over && !e) {
    return (
      <div>
        {canRetire(g) && <button style={btn} onClick={() => act({ type: 'retire' })}>은퇴하고 물려주기</button>}
        <details><summary>가문 특성 트리 ({legacy.currency.name} {f.han})</summary>{treeBox}</details>
      </div>
    );
  }
  if (!e) return null;
  return (
    <div style={{ border: '1px solid #999', padding: 8, margin: '8px 0' }}>
      <b>{f.generation}세대 끝</b> ({e.kind === 'retire' ? '은퇴' : '파산'})
      {e.step === 'card' && (
        <div>
          {g.pendingEnding && <p>{g.pendingEnding.id} {g.pendingEnding.title} — {g.pendingEnding.line}</p>}
          <button style={btn} onClick={() => act({ type: 'estateNext' })}>재산 명세서로</button>
        </div>
      )}
      {e.step === 'statement' && (() => {
        const st = statement(g);
        return (
          <div>
            <p>부모가 남긴 것: 현금 {comma(st.parent.cash)} · 지갑 {comma(st.parent.wallet)} · 쳇바퀴 {st.parent.coins.length} · 설비 {st.parent.equipment} · 집 {st.parent.house} · 빚 {Object.entries(st.parent.debts).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${comma(v)}`).join(', ') || '없음'}</p>
            {st.cards[0] && <p>쌓인 성과 {st.cards[0].calc.score} × 장부 {st.cards[0].calc.ledgerMul.toFixed(2)} × 반복 {st.cards[0].calc.repeatMul.toFixed(2)} × 족보 {st.cards[0].calc.crestMul.toFixed(2)}</p>}
            {st.cards.map((c) => (
              <div key={c.branch}>
                <button style={btn} onClick={() => act({ type: 'inherit', branch: c.branch })}>{({ renounce: '상속포기', limited: '한정승인', simple: '단순승인', gift: '증여' } as any)[c.branch]}</button>
                받는 {legacy.currency.name} +{c.han} · 남는 것: {c.keeps.join(', ') || '없음'} · 시작 빚 {comma(c.startDebt)}{c.tax ? ` + 세금 ${comma(c.tax)}` : ''} · 현금 {comma(c.startCash)} · 첫 정산 수지 {comma(c.firstNet)} · 단계 {c.stage}
              </div>
            ))}
          </div>
        );
      })()}
      {e.step === 'tree' && (
        <div>
          <p>{e.chosen} 선택 · 받은 {legacy.currency.name} +{e.award} {e.maxim && `— ${e.maxim}`}</p>
          {treeBox}
          <button style={btn} onClick={() => act({ type: 'nextGeneration' })}>다음 세대 시작</button>
        </div>
      )}
    </div>
  );
}
