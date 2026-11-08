import { defineConfig } from '@playwright/test';
const baseURL = process.env.MOTES_BROWSER_BASE_URL || 'http://127.0.0.1:4174';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: 'outputs/browser',
  use: { baseURL, viewport: { width: 1280, height: 900 }, screenshot: 'only-on-failure', launchOptions: { executablePath: process.env.MOTES_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
  webServer: process.env.MOTES_BROWSER_BASE_URL ? undefined : { command: 'npm run start -- --port 4174', url: baseURL + '/api/session', reuseExistingServer: false, timeout: 120_000 },
});
