import { sveltePreprocess } from 'svelte-preprocess'
import adapter from '@sveltejs/adapter-static'

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: null,
      precompress: false,
      strict: true
    })
  },
  preprocess: [
    sveltePreprocess({
      postcss: true
    })
  ]
}
