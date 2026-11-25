import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { host: true },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}', 'server/tests/**/*.test.ts'] },
});
