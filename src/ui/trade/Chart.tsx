import { useEffect, useRef } from 'react';
import type { MarketState, Position } from '../../engine/types';
import { liqPrice, slPrice, tpPrice } from '../../engine/selectors';
import { T } from '../../engine/data';
import { formatPrice } from '../../engine/market';

interface Props {
  market: MarketState;
  pos: Position | undefined;
  up: string;
  down: string;
}

export function Chart({ market, pos, up, down }: Props) {
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
      const data = market.hist.slice(-T.chartWindowTicks);
      const last = data[data.length - 1];
      let lo = Math.min(...data);
      let hi = Math.max(...data);
      const minSpan = last * 0.003;
      if (hi - lo < minSpan) {
        const mid = (hi + lo) / 2;
        lo = mid - minSpan / 2;
        hi = mid + minSpan / 2;
      }
      const pad = (hi - lo) * 0.12;
      lo -= pad;
      hi += pad;
      const padX = 6;
      // 기록이 짧을 때(게임 시작 직후)는 있는 만큼을 가로 전체에 펼친다. 오른쪽 끝에 몰리면 세로선처럼 보인다.
      const n = Math.max(data.length, 2);
      const X = (i: number) => padX + (i / (n - 1)) * (w - padX * 2);
      const xOff = 0;
      const Y = (p: number) => h - ((p - lo) / (hi - lo)) * h;
      // 격자
      ctx.strokeStyle = 'rgba(120,150,100,0.20)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(0, (h / 4) * k);
        ctx.lineTo(w, (h / 4) * k);
        ctx.stroke();
      }
      // 가격선
      const rising = last >= data[0];
      const lc = rising ? up : down;
      // 선 아래 옅은 채움
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, lc + '33');
      grad.addColorStop(1, lc + '00');
      ctx.beginPath();
      data.forEach((p, i) => {
        const x = X(i) + xOff;
        const y = Y(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(X(data.length - 1), h);
      ctx.lineTo(X(0), h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = lc;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      data.forEach((p, i) => {
        const x = X(i) + xOff;
        const y = Y(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // 현재가 점
      ctx.fillStyle = rising ? up : down;
      ctx.beginPath();
      ctx.arc(w - padX, Y(last), 5, 0, Math.PI * 2);
      ctx.fill();

      // 가로선
      const line = (price: number, color: string, dash: number[], width: number, label: string) => {
        let y = Y(price);
        let text = label + ' ' + formatPrice(market.id, price);
        if (y < 15) {
          y = 15;
          text = '▲ ' + text;
        } else if (y > h - 10) {
          y = h - 10;
          text = '▼ ' + text;
        }
        ctx.setLineDash(dash);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '700 11px -apple-system, "Apple SD Gothic Neo", sans-serif';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(255,253,246,0.9)';
        ctx.fillRect(4, y - 13, tw + 6, 13);
        ctx.fillStyle = color;
        ctx.fillText(text, 7, y - 3);
      };
      if (pos) {
        line(pos.entry, '#4f7fe0', [], 1.6, '진입');
        line(liqPrice(pos), '#e0452f', [6, 4], 1.8, '청산가');
        const sl = slPrice(pos);
        const tp = tpPrice(pos);
        if (sl !== null) line(sl, '#d98a2b', [3, 3], 1.2, '손절');
        if (tp !== null) line(tp, '#3a9a5a', [3, 3], 1.2, '익절');
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  });

  return <canvas ref={ref} role="img" aria-label={`${market.id} 최근 ${T.chartWindowTicks}틱 시세 차트`} />;
}
