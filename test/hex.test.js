import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SudokuSession } from '../src/session.js';
import { SudokuGame } from '../src/game.js';
import { SudokuBoard, SudokuError, CHIFFRES } from '../src/board.js';
import { DIFFICULTY } from '../src/generator.js';
import { MODE, makeCode, parseCode, canonicalCode, dailyCode, puzzleFromCode, memeGrille } from '../src/code.js';
import { REGIONS_16, moteurDe } from '../src/sudoku_n.js';
import { REGIONS_CLASSIQUES } from '../src/jigsaw.js';
import { byDifficulty, modeOf } from '../src/stats.js';

// Version 16×16 (2.0.0) : moteur n×n, plateau, partie, codes, session. Chiffres affichés 0 à 9 puis A à F (valeurs internes 0..15).

function memoire() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}
const empreinte = (g) => createHash('sha1').update(g.board.fixedToString()).digest('hex').slice(0, 16);

test('plateau 16×16 : taille, régions de 4×4, cases alignées (40), chiffres 0 à F', () => {
  const b = new SudokuBoard(REGIONS_16);
  assert.deepEqual([b.n, b.N, b.isHex, b.isJigsaw, b.supportsHash], [16, 256, true, false, false]);
  assert.equal(b.blocks.length, 16);
  assert.ok(b.blocks.every((c) => c.length === 16));
  assert.ok(b.aligned21.every((a, p) => a.length === 40 && a[0] === p), 'case + 15 de la ligne + 15 de la colonne + 9 du bloc hors ligne/colonne');
  assert.equal(CHIFFRES, '0123456789ABCDEF');
  assert.throws(() => b.fixedToAscii(), SudokuError, 'le partage « # » est classique seulement');
  // même chiffre deux fois dans un bloc de 4×4 (lignes et colonnes différentes) : conflit ; case voisine d'un autre bloc : non
  b.insert(0, 15); b.insert(17, 15);
  assert.deepEqual([...b.broken].sort((x, y) => x - y), [0, 17]);
  assert.equal(b.isEarmarkPossible(34, 15), false, 'case de la ligne 2, bloc 0 : le 15 est déjà dans le bloc, donc impossible');
  assert.equal(b.isEarmarkPossible(200, 15), true, 'ligne 12, colonne 8, bloc 14 : le 15 de la case 0 ne la touche pas');
  b.insert(17, 3);
  assert.equal(b.broken.size, 0);
});

test('plateau classique : inchangé (9×9, pas de champ « size » dans la sauvegarde)', () => {
  const b = new SudokuBoard();
  assert.deepEqual([b.n, b.N, b.isHex, b.supportsHash], [9, 81, false, true]);
  assert.equal(b.toJson(0).size, undefined);
  assert.equal(b.toJson(0).cells.length, 81);
  assert.equal(b.regions, REGIONS_CLASSIQUES);
});

for (const [niveau, graine, indices, sha] of [[1, 12346, 95, 'd111cb2973b5e4c9'], [2, 12347, 95, 'c09d5128ed953426'], [3, 12348, 90, 'dcb9377824a90bd8'], [4, 12349, 93, '09069419f76b1895']]) {
  test(`16×16 niveau ${niveau} : grille de référence figée (règle d'or), solution unique, niveau mesuré`, () => {
    const g = SudokuGame.fromHex(niveau, graine);
    assert.equal(g.board.totalFixed, indices);
    assert.equal(empreinte(g), sha, 'si ceci casse, l\'algorithme du 16×16 a changé : créer la version 2 des codes, garder la 1');
    assert.equal(g.board.difficultyCategory, niveau);
    // la solution est valable : 16 chiffres différents dans chaque ligne, colonne et bloc
    const s = g.board.solution;
    const unites = [...g.board.rows, ...g.board.cols, ...g.board.blocks];
    assert.ok(unites.every((u) => new Set(Array.from(u, (p) => s[p])).size === 16));
    // les indices sont ceux de la solution, et le solveur indépendant (comptage avec hypothèses) trouve une seule solution
    for (let p = 0; p < 256; p++) if (g.board.isFixed(p)) assert.equal(g.board.value[p], s[p]);
    const m = moteurDe(4);
    assert.equal(m.compterEssais(m.copie(m.etatInitial(g.board.fixedValues())), 2), 1);
    // même graine, même grille
    assert.equal(empreinte(SudokuGame.fromHex(niveau, graine)), sha);
  });
}

