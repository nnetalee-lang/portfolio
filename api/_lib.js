// Shared helpers for the private /stats dashboard.
// Files starting with "_" are not exposed as routes by Vercel.
// Everything secret lives in Vercel environment variables, never in this public repo:
//   DASH_PASSWORD      password for the /stats page
//   VERCEL_API_TOKEN   Vercel access token (read access to Web Analytics)
//   VERCEL_PROJECT_ID  the portfolio project's ID
//   VERCEL_TEAM_ID     optional, the team ID or slug that owns the project
//   CLARITY_TOKEN      Microsoft Clarity Data Export API token
//   CRON_SECRET        any long random string; Vercel sends it with cron calls
//   KV_REST_API_URL / KV_REST_API_TOKEN   (or UPSTASH_REDIS_REST_URL / _TOKEN) from the Upstash integration

const crypto = require('crypto');

const env = (k) => (process.env[k] || '').trim();

// ---------- storage (Upstash Redis over REST, no dependencies) ----------
function redisCfg() {
  const url = env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL');
  const token = env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) throw new Error('storage-not-configured');
  return { url, token };
}
async function redis(cmd) {
  const { url, token } = redisCfg();
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error('redis: ' + j.error);
  return j.result;
}
const getJSON = async (k) => { const v = await redis(['GET', k]); return v ? JSON.parse(v) : null; };
const setJSON = (k, v) => redis(['SET', k, JSON.stringify(v)]);
async function mgetJSON(keys) {
  if (!keys.length) return [];
  const vals = await redis(['MGET', ...keys]);
  return vals.map((v) => (v ? JSON.parse(v) : null));
}

// ---------- dates (UTC) ----------
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const today = () => ymd(new Date());
function dayRange(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }

// ---------- paths ----------
function normPath(u) {
  if (!u) return '(unknown)';
  let p = String(u);
  try { p = new URL(p, 'https://www.neta-leeartzi.com').pathname; } catch (e) { /* keep as is */ }
  p = p.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/$/, '$1');
  return p || '/';
}

