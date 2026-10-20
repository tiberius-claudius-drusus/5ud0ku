import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SudokuGenerator, DIFFICULTY } from '../src/generator.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8').split('\n').filter(Boolean);

// Reprise du test de compatibilité QQWing de l'amont : chaque puzzle doit avoir une solution unique et la
// difficulté du fichier dont il vient (amont : qqwing-simple = Facile, -easy = Moyen, -intermediate = Difficile,
// -expert = Très difficile). Ici les 300 premières lignes de chaque fichier (fixtures nommées par difficulté).
for (const [name, level] of [['qqwing-easy', DIFFICULTY.EASY], ['qqwing-medium', DIFFICULTY.MEDIUM], ['qqwing-hard', DIFFICULTY.HARD], ['qqwing-veryhard', DIFFICULTY.VERY_HARD]]) {
  test(`QQWing ${name} : solution unique et difficulté ${level}`, () => {
    const g = new SudokuGenerator(1);
    for (const line of fixture(name)) {
      assert.ok(g.setPuzzleQQWing(line));
      assert.ok(g.solveUnique(), `pas de solution unique : ${line}`);
      assert.equal(g.difficulty(), level, `difficulté inattendue : ${line}`);
    }
  });
}

function valid(grid) {
  const ok = (cells) => new Set(cells).size === 9;
  for (let i = 0; i < 9; i++) {
    if (!ok(grid[i])) return false;
    if (!ok(grid.map((r) => r[i]))) return false;
    const r0 = Math.floor(i / 3) * 3, c0 = (i % 3) * 3;
    const b = [];
    for (let r = r0; r < r0 + 3; r++) for (let c = c0; c < c0 + 3; c++) b.push(grid[r][c]);
    if (!ok(b)) return false;
  }
  return true;
}

test('un puzzle généré a une solution unique valide qui respecte les données', () => {
  const g = new SudokuGenerator(42);
  for (let i = 0; i < 5; i++) {
    g.newPuzzle();
    const puzzle = g.getPuzzle();
    assert.ok(g.checkUniqueSolution());
    const sol = g.solve();
    assert.ok(valid(sol));
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (puzzle[r][c] !== null) assert.equal(sol[r][c], puzzle[r][c]);
  }
});

test('même graine, même puzzle ; graine différente, puzzle différent', () => {
  const a = new SudokuGenerator(7); a.newPuzzle();
  const b = new SudokuGenerator(7); b.newPuzzle();
  const c = new SudokuGenerator(8); c.newPuzzle();
  assert.deepEqual(a.getPuzzle(), b.getPuzzle());
  assert.notDeepEqual(a.getPuzzle(), c.getPuzzle());
});

test('generate renvoie la difficulté demandée', () => {
  for (const d of [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD, DIFFICULTY.VERY_HARD]) {
    const r = SudokuGenerator.generate(d, 3);
    const g = new SudokuGenerator(1);
    g.setPuzzle(r.puzzle);
    assert.ok(g.solveUnique());
    assert.equal(g.difficulty(), d);
  }
});

test('un puzzle contradictoire est refusé ; une grille vide n\'a pas de solution unique', () => {
  const g = new SudokuGenerator(1);
  const grid = Array.from({ length: 9 }, () => Array(9).fill(null));
  grid[0][0] = 4; grid[0][1] = 4;
  assert.equal(g.setPuzzle(grid), false);
  g.setPuzzle(Array.from({ length: 9 }, () => Array(9).fill(null)));
  assert.equal(g.solveUnique(), null);
});
