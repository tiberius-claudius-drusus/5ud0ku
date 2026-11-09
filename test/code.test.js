/*
 * 5ud0ku — codes de grille et grille du jour : grilles de référence figées (RÈGLE D'OR : un code ne change jamais de
 * grille), détection des fautes de frappe, date. Licence : GPL-3.0-or-later (voir LICENSE.txt).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SudokuGenerator, DIFFICULTY } from '../src/generator.js';
import { memeGrille, CODE_VERSION, JIGSAW_CODE_VERSION, MODE, makeCode, parseCode, canonicalCode, typeCode, dailySeed, dailyCode, localDate, validDate, puzzleFromCode } from '../src/code.js';
import { regionsValides, compterSolutions } from '../src/jigsaw.js';

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
      assert.deepEqual(c, { version: 1, difficulty: d, seed, mode: 'classique' });
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

// --- mode Jigsaw : même format de code (12 symboles), difficulté 5 à 8, version propre à l'algorithme Jigsaw ---

const enTexte = (puzzle) => Array.from(puzzle, (v) => (v < 0 ? '.' : String(v + 1))).join('');

// RÈGLE D'OR (voir src/code.js) : ces grilles ne doivent JAMAIS changer pour une même version de l'algorithme Jigsaw. Si ce test casse parce que
// src/jigsaw.js ou src/jigsaw_solveur.js a changé, il faut créer la version 2 (JIGSAW_CODE_VERSION) et garder la version 1 appelable.
const JIGSAW_REFERENCES = [
  { d: 1, seed: 12345, code: '0150000C1SWM', regions: '000002222040002112441111122444445112435555555333385777333888777636888887666666677', puzzle: '.18.327....52..3.6...7....9..9..6.........4.1.37......2..3..9.5....9....46.9.7...' },
  { d: 2, seed: 12345, code: '0160000C1S1Q', regions: '000002222040002112441111122444445112435555555333385777333888777636888887666666677', puzzle: '..8.3.7.4..52..3.6...7.......9...........34.1..7.....22..3.8..5..........6.9.7...' },
  { d: 3, seed: 777, code: '01700000R999', regions: '111100005110002255113022225133024225333444445633377455666778485667778488666778888', puzzle: '................2.7....48.......5.74..9.86...8.14.....2..5......6...1.......18...' },
  { d: 4, seed: 424242, code: '018000CY9JR3', regions: '311102222310000022311044025311044225314444455338888875366887875366877775666667755', puzzle: '......13..1...54...........1....2.96...9...8.........4.....46...98.....7.....8...' },
];

test('Jigsaw : version de l\'algorithme et grilles de référence figées (règle d\'or des codes)', () => {
  assert.equal(JIGSAW_CODE_VERSION, 1);
  for (const r of JIGSAW_REFERENCES) {
    // depuis 2.1.1 : « 1 » (puzzle), « 1 » (version), la difficulté 1 à 4 ; l'ancien code (« 01 » + difficulté 5 à 8) désigne la même grille
    const nouveau = makeCode(r.d, r.seed, MODE.JIGSAW);
    assert.equal(nouveau.slice(0, 3), `11${r.d}`);
    assert.deepEqual(parseCode(r.code), parseCode(nouveau));
    assert.equal(memeGrille(r.code, nouveau), true);
    for (const code of [r.code, nouveau]) {
      const h = puzzleFromCode(code);
      assert.equal(h.mode, MODE.JIGSAW);
      assert.equal(h.difficulty, r.d);
      assert.equal(h.regions.join(''), r.regions, `${code} : régions`);
      assert.equal(enTexte(h.puzzle), r.puzzle, `${code} : puzzle`);
    }
    const g = puzzleFromCode(nouveau);
    assert.ok(regionsValides(g.regions));
    assert.equal(compterSolutions(g.regions, g.puzzle, 2), 1, `${nouveau} : solution unique`);
    assert.ok(g.puzzle.every((v, p) => v < 0 || v === g.solution[p]));
  }
});

test('Jigsaw : un code se décode et se recode à l\'identique, avec son mode', () => {
  for (const d of [1, 2, 3, 4]) {
    for (const seed of [0, 1, 32, 12345, 0xffffffff]) {
      const code = makeCode(d, seed, MODE.JIGSAW);
      assert.deepEqual(parseCode(code), { version: 1, difficulty: d, seed, mode: MODE.JIGSAW });
      assert.notEqual(code, makeCode(d, seed), 'un code Jigsaw n\'est jamais un code classique');
      assert.equal(code.slice(0, 3), `11${d}`, 'type 1 (puzzle), version 1, difficulté 1 à 4 comme partout');
    }
  }
  assert.throws(() => makeCode(1, 5, 'autre'));
});

test('les codes classiques ne changent pas de sens avec le mode Jigsaw', () => {
  for (const code of ['01129A056GPM', '01100KAA4XWK', '01400KAA50N3']) assert.equal(parseCode(code).mode, MODE.CLASSIQUE);
  assert.equal(dailySeed('2026-10-20', DIFFICULTY.EASY), 2459964624);
  assert.equal(dailyCode('2026-10-20', DIFFICULTY.EASY), '01129A056GPM');
});

test('Jigsaw : fautes de frappe détectées, symboles de difficulté et versions hors échelle refusés', () => {
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (const code of [makeCode(1, 12345, MODE.JIGSAW), makeCode(4, 0xffffffff, MODE.JIGSAW)]) {
    for (let i = 0; i < 12; i++) {
      for (const ch of ALPHA) {
        if (ch === code[i]) continue;
        const bad = code.slice(0, i) + ch + code.slice(i + 1);
        assert.equal(parseCode(bad), null, `${code} -> ${bad}`);
      }
    }
  }
  // une version d'algorithme ou un type qui n'existent pas : refusés
  assert.equal(parseCode(makeCode(1, 5, MODE.JIGSAW).replace(/^11/, '12')), null, 'une autre version de l\'algorithme Jigsaw n\'existe pas encore');
  assert.equal(parseCode(makeCode(2, 5).replace(/^01/, '02')), null);
  assert.equal(parseCode(makeCode(1, 5, MODE.JIGSAW).replace(/^11/, 'Z1')), null, 'type de grille inconnu');
});

test('Jigsaw : grille du jour distincte du mode classique, mais stable', () => {
  const a = dailyCode('2026-11-08', DIFFICULTY.MEDIUM, MODE.JIGSAW);
  assert.equal(a, dailyCode('2026-11-08', DIFFICULTY.MEDIUM, MODE.JIGSAW));
  assert.notEqual(a, dailyCode('2026-11-08', DIFFICULTY.MEDIUM));
  assert.notEqual(a, dailyCode('2026-11-09', DIFFICULTY.MEDIUM, MODE.JIGSAW));
  assert.equal(parseCode(a).mode, MODE.JIGSAW);
});
