/*
 * 5ud0ku — langues : chaque traduction a les mêmes clés et les mêmes paramètres que le français, rien de vide, et le
 * registre est complet. Licence : GPL-3.0-or-later (voir LICENSE.txt).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { FR, EN, t, setDictionary } from '../src/strings.js';
import { LANGUAGES, CODES, pickLanguage, directionOf, loadLanguage } from '../src/lang/index.js';

const files = readdirSync(new URL('../src/lang/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => f.slice(0, -3));
const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('registre : 20 langues, une par fichier (sauf fr et en, intégrées)', () => {
  assert.equal(CODES.length, 20);
  assert.equal(new Set(CODES).size, 20);
  assert.deepEqual(CODES.filter((c) => c !== 'fr' && c !== 'en').sort(), files.sort());
  for (const l of LANGUAGES) assert.ok(l.name && l.name.length > 1, l.code);
});

test('l\'anglais a les mêmes clés et les mêmes paramètres que le français', () => {
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(FR).sort());
  for (const k of Object.keys(FR)) assert.equal(params(EN[k]), params(FR[k]), k);
});

for (const code of files) {
  test(`${code} : mêmes clés et mêmes paramètres que le français, aucun texte vide`, async () => {
    const d = await loadLanguage(code);
    assert.notEqual(d, EN, `${code} non chargée`);
    assert.deepEqual(Object.keys(d).sort(), Object.keys(FR).sort(), 'clés manquantes ou en trop');
    for (const [k, v] of Object.entries(d)) {
      assert.equal(typeof v, 'string', k);
      assert.ok(v.trim().length > 0, `${k} vide`);
      assert.ok(!/[\r\n]/.test(v), `${k} contient un retour à la ligne`);
      assert.equal(params(v), params(FR[k]), `${k} : paramètres ${params(v)} au lieu de ${params(FR[k])}`);
    }
    assert.ok(d['home.foot'].endsWith(' '), 'home.foot doit finir par une espace : un lien « GPL3+ » lui est accolé');
    assert.equal(d['app.title'], '5ud0ku');
  });
}

test('une traduction ne reste pas en français ou en anglais pour les libellés principaux (hors latin proche)', async () => {
  for (const code of files) {
    const d = await loadLanguage(code);
    const same = ['home.new', 'home.stats', 'home.options', 'home.help'].filter((k) => d[k] === FR[k] || d[k] === EN[k]);
    // l'anglais « Options » et « Statistiques / Statistics » peuvent légitimement coïncider dans quelques langues
    assert.ok(same.length <= 2, `${code} : ${same.join(', ')} identiques au français ou à l'anglais`);
  }
});

test('choix de la langue : liste du navigateur, pt vers pt-pt, repli sur l\'anglais', () => {
  assert.equal(pickLanguage(['fr-FR', 'en']), 'fr');
  assert.equal(pickLanguage(['de-AT']), 'de');
  assert.equal(pickLanguage(['pt-BR']), 'pt-br');
  assert.equal(pickLanguage(['pt']), 'pt-pt');
  assert.equal(pickLanguage(['zh-CN']), 'zh');
  assert.equal(pickLanguage(['xx', 'es']), 'es');
  assert.equal(pickLanguage(['xx']), 'en');
  assert.equal(pickLanguage([]), 'en');
});

test('sens d\'écriture : arabe de droite à gauche, les autres de gauche à droite', () => {
  assert.equal(directionOf('ar'), 'rtl');
  for (const c of CODES.filter((x) => x !== 'ar')) assert.equal(directionOf(c), 'ltr', c);
});

test('t() : langue courante, repli sur l\'anglais, puis sur la clé ; paramètres remplacés', () => {
  setDictionary({ 'home.new': 'X' });
  assert.equal(t('home.new'), 'X');
  assert.equal(t('home.stats'), EN['home.stats'], 'repli anglais');
  assert.equal(t('clé.inconnue'), 'clé.inconnue');
  assert.equal(t('game.cell', { row: 2, col: 5 }), 'Row 2, column 5');
  assert.equal(t('game.cell', { row: 2 }), 'Row 2, column {col}', 'paramètre absent laissé tel quel');
  setDictionary(FR);
  assert.equal(t('home.new'), 'Nouvelle partie');
});

test('une langue inconnue ou un fichier absent donne l\'anglais, jamais d\'exception', async () => {
  assert.equal(await loadLanguage('xx'), EN);
  assert.equal(await loadLanguage('fr'), FR);
  assert.equal(await loadLanguage('en'), EN);
});
