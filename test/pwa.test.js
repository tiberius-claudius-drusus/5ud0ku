/*
 * 5ud0ku — cohérence PWA et version. Licence : GPL-3.0-or-later (voir LICENSE.txt).
 * Garde-fou contre le « cache périmé » : version de sw.js = version de src/version.js = package.json = première
 * entrée du CHANGELOG, et tout fichier utile est dans la liste de mise en cache.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { VERSION, RELEASE_DATE } from '../src/version.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const sw = read('sw.js');
const files = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('la version du service worker est celle de src/version.js', () => {
  assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], VERSION);
  assert.match(sw, /const CACHE = `5ud0ku-\$\{VERSION\}`/);
});

test('package.json et CHANGELOG portent la même version et la même date', () => {
  assert.equal(JSON.parse(read('package.json')).version, VERSION);
  const first = read('CHANGELOG.md').match(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})/m);
  assert.equal(first[1], VERSION);
  assert.equal(first[2], RELEASE_DATE);
});

test('chaque fichier mis en cache existe', () => {
  for (const f of files) {
    if (f === './') continue;
    assert.ok(existsSync(new URL(f, root)), `fichier absent : ${f}`);
  }
});

test('tous les fichiers de src/ et les fichiers de la page sont mis en cache', () => {
  for (const f of readdirSync(new URL('src/', root)).filter((n) => n.endsWith('.js'))) {
    assert.ok(files.includes(`src/${f}`), `src/${f} absent de la liste de cache`);
  }
  for (const f of ['index.html', 'app.js', 'manifest.webmanifest', 'LICENSE.txt']) {
    assert.ok(files.includes(f), `${f} absent de la liste de cache`);
  }
});

test('le manifeste pointe vers des icônes existantes', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const icon of m.icons) assert.ok(existsSync(new URL(icon.src, root)), icon.src);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('la page reste autonome : CSS en ligne, manifeste avec identifiants, lien de licence en .txt', () => {
  const html = read('index.html');
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(html), 'le nginx du portail sert les .css en octet-stream');
  assert.match(html, /<link rel="manifest"[^>]+crossorigin="use-credentials"/);
  assert.match(html, /href="LICENSE\.txt"/);
});

test('politique de sécurité du contenu : scripts de la page seulement, pas de script en ligne ni de gestionnaire on…=', () => {
  const html = read('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'aucun script en ligne autorisé');
  assert.match(csp, /object-src 'none'/);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'aucun <script> en ligne dans index.html');
  assert.ok(!/\son[a-z]+\s*=\s*["']/.test(html), 'aucun gestionnaire on…= en ligne');
});

test('les textes français et anglais ont les mêmes clés', async () => {
  const { STRINGS } = await import('../src/strings.js');
  assert.deepEqual(Object.keys(STRINGS.fr).sort(), Object.keys(STRINGS.en).sort());
});
