// Builds a dot-matrix world map (Equal Earth) as one SVG path, plus the projection constants the page uses
// to place visitor dots. Usage: node build-map.mjs <out.html>
import fs from 'node:fs';
import { geoEqualEarth, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
const world = JSON.parse(fs.readFileSync('node_modules/world-atlas/land-50m.json'));
const land = feature(world, world.objects.land);
const W = 960, STEP = 6.4;
const proj = geoEqualEarth().fitWidth(W, { type: 'Sphere' });
const [, y0] = proj([0, 83.5]);  // crop: top of Greenland
const [, y1] = proj([0, -56]);   // crop: below Tierra del Fuego, drop Antarctica
let d = '', n = 0;
for (let y = y0 + STEP / 2; y < y1; y += STEP) {
  for (let x = STEP / 2; x < W; x += STEP) {
    const ll = proj.invert([x, y]);
    if (ll && geoContains(land, ll)) { d += `M${x.toFixed(1)} ${(y - y0).toFixed(1)}h0`; n++; }
  }
}
const k = proj.scale(), [tx, ty] = proj.translate();
const H = Math.round(y1 - y0);
const out = `<svg class="map" viewBox="0 0 ${W} ${H}" data-k="${k.toFixed(4)}" data-tx="${tx.toFixed(3)}" data-ty="${(ty - y0).toFixed(3)}" role="img" aria-label="World map of visitor locations"><path class="land" d="${d}"/><g class="pts"></g></svg>\n`;
fs.writeFileSync(process.argv[2], out);
console.log({ dots: n, W, H, k, tx, ty: ty - y0, bytes: out.length });
