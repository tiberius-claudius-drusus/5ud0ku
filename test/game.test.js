import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SudokuBoard, SudokuError, idx } from '../src/board.js';
import { SudokuGame, STACK_ACTION } from '../src/game.js';
import { DIFFICULTY } from '../src/generator.js';

// Puzzle QQWing de référence (facile) : 81 caractères, « . » = vide
const EASY = '.6.8.93245...2..8....1.69...3.2..8.........6.....3..1.8..4..2.6..6.93.5.......1..'.padEnd(81, '.');

function horloge() {
  let t = 0;
  const f = () => t;
  f.avance = (s) => { t += s * 1000; };
  return f;
}

function partie(options) {
  return SudokuGame.fromString(EASY, options);
}

// première case vide et un chiffre qui n'y entre pas en conflit
function caseVide(game) {
  for (let p = 0; p < 81; p++) if (game.board.value[p] === -1) return p;
  throw new Error('plateau plein');
}

test('un plateau lu depuis une chaîne est résolu : solution unique et difficulté', () => {
  const g = partie();
  assert.equal(g.board.totalFixed, [...EASY].filter((c) => c !== '.').length);
  for (let p = 0; p < 81; p++) assert.ok(g.board.solution[p] >= 0 && g.board.solution[p] <= 8);
  assert.ok([1, 2, 3, 4].includes(g.difficulty));
});

test('une grille entièrement donnée n\'est pas un puzzle : refusée par une SudokuError, pas par une exception brute (audit F1)', () => {
  const g = partie();
  const pleine = g.board.solution;
  const texte = [...pleine].map((v) => String(v + 1)).join('');
  assert.throws(() => SudokuGame.fromString(texte), (e) => e instanceof SudokuError && e.message === 'Invalid Puzzle');
  assert.throws(() => SudokuGame.fromAscii(SudokuBoard.fromString(texte).fixedToAscii()), SudokuError);
});

test('une chaîne trop courte ou un puzzle contradictoire sont refusés', () => {
  assert.throws(() => SudokuGame.fromString('123'), SudokuError);
  const contradictoire = '11' + '.'.repeat(79);
  assert.throws(() => SudokuGame.fromString(contradictoire), SudokuError);
  assert.throws(() => SudokuGame.fromString('.'.repeat(81)), SudokuError); // plusieurs solutions
});

test('insérer, effacer, annuler et refaire', () => {
  const g = partie();
  const p = caseVide(g);
  const v = g.board.solution[p];
  g.insert(p, v);
  assert.equal(g.board.value[p], v);
  assert.ok(g.canUndo && !g.canRedo);
  g.undo();
  assert.equal(g.board.value[p], -1);
  assert.ok(!g.canUndo && g.canRedo);
  g.redo();
  assert.equal(g.board.value[p], v);
  g.remove(p);
  assert.equal(g.board.value[p], -1);
  g.undo();
  assert.equal(g.board.value[p], v);
});

test('une nouvelle action efface ce qui pouvait être refait', () => {
  const g = partie();
  const p = caseVide(g);
  g.insert(p, g.board.solution[p]);
  g.undo();
  assert.ok(g.canRedo);
  g.enableEarmark(p, 0);
  assert.ok(!g.canRedo);
});

test('les notes : activer, désactiver, tout effacer, annuler', () => {
  const g = partie();
  const p = caseVide(g);
  g.enableEarmark(p, 2);
  g.enableEarmark(p, 5);
  assert.ok(g.board.isEarmarkEnabled(p, 2) && g.board.isEarmarkEnabled(p, 5));
  assert.equal(g.board.totalEarmarks, 2);
  g.disableAllEarmarks(p);
  assert.ok(!g.board.hasEarmarks(p));
  g.undo();
  assert.ok(g.board.isEarmarkEnabled(p, 2) && g.board.isEarmarkEnabled(p, 5));
  g.undo();
  g.undo();
  assert.equal(g.board.totalEarmarks, 0);
});

test('poser un chiffre efface les notes de la case ; avec nettoyage, aussi celles des cases alignées', () => {
  const g = partie();
  const p = caseVide(g);
  const v = g.board.solution[p];
  g.enableEarmark(p, 0);
  // une case alignée vide, avec une note sur v
  const q = [...Array(81).keys()].find((k) => k !== p && g.board.value[k] === -1 && (Math.floor(k / 9) === Math.floor(p / 9)));
  g.enableEarmark(q, v);
  g.insertAndDisableAlignedEarmarks(p, v);
  assert.ok(!g.board.hasEarmarks(p));
  assert.ok(!g.board.isEarmarkEnabled(q, v));
  assert.equal(g.currentAction, STACK_ACTION.NONE);
  g.undo();
  assert.equal(g.board.value[p], -1);
  assert.ok(g.board.isEarmarkEnabled(q, v) && g.board.isEarmarkEnabled(p, 0));
});

