// 임시 디버그 화면(M1). 상태를 보여 주고 줍기/채굴/구매/팔기/대출/도장을 눌러 볼 수 있다. 화면 설계는 M7 에서.
import { useGame } from './store/gameStore';
import { COINS, coinWheelDefs, tierDefs, lenderDefs, friendDefs, houseDefs, wheelByCoin } from './engine/data';
import { netWorth, stage, totalDebt, walletValueOf } from './engine/selectors';
import { forecast } from './engine/settlement';
import { wheelStatus } from './engine/progression';
import { comma, abbrev, timeOfDay } from './engine/util';
import { affordableUpgrades } from './engine/upgrades';
import { upgradeTracks } from './engine/data';

const TIME = ['아침', '낮', '저녁', '밤'];

export default function App() {
  const { g, act, advance, reset, speed, setSpeed } = useGame();
  const run = g.run;
  const f = forecast(g);
  const btn = { margin: 2, padding: '6px 8px', minHeight: 36 } as const;
  return (
    <div style={{ padding: 12, fontFamily: 'sans-serif', fontSize: 14, maxWidth: 760 }}>
      <h1 style={{ fontSize: 18 }}>선물의 숲 — 엔진 디버그 (GDD v2 M1)</h1>
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
      <h3>속보·기록</h3>
      <ul>{run.notices.slice(-5).reverse().map((n, i) => <li key={i}>{n.text}</li>)}</ul>
      <ul style={{ color: '#666' }}>{run.eventLog.slice().reverse().map((e, i) => <li key={i}>{e.kind} {e.text} {e.amount ?? ''}</li>)}</ul>
    </div>
  );
}
