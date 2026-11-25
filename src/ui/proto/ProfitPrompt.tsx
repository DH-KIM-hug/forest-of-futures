import { useEffect, useState } from 'react';
import { useProto } from './protoStore';
import { renderCard, saveCard } from './shareCard';
import { comma } from '../../engine/util';
import { play } from './audio';

type Stage = 'ask' | 'busy' | 'done';

/** 이익으로 닫았을 때 뜨는 스티커형 물음. 저장하면 카드 미리보기를 보여 준다. */
export function ProfitPrompt() {
  const p = useProto((s) => s.profit);
  const [stage, setStage] = useState<Stage>('ask');
  const [thumb, setThumb] = useState<string | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => { setStage('ask'); setThumb(null); setNote(''); }, [p]);
  useEffect(() => {
    if (!p || stage !== 'ask') return;
    const t = window.setTimeout(() => useProto.getState().patch({ profit: null }), 15000);
    return () => window.clearTimeout(t);
  }, [p, stage]);
  if (!p) return null;
  const close = () => useProto.getState().patch({ profit: null });
  const save = async () => {
    setStage('busy');
    try {
      const cv = await renderCard(p);
      setThumb(cv.toDataURL('image/png'));
      (window as unknown as { __lastCard?: string }).__lastCard = cv.toDataURL('image/png');
      const r = await saveCard(cv, p.date);
      if (r !== 'cancelled') play('shutter');
      setNote(r === 'shared' ? '공유했어요' : r === 'downloaded' ? '이미지로 저장했어요' : '저장하지 않았어요');
    } catch { setNote('그림을 만들지 못했어요'); }
    setStage('done');
  };
  return (
    <div className="pr-profit" role="dialog" aria-label="수익 인증서">
      {stage === 'done' && thumb ? (
        <>
          <img className="th" src={thumb} alt="수익 인증서 미리보기" />
          <div className="tx"><b>{note}</b><small>카드 아래 QR 은 앱 주소예요</small></div>
          <div className="bt"><button className="no" onClick={close} aria-label="닫기">닫기</button></div>
        </>
      ) : (
        <>
          <div className="tx"><b>수익 인증서 저장할까요?</b><small>{p.coin} {p.dir === 1 ? '롱' : '숏'} {p.lev}배 · +{comma(Math.round(p.pnl))} 도토리</small></div>
          <div className="bt">
            <button className="yes" onClick={save} disabled={stage === 'busy'}>{stage === 'busy' ? '그리는 중…' : '저장'}</button>
            <button className="no" onClick={close} disabled={stage === 'busy'}>괜찮아요</button>
          </div>
        </>
      )}
    </div>
  );
}
