// Data for the private /stats dashboard. Requires the login cookie.
// ?range=7|30|90|all  — up to 30 days comes live from Vercel; longer ranges come from
// the nightly snapshots. Clarity always comes from the snapshots.
const L = require('./_lib');

const sumBy = (lists) => {
  const m = new Map();
  for (const list of lists) for (const r of list || []) {
    const o = m.get(r.key) || { key: r.key, views: 0, visitors: 0 };
    o.views += r.views || 0; o.visitors += r.visitors || 0; m.set(r.key, o);
  }
  return [...m.values()].sort((a, b) => b.visitors - a.visitors || b.views - a.views);
};

// Merge Clarity rows across days: counts add up, averages are weighted by sessions.
function mergeClarity(lists) {
  const m = new Map();
  const counts = ['sessions', 'bots', 'users', 'rage', 'dead', 'quickback', 'excessiveScroll', 'scriptErrors', 'errorClicks'];
  for (const list of lists) for (const r of list || []) {
    const o = m.get(r.key) || { key: r.key, _w: 0, _scroll: 0, _sw: 0, _active: 0, _aw: 0, _total: 0, _tw: 0 };
    for (const c of counts) if (r[c] != null) o[c] = (o[c] || 0) + r[c];
    const w = r.sessions || 1;
    if (r.scroll != null) { o._scroll += r.scroll * w; o._sw += w; }
    if (r.activeTime != null) { o._active += r.activeTime * w; o._aw += w; }
    if (r.totalTime != null) { o._total += r.totalTime * w; o._tw += w; }
    m.set(r.key, o);
  }
  return [...m.values()].map((o) => {
    const out = { key: o.key };
    for (const c of counts) if (o[c] != null) out[c] = o[c];
    if (o._sw) out.scroll = o._scroll / o._sw;
    if (o._aw) out.activeTime = o._active / o._aw;
    if (o._tw) out.totalTime = o._total / o._tw;
    return out;
  }).sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
}

module.exports = async (req, res) => {
  if (!L.isAuthed(req)) return L.send(res, 401, { error: 'login' });
  const url = new URL(req.url, 'http://x');
  const rangeArg = url.searchParams.get('range') || '30';

  const setup = {
    password: !!L.env('DASH_PASSWORD'),
    vercel: !!(L.env('VERCEL_API_TOKEN') && L.env('VERCEL_PROJECT_ID')),
    clarity: !!L.env('CLARITY_TOKEN'),
    storage: !!((L.env('KV_REST_API_URL') || L.env('UPSTASH_REDIS_REST_URL')) && (L.env('KV_REST_API_TOKEN') || L.env('UPSTASH_REDIS_REST_TOKEN'))),
    cron: !!L.env('CRON_SECRET'),
  };
  const out = { setup, generatedAt: new Date().toISOString() };

  // Which days do we have stored?
  let vDays = [], cDays = [];
  if (setup.storage) {
    try {
      vDays = ((await L.redis(['SMEMBERS', 'days:v'])) || []).sort();
      cDays = ((await L.redis(['SMEMBERS', 'days:c'])) || []).sort();
      out.lastRun = await L.getJSON('meta:lastRun');
    } catch (e) { out.storageError = e.message; }
  }

  const to = L.today();
  let from;
  if (rangeArg === 'all') {
    const first = [vDays[0], cDays[0]].filter(Boolean).sort()[0];
    from = first && first < L.addDays(to, -29) ? first : L.addDays(to, -29);
  } else from = L.addDays(to, -(Math.max(1, Math.min(365, Number(rangeArg) || 30)) - 1));
  const days = L.dayRange(from, to);
  const live = days.length <= 30;
  out.range = { key: rangeArg, from, to, days: days.length, live };

  // ---------- Vercel ----------
  try {
    if (live) {
      if (!setup.vercel) throw new Error('not-configured');
      const b = await L.vercelBreakdowns(from, to);
      const byDay = new Map(b.days.map((d) => [d.day, d]));
      const devVisitors = b.devices.reduce((s, r) => s + r.visitors, 0);
      out.vercel = {
        views: b.days.reduce((s, d) => s + d.views, 0),
        visitors: devVisitors || b.days.reduce((s, d) => s + d.visitors, 0),
        visitorsNote: 'unique visitors in the range',
        trend: days.map((d) => ({ day: d, views: (byDay.get(d) || {}).views || 0, visitors: (byDay.get(d) || {}).visitors || 0 })),
        pages: sumBy([b.pages]), referrers: sumBy([b.referrers]), countries: sumBy([b.countries]), devices: sumBy([b.devices]),
      };
    } else {
      if (!setup.storage) throw new Error('not-configured');
      const snaps = await L.mgetJSON(days.map((d) => `v:${d}`));
      const tots = await L.mgetJSON(days.map((d) => `t:${d}`));
      const trend = days.map((d, i) => { const s = snaps[i] || tots[i]; return { day: d, views: s ? s.views : 0, visitors: s ? s.visitors : 0 }; });
      const got = snaps.filter(Boolean);
      out.vercel = {
        views: trend.reduce((s, d) => s + d.views, 0),
        visitors: trend.reduce((s, d) => s + d.visitors, 0),
        visitorsNote: 'daily visitors added up, so a person who came on two days counts twice',
        trend,
        pages: sumBy(got.map((s) => s.pages)), referrers: sumBy(got.map((s) => s.referrers)),
        countries: sumBy(got.map((s) => s.countries)), devices: sumBy(got.map((s) => s.devices)),
      };
    }
  } catch (e) { out.vercel = { error: e.message }; }

  // ---------- Clarity ----------
  try {
    if (!setup.storage) throw new Error('not-configured');
    const inRange = cDays.filter((d) => d >= from && d <= to);
    const snaps = (await L.mgetJSON(inRange.map((d) => `c:${d}`))).filter(Boolean);
    const devices = mergeClarity(snaps.map((s) => s.devices));
    const pages = mergeClarity(snaps.map((s) => s.pages));
    const total = mergeClarity([devices.map((d) => ({ ...d, key: 'all' }))])[0] || {};
    const sig = (k) => pages.reduce((s, p) => s + (p[k] || 0), 0);
    out.clarity = {
      days: inRange.length, firstDay: cDays[0] || null,
      sessions: total.sessions || 0, users: total.users || 0, bots: total.bots || 0,
      scroll: total.scroll ?? null, activeTime: total.activeTime ?? null, totalTime: total.totalTime ?? null,
      pages, devices, sources: mergeClarity(snaps.map((s) => s.sources)), countries: mergeClarity(snaps.map((s) => s.countries)),
      signals: { rage: sig('rage'), dead: sig('dead'), quickback: sig('quickback'), excessiveScroll: sig('excessiveScroll'), scriptErrors: sig('scriptErrors'), errorClicks: sig('errorClicks') },
    };
    // Page-level averages are more reliable than device-level ones for scroll and time.
    if (out.clarity.scroll == null && pages.length) {
      const m = mergeClarity([pages.map((p) => ({ ...p, key: 'all' }))])[0];
      out.clarity.scroll = m.scroll ?? null; out.clarity.activeTime = m.activeTime ?? null; out.clarity.totalTime = m.totalTime ?? null;
    }
  } catch (e) { out.clarity = { error: e.message }; }

  if (url.searchParams.get('raw') && setup.storage) {
    const last = cDays[cDays.length - 1];
    if (last) out.clarityRaw = await L.getJSON(`craw:${last}`);
  }
  L.send(res, 200, out);
};
