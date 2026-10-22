import type { Handle } from '@sveltejs/kit/hooks'

// Security headers on every page and API response. The Content-Security-Policy is set in
// vite.config.ts instead, where SvelteKit can add its nonce.
const HEADERS = {
  // Browsers mustn't guess a file's type, so nothing can be passed off as a script.
  'X-Content-Type-Options': 'nosniff',
  // Following a link out of the app tells the next site nothing about where it came from.
  'Referrer-Policy': 'no-referrer',
  // The app uses no camera, microphone, location, motion sensors, payments or USB, so the page
  // can't ask for any of them, and it opts out of ad-interest tracking.
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()',
  // A site that opens this one in a new window can't reach into it.
  'Cross-Origin-Opener-Policy': 'same-origin',
  // After one visit over HTTPS, the browser refuses plain HTTP here for a year. Browsers ignore
  // this on plain-HTTP localhost.
  'Strict-Transport-Security': 'max-age=31536000',
}

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event)
  for (const [name, value] of Object.entries(HEADERS)) response.headers.set(name, value)
  return response
}
