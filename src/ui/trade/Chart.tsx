import { useEffect, useRef } from 'react';
import { chartModel, fmtPrice } from '../vm/trade';

export interface ChartLine { price: number; color: string; dash: number[]; width: number; label: string }
interface Props { market: string; prices: number[]; lines: ChartLine[]; up: string; down: string; empty?: boolean }

/** 깨끗한 사각 영역. 안에는 가격 선·가로선·가장자리 꼬리표뿐이고(캔버스 하나), 얼굴·잎·말풍선·문구는 이 상자 밖에 둔다(AC-v2-144). */
export function ChartBox(props: Props) {
  return (
    <div className="chartbox" data-chart={props.market}>
      <ChartCanvas {...props} />
    </div>
  );
}

function ChartCanvas({ market, prices, lines, up, down, empty }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (w === 0 || h === 0) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (empty) return;
      const data = prices.slice(-120);
      const m = chartModel(data);
      const Y = (p: number) => h - ((p - m.lo) / (m.hi - m.lo)) * h;
      ctx.strokeStyle = 'rgba(120,150,100,0.22)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(0, (h / 4) * k);
        ctx.lineTo(w, (h / 4) * k);
        ctx.stroke();
      }
      ctx.font = '600 10.5px -apple-system, "Apple SD Gothic Neo", sans-serif';
      ctx.fillStyle = 'rgba(90,70,50,0.7)';
      ctx.textAlign = 'left';
      ctx.fillText(fmtPrice(market, m.hi), 4, 12);
      ctx.fillText(fmtPrice(market, m.lo), 4, h - 4);
      if (data.length >= 2) {
        const n = data.length;
        const X = (i: number) => 6 + (i / (n - 1)) * (w - 12);
        const rising = data[n - 1] >= data[0];
        const lc = rising ? up : down;
        ctx.beginPath();
        data.forEach((p, i) => (i === 0 ? ctx.moveTo(X(i), Y(p)) : ctx.lineTo(X(i), Y(p))));
        ctx.lineTo(X(n - 1), h);
        ctx.lineTo(X(0), h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, lc + '30');
        grad.addColorStop(1, lc + '00');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = lc;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        data.forEach((p, i) => (i === 0 ? ctx.moveTo(X(i), Y(p)) : ctx.lineTo(X(i), Y(p))));
        ctx.stroke();
        ctx.fillStyle = lc;
        ctx.beginPath();
        ctx.arc(X(n - 1), Y(data[n - 1]), 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // 가로선: 화면 밖이면 가장자리에 꼬리표만
      const taken: number[] = [];
      for (const ln of lines) {
        let y = Y(ln.price);
        let text = `${ln.label} ${fmtPrice(market, ln.price)}`;
        let edge = false;
        if (y < 13) { y = 13; text = '▲ ' + text; edge = true; }
        else if (y > h - 13) { y = h - 13; text = '▼ ' + text; edge = true; }
        while (taken.some((t) => Math.abs(t - y) < 14)) y += edge && y > h / 2 ? -14 : 14;
        taken.push(y);
        if (!edge) {
          ctx.setLineDash(ln.dash);
          ctx.strokeStyle = ln.color;
          ctx.lineWidth = ln.width;
          ctx.beginPath();
          ctx.moveTo(0, Y(ln.price));
          ctx.lineTo(w, Y(ln.price));
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.font = '700 10.5px -apple-system, "Apple SD Gothic Neo", sans-serif';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(255,253,246,0.94)';
        ctx.fillRect(w - tw - 10, y - 8, tw + 8, 14);
        ctx.fillStyle = ln.color;
        ctx.textAlign = 'right';
        ctx.fillText(text, w - 6, y + 3);
        ctx.textAlign = 'left';
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  });
  return <canvas ref={ref} role="img" aria-label={`${market} 최근 120초 시세 차트`} />;
}