test('toutes les possibilités : une action annulable, sans effet quand tout est déjà noté', () => {
  const g = partie();
  g.enableAllEarmarkPossibilities();
  const n = g.board.totalEarmarks;
  assert.ok(n > 0);
  const taille = g.stack.length;
  g.enableAllEarmarkPossibilities();
  assert.equal(g.stack.length, taille);
  g.undo();
  assert.equal(g.board.totalEarmarks, 0);
  g.redo();
  assert.equal(g.board.totalEarmarks, n);
});

test('conflits : deux chiffres identiques dans une unité sont marqués, puis libérés', () => {
  const g = partie();
  const ligne = (r) => [...Array(9).keys()].map((c) => idx(r, c));
  // cherche une ligne avec deux cases vides et un chiffre déjà donné sur cette ligne
  for (let r = 0; r < 9; r++) {
    const vides = ligne(r).filter((p) => g.board.value[p] === -1);
    const donnes = ligne(r).filter((p) => g.board.value[p] !== -1);
    if (vides.length >= 2 && donnes.length) {
      const doublon = g.board.value[donnes[0]];
      g.insert(vides[0], doublon);
      assert.ok(g.board.broken.has(vides[0]) && g.board.broken.has(donnes[0]));
      assert.ok(!g.board.isComplete());
      g.undo();
      assert.equal(g.board.broken.size, 0);
      // trois chiffres identiques, puis remplacement d'un seul : plus de conflit résiduel sur la case remplacée
      g.insert(vides[0], doublon);
      g.insert(vides[1], doublon);
      assert.ok(g.board.broken.has(vides[1]));
      const autre = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((v) => v !== doublon && g.board.isEarmarkPossible(vides[1], v));
      g.insert(vides[1], autre);
      assert.ok(!g.board.broken.has(vides[1]) || g.board.inRow[autre * 9 + r] > 1 || g.board.inCol[autre * 9 + (vides[1] % 9)] > 1);
      return;
    }
  }
  assert.fail('aucune ligne de test');
});

test('compléter la grille avec la solution déclenche « completed »', () => {
  const g = partie();
  let fini = 0;
  g.on('completed', () => { fini++; });
  g.autoComplete();
  assert.equal(fini, 1);
  assert.ok(g.board.isComplete());
  assert.equal(g.playOrder().length, 81 - g.board.totalFixed);
});

test('réinitialiser retire tout ce que le joueur a ajouté, en une action annulable', () => {
  const g = partie();
  const p = caseVide(g);
  g.insert(p, g.board.solution[p]);
  g.enableEarmark(caseVide(g) === p ? p + 1 : caseVide(g), 0);
  g.reset();
  assert.ok(g.board.isEmpty());
  g.undo();
  assert.equal(g.board.value[p], g.board.solution[p]);
});

test('événements : value-changed, earmark-changed, action-completed', () => {
  const g = partie();
  const log = [];
  g.on('value-changed', (p, a, b) => log.push(['v', p, a, b]));
  g.on('earmark-changed', (p, n, e) => log.push(['e', p, n, e]));
  g.on('action-completed', (a) => log.push(['a', a]));
  const p = caseVide(g);
  g.enableEarmark(p, 1);
  g.insert(p, g.board.solution[p]);
  assert.deepEqual(log[0], ['e', p, 1, true]);
  assert.deepEqual(log[1], ['a', STACK_ACTION.ENABLE_EARMARK]);
  assert.deepEqual(log[2], ['e', p, 1, false]);
  assert.equal(log[3][0], 'v');
  assert.deepEqual(log[4], ['a', STACK_ACTION.INSERT]);
});

test('minuteur : temps joué, pause, reprise', () => {
  const now = horloge();
  const g = partie({ now });
  now.avance(10);
  assert.equal(g.totalTimePlayed(), 10);
  g.togglePause();
  assert.ok(g.paused);
  now.avance(30);
  assert.equal(g.totalTimePlayed(), 10);
  g.togglePause();
  now.avance(5);
  assert.equal(g.totalTimePlayed(), 15);
});

