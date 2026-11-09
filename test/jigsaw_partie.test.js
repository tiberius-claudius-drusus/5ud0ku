import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SudokuSession } from '../src/session.js';
import { SudokuGame } from '../src/game.js';
import { SudokuBoard, SudokuError } from '../src/board.js';
import { DIFFICULTY } from '../src/generator.js';
import { MODE, makeCode, parseCode, canonicalCode } from '../src/code.js';
import { REGIONS_CLASSIQUES } from '../src/jigsaw.js';

// Mode Jigsaw dans le plateau, la partie et la session (étape 2) : régions lues dans un tableau, sauvegarde avec les régions, codes, surbrillance.

function memoire() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}
const ligne = (p) => Math.floor(p / 9);
const colonne = (p) => p % 9;
const videDe = (g) => [...Array(81).keys()].filter((p) => g.board.value[p] === -1);

// deux cases d'une même région, sur des lignes ET des colonnes différentes (seule la région les relie)
function pairePartagee(board) {
  for (let b = 0; b < 9; b++) {
    const cases = board.blocks[b];
    for (const p of cases) for (const q of cases) if (p < q && ligne(p) !== ligne(q) && colonne(p) !== colonne(q)) return [p, q];
  }
  throw new Error('aucune paire');
}

test('plateau Jigsaw : deux chiffres identiques dans une même région irrégulière sont en conflit, même sans ligne ni colonne commune', () => {
  const g = SudokuGame.fromJigsaw(DIFFICULTY.MEDIUM, 4242);
  const b = g.board;
  assert.ok(b.isJigsaw);
  let trouve = null;
  for (let bl = 0; bl < 9 && !trouve; bl++) {
    for (const p of b.blocks[bl]) for (const q of b.blocks[bl]) {
      if (p >= q || ligne(p) === ligne(q) || colonne(p) === colonne(q) || b.value[p] !== -1 || b.value[q] !== -1) continue;
      const vu = new Set([...b.aligned21[p], ...b.aligned21[q]].map((c) => b.value[c]));
      const v = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((x) => !vu.has(x));
      if (v !== undefined && !trouve) trouve = [p, q, v];
    }
  }
  assert.ok(trouve, 'deux cases vides de la même région, sans ligne ni colonne commune, et un chiffre libre');
  const [p, q, v] = trouve;
  b.setValue(p, v);
  assert.equal(b.isEarmarkPossible(q, v), false, 'ce chiffre n\'est plus possible dans le reste de la région');
  b.setValue(q, v);
  assert.deepEqual([...b.broken].sort((x, y) => x - y), [p, q].sort((x, y) => x - y));
  b.setValue(q, null);
  assert.equal(b.broken.size, 0);
});

test('plateau classique : mêmes cases alignées et mêmes blocs qu\'avant (aucune régression)', () => {
  const b = new SudokuBoard();
  assert.equal(b.isJigsaw, false);
  assert.equal(b.regions, REGIONS_CLASSIQUES);
  assert.ok(b.aligned21.every((a) => a.length === 21));
  assert.deepEqual([...b.blocks[4]].sort((x, y) => x - y), [30, 31, 32, 39, 40, 41, 48, 49, 50]);
});

test('cases alignées d\'un plateau Jigsaw : la case, sa ligne, sa colonne et toute sa région, sans doublon', () => {
  const b = SudokuGame.fromJigsaw(DIFFICULTY.EASY, 11).board;
  for (let p = 0; p < 81; p++) {
    const a = b.aligned21[p];
    assert.equal(a[0], p);
    assert.equal(new Set(a).size, a.length, 'sans doublon');
    for (let q = 0; q < 81; q++) {
      const voisine = q === p || ligne(q) === ligne(p) || colonne(q) === colonne(p) || b.regions[q] === b.regions[p];
      assert.equal(a.includes(q), voisine, `case ${p}, voisine ${q}`);
    }
  }
});

