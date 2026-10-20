/*
 * 5ud0ku — logo : un SVG bien formé, aux couleurs du thème, accessible. Licence : GPL-3.0-or-later (voir LICENSE.txt).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logoSvg, LOGO_DIGITS } from '../src/logo.js';

test('le logo est un SVG de grille 9×9 : 16 traits intérieurs, un cadre, un chiffre par case décrite', () => {
  const svg = logoSvg();
  assert.match(svg, /^<svg viewBox="0 0 100 100" role="img" aria-label="5ud0ku"/);
  assert.equal((svg.match(/<line /g) ?? []).length, 16);
  assert.equal((svg.match(/<text /g) ?? []).length, LOGO_DIGITS.length);
  assert.ok(svg.endsWith('</svg>'));
});

test('aucune couleur en dur : tout passe par les variables du thème', () => {
  const svg = logoSvg();
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(svg), 'couleur hexadécimale en dur');
  assert.ok(!/rgb\(/.test(svg));
  for (const v of ['--cell', '--line', '--line-strong', '--given', '--entry', '--test']) assert.ok(svg.includes(`var(${v})`), v);
});

test('les chiffres du logo sont valides : cases distinctes, chiffres 1 à 9, pas de doublon dans une ligne ou une colonne', () => {
  const seen = new Set();
  const rows = new Map(), cols = new Map();
  for (const [r, c, d] of LOGO_DIGITS) {
    assert.ok(r >= 0 && r < 9 && c >= 0 && c < 9 && d >= 1 && d <= 9);
    assert.ok(!seen.has(r * 9 + c), 'case en double');
    seen.add(r * 9 + c);
    assert.ok(!rows.get(r)?.has(d), `doublon ligne ${r}`);
    assert.ok(!cols.get(c)?.has(d), `doublon colonne ${c}`);
    rows.set(r, (rows.get(r) ?? new Set()).add(d));
    cols.set(c, (cols.get(c) ?? new Set()).add(d));
  }
});
