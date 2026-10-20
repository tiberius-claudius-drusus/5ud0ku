/*
 * 5ud0ku — thèmes : variantes complètes, couleurs lisibles. Licence : GPL-3.0-or-later (voir LICENSE.txt).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, MODES, DEFAULT_FAMILY, resolve, normalize, pickVariant } from '../src/themes.js';

const KEYS = Object.keys(resolve('epure', 'clair')).sort();
const variants = Object.entries(THEMES).flatMap(([f, fam]) => Object.keys(fam.variants).map((v) => [f, v]));

test('quatre familles, deux variantes chacune', () => {
  assert.deepEqual(Object.keys(THEMES), ['epure', 'aurora', 'claudia', 'minamoto']);
  for (const fam of Object.values(THEMES)) assert.deepEqual(Object.keys(fam.variants).sort(), ['clair', 'fonce']);
});

test('chaque variante définit exactement les mêmes variables que la référence', () => {
  for (const [f, v] of variants) assert.deepEqual(Object.keys(resolve(f, v)).sort(), KEYS, `${f}/${v}`);
});

test('chaque variable de couleur de la page est définie par chaque thème', () => {
  const need = ['--bg', '--fg', '--muted', '--panel', '--line', '--line-strong', '--cell', '--given', '--entry', '--sel', '--hl', '--same',
    '--err', '--errbg', '--acc', '--accfg', '--test', '--pad-note', '--pad-note-line', '--pad-test', '--pad-test-line', '--shadow', '--veil', '--theme-color'];
  for (const [f, v] of variants) for (const k of need) assert.ok(resolve(f, v)[k], `${f}/${v} : ${k}`);
});

const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : null);
const lum = (rgb) => {
  const [r, g, b] = rgb.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('contraste WCAG AA (4,5) des textes essentiels, pour les couleurs opaques', () => {
  const pairs = [['--fg', '--bg'], ['--given', '--cell'], ['--entry', '--cell'], ['--test', '--cell'], ['--err', '--cell'], ['--muted', '--bg'], ['--accfg', '--acc']];
  for (const [f, v] of variants) {
    const vars = resolve(f, v);
    for (const [a, b] of pairs) {
      const x = hex(vars[a]), y = hex(vars[b]);
      if (!x || !y) continue; // couleur translucide (Aurora) : dépend du fond, non calculable ici
      assert.ok(ratio(x, y) >= 4.5, `${f}/${v} : ${a} sur ${b} = ${ratio(x, y).toFixed(2)}`);
    }
  }
});

test('le chiffre d\'essai (vert) se distingue du chiffre du joueur (bleu ou brun) et des chiffres donnés', () => {
  for (const [f, v] of variants) {
    const vars = resolve(f, v);
    assert.notEqual(vars['--test'], vars['--entry'], `${f}/${v}`);
    assert.notEqual(vars['--test'], vars['--given'], `${f}/${v}`);
  }
});

test('choix corrompu ramené à des valeurs valides ; variante selon le mode et le système', () => {
  assert.deepEqual(normalize({ family: 'inconnue', mode: 'x' }), { family: DEFAULT_FAMILY, mode: 'auto' });
  assert.deepEqual(normalize(), { family: DEFAULT_FAMILY, mode: 'auto' });
  assert.deepEqual(MODES, ['auto', 'clair', 'fonce']);
  assert.equal(pickVariant('auto', true), 'fonce');
  assert.equal(pickVariant('auto', false), 'clair');
  assert.equal(pickVariant('clair', true), 'clair');
  assert.equal(pickVariant('fonce', false), 'fonce');
});
