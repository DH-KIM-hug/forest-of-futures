import { Game } from './ui/Game';
import DebugApp from './DebugApp';

const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

export default function App() {
  return debug ? <DebugApp /> : <Game />;
}
