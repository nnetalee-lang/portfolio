// Receives the small visit beacons sent by assets/visit.js and stores them (see recordHit in _lib).
// Public on purpose: it only accepts the expected fields, clamps every number and stores no IP.
const L = require('./_lib');

async function readBody(req) {
  let b = req.body;
  if (b === undefined) {
    b = await new Promise((resolve) => {
      let s = '';
      req.on('data', (c) => { s += c; if (s.length > 4000) { s = ''; req.destroy(); } });
      req.on('end', () => resolve(s));
      req.on('error', () => resolve(''));
    });
  }
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') { if (b.length > 4000) return null; try { b = JSON.parse(b); } catch (e) { return null; } }
  return b && typeof b === 'object' ? b : null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'POST') return L.send(res, 405, { error: 'method' });
  try {
    const v = await L.recordHit(await readBody(req), req.headers || {});
    // On preview deployments ?debug=1 echoes the stored record, to test the setup.
    if (L.visitNS() !== 'vis' && /[?&]debug=1/.test(req.url || '')) return L.send(res, v ? 200 : 400, v ? { stored: v, verdict: L.classify(v) } : { error: 'invalid' });
    res.statusCode = v ? 204 : 400;
    res.end();
  } catch (e) {
    L.send(res, 500, { error: e.message === 'storage-not-configured' ? e.message : 'failed' });
  }
};
