import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // served from datapages.github.io/datapage-builder/
  base: '/datapage-builder/',
  plugins: [svelte()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        // GitHub OAuth redirects here, and it hands the code back to the opener
        callback: resolve(import.meta.dirname, 'callback/index.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
