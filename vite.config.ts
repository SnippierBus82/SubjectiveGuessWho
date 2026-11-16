import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { port: 5173, strictPort: true, allowedHosts: ['guesswho.local'] },
  build: { target: 'es2022' },
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
