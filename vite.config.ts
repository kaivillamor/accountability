import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      // The page may load and run only what comes from this site, and talk only to this site,
      // so a script that got in some other way still couldn't send anyone's data elsewhere.
      // SvelteKit adds a nonce for its own inline script, and loosens styles itself in dev for
      // Vite's injected <style> tags.
      csp: {
        mode: 'auto',
        directives: {
          'default-src': ['self'],
          'script-src': ['self'],
          'style-src': ['self'],
          // Inline style attributes, which SvelteKit's screen-reader announcer uses. They can't
          // run code or load anything from elsewhere; <style> elements stay limited to this site.
          'style-src-attr': ['unsafe-inline'],
          'object-src': ['none'],
          'base-uri': ['none'],
          // Forms only ever run in the page; none submits anywhere.
          'form-action': ['none'],
          // No other site can show the app inside a frame and trick clicks out of it.
          'frame-ancestors': ['none'],
        },
      },
    }),
  ],
})
