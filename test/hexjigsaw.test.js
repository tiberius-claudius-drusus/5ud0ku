import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SudokuSession } from '../src/session.js';
import { SudokuGame } from '../src/game.js';
import { SudokuBoard, SudokuError } from '../src/board.js';
import { DIFFICULTY, mulberry32 } from '../src/generator.js';
import { MODE, makeCode, parseCode, dailyCode, puzzleFromCode } from '../src/code.js';
import { REGIONS_16, moteur, regionsAleatoiresN, regionsValidesN } from '../src/sudoku_n.js';
import { byDifficulty, modeOf } from '../src/stats.js';

// Jigsaw 16×16 : seize régions connexes de seize cases, chiffres 0 à F. Mêmes règles d'or que les autres modes : des grilles de référence figées.

function memoire() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}
const h = (x) => createHash('sha1').update(x).digest('hex').slice(0, 16);

test('régions 16×16 : partitions valables, déterministes, aucune ligne ni colonne entière', () => {
  assert.equal(regionsValidesN(REGIONS_16, 16), true);
  const a = regionsAleatoiresN(4, mulberry32(7)), b = regionsAleatoiresN(4, mulberry32(7)), c = regionsAleatoiresN(4, mulberry32(8));
  assert.equal(regionsValidesN(a, 16), true);
  assert.deepEqual(a, b, 'même graine, mêmes régions');
  assert.notDeepEqual(a, c);
  assert.ok(a.some((v, p) => v !== REGIONS_16[p]), 'pas les blocs de 4×4');
  // refus : région de 15 cases, région en deux morceaux, ligne entière
  const mauvaise = Int8Array.from(REGIONS_16); mauvaise[0] = 1;
  assert.equal(regionsValidesN(mauvaise, 16), false);
  const deux = Int8Array.from(REGIONS_16); deux[0] = 5; deux[200] = 0;
  assert.equal(regionsValidesN(deux, 16), false);
  const ligne = Int8Array.from({ length: 256 }, (_, p) => Math.floor(p / 16));
  assert.equal(regionsValidesN(ligne, 16), false);
});

for (const [niveau, graine, indices, sha, shaRegions] of [
  [1, 5001, 90, '33c6d01b58f106bc', 'a5de91ed6d0c9c90'],
  [2, 5002, 78, 'b4442e3c97e67dd8', 'f74f0cdb22df5516'],
  [3, 5003, 73, 'ad6b3e2e4458f3a0', '792f7888d5f88db2'],
  [4, 5004, 73, '7d1e3ea8707c55c2', 'c42767fc9380c49b'],
]) {
  test(`Jigsaw 16×16 niveau ${niveau} : grille de référence figée (règle d'or), solution unique, niveau mesuré`, () => {
    const g = SudokuGame.fromHexJigsaw(niveau, graine);
    assert.equal(g.board.isHex && g.board.isJigsaw, true);
    assert.equal(g.board.totalFixed, indices);
    assert.equal(h(g.board.fixedToString()), sha, "si ceci casse, l'algorithme du Jigsaw 16×16 a changé : créer la version 2 des codes, garder la 1");
    assert.equal(h(Array.from(g.board.regions).join(',')), shaRegions);
    assert.equal(g.board.difficultyCategory, niveau);
    const s = g.board.solution;
    assert.ok([...g.board.rows, ...g.board.cols, ...g.board.blocks].every((u) => new Set(Array.from(u, (p) => s[p])).size === 16), '16 chiffres différents par ligne, colonne et région');
    const m = moteur(4, g.board.regions);
    assert.equal(m.compterEssais(m.copie(m.etatInitial(g.board.fixedValues())), 2, { fort: true }), 1);
  });
}

