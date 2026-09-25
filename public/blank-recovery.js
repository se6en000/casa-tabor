// Blank-screen recovery (2026-09-25). If the app hasn't drawn anything 20 s after
// load — e.g. a stale cached script, which left the wall kiosk blank — clear the
// service worker and its caches and reload. At most once per 5 minutes, so it
// can't loop. A classic script so it runs even when the app's module fails.
(function () {
  var KEY = 'casa-blank-recovery-at'
  var WAIT_MS = 20000
  var AGAIN_AFTER_MS = 5 * 60 * 1000
  setTimeout(function () {
    var root = document.getElementById('root')
    if (!root || root.childElementCount > 0) return
    try {
      var last = Number(sessionStorage.getItem(KEY) || 0)
      if (Date.now() - last < AGAIN_AFTER_MS) return
      sessionStorage.setItem(KEY, String(Date.now()))
    } catch (e) {
      return
    }
    var jobs = []
    if (navigator.serviceWorker) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister() }))
      }))
    }
    if (window.caches) {
      jobs.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k) }))
      }))
    }
    var reload = function () { location.reload() }
    Promise.all(jobs).then(reload, reload)
  }, WAIT_MS)
})()
