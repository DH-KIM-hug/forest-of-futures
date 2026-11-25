import { createRoot } from 'react-dom/client';
import App from './App';
import { startLoop } from './store/gameStore';
import './styles.css';

startLoop();
createRoot(document.getElementById('root')!).render(<App />);
