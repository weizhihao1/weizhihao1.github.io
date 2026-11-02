// Visitor counter + map data for keyuli.space.
// POST /hit   -> records one page view (and one visit per visitor per UTC day), returns stats
// GET  /stats -> returns stats only
// Privacy: no IPs are stored. A salted daily hash dedupes visits; locations are city-level, rounded to 0.1°.

const ALLOWED = [
  /^https:\/\/(www\.)?keyuli\.space$/,
  /^https:\/\/weizhihao1\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|go-http|java\//i;

function cors(origin) {
  const ok = origin && ALLOWED.some((r) => r.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://weizhihao1.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, headers, extra = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers, ...extra },
  });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readStats(db) {
  const [tot, places, countries, last] = await db.batch([
    db.prepare('SELECT visits, views, since FROM stats WHERE id = 1'),
    db.prepare('SELECT lat, lon, city, country AS cc, visits AS n FROM places ORDER BY visits DESC LIMIT 400'),
    db.prepare('SELECT country AS cc, SUM(visits) AS n FROM places GROUP BY country ORDER BY n DESC'),
    db.prepare("SELECT city, country AS cc, last AS t FROM places WHERE source = 'live' ORDER BY last DESC LIMIT 1"),
  ]);
  const t = tot.results[0] || { visits: 0, views: 0, since: null };
  return {
    visits: t.visits,
    views: t.views,
    since: t.since,
    countries: countries.results,
    places: places.results,
    last: last.results[0] || null,
  };
}

async function hit(request, env) {
  const cf = request.cf || {};
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  if (BOT.test(ua)) return false;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const h = await sha256(`${env.SALT || 'salt'}|${day}|${ip}|${ua}`);
  const db = env.DB;
  const ins = await db.prepare('INSERT OR IGNORE INTO seen (h, day) VALUES (?, ?)').bind(h, day).run();
  const isNew = ins.meta.changes === 1;
  const stmts = [db.prepare('UPDATE stats SET views = views + 1, visits = visits + ? WHERE id = 1').bind(isNew ? 1 : 0)];
  if (isNew) {
    const country = (cf.country || 'XX').toUpperCase();
    const lat = Number.parseFloat(cf.latitude);
    const lon = Number.parseFloat(cf.longitude);
    if (country !== 'XX' && Number.isFinite(lat) && Number.isFinite(lon)) {
      const rlat = Math.round(lat * 10) / 10;
      const rlon = Math.round(lon * 10) / 10;
      const city = (cf.city || cf.region || '').slice(0, 80);
      const key = `${country}|${city}|${rlat}|${rlon}`;
      stmts.push(
        db.prepare(
          `INSERT INTO places (k, country, region, city, lat, lon, visits, last, source)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'live')
           ON CONFLICT(k) DO UPDATE SET visits = visits + 1, last = excluded.last`
        ).bind(key, country, (cf.region || '').slice(0, 80), city, rlat, rlon, now.toISOString())
      );
    }
    stmts.push(db.prepare('DELETE FROM seen WHERE day < ?').bind(new Date(now - 2 * 864e5).toISOString().slice(0, 10)));
  }
  await db.batch(stmts);
  return true;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const h = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    try {
      if (url.pathname === '/hit' && request.method === 'POST') {
        const fromSite = origin && ALLOWED.slice(0, 2).some((r) => r.test(origin));
        if (fromSite) await hit(request, env);
        return json(await readStats(env.DB), h, { 'Cache-Control': 'no-store' });
      }
      if (url.pathname === '/stats' && request.method === 'GET') {
        return json(await readStats(env.DB), h, { 'Cache-Control': 'public, max-age=60' });
      }
      if (url.pathname === '/') return new Response('keyuli.space visitor counter', { headers: h });
      return new Response('Not found', { status: 404, headers: h });
    } catch (e) {
      return json({ error: 'internal' }, h, { 'Cache-Control': 'no-store' });
    }
  },
};