test('codes 16×16 : symbole de difficulté 9 à 12, version propre, aucun recouvrement avec le classique et Jigsaw', () => {
  for (let d = 1; d <= 4; d++) {
    const c = makeCode(d, 4242, MODE.HEX);
    assert.deepEqual(parseCode(c), { version: 1, difficulty: d, seed: 4242, mode: MODE.HEX });
    assert.notEqual(c, makeCode(d, 4242, MODE.JIGSAW));
    assert.notEqual(c, makeCode(d, 4242, MODE.CLASSIQUE));
  }
  assert.equal(parseCode(makeCode(1, 5, MODE.CLASSIQUE)).mode, MODE.CLASSIQUE);
  assert.equal(parseCode(makeCode(1, 5, MODE.JIGSAW)).mode, MODE.JIGSAW);
  // faute de frappe : refusée ; version inconnue : refusée
  const c = makeCode(2, 777, MODE.HEX);
  const faute = c.slice(0, 5) + (c[5] === '0' ? '1' : '0') + c.slice(6);
  assert.equal(parseCode(faute), null);
  assert.equal(dailyCode('2026-11-09', 2, MODE.HEX), dailyCode('2026-11-09', 2, MODE.HEX));
  assert.notEqual(dailyCode('2026-11-09', 2, MODE.HEX), dailyCode('2026-11-09', 2, MODE.JIGSAW));
  const g = puzzleFromCode(c);
  assert.equal(g.mode, MODE.HEX);
  assert.equal(g.puzzle.length, 256);
  assert.equal(g.regions, REGIONS_16);
});

test('sauvegarde 16×16 : champ size, aller-retour complet (valeurs, notes, essai), refus des tailles et valeurs invalides', () => {
  const g = SudokuGame.fromHex(DIFFICULTY.EASY, 777);
  const vides = [...Array(256).keys()].filter((p) => g.board.value[p] === -1);
  g.insert(vides[0], g.board.solution[vides[0]]);
  g.insertTest(vides[1], 15);
  g.board.enableEarmark(vides[2], 15);
  g.board.enableEarmark(vides[2], 0);
  const json = JSON.parse(JSON.stringify(g.toJson(12)));
  assert.equal(json.size, 16);
  assert.equal(json.regions, undefined);
  assert.equal(json.cells.length, 256);
  const h = SudokuGame.fromJson(json);
  assert.equal(h.board.isHex, true);
  assert.equal(h.board.value[vides[0]], g.board.value[vides[0]]);
  assert.equal(h.board.test[vides[1]], 1);
  assert.deepEqual([h.board.isEarmarkEnabled(vides[2], 15), h.board.isEarmarkEnabled(vides[2], 0)], [true, true]);
  assert.deepEqual(h.board.solution, g.board.solution);
  assert.throws(() => SudokuBoard.fromJson({ ...json, size: 12 }), SudokuError);
  assert.throws(() => SudokuBoard.fromJson({ ...json, regions: '0'.repeat(81) }), SudokuError);
  const trop = JSON.parse(JSON.stringify(json));
  trop.cells[0].value = 17;
  assert.throws(() => SudokuBoard.fromJson(trop), SudokuError);
  // un 9×9 refuse une valeur de 16×16
  const neuf = new SudokuBoard().toJson(0);
  neuf.cells[0].value = 12;
  assert.throws(() => SudokuBoard.fromJson(neuf), SudokuError);
});

test('session 16×16 : nouvelle partie, code, reprise, meilleur temps et statistiques séparés par mode', () => {
  const stockage = memoire();
  const s = new SudokuSession({ storage: stockage });
  s.setSelectedMode(MODE.HEX);
  assert.equal(s.selectedMode, MODE.HEX);
  const g = s.newGame(DIFFICULTY.EASY, 31337, MODE.HEX);
  assert.equal(g.board.isHex, true);
  assert.deepEqual(parseCode(g.code), { version: 1, difficulty: 1, seed: 31337, mode: MODE.HEX });
  assert.equal(s.savedInfo().mode, MODE.HEX);
  // coller le code redonne la même grille
  const h = s.startFrom(g.code);
  assert.equal(empreinte(h), empreinte(g));
  // une partie 16×16 gagnée : meilleur temps du 16×16 seulement, statistiques taguées
  h.autoComplete();
  assert.equal(h.finished, true);
  s.completeGame?.(h);
  const s2 = new SudokuSession({ storage: stockage });
  assert.deepEqual(Object.keys(s2.highscoresOf(MODE.HEX)), ['1']);
  assert.deepEqual(s2.highscoresOf(MODE.CLASSIQUE), {});
  assert.deepEqual(s2.highscoresOf(MODE.JIGSAW), {});
  assert.equal(s2.selectedMode, MODE.HEX);
  assert.equal(byDifficulty(s2.stats.games, MODE.HEX).length, 1);
  assert.equal(byDifficulty(s2.stats.games, MODE.CLASSIQUE).length, 0);
  assert.equal(modeOf(s2.stats.games.at(-1)), MODE.HEX);
});