test('sauvegarde JSON : aller-retour fidèle (valeurs, données, notes, temps)', () => {
  const now = horloge();
  const g = partie({ now });
  const p = caseVide(g);
  g.insert(p, g.board.solution[p]);
  g.enableEarmark(p + 1 < 81 && g.board.value[p + 1] === -1 ? p + 1 : caseVide(g), 3);
  now.avance(42);
  const json = JSON.parse(JSON.stringify(g.toJson()));
  assert.equal(json.cells.length, 81);
  assert.equal(json.time_elapsed, 42);
  const h = SudokuGame.fromJson(json, { now: horloge() });
  assert.deepEqual([...h.board.value], [...g.board.value]);
  assert.deepEqual([...h.board.fixed], [...g.board.fixed]);
  assert.deepEqual([...h.board.earmarks], [...g.board.earmarks]);
  assert.equal(h.totalTimePlayed(), 42);
  assert.equal(h.board.totalFilled, g.board.totalFilled);
});

test('sauvegarde JSON corrompue refusée', () => {
  assert.throws(() => SudokuBoard.fromJson('{pas du json'), SudokuError);
  assert.throws(() => SudokuBoard.fromJson({ time_elapsed: 5, cells: [{ position: [9, 0], value: 1, fixed: true, earmarks: [] }] }), SudokuError);
  assert.throws(() => SudokuBoard.fromJson({ time_elapsed: 5, cells: [{ position: [0, 0], value: 12, fixed: true, earmarks: [] }] }), SudokuError);
  assert.throws(() => SudokuBoard.fromJson({ time_elapsed: -5, cells: [] }), SudokuError);
  assert.throws(() => SudokuBoard.fromJson({ time_elapsed: 5, cells: [{ position: [0, 0], value: 0, fixed: false, earmarks: [3, 3] }] }), SudokuError);
});

test('partage « # » : aller-retour, même puzzle', () => {
  const g = partie();
  const code = g.board.fixedToAscii();
  assert.ok(code.startsWith('#'));
  const h = SudokuGame.fromAscii(code);
  assert.deepEqual([...h.board.value], [...g.board.value]);
  assert.deepEqual([...h.board.solution], [...g.board.solution]);
  assert.throws(() => SudokuBoard.fromAscii('pas un code'), SudokuError);
  assert.throws(() => SudokuBoard.fromAscii(code.slice(0, -1)), SudokuError);
});

test('génération par graine : même graine, même partie', () => {
  const a = SudokuGame.fromGenerator(DIFFICULTY.EASY, 5);
  const b = SudokuGame.fromGenerator(DIFFICULTY.EASY, 5);
  assert.deepEqual([...a.board.value], [...b.board.value]);
  assert.equal(a.difficulty, DIFFICULTY.EASY);
});

test('ordre de jeu d\'une partie chargée : complété au hasard avec les cases déjà remplies', () => {
  const g = partie();
  const ps = [];
  for (let p = 0; p < 81 && ps.length < 3; p++) if (g.board.value[p] === -1) ps.push(p);
  for (const p of ps) g.insert(p, g.board.solution[p]);
  const h = SudokuGame.fromJson(g.toJson());
  assert.equal(h.playOrder().length, 81 - h.board.totalFixed);
});

test('valeur d\'essai : notes conservées, annulable, confirmable', () => {
  const g = partie();
  const p = caseVide(g);
  const v = g.board.solution[p];
  g.enableEarmark(p, v);
  g.enableEarmark(p, (v + 1) % 9);
  g.insertTest(p, v);
  assert.equal(g.board.value[p], v);
  assert.equal(g.board.test[p], 1);
  assert.ok(g.board.isEarmarkEnabled(p, v) && g.board.isEarmarkEnabled(p, (v + 1) % 9), 'les notes restent');
  g.undo();
  assert.equal(g.board.value[p], -1);
  assert.equal(g.board.test[p], 0);
  g.redo();
  assert.equal(g.board.test[p], 1);
  g.confirmTest(p);
  assert.equal(g.board.test[p], 0);
  assert.equal(g.board.value[p], v);
  assert.ok(!g.board.hasEarmarks(p), 'la confirmation efface les notes');
  g.undo();
  assert.equal(g.board.test[p], 1);
  assert.ok(g.board.isEarmarkEnabled(p, v), 'annuler la confirmation rend l\'essai et ses notes');
});

