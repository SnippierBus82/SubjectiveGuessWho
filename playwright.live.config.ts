import { defineConfig, devices } from '@playwright/test'

const enabled = Boolean(process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_PUBLISHABLE_KEY)
export default defineConfig({
  testDir: './tests/live',
  workers: 1,
  timeout: 90000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  projects: [{ name: 'live-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: enabled
    ? {
        command: 'npm run dev -- --host 127.0.0.1 --port 5174',
        url: 'http://127.0.0.1:5174',
        reuseExistingServer: false,
        env: {
          VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL!,
          VITE_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_PUBLISHABLE_KEY!,
          VITE_TURNSTILE_SITE_KEY: '',
        },
      }
    : undefined,
})
