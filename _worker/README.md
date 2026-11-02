# Visitor counter (stats.keyuli.space)

Cloudflare Worker + D1 that powers the Visitors map on the homepage. No cookies, no stored IPs:
a salted daily hash dedupes visits (one per visitor per UTC day) and locations are city-level, rounded to 0.1°.

- `POST /hit` records a view and returns stats; `GET /stats` returns stats only (cached 60 s).
- `seed_flagcounter.sql` imports the 434 visits FlagCounter recorded before 2026-11-02 (country / US-state level).
- `build-map.mjs` regenerates `_includes/visitor-map.svg` (needs `d3-geo`, `topojson-client`, `world-atlas`).

```bash
cd _worker && npm install
npx wrangler login
npx wrangler d1 migrations apply keyuli-visitors --remote
npx wrangler deploy
npx wrangler d1 execute keyuli-visitors --remote --command "SELECT * FROM stats"
```
