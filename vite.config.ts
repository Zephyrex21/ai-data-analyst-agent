/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // jsdom (not node) — csv.test.ts exercises real File/FileReader parsing
    // via papaparse, which needs a proper browser-like environment to detect
    // it's not running inside a Worker.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
