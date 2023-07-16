import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  css: {
    devSourcemap: true
  },
  plugins: [sveltekit()]
})
