const L = require('./_lib');

module.exports = async (req, res) => {
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', `${L.COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return L.send(res, 200, { ok: true });
  }
  if (req.method !== 'POST') return L.send(res, 405, { error: 'method' });
  const pw = L.env('DASH_PASSWORD');
  if (!pw) return L.send(res, 503, { error: 'DASH_PASSWORD is not set yet' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body || !L.safeEqual(String(body.password || ''), pw)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return L.send(res, 401, { error: 'wrong password' });
  }
  res.setHeader('Set-Cookie', `${L.COOKIE}=${L.makeSession(30)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30 * 86400}`);
  L.send(res, 200, { ok: true });
};
