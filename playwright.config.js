import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  // Tests run against a separate build with test hooks on (dist-test), so the
  // production dist never contains them.
  webServer: {
    command: `VITE_FOX_TEST_HOOKS=1 npx vite build --outDir dist-test && npx vite preview --outDir dist-test --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // Safari's engine, only with PW_WEBKIT=1 (the gate browser pass): WebGL in headless WebKit is
    // software rendered, so it is not part of the everyday two-browser suite.
    ...(process.env.PW_WEBKIT === '1' ? [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }] : []),
  ],
});
