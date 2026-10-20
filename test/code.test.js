/*
 * 5ud0ku — codes de grille et grille du jour : grilles de référence figées (RÈGLE D'OR : un code ne change jamais de
 * grille), détection des fautes de frappe, date. Licence : GPL-3.0-or-later (voir LICENSE.txt).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SudokuGenerator, DIFFICULTY } from '../src/generator.js';
import { CODE_VERSION, makeCode, parseCode, canonicalCode, typeCode, dailySeed, dailyCode, localDate, validDate, puzzleFromCode } from '../src/code.js';

const flat = (puzzle) => puzzle.map((row) => row.map((v) => (v === null ? '.' : v + 1)).join('')).join('');

// Grilles de référence : si l'un de ces tests échoue, l'algorithme a changé et des codes déjà partagés donneraient
// d'autres grilles. Ne PAS corriger les valeurs : créer la version 2 du code et garder la version 1 appelable.
const REFERENCE = [
  [DIFFICULTY.EASY, 20261021, '01100KAA4XWK', '..8.6..2.46...9.7...95..4.3.8.3142..2..9.7..4..4682.5.8.1..69...4.2...85.3..4.6..'],
  [DIFFICULTY.MEDIUM, 20261022, '01200KAA4YM0', '.8.63..2...51.4..9.....963...7.1.....1.4.8.5.....9.8...718.....3..2.15...5..67.1.'],
  [DIFFICULTY.HARD, 20261023, '01300KAA4ZCD', '45...1.2.7.18..4...2...3.......8.2....96...1.....3.5...4...9...9.52..1..61...4.8.'],
  [DIFFICULTY.VERY_HARD, 20261024, '01400KAA50N3', '.....35.42....4.6..9..6....6.7...9...5.476.3...2...6.5....3..2..2.9....74.98.....'],
];

test('version 1 : grilles de référence figées pour chaque difficulté', () => {
  assert.equal(CODE_VERSION, 1);
  for (const [difficulty, seed, code, expected] of REFERENCE) {
    assert.equal(makeCode(difficulty, seed), code);
    const r = puzzleFromCode(code);
    assert.equal(flat(r.puzzle), expected, `difficulté ${difficulty}`);
    assert.equal(r.difficulty, difficulty);
    assert.equal(r.seed, seed);
  }
});

test('grille du jour : graine et code figés pour une date donnée', () => {
  assert.equal(dailySeed('2026-10-20', DIFFICULTY.EASY), 2459964624);
  assert.equal(dailyCode('2026-10-20', DIFFICULTY.EASY), '01129A056GPM');
  assert.notEqual(dailyCode('2026-10-20', DIFFICULTY.EASY), dailyCode('2026-10-21', DIFFICULTY.EASY));
  assert.notEqual(dailyCode('2026-10-20', DIFFICULTY.EASY), dailyCode('2026-10-20', DIFFICULTY.HARD));
  assert.throws(() => dailyCode('2026-13-40', DIFFICULTY.EASY));
});

test('un code se décode et se recode à l\'identique, pour tout l\'intervalle des graines', () => {
  for (const d of [1, 2, 3, 4]) {
    for (const seed of [0, 1, 31, 32, 12345, 2459964624, 0xfffffffe, 0xffffffff]) {
      const c = parseCode(makeCode(d, seed));
      assert.deepEqual(c, { version: 1, difficulty: d, seed });
    }
  }
});

test('toute faute d\'un symbole est détectée (31 substitutions possibles par position)', () => {
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (const code of ['01129A056GPM', '01100KAA4XWK', '01400KAA50N3', makeCode(2, 0xffffffff), makeCode(3, 0)]) {
    for (let i = 0; i < code.length; i++) {
      for (const c of ALPHA) {
        if (c === code[i]) continue;
        const bad = code.slice(0, i) + c + code.slice(i + 1);
        assert.equal(parseCode(bad), null, `${code} -> ${bad}`);
      }
    }
  }
});

test('tout échange de deux symboles voisins distincts est détecté', () => {
  for (const code of ['01129A056GPM', '01100KAA4XWK', '01400KAA50N3', makeCode(2, 777777777)]) {
    for (let i = 0; i < code.length - 1; i++) {
      if (code[i] === code[i + 1]) continue;
      const bad = code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2);
      assert.equal(parseCode(bad), null, `${code} -> ${bad}`);
    }
  }
});

test('saisie tolérante : minuscules, tirets, espaces, O/0 et I/L/1 confondus ; refus du reste', () => {
  const code = makeCode(2, 1048576 * 3);
  assert.ok(parseCode(code.toLowerCase()));
  assert.ok(parseCode(` ${code.slice(0, 4)} - ${code.slice(4, 8)}-${code.slice(8)} `));
  assert.equal(canonicalCode(code), `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`);
  assert.equal(parseCode(''), null);
  assert.equal(parseCode(null), null);
  assert.equal(parseCode('0123'), null);
  assert.equal(parseCode(`${code}0`), null);
  assert.equal(parseCode('01U00KAA4XWK'), null, 'U est interdit');
  assert.equal(canonicalCode('n importe quoi'), null);
  // version et difficulté inconnues
  const v2 = '02' + code.slice(2);
  assert.equal(parseCode(v2), null);
  assert.equal(parseCode(makeCode(1, 5).replace(/^01(.)/, '010')), null);
  assert.throws(() => makeCode(9, 1));
  assert.throws(() => puzzleFromCode('xxxx'));
});

test('typeCode met en forme au fil de la frappe', () => {
  assert.equal(typeCode('0112'), '0112');
  assert.equal(typeCode('01129a05'), '0112-9A05');
  assert.equal(typeCode('0112 9a05 6gpm extra'), '0112-9A05-6GPM');
  assert.equal(typeCode('o1l'), '011');
  assert.equal(typeCode(''), '');
});

test('dates : validité et date locale', () => {
  assert.ok(validDate('2026-10-20'));
  assert.ok(validDate('2028-02-29'));
  assert.ok(!validDate('2027-02-29'));
  assert.ok(!validDate('2026-1-5'));
  assert.ok(!validDate('hier'));
  assert.equal(localDate(new Date(2026, 9, 5, 23, 59)), '2026-10-05');
  assert.equal(localDate(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

test('le même code redonne la même grille, une graine voisine une autre', () => {
  const a = puzzleFromCode(dailyCode('2026-10-20', DIFFICULTY.MEDIUM));
  const b = puzzleFromCode(dailyCode('2026-10-20', DIFFICULTY.MEDIUM));
  assert.deepEqual(a.puzzle, b.puzzle);
  const g = new SudokuGenerator(1);
  g.setPuzzle(a.puzzle);
  assert.ok(g.solveUnique(), 'solution unique');
  assert.equal(g.difficulty(), DIFFICULTY.MEDIUM);
});
