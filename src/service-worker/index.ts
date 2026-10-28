import { dev, version } from '$app/env'
import { assets, immutable } from '$app/manifest'
import { self } from '$app/service-worker'

// The app shell and every file of the build are saved on install, so the app opens with no
// network. Nothing else is fetched: the page never talks to a server for anyone's data.
const SHELL = '/'
const FILES = [SHELL, ...[...immutable, ...assets].map((file) => `/${file.path}`)]
const CACHE = `app-${version}`

async function saved(key: string): Promise<Response> {
  const cache = await caches.open(CACHE)
  return (await cache.match(key))!
}

// `npm run dev` always serves the latest code, so only a build saves anything.
if (!dev) {
  // A new version takes over as soon as its files are saved, and the page reloads into it (see
  // src/lib/updates.ts), so an installed app updates without being closed first.
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches
        .open(CACHE)
        .then((cache) => cache.addAll(FILES))
        .then(() => self.skipWaiting()),
    )
  })

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
        .then(() => self.clients.claim()),
    )
  })

  self.addEventListener('fetch', (event) => {
    const { request } = event
    const { origin, pathname } = new URL(request.url)
    if (request.method !== 'GET' || origin !== self.location.origin) return
    if (request.mode === 'navigate' && pathname === SHELL) event.respondWith(saved(SHELL))
    else if (FILES.includes(pathname)) event.respondWith(saved(pathname))
  })
}
