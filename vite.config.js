import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import adapter from '@sveltejs/adapter-static'

export default defineConfig({
  css: {
    devSourcemap: true
  },
  server: {
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..']
    }
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    reportCompressedSize: false
  },
  plugins: [
    sveltekit({
      compilerOptions: {
        runes: true
      },
      paths: {
        relative: false
      },
      adapter: adapter({
        pages: 'build',
        assets: 'build',
        fallback: '404.html',
        strict: true,
        precompress: false
      }),
      // Inline only small CSS files (< 2 KB)
      inlineStyleThreshold: 2048
    })
  ]
})
