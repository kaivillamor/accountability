// An installed app can stay open for days, so it looks for a new version whenever it comes back
// to the front, and reloads once that version has taken over (see src/service-worker). Nothing is
// lost: everything is already saved, and hidden trackers lock as soon as the app is left.
export function keepUpToDate() {
  const { serviceWorker } = navigator
  // The first worker taking over a page loaded without one isn't a new version.
  let controlled = serviceWorker.controller !== null
  serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) location.reload()
    controlled = true
  })
  serviceWorker.ready.then((registration) => {
    document.addEventListener('visibilitychange', () => {
      // Offline, the check fails; the next return to the app checks again.
      if (!document.hidden) registration.update().catch(() => {})
    })
  })
}
