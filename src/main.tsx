// 표시용 글꼴 Jua 는 여기서 한 번만 부른다(@fontsource 번들, woff2). 글자 체계: docs/gdd/LITE_TYPE.md
import '@fontsource/jua/korean-400.css';
import '@fontsource/jua/latin-400.css';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startLoop, useGame } from './store/gameStore';
import { applyDev } from './ui/dev';
import { applyFastOverride, isProto } from './ui/proto/config';
import { bootProto } from './ui/proto/dev';

if (isProto) {
  // 시제품: 저장을 읽지 않고(새 게임) 정산 간격 덮어쓰기(&fast=1)를 먼저 한 뒤 시작한다.
  applyFastOverride();
  bootProto();
  void startLoop();
  createRoot(document.getElementById('root')!).render(<App />);
} else

// 저장(`fof.save.v2`)을 읽은 뒤에 시계를 돌린다.
void useGame.getState().hydrate().finally(() => {
  applyDev();
  void startLoop();
  createRoot(document.getElementById('root')!).render(<App />);
});
