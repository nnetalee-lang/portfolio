// First-party visit signals for the private /stats dashboard: did a real person look?
// Loaded only on the live domain and never for the site owner (see the snippet in each page).
// Sends what the visitor did on the page (time, scroll, clicks, mouse/touch), never personal data.
// A visit id lives in sessionStorage, so it is forgotten when the tab is closed.
(function () {
  try {
    var URL_ = '/api/hit';
    var rid = function () { try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {} return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12); };
    var sid = null, fresh = false;
    try { sid = sessionStorage.getItem('nla-sid'); } catch (e) {}
    if (!sid) { sid = rid(); fresh = true; try { sessionStorage.setItem('nla-sid', sid); } catch (e) {} }
    var pv = rid();
    var path = location.pathname;

    var visibleSince = document.visibilityState === 'visible' ? Date.now() : null, active = 0;
    var depth = 0, px = 0, clicks = 0, moves = 0, touched = 0, keys = 0;

    var activeNow = function () { return active + (visibleSince ? Date.now() - visibleSince : 0); };
    var measure = function () {
      var de = document.documentElement, y = window.scrollY || de.scrollTop || 0, h = Math.max(de.scrollHeight, document.body ? document.body.scrollHeight : 0);
      if (y > px) px = y;
      if (h > 0) { var d = Math.min(100, Math.round((y + window.innerHeight) / h * 100)); if (d > depth) depth = d; }
    };

    var post = function (body) {
      var s = JSON.stringify(body), ok = false;
      try { ok = navigator.sendBeacon && navigator.sendBeacon(URL_, new Blob([s], { type: 'application/json' })); } catch (e) {}
      if (!ok) { try { fetch(URL_, { method: 'POST', body: s, headers: { 'Content-Type': 'application/json' }, keepalive: true }); } catch (e) {} }
    };
    var update = function (ended) {
      measure();
      post({ t: ended ? 'end' : 'ping', sid: sid, pv: pv, p: path, act: Math.round(activeNow() / 1000), sc: depth, px: Math.round(px), cl: clicks, mv: moves > 2 ? 1 : 0, tc: touched, ky: keys });
    };

    var ref = '';
    try { if (document.referrer) { var r = new URL(document.referrer); if (r.hostname !== location.hostname) ref = r.hostname; } } catch (e) {}
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    measure();
    post({
      t: 'start', sid: sid, pv: pv, p: path, fresh: fresh ? 1 : 0, ref: ref,
      sw: screen.width, sh: screen.height, vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio || 1,
      wd: navigator.webdriver ? 1 : 0, lang: navigator.language || '', tz: tz, tp: navigator.maxTouchPoints || 0, sc: depth
    });

    addEventListener('scroll', measure, { passive: true });
    addEventListener('pointerdown', function () { clicks++; }, { passive: true });
    addEventListener('mousemove', function () { moves++; }, { passive: true });
    addEventListener('touchstart', function () { touched = 1; }, { passive: true });
    addEventListener('keydown', function () { keys = 1; }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { if (visibleSince) { active += Date.now() - visibleSince; visibleSince = null; } update(true); }
      else if (!visibleSince) visibleSince = Date.now();
    });
    addEventListener('pagehide', function () { update(true); });
    // Two check-ins in case the page is closed without a hidden/pagehide event (common on phones).
    setTimeout(function () { if (document.visibilityState === 'visible') update(false); }, 15000);
    setTimeout(function () { if (document.visibilityState === 'visible') update(false); }, 60000);
  } catch (e) { /* never break the page */ }
})();