test('partie Jigsaw : la solution complète gagne la partie', () => {
  const g = SudokuGame.fromJigsaw(DIFFICULTY.EASY, 7);
  let fini = 0;
  g.on('completed', () => { fini++; });
  assert.equal(g.difficulty, DIFFICULTY.EASY);
  for (const p of videDe(g)) g.insert(p, g.board.solution[p]);
  assert.equal(g.board.isComplete(), true);
  assert.equal(fini, 1);
});

test('partie Jigsaw : poser un chiffre retire ce chiffre des notes de toute la région, pas seulement du carré', () => {
  let essai = null;
  for (let graine = 1; graine <= 40 && !essai; graine++) {
    const g = SudokuGame.fromJigsaw(DIFFICULTY.EASY, graine);
    const b = g.board;
    g.enableAllEarmarkPossibilities();
    for (let bl = 0; bl < 9 && !essai; bl++) {
      for (const p of b.blocks[bl]) for (const q of b.blocks[bl]) {
        if (p === q || ligne(p) === ligne(q) || colonne(p) === colonne(q) || b.value[p] !== -1 || b.value[q] !== -1) continue;
        if (!essai && b.isEarmarkEnabled(q, b.solution[p])) essai = [g, p, q, b.solution[p]];
      }
    }
  }
  assert.ok(essai, 'une partie, deux cases d\'une même région sans ligne ni colonne commune, et une note à retirer');
  const [g, p, q, v] = essai;
  g.insertAndDisableAlignedEarmarks(p, v);
  assert.equal(g.board.isEarmarkEnabled(q, v), false, 'la case de la même région n\'a plus la note');
});

test('sauvegarde Jigsaw : les régions sont enregistrées, la partie se relit à l\'identique ; la sauvegarde classique n\'a pas de champ « regions »', () => {
  const g = SudokuGame.fromJigsaw(DIFFICULTY.HARD, 99);
  const [p] = videDe(g);
  g.insert(p, g.board.solution[p]);
  g.code = canonicalCode(makeCode(DIFFICULTY.HARD, 99, MODE.JIGSAW));
  const json = JSON.parse(JSON.stringify(g.toJson(12)));
  assert.match(json.regions, /^[0-8]{81}$/);
  const h = SudokuGame.fromJson(json);
  assert.ok(h.board.isJigsaw);
  assert.equal(h.board.regions.join(''), json.regions);
  assert.deepEqual([...h.board.value], [...g.board.value]);
  assert.deepEqual([...h.board.solution], [...g.board.solution]);
  assert.equal(h.difficulty, DIFFICULTY.HARD);
  assert.equal(h.code, g.code);
  const classique = SudokuGame.fromGenerator(DIFFICULTY.EASY, 21).toJson(0);
  assert.ok(!('regions' in classique), 'format de sauvegarde classique inchangé');
});

test('sauvegarde : régions invalides refusées (longueur, chiffres, régions pas d\'un seul tenant ou pas de neuf cases)', () => {
  const g = SudokuGame.fromJigsaw(DIFFICULTY.EASY, 3);
  const json = JSON.parse(JSON.stringify(g.toJson(0)));
  const regions = json.regions;
  for (const mauvaise of ['', regions.slice(1), regions + '0', '9'.repeat(81), 'x'.repeat(81), '0'.repeat(81), regions.replace(/0/, '1'), 12]) {
    assert.throws(() => SudokuBoard.fromJson({ ...json, regions: mauvaise }), SudokuError, String(mauvaise).slice(0, 20));
  }
  // des carrés de 3×3 enregistrés comme régions : on retombe sur le plateau classique
  const carres = REGIONS_CLASSIQUES.join('');
  assert.equal(SudokuBoard.fromJson({ ...SudokuGame.fromGenerator(DIFFICULTY.EASY, 5).toJson(0), regions: carres }).isJigsaw, false);
});