test('codes Jigsaw 16×16 : symbole de difficulté 13 à 16, version propre, distincts des autres modes', () => {
  for (let d = 1; d <= 4; d++) {
    const c = makeCode(d, 4242, MODE.HEXJIGSAW);
    assert.deepEqual(parseCode(c), { version: 1, difficulty: d, seed: 4242, mode: MODE.HEXJIGSAW });
    for (const autre of [MODE.CLASSIQUE, MODE.JIGSAW, MODE.HEX]) assert.notEqual(c, makeCode(d, 4242, autre));
  }
  assert.notEqual(dailyCode('2026-11-09', 1, MODE.HEXJIGSAW), dailyCode('2026-11-09', 1, MODE.HEX));
  const g = puzzleFromCode(makeCode(1, 5001, MODE.HEXJIGSAW));
  assert.equal(g.mode, MODE.HEXJIGSAW);
  assert.equal(g.puzzle.length, 256);
  assert.equal(regionsValidesN(g.regions, 16), true);
});

test('sauvegarde Jigsaw 16×16 : size et regions (256 chiffres hexadécimaux), aller-retour, refus des régions invalides, blocs 4×4 = 16×16 ordinaire', () => {
  const g = SudokuGame.fromHexJigsaw(DIFFICULTY.MEDIUM, 5002);
  const vides = [...Array(256).keys()].filter((p) => g.board.value[p] === -1);
  g.insert(vides[0], g.board.solution[vides[0]]);
  g.board.enableEarmark(vides[1], 15);
  const json = JSON.parse(JSON.stringify(g.toJson(9)));
  assert.equal(json.size, 16);
  assert.match(json.regions, /^[0-9a-f]{256}$/);
  const r = SudokuGame.fromJson(json);
  assert.equal(r.board.isJigsaw && r.board.isHex, true);
  assert.deepEqual(r.board.regions, g.board.regions);
  assert.deepEqual(r.board.solution, g.board.solution);
  assert.equal(r.board.isEarmarkEnabled(vides[1], 15), true);
  assert.throws(() => SudokuBoard.fromJson({ ...json, regions: json.regions.replace(/^./, (c) => (c === '0' ? '1' : '0')) }), SudokuError);
  assert.throws(() => SudokuBoard.fromJson({ ...json, regions: 'g'.repeat(256) }), SudokuError);
  // des blocs de 4×4 ramènent au plateau 16×16 ordinaire (pas de champ regions à la sauvegarde suivante)
  const blocs = SudokuBoard.fromJson({ ...json, regions: Array.from(REGIONS_16, (v) => v.toString(16)).join('') });
  assert.equal(blocs.isJigsaw, false);
  assert.equal(blocs.isHex, true);
  assert.equal(blocs.toJson(0).regions, undefined);
});

test('session Jigsaw 16×16 : partie, code, reprise, meilleurs temps et statistiques séparés des trois autres modes', () => {
  const stockage = memoire();
  const s = new SudokuSession({ storage: stockage });
  const g = s.newGame(DIFFICULTY.EASY, 5001, MODE.HEXJIGSAW);
  assert.equal(g.board.isJigsaw && g.board.isHex, true);
  assert.deepEqual(parseCode(g.code), { version: 1, difficulty: 1, seed: 5001, mode: MODE.HEXJIGSAW });
  assert.equal(s.savedInfo().mode, MODE.HEXJIGSAW);
  const rejouee = s.startFrom(g.code);
  assert.equal(h(rejouee.board.fixedToString()), h(g.board.fixedToString()));
  assert.deepEqual(rejouee.board.regions, g.board.regions);
  rejouee.autoComplete();
  s.completeGame();
  const s2 = new SudokuSession({ storage: stockage });
  assert.deepEqual(Object.keys(s2.highscoresOf(MODE.HEXJIGSAW)), ['1']);
  for (const autre of [MODE.CLASSIQUE, MODE.JIGSAW, MODE.HEX]) assert.deepEqual(s2.highscoresOf(autre), {});
  assert.equal(byDifficulty(s2.stats.games, MODE.HEXJIGSAW).length, 1);
  assert.equal(modeOf(s2.stats.games.at(-1)), MODE.HEXJIGSAW);
  s2.setSelectedMode(MODE.HEXJIGSAW);
  assert.equal(new SudokuSession({ storage: stockage }).selectedMode, MODE.HEXJIGSAW);
});
