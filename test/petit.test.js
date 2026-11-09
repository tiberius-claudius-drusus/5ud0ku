import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SudokuSession } from '../src/session.js';
import { SudokuGame } from '../src/game.js';
import { SudokuBoard, SudokuError } from '../src/board.js';
import { DIFFICULTY } from '../src/generator.js';
import { MODE, makeCode, parseCode, dailyCode, puzzleFromCode } from '../src/code.js';
import { REGIONS_4, moteurDe } from '../src/sudoku_n.js';
import { byDifficulty, modeOf } from '../src/stats.js';

// Grille 4×4 (2.2.0) : blocs de 2×2, chiffres 1 à 4, une seule difficulté (facile), 7 indices au moins : débutants et enfants.

function memoire() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}

test('plateau 4×4 : taille, blocs de 2×2, cases alignées (8), chiffres 1 à 4, pas un Jigsaw', () => {
  const b = new SudokuBoard(REGIONS_4);
  assert.deepEqual([b.n, b.N, b.isPetit, b.isHex, b.isJigsaw, b.supportsHash], [4, 16, true, false, false, false]);
  assert.ok(b.blocks.every((c) => c.length === 4));
  assert.ok(b.aligned21.every((a, p) => a.length === 8 && a[0] === p), 'case + 3 de la ligne + 3 de la colonne + 1 du bloc hors ligne et colonne');
  b.insert(0, 3); b.insert(5, 3);
  assert.deepEqual([...b.broken].sort((x, y) => x - y), [0, 5], 'même chiffre dans un bloc de 2×2 (lignes et colonnes différentes)');
  assert.throws(() => b.fixedToAscii(), SudokuError);
});

for (const [graine, sha] of [[1, '.31.2.3.....3.41'], [2, '.21..34...34...1'], [3, '.32.12..31.....3'], [12345, '....4.1....22341']]) {
  test(`4×4 graine ${graine} : grille de référence figée (règle d'or), 7 indices, solution unique, niveau facile`, () => {
    const g = SudokuGame.fromPetit(graine);
    assert.equal(g.board.fixedToString(), sha, "si ceci casse, l'algorithme du 4×4 a changé : créer la version 2 des codes, garder la 1");
    assert.equal(g.board.totalFixed, 7);
    assert.equal(g.board.difficultyCategory, DIFFICULTY.EASY);
    const m = moteurDe(2);
    assert.equal(m.compterEssais(m.copie(m.etatInitial(g.board.fixedValues())), 2), 1);
    assert.ok([...g.board.rows, ...g.board.cols, ...g.board.blocks].every((u) => new Set(Array.from(u, (p) => g.board.solution[p])).size === 4));
    assert.equal(SudokuGame.fromPetit(graine).board.fixedToString(), sha, 'même graine, même grille');
  });
}

test('300 grilles 4×4 : toutes uniques, faciles, avec au moins 7 indices', () => {
  for (let s = 1; s <= 300; s++) {
    const g = SudokuGame.fromPetit(s);
    assert.ok(g.board.totalFixed >= 7 && g.board.difficultyCategory === 1, `graine ${s}`);
  }
});

test('codes 4×4 : premier symbole 4, difficulté 1 seulement, grille du jour, grille du code', () => {
  assert.equal(makeCode(1, 12345, MODE.PETIT), '4110000C1SCC');
  assert.deepEqual(parseCode('4110000C1SCC'), { version: 1, difficulty: 1, seed: 12345, mode: MODE.PETIT });
  assert.throws(() => makeCode(2, 5, MODE.PETIT));
  assert.notEqual(dailyCode('2026-11-09', 1, MODE.PETIT), dailyCode('2026-11-09', 1, MODE.CLASSIQUE));
  const g = puzzleFromCode('4110000C1SCC');
  assert.equal(g.mode, MODE.PETIT);
  assert.equal(g.puzzle.length, 16);
  assert.equal(Array.from(g.puzzle, (v) => (v < 0 ? '.' : v + 1)).join(''), '....4.1....22341');
});

test('sauvegarde 4×4 : size 4, aller-retour, valeurs 1 à 4 seulement, pas de regions', () => {
  const g = SudokuGame.fromPetit(3);
  const vide = [...Array(16).keys()].find((p) => g.board.value[p] === -1);
  g.insert(vide, g.board.solution[vide]);
  const json = JSON.parse(JSON.stringify(g.toJson(5)));
  assert.equal(json.size, 4);
  assert.equal(json.regions, undefined);
  assert.equal(json.cells.length, 16);
  const h = SudokuGame.fromJson(json);
  assert.equal(h.board.isPetit, true);
  assert.equal(h.board.value[vide], g.board.value[vide]);
  const trop = JSON.parse(JSON.stringify(json)); trop.cells[0].value = 5;
  assert.throws(() => SudokuBoard.fromJson(trop), SudokuError);
  assert.throws(() => SudokuBoard.fromJson({ ...json, regions: '0'.repeat(16) }), SudokuError);
  assert.throws(() => SudokuBoard.fromJson({ ...json, size: 9 }), SudokuError);
});

test('session 4×4 : partie, code, victoire, meilleur temps et statistiques à part', () => {
  const stockage = memoire();
  const s = new SudokuSession({ storage: stockage });
  const g = s.newGame(DIFFICULTY.EASY, 12345, MODE.PETIT);
  assert.equal(g.board.isPetit, true);
  assert.equal(g.code, '4110-000C-1SCC');
  assert.equal(s.savedInfo().mode, MODE.PETIT);
  g.autoComplete();
  assert.equal(g.finished, true);
  s.completeGame();
  const s2 = new SudokuSession({ storage: stockage });
  assert.deepEqual(Object.keys(s2.highscoresOf(MODE.PETIT)), ['1']);
  assert.deepEqual(s2.highscoresOf(MODE.CLASSIQUE), {});
  assert.equal(byDifficulty(s2.stats.games, MODE.PETIT).length, 1);
  assert.equal(byDifficulty(s2.stats.games, MODE.CLASSIQUE).length, 0);
  assert.equal(modeOf(s2.stats.games.at(-1)), MODE.PETIT);
  s2.setSelectedMode(MODE.PETIT);
  assert.equal(new SudokuSession({ storage: stockage }).selectedMode, MODE.PETIT);
});
