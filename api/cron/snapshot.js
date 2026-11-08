// Nightly snapshot: saves yesterday's Vercel and Clarity numbers so history is kept
// beyond Vercel's 1-month window and Clarity's 3-day API window.
// Called by Vercel Cron (see vercel.json) with "Authorization: Bearer <CRON_SECRET>",
// or manually from the dashboard while logged in.
const L = require('../_lib');

module.exports = async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const fromCron = L.env('CRON_SECRET') && bearer && L.safeEqual(bearer, L.env('CRON_SECRET'));
  if (!fromCron && !L.isAuthed(req)) return L.send(res, 401, { error: 'unauthorized' });

  const y = L.addDays(L.today(), -1);
  const log = { day: y, vercel: null, clarity: null, backfill: null };

  // Vercel: yesterday's full breakdown
  try {
    if (!(await L.redis(['EXISTS', `v:${y}`]))) {
      const b = await L.vercelBreakdowns(y, y);
      const t = b.days.find((d) => d.day === y) || { views: 0, visitors: 0 };
      await L.setJSON(`v:${y}`, { day: y, views: t.views, visitors: t.visitors, pages: b.pages, referrers: b.referrers, countries: b.countries, devices: b.devices });
      await L.redis(['SADD', 'days:v', y]);
      log.vercel = 'saved';
    } else log.vercel = 'already saved';
  } catch (e) { log.vercel = 'error: ' + e.message; }

  // Vercel: one-time backfill of daily totals for the last month (trend line only)
  try {
    if (!(await L.redis(['GET', 'meta:backfilled']))) {
      const b = await L.vercelBreakdowns(L.addDays(y, -29), y, 5);
      for (const d of b.days) if (d.day) await L.setJSON(`t:${d.day}`, { day: d.day, views: d.views, visitors: d.visitors });
      await L.redis(['SET', 'meta:backfilled', L.today()]);
      log.backfill = `${b.days.length} days`;
    }
  } catch (e) { log.backfill = 'error: ' + e.message; }

  // Manual test run (logged in, ?test=1): fetch Clarity once and show what came back,
  // without saving it as a day, so the nightly run still gets a clean window.
  const test = !fromCron && /[?&]test=1/.test(req.url || '');
  if (test) {
    try {
      const s = await L.claritySnapshot(1);
      await L.setJSON('craw:test', s.raw);
      log.clarity = 'test only, not saved as a day';
      log.clarityParsed = { pages: L.parseClarity(s.raw.URL, 'URL'), devices: L.parseClarity(s.raw.Device, 'Device') };
      log.clarityRawSample = (s.raw.URL || []).map((m) => ({ metricName: m.metricName, first: (m.information || [])[0] || null }));
    } catch (e) { log.clarity = 'error: ' + e.message; }
    return L.send(res, 200, log);
  }

  // Clarity: last 24 hours (≈ yesterday), 4 API calls of the 10 allowed per day
  try {
    if (!(await L.redis(['EXISTS', `c:${y}`]))) {
      const s = await L.claritySnapshot(1);
      await L.setJSON(`c:${y}`, {
        day: y, takenAt: new Date().toISOString(),
        pages: L.parseClarity(s.raw.URL, 'URL'),
        devices: L.parseClarity(s.raw.Device, 'Device'),
        sources: L.parseClarity(s.raw.Source, 'Source'),
        countries: L.parseClarity(s.raw.Country, 'Country/Region'),
      });
      await L.setJSON(`craw:${y}`, s.raw);
      await L.redis(['SADD', 'days:c', y]);
      log.clarity = 'saved';
    } else log.clarity = 'already saved';
  } catch (e) { log.clarity = 'error: ' + e.message; }

  try { await L.setJSON('meta:lastRun', { at: new Date().toISOString(), ...log }); } catch (e) { /* storage missing */ }
  L.send(res, 200, log);
};