test('surbrillance 16×16 : « bloc » éclaire le carré de 4×4, la ligne et la colonne font 16 cases', () => {
  const s = new SudokuSession({ storage: memoire() });
  s.setPreference('highlightRowColumn', true);
  s.setPreference('highlightBlock', true);
  s.newGame(DIFFICULTY.EASY, 55, MODE.HEX);
  const { cells } = s.highlights(0);
  assert.equal(cells.size, 40, 'la case 0 et ses 39 cases alignées');
  assert.ok(cells.has(15) && cells.has(240) && cells.has(17));
});

test('codes uniformes (2.1.1) : le premier symbole donne le type, la difficulté reste 1 à 4 ; les codes 16×16 d\'avant (« 01 » + difficulté 9 à C) désignent la même grille', () => {
  for (let d = 1; d <= 4; d++) {
    assert.equal(makeCode(d, 12345 + d, MODE.HEX).slice(0, 3), `21${d}`);
    assert.equal(makeCode(d, 12345 + d, MODE.HEXJIGSAW).slice(0, 3), `31${d}`);
    assert.equal(makeCode(d, 12345 + d, MODE.JIGSAW).slice(0, 3), `11${d}`);
    assert.equal(makeCode(d, 12345 + d, MODE.CLASSIQUE).slice(0, 3), `01${d}`);
  }
  // codes relevés avant 2.1.1 (difficulté décalée de 8 sous « 01 ») : graines 12346 et 12347, niveaux 1 et 2
  assert.deepEqual(parseCode('0190000C1T3A'), { version: 1, difficulty: 1, seed: 12346, mode: MODE.HEX });
  assert.deepEqual(parseCode('01A0000C1VVQ'), { version: 1, difficulty: 2, seed: 12347, mode: MODE.HEX });
  assert.equal(memeGrille('0190000C1T3A', makeCode(1, 12346, MODE.HEX)), true);
  assert.equal(memeGrille('0190000C1T3A', makeCode(1, 12346, MODE.JIGSAW)), false);
  assert.equal(memeGrille('0190000C1T3A', makeCode(2, 12346, MODE.HEX)), false);
  assert.equal(canonicalCode('0190000C1T3A'), '0190-000C-1T3A');
});

test('Recommencer une grille terminée (audit M1) : même grille, même code, régions comprises, sans régénération, pour les cinq types', () => {
  const stockage = memoire();
  for (const [mode, graine] of [[MODE.CLASSIQUE, 12345], [MODE.JIGSAW, 12345], [MODE.HEX, 12346], [MODE.HEXJIGSAW, 5001], [MODE.PETIT, 12345]]) {
    const s = new SudokuSession({ storage: stockage });
    const g = s.newGame(DIFFICULTY.EASY, graine, mode);
    // nouvelle session, comme après un rechargement : la grille vient de la sauvegarde, pas du cache de génération du moteur
    const s2 = new SudokuSession({ storage: stockage });
    assert.equal(s2.resume(), true, mode);
    const reprise = s2.game;
    reprise.autoComplete();
    assert.equal(reprise.finished, true, mode);
    const t0 = performance.now();
    const neuve = s2.restartFinished();
    assert.ok(performance.now() - t0 < 100, `${mode} : recommencer prend ${(performance.now() - t0).toFixed(0)} ms`);
    assert.equal(neuve.finished, false, mode);
    assert.equal(neuve.code, g.code, mode);
    assert.equal(neuve.board.fixedToString(), g.board.fixedToString(), mode);
    assert.deepEqual(neuve.board.regions, g.board.regions, mode);
    assert.deepEqual(neuve.board.solution, g.board.solution, mode);
    assert.equal(neuve.board.totalFilled, neuve.board.totalFixed, 'aucune valeur du joueur : seulement les indices');
    assert.equal(neuve.board.difficultyCategory, g.board.difficultyCategory, mode);
  }
});
