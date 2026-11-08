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
async function vercelBreakdowns(since, until, limit = 50) {
  const agg = (by) => vercelQuery('visits/aggregate', { since, until, by, limit: String(limit) }).then(rows);
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
function parseClarity(resp, dim) {
  const by = new Map();
  const get = (key) => { if (!by.has(key)) by.set(key, { key }); return by.get(key); };
  for (const m of Array.isArray(resp) ? resp : []) {
    const name = String(m.metricName || '');
    for (const info of m.information || []) {
      let key = dimValue(info, dim);
      if (dim === 'URL') key = normPath(key);
      const o = get(key);
      switch (name) {
        case 'Traffic':
          o.sessions = (o.sessions || 0) + (firstNum(info, ['totalSessionCount']) || 0);
          o.bots = (o.bots || 0) + (firstNum(info, ['totalBotSessionCount']) || 0);
          o.users = (o.users || 0) + (firstNum(info, ['distantUserCount']) || 0);
          o.pagesPerSession = firstNum(info, ['PagesPerSessionPercentage', 'pagesPerSessionPercentage']);
          break;
        case 'Scroll Depth':
          o.scroll = firstNum(info, ['averageScrollDepth', 'AverageScrollDepth', 'scrollDepth']) ?? fuzzyNum(info, /scroll/i);
          break;
        case 'Engagement Time':
          o.activeTime = firstNum(info, ['activeTime', 'ActiveTime']) ?? fuzzyNum(info, /active/i);
          o.totalTime = firstNum(info, ['totalTime', 'TotalTime']) ?? fuzzyNum(info, /total.*time|time/i);
          break;
        case 'Rage Click Count': o.rage = signal(info); break;
        case 'Dead Click Count': o.dead = signal(info); break;
        case 'Quickback Click': o.quickback = signal(info); break;
        case 'Excessive Scroll': o.excessiveScroll = signal(info); break;
        case 'Script Error Count': o.scriptErrors = signal(info); break;
        case 'Error Click Count': o.errorClicks = signal(info); break;
        default: break;
      }
    }
  }
  return [...by.values()];
}
const signal = (info) => firstNum(info, ['subTotal', 'sessionsCount', 'count', 'Count']) ?? fuzzyNum(info, /count|total/i) ?? 0;

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
  vercelBreakdowns, claritySnapshot, parseClarity, COOKIE, makeSession, isAuthed, safeEqual, send,
};
