import { createRoot } from 'react-dom/client';
import App from './App';
import { startLoop, useGame } from './store/gameStore';

// 저장(`fof.save.v2`)을 읽은 뒤에 시계를 돌린다.
void useGame.getState().hydrate().finally(() => {
  startLoop();
  createRoot(document.getElementById('root')!).render(<App />);
});
