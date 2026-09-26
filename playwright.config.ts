import { defineConfig } from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4311',
    viewport: { width: 1440, height: 1050 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://127.0.0.1:4311',
    reuseExistingServer: false,
    env: {
      PORT: '4311',
      STUDIO_DATA_DIR: path.resolve(`.data/browser-fixture-${Date.now()}`),
      CODEX_BIN: path.resolve('tests/fake-codex.mjs'),
      IMAGEGEN_SKILL: path.resolve('tests/fixtures/imagegen/SKILL.md'),
      CODEX_HOME: path.resolve('.data/test-codex-home'),
    },
  },
});