test('partie Jigsaw ambiguë ou impossible refusée au chargement', () => {
  const g = SudokuGame.fromJigsaw(DIFFICULTY.EASY, 3);
  const json = JSON.parse(JSON.stringify(g.toJson(0)));
  const vide = json.cells.map((c) => ({ ...c, value: 0, fixed: false, earmarks: [] }));
  assert.throws(() => SudokuGame.fromJson({ ...json, cells: vide }), (e) => e instanceof SudokuError, 'grille sans aucun indice : plusieurs solutions');
  const faux = JSON.parse(JSON.stringify(json));
  const donnees = faux.cells.filter((c) => c.fixed);
  let paire = null;
  for (const a of donnees) for (const b of donnees) if (!paire && a !== b && a.position[0] === b.position[0] && a.value !== b.value) paire = [a, b];
  assert.ok(paire, 'deux indices dans une même ligne');
  paire[1].value = paire[0].value;   // le même chiffre deux fois dans une ligne : grille impossible
  assert.throws(() => SudokuGame.fromJson(faux), SudokuError);
});

test('session : une partie Jigsaw se crée, porte son code, se sauvegarde et se reprend', () => {
  const st = memoire();
  const a = new SudokuSession({ storage: st });
  const g = a.newGame(DIFFICULTY.MEDIUM, 31337, MODE.JIGSAW);
  assert.ok(g.board.isJigsaw);
  assert.deepEqual([parseCode(g.code).mode, parseCode(g.code).difficulty, parseCode(g.code).seed], [MODE.JIGSAW, DIFFICULTY.MEDIUM, 31337]);
  const [p] = videDe(g);
  a.setValue(p, g.board.solution[p]);
  a.saveGame();
  assert.equal(a.savedInfo().mode, MODE.JIGSAW);
  const b = new SudokuSession({ storage: st });
  assert.ok(b.resume());
  assert.ok(b.game.board.isJigsaw);
  assert.equal(b.game.code, g.code);
  assert.deepEqual([...b.game.board.value], [...g.board.value]);
});

test('session : coller un code Jigsaw lance la même grille ; un code classique lance une grille classique', () => {
  const a = new SudokuSession({ storage: memoire() });
  const code = makeCode(DIFFICULTY.HARD, 777, MODE.JIGSAW);
  const g = a.startFrom(code);
  assert.ok(g.board.isJigsaw);
  assert.equal(g.difficulty, DIFFICULTY.HARD);
  const h = new SudokuSession({ storage: memoire() }).startFrom(code);
  assert.deepEqual([...h.board.value], [...g.board.value]);
  assert.deepEqual([...h.board.regions], [...g.board.regions]);
  const c = new SudokuSession({ storage: memoire() }).startFrom(makeCode(DIFFICULTY.EASY, 21));
  assert.equal(c.board.isJigsaw, false);
});

test('session : grille du jour Jigsaw distincte de la grille du jour classique, et stable', () => {
  const a = new SudokuSession({ storage: memoire() });
  const j1 = a.startDaily(DIFFICULTY.EASY, '2026-11-08', MODE.JIGSAW);
  const j2 = new SudokuSession({ storage: memoire() }).startDaily(DIFFICULTY.EASY, '2026-11-08', MODE.JIGSAW);
  const c = new SudokuSession({ storage: memoire() }).startDaily(DIFFICULTY.EASY, '2026-11-08');
  assert.equal(j1.code, j2.code);
  assert.notEqual(j1.code, c.code);
  assert.deepEqual([...j1.board.value], [...j2.board.value]);
});

test('surbrillance : « région » surligne toute la région d\'une grille Jigsaw', () => {
  const s = new SudokuSession({ storage: memoire() });
  const g = s.newGame(DIFFICULTY.EASY, 11, MODE.JIGSAW);
  s.setPreference('highlightBlock', true);
  const [p] = videDe(g);
  const { cells } = s.highlights(p);
  for (const q of g.board.blocks[g.board.regions[p]]) assert.ok(cells.has(q), `case ${q} de la région`);
  s.setPreference('highlightBlock', false);
  assert.equal(s.highlights(p).cells.size, 0);
});
