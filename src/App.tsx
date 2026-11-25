import { Game } from './ui/Game';
import DebugApp from './DebugApp';
import { ProtoApp } from './ui/proto/ProtoApp';
import { isProto } from './ui/proto/config';

const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

export default function App() {
  if (debug) return <DebugApp />;
  return isProto ? <ProtoApp /> : <Game />;
}