// ---------- Vercel Web Analytics ----------
async function vercelQuery(endpoint, params) {
  const token = env('VERCEL_API_TOKEN');
  const projectId = env('VERCEL_PROJECT_ID');
  if (!token || !projectId) throw new Error('vercel-not-configured');
  const q = new URLSearchParams({ projectId, ...params });
  const team = env('VERCEL_TEAM_ID');
  if (team) q.set(team.startsWith('team_') ? 'teamId' : 'slug', team);
  const r = await fetch(`https://api.vercel.com/v1/query/web-analytics/${endpoint}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await r.text();
  if (!r.ok) throw new Error(`vercel ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
const rows = (j) => (Array.isArray(j && j.data) ? j.data : []);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// One day or a range, all breakdowns. since/until are inclusive YYYY-MM-DD.
// The API reads a bare date as midnight, so the end of the range is sent as the next
// midnight (or "now" for today) to include the whole last day.
async function vercelBreakdowns(sinceDay, untilDay, limit = 50) {
  const since = sinceDay + 'T00:00:00.000Z';
  const until = untilDay >= today() ? new Date().toISOString() : addDays(untilDay, 1) + 'T00:00:00.000Z';
  // Only the live site counts, not preview deployments.
  const agg = (by) => vercelQuery('visits/aggregate', { since, until, by, limit: String(by === 'day' ? 100 : limit), filter: "environment eq 'production'" }).then(rows);
  const [days, pages, refs, countries, devices] = await Promise.all([
    agg('day'), agg('requestPath'), agg('referrerHostname'), agg('country'), agg('deviceType'),
  ]);
  const pick = (list, key, fix = (x) => x) => list.map((r) => ({ key: fix(r[key] == null ? '(none)' : r[key]), views: num(r.pageviews), visitors: num(r.visitors) }));
  return {
    days: days.map((r) => ({ day: String(r.timestamp || r.day || '').slice(0, 10), views: num(r.pageviews), visitors: num(r.visitors) })),
    pages: mergeByKey(pick(pages, 'requestPath', normPath)),
    referrers: pick(refs, 'referrerHostname', (x) => x || 'Direct'),
    countries: pick(countries, 'country'),
    devices: pick(devices, 'deviceType'),
  };
}
function mergeByKey(list) {
  const m = new Map();
  for (const r of list) { const o = m.get(r.key) || { key: r.key, views: 0, visitors: 0 }; o.views += r.views; o.visitors += r.visitors; m.set(r.key, o); }
  return [...m.values()];
}

// ---------- Microsoft Clarity Data Export API (max 10 calls per day) ----------
async function clarityFetch(numOfDays, dimension) {
  const token = env('CLARITY_TOKEN');
  if (!token) throw new Error('clarity-not-configured');
  const q = new URLSearchParams({ numOfDays: String(numOfDays) });
  if (dimension) q.set('dimension1', dimension);
  const r = await fetch(`https://www.clarity.ms/export-data/api/v1/project-live-insights?${q}`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const text = await r.text();
  if (!r.ok) throw new Error(`clarity ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
// Four calls cover everything the dashboard needs.
async function claritySnapshot(numOfDays) {
  const dims = { URL: 'URL', Device: 'Device', Source: 'Source', Country: 'Country/Region' };
  const out = { numOfDays, raw: {} };
  for (const [k, d] of Object.entries(dims)) out.raw[k] = await clarityFetch(numOfDays, d);
  return out;
}

// The API documents Traffic fields only; the others are parsed defensively and the raw
// response is always stored, so nothing is lost if a field name differs.
const firstNum = (o, names) => { for (const n of names) if (o[n] != null && Number.isFinite(Number(o[n]))) return Number(o[n]); return null; };
const fuzzyNum = (o, re) => { for (const [k, v] of Object.entries(o)) if (re.test(k) && Number.isFinite(Number(v))) return Number(v); return null; };
function dimValue(o, dim) {
  for (const k of Object.keys(o)) if (k.toLowerCase() === dim.toLowerCase().replace('/region', '') || k.toLowerCase() === dim.toLowerCase()) return o[k];
  for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && !Number.isFinite(Number(v))) return v;
  return '(all)';
}
// Metric names come back without spaces ("ScrollDepth"), so compare them squashed.
const squash = (x) => String(x || '').replace(/[^a-z]/gi, '').toLowerCase();
const SITE = /(^|\.)neta-leeartzi\.com$/i;
function parseClarity(resp, dim) {
  const by = new Map();
  const get = (key) => { if (!by.has(key)) by.set(key, { key }); return by.get(key); };
  for (const m of Array.isArray(resp) ? resp : []) {
    const name = squash(m.metricName);
    for (const info of m.information || []) {
      if (!info) continue;
      let key = dimValue(info, dim);
      if (dim === 'URL') {
        try { if (!SITE.test(new URL(key).hostname)) continue; } catch (e) { /* relative URL, keep */ }
        key = normPath(key);
      }
      const o = get(key);
      switch (name) {
        case 'traffic':
          o.sessions = (o.sessions || 0) + (firstNum(info, ['totalSessionCount']) || 0);
          o.bots = (o.bots || 0) + (firstNum(info, ['totalBotSessionCount']) || 0);
          o.users = (o.users || 0) + (firstNum(info, ['distinctUserCount', 'distantUserCount']) || 0);
          o.pagesPerSession = firstNum(info, ['pagesPerSessionPercentage', 'PagesPerSessionPercentage']);
          break;
        case 'scrolldepth':
          o.scroll = firstNum(info, ['averageScrollDepth', 'AverageScrollDepth', 'scrollDepth']) ?? fuzzyNum(info, /scroll/i);
          break;
        case 'engagementtime':
          o.activeTime = firstNum(info, ['activeTime', 'ActiveTime']) ?? fuzzyNum(info, /active/i);
          o.totalTime = firstNum(info, ['totalTime', 'TotalTime']) ?? fuzzyNum(info, /total.*time|time/i);
          break;
        case 'rageclickcount': o.rage = (o.rage || 0) + signal(info); break;
        case 'deadclickcount': o.dead = (o.dead || 0) + signal(info); break;
        case 'quickbackclick': o.quickback = (o.quickback || 0) + signal(info); break;
        case 'excessivescroll': o.excessiveScroll = (o.excessiveScroll || 0) + signal(info); break;
        case 'scripterrorcount': o.scriptErrors = (o.scriptErrors || 0) + signal(info); break;
        case 'errorclickcount': o.errorClicks = (o.errorClicks || 0) + signal(info); break;
        default: break;
      }
    }
  }
  return [...by.values()];
}
const signal = (info) => firstNum(info, ['subTotal', 'sessionsCount', 'count', 'Count']) ?? fuzzyNum(info, /count|total/i) ?? 0;

// ---------- own visit tracking (assets/visit.js → /api/hit) ----------
// One record per browser-tab session. No IP address is stored; location comes from the
// city/country headers Vercel adds. Records expire after 180 days.
// Preview deployments write to a separate namespace so tests never mix with real visits.
const VISIT_TTL = 180 * 864e5;
const visitNS = () => (env('VERCEL_ENV') === 'production' ? 'vis' : 'vistest');

const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|scanner|python|curl|wget|phantom|puppeteer|playwright|selenium|axios|node-fetch|go-http|java\/|okhttp|httpclient/i;
// Places where big cloud data centers sit. A visit from here with no activity is a machine.
const DC_CITY = /^(ashburn|sterling|leesburg|manassas|boardman|hillsboro|the dalles|council bluffs|quincy|prineville|moncks corner|lenoir|pryor|santa clara|north charleston|san antonio|des moines)$/i;

function deviceOf(ua) {
  ua = ua || '';
  const os = /iPad/.test(ua) ? 'iPad' : /iPhone|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  return { os, br, mobile: /iPhone|iPod|Android.*Mobile|Mobile Safari/.test(ua) };
}

// What the visitor did, added up over every page in the visit.
function visitTotals(v) {
  const pages = Object.values(v.pages || {}).sort((a, b) => a.at - b.at);
  return {
    pages,
    active: pages.reduce((s, p) => s + (p.act || 0), 0),
    depth: pages.reduce((m, p) => Math.max(m, p.sc || 0), 0),
    px: pages.reduce((m, p) => Math.max(m, p.px || 0), 0),
    clicks: pages.reduce((s, p) => s + (p.cl || 0), 0),
  };
}

// person · unclear · bot, with the reason in plain words. Rules are applied when the
// dashboard loads, so they can be changed later and every stored visit is re-judged.
function classify(v) {
  const t = visitTotals(v);
  const did = [];
  if (t.px >= 150) did.push('scrolled');
  if (t.clicks) did.push('clicked');
  if (v.mv) did.push('moved the mouse');
  if (v.tc) did.push('touched the screen');
  if (v.ky) did.push('typed');
  const interacted = did.length > 0;
  const dev = deviceOf(v.ua);
  if (v.wd) return { kind: 'bot', why: 'Automated browser' };
  if (BOT_UA.test(v.ua || '')) return { kind: 'bot', why: 'Bot browser' };
  if (interacted && t.active >= 3) return { kind: 'person', why: cap(did.join(', ')) + (t.pages.length > 1 ? `, ${t.pages.length} pages` : '') };
  if (t.pages.length > 1 && t.active >= 10) return { kind: 'person', why: `Opened ${t.pages.length} pages` };
  if (!interacted) {
    if (v.city && DC_CITY.test(v.city)) return { kind: 'bot', why: 'Data center location, did nothing' };
    if (dev.os === 'Linux') return { kind: 'bot', why: 'Server-type computer, did nothing' };
    if (!v.ended && t.active < 15) return { kind: 'bot', why: 'Loaded the page and vanished' };
    if (t.active < 5) return { kind: 'bot', why: 'Gone within seconds, did nothing' };
  }
  if (t.active >= 20) return { kind: 'person', why: `Stayed ${t.active}s` };
  return { kind: 'unclear', why: interacted ? 'Brief activity' : 'Short visit, no scrolling or clicks' };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const clampInt = (x, lo, hi) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0; };
const cleanStr = (x, max) => String(x == null ? '' : x).replace(/[\u0000-\u001f]/g, '').slice(0, max);
const ID = /^[A-Za-z0-9-]{8,64}$/;

// Apply one beacon to the stored visit. Returns the stored record, or null if the beacon is invalid.
async function recordHit(b, headers, now = Date.now()) {
  if (!b || !ID.test(b.sid || '') || !ID.test(b.pv || '') || !['start', 'ping', 'end'].includes(b.t)) return null;
  const p = cleanStr(b.p, 120);
  if (!p.startsWith('/')) return null;
  const NS = visitNS(), key = `${NS}:${b.sid}`;
  let v = await getJSON(key);
  if (!v) {
    let city = headers['x-vercel-ip-city'] || '';
    try { city = decodeURIComponent(city); } catch (e) { /* keep raw */ }
    v = {
      sid: b.sid, start: now, pages: {},
      country: cleanStr(headers['x-vercel-ip-country'], 4), region: cleanStr(headers['x-vercel-ip-country-region'], 8), city: cleanStr(city, 60),
      ua: cleanStr(headers['user-agent'], 300),
    };
    await redis(['ZADD', `${NS}:idx`, String(now), b.sid]);
    if (Math.random() < 0.02) await redis(['ZREMRANGEBYSCORE', `${NS}:idx`, '0', String(now - VISIT_TTL)]);
  }
  if (b.t === 'start') {
    v.ref = v.ref || cleanStr(b.ref, 80);
    Object.assign(v, {
      sw: clampInt(b.sw, 0, 10000), sh: clampInt(b.sh, 0, 10000), vw: clampInt(b.vw, 0, 10000), vh: clampInt(b.vh, 0, 10000),
      dpr: Math.min(8, Math.max(0, Number(b.dpr) || 0)), lang: cleanStr(b.lang, 20), tz: cleanStr(b.tz, 40), tp: clampInt(b.tp, 0, 20),
    });
    if (b.wd) v.wd = 1;
  }
  const pg = v.pages[b.pv] || (Object.keys(v.pages).length < 30 ? (v.pages[b.pv] = { p, at: now }) : null);
  if (pg) {
    // Values from the page are running totals, so the newest one wins (never going down).
    pg.act = Math.max(pg.act || 0, clampInt(b.act, 0, 6 * 3600));
    pg.sc = Math.max(pg.sc || 0, clampInt(b.sc, 0, 100));
    pg.px = Math.max(pg.px || 0, clampInt(b.px, 0, 200000));
    pg.cl = Math.max(pg.cl || 0, clampInt(b.cl, 0, 10000));
  }
  if (b.mv) v.mv = 1;
  if (b.tc) v.tc = 1;
  if (b.ky) v.ky = 1;
  if (b.t === 'end') v.ended = 1;
  v.last = now;
  await redis(['SET', key, JSON.stringify(v), 'PX', String(VISIT_TTL)]);
  return v;
}

// Visits that started in [fromMs, toMs], newest first, judged and trimmed for the dashboard.
async function loadVisits(fromMs, toMs, max = 3000) {
  const NS = visitNS();
  const ids = (await redis(['ZREVRANGEBYSCORE', `${NS}:idx`, String(toMs), String(fromMs), 'LIMIT', '0', String(max)])) || [];
  const first = await redis(['ZRANGE', `${NS}:idx`, '0', '0', 'WITHSCORES']);
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const recs = await mgetJSON(ids.slice(i, i + 200).map((id) => `${NS}:${id}`));
    for (const v of recs) {
      if (!v) continue;
      const t = visitTotals(v), c = classify(v), d = deviceOf(v.ua);
      out.push({
        at: v.start, kind: c.kind, why: c.why, country: v.country || '', city: v.city || '',
        device: `${d.os} · ${d.br}`, mobile: d.mobile, ref: v.ref || '',
        pages: t.pages.map((p) => normPath(p.p)), active: t.active, depth: t.depth, screen: v.sw ? `${v.sw}×${v.sh}` : '',
      });
    }
  }
  return { visits: out, since: first && first[1] ? Number(first[1]) : null };
}

// ---------- auth ----------
const COOKIE = 'nla_stats';
function sign(v) { return crypto.createHmac('sha256', env('DASH_PASSWORD') + '|stats').update(v).digest('base64url'); }
function makeSession(days = 30) { const exp = String(Date.now() + days * 864e5); return `${exp}.${sign(exp)}`; }
function readCookie(req, name) {
  const c = req.headers.cookie || '';
  for (const part of c.split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
  return null;
}
function isAuthed(req) {
  if (!env('DASH_PASSWORD')) return false;
  const v = readCookie(req, COOKIE);
  if (!v) return false;
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(JSON.stringify(body));
}

module.exports = {
  env, redis, getJSON, setJSON, mgetJSON, ymd, addDays, today, dayRange, normPath,
  vercelBreakdowns, vercelQuery, claritySnapshot, parseClarity, COOKIE, makeSession, isAuthed, safeEqual, send,
  visitNS, classify, deviceOf, recordHit, loadVisits,
};
