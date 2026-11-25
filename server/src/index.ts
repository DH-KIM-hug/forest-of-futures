import { loadConfig } from './config.ts';
import { createRelay } from './relay.ts';

const cfg = loadConfig();
const relay = createRelay({ cfg });
const port = await relay.start();
console.log(`[relay] listening on :${port}  ws /v1/stream  rest /v1/time /v1/ticks /v1/bars /healthz`);
const bye = async () => {
  await relay.stop();
  process.exit(0);
};
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