test('valeur d\'essai : sauvegardée et relue, effacée par remove, jamais sur une case donnée', () => {
  const g = partie();
  const p = caseVide(g);
  g.enableEarmark(p, g.board.solution[p]);
  g.insertTest(p, g.board.solution[p]);
  const h = SudokuGame.fromJson(JSON.parse(JSON.stringify(g.toJson())));
  assert.equal(h.board.test[p], 1);
  g.remove(p);
  assert.equal(g.board.test[p], 0);
  const donnee = [...Array(81).keys()].find((k) => g.board.isFixed(k));
  g.board.setValue(donnee, g.board.value[donnee], true);
  assert.equal(g.board.test[donnee], 0);
});

test('une valeur d\'essai ne fait pas gagner : la grille pleine n\'est terminée qu\'une fois toutes les valeurs confirmées', () => {
  const g = partie();
  let victoires = 0;
  g.on('completed', () => { victoires++; });
  const vides = [...Array(81).keys()].filter((p) => g.board.value[p] === -1);
  const derniere = vides.pop();
  for (const p of vides) g.insert(p, g.board.solution[p]);
  assert.equal(victoires, 0);
  // la dernière case en valeur d'essai : grille pleine et juste, mais pas de victoire
  g.enableEarmark(derniere, g.board.solution[derniere]);
  g.insertTest(derniere, g.board.solution[derniere]);
  assert.equal(g.board.totalFilled, 81);
  assert.equal(g.board.broken.size, 0);
  assert.ok(!g.board.isComplete(), 'pas complète tant qu\'une valeur d\'essai reste');
  assert.ok(!g.finished);
  assert.equal(victoires, 0);
  // la confirmer achève la grille
  g.confirmTest(derniere);
  assert.equal(victoires, 1);
  assert.ok(g.finished && g.board.isComplete());
  // tout en essais : jamais de victoire, même plein
  const h = partie();
  let v2 = 0;
  h.on('completed', () => { v2++; });
  for (const p of [...Array(81).keys()].filter((k) => h.board.value[k] === -1)) { h.enableEarmark(p, h.board.solution[p]); h.insertTest(p, h.board.solution[p]); }
  assert.equal(h.board.totalFilled, 81);
  assert.equal(v2, 0);
  assert.ok(!h.finished);
});

test('réinitialiser remet le chronomètre à zéro (il repart), y compris le temps d\'une partie reprise', () => {
  const now = horloge();
  const g = partie({ now });
  const p = caseVide(g);
  now.avance(90);
  g.insert(p, g.board.solution[p]);
  assert.equal(g.totalTimePlayed(), 90);
  g.reset();
  assert.equal(g.totalTimePlayed(), 0, 'temps remis à zéro');
  now.avance(5);
  assert.equal(g.totalTimePlayed(), 5, 'le chronomètre repart');
  g.undo();
  assert.equal(g.board.value[p], g.board.solution[p], 'annuler rend la grille ET le temps (R1)');
  assert.equal(g.totalTimePlayed(), 95);
  // en pause : le temps reste à zéro jusqu'à la reprise
  g.togglePause();
  g.reset();
  now.avance(30);
  assert.equal(g.totalTimePlayed(), 0);
  // partie reprise d'une sauvegarde : son temps est effacé aussi
  const h = SudokuGame.fromJson({ ...g.toJson(), time_elapsed: 200 }, { now });
  assert.equal(h.totalTimePlayed(), 200);
  h.reset();
  assert.equal(h.totalTimePlayed(), 0);
});

test('Recommencer puis Annuler rend le temps ; Rétablir le remet à zéro (R1)', () => {
  const now = horloge();
  const g = partie({ now });
  const p = caseVide(g);
  now.avance(600);
  g.insert(p, g.board.solution[p]);
  g.reset();
  assert.equal(g.totalTimePlayed(), 0);
  now.avance(5);
  g.undo();
  assert.equal(g.totalTimePlayed(), 605, 'le temps réel joué est conservé');
  g.redo();
  assert.equal(g.totalTimePlayed(), 0, 'rétablir remet le chrono à zéro');
  now.avance(3);
  g.undo();
  assert.equal(g.totalTimePlayed(), 608);
});

test('réinitialiser retire aussi les valeurs d\'essai', () => {
  const g = partie();
  const p = caseVide(g);
  g.enableEarmark(p, g.board.solution[p]);
  g.insertTest(p, g.board.solution[p]);
  g.reset();
  assert.equal(g.board.test[p], 0);
  g.undo();
  assert.equal(g.board.test[p], 1);
});
