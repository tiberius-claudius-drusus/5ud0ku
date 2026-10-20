import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SudokuSession, DEFAULT_PREFERENCES } from '../src/session.js';
import { DIFFICULTY } from '../src/generator.js';

function memoire() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}

function horloge() {
  let t = 0;
  const f = () => t;
  f.avance = (s) => { t += s * 1000; };
  return f;
}

const videDe = (g) => [...Array(81).keys()].filter((p) => g.board.value[p] === -1);

test('valeurs par défaut du schéma de l\'amont', () => {
  const s = new SudokuSession();
  assert.deepEqual(s.preferences, DEFAULT_PREFERENCES);
  assert.equal(s.selectedDifficulty, DIFFICULTY.EASY);
});

test('les préférences sont gardées et relues ; une préférence inconnue est refusée', () => {
  const st = memoire();
  const a = new SudokuSession({ storage: st });
  a.setPreference('highlightBlock', true);
  a.setPreference('zoom', 'large');
  const b = new SudokuSession({ storage: st });
  assert.equal(b.preferences.highlightBlock, true);
  assert.equal(b.preferences.zoom, 'large');
  assert.throws(() => a.setPreference('inconnue', true));
  assert.throws(() => a.setPreference('zoom', 'enorme'));
  assert.throws(() => a.setPreference('highlightBlock', 'oui'));
  // le chronomètre n'est pas une option : toujours affiché, plus de préférence pour le masquer
  assert.ok(!('showTimer' in b.preferences));
  assert.throws(() => a.setPreference('showTimer', false));
});

test('sans stockage, ou stockage qui lève, la session fonctionne', () => {
  const casse = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); }, removeItem() { throw new Error('bloqué'); } };
  for (const st of [null, casse]) {
    const s = new SudokuSession({ storage: st });
    s.setPreference('highlightBlock', true);
    s.newGame(DIFFICULTY.EASY, 11);
    s.saveGame();
    assert.equal(s.resume(), false);
  }
});

test('stockage corrompu : valeurs par défaut', () => {
  const st = memoire();
  st.setItem('5ud0ku:prefs', '{pas du json');
  st.setItem('5ud0ku:data', '[1,2');
  const s = new SudokuSession({ storage: st });
  assert.deepEqual(s.preferences, DEFAULT_PREFERENCES);
});

test('une partie enregistrée se reprend à l\'identique', () => {
  const st = memoire();
  const a = new SudokuSession({ storage: st });
  const g = a.newGame(DIFFICULTY.EASY, 21);
  const [p, q] = videDe(g);
  a.setValue(p, g.board.solution[p]);
  a.toggleEarmark(q, 4);
  a.saveGame();
  const b = new SudokuSession({ storage: st });
  assert.ok(b.resume());
  assert.deepEqual([...b.game.board.value], [...g.board.value]);
  assert.deepEqual([...b.game.board.earmarks], [...g.board.earmarks]);
  assert.equal(b.game.difficulty, DIFFICULTY.EASY);
});

test('une partie gagnée est terminée pour de bon : plus d\'annuler, de pause ni de réinitialisation, victoire comptée une fois (audit G1)', () => {
  const st = memoire();
  const now = horloge();
  const a = new SudokuSession({ storage: st, gameOptions: { now } });
  const g = a.newGame(DIFFICULTY.EASY, 12345);
  let victoires = 0;
  g.on('action-completed', () => a.saveGame());   // comme app.js
  g.on('completed', () => { victoires++; a.completeGame(); });
  now.avance(60);
  for (const p of videDe(g)) a.setValue(p, g.board.solution[p]);
  assert.equal(victoires, 1);
  assert.ok(g.finished);
  assert.ok(!g.paused, 'terminée n\'est pas en pause');
  assert.equal(a.stats.games.length, 1);
  assert.equal(st.getItem('5ud0ku:savefile'), null);
  const temps = g.totalTimePlayed();
  // tout ce que le scénario de l'audit tentait après la victoire
  g.undo();
  g.redo();
  g.togglePause();
  g.startClock();
  g.reset();
  g.remove(0);
  g.enableEarmark(0, 1);
  g.enableAllEarmarkPossibilities();
  now.avance(300);
  assert.ok(g.board.isComplete(), 'la grille reste complète');
  assert.equal(g.totalTimePlayed(), temps, 'le temps final reste figé');
  assert.equal(st.getItem('5ud0ku:savefile'), null, 'aucune sauvegarde réécrite');
  assert.equal(a.savedInfo(), null);
  // rejouer une case ne peut plus rien déclencher
  const p = [...Array(81).keys()].find((k) => !g.board.isFixed(k));
  a.setValue(p, (g.board.solution[p] + 1) % 9);
  assert.equal(g.board.value[p], g.board.solution[p]);
  assert.equal(victoires, 1);
  assert.equal(a.completeGame(), false, 'une victoire ne se compte qu\'une fois');
  assert.equal(a.stats.games.length, 1);
});

test('sauvegarde illisible : « Continuer » disparaît, la sauvegarde est mise de côté (audit M2)', () => {
  const st = memoire();
  const a = new SudokuSession({ storage: st });
  const g = a.newGame(DIFFICULTY.EASY, 5);
  const [p] = videDe(g);
  a.setValue(p, g.board.solution[p]);
  const bonne = JSON.parse(st.getItem('5ud0ku:savefile'));
  // cases invalides : savedInfo les refuse dès l'accueil
  st.setItem('5ud0ku:savefile', JSON.stringify({ ...bonne, cells: [{ position: [12, 0], value: 1, fixed: true, earmarks: [] }] }));
  assert.equal(new SudokuSession({ storage: st }).savedInfo(), null);
  // grille sans solution unique (une seule donnée) : lisible mais injouable ; resume() échoue et met de côté
  const trop = { ...bonne, cells: bonne.cells.map((c, i) => ({ ...c, value: i === 0 ? 1 : 0, fixed: i === 0, earmarks: [] })) };
  st.setItem('5ud0ku:savefile', JSON.stringify(trop));
  const b = new SudokuSession({ storage: st });
  assert.ok(b.savedInfo(), 'relisible : le bouton est proposé');
  assert.equal(b.resume(), false);
  assert.equal(st.getItem('5ud0ku:savefile'), null, 'retirée');
  assert.notEqual(st.getItem('5ud0ku:savefile.illisible'), null, 'mise de côté pour examen');
  assert.equal(new SudokuSession({ storage: st }).savedInfo(), null, 'plus de bouton « Continuer »');
});

test('fermer l\'application depuis l\'accueil (sans « Continuer ») ne fait pas perdre la partie sauvegardée', () => {
  const st = memoire();
  const a = new SudokuSession({ storage: st });
  const g = a.newGame(DIFFICULTY.MEDIUM, 77);
  const [p] = videDe(g);
  a.setValue(p, g.board.solution[p]);
  a.saveGame();
  const sauvee = st.getItem('5ud0ku:savefile');
  assert.ok(sauvee);
  // l'application est rouverte : l'accueil, aucune partie en mémoire ; à la fermeture elle appelle saveGame()
  for (let i = 0; i < 3; i++) {
    const b = new SudokuSession({ storage: st });
    assert.ok(b.savedInfo());
    b.saveGame();                      // pagehide, visibilitychange, retour à l'accueil…
    assert.equal(st.getItem('5ud0ku:savefile'), sauvee, `ouverture ${i + 1} : la sauvegarde est intacte`);
  }
  const c = new SudokuSession({ storage: st });
  assert.ok(c.resume());
  assert.equal(c.game.board.value[p], g.board.solution[p]);
});

test('une grille intacte est sauvegardée dès le début : on la retrouve en rouvrant, sans avoir joué', () => {
  const st = memoire();
  const a = new SudokuSession({ storage: st });
  const g = a.newGame(DIFFICULTY.EASY, 3);
  assert.notEqual(st.getItem('5ud0ku:savefile'), null, 'enregistrée dès la création');
  const b = new SudokuSession({ storage: st });
  assert.ok(b.savedInfo());
  assert.ok(b.resume());
  assert.deepEqual([...b.game.board.value], [...g.board.value]);
  assert.equal(b.game.code, g.code);
  // une grille du jour, une grille collée, une grille saisie par son code : pareil
  for (const make of [(s) => s.startDaily(DIFFICULTY.EASY, '2026-10-20'), (s) => s.startFrom(g.board.fixedToAscii()), (s) => s.startFrom(g.code)]) {
    const c = new SudokuSession({ storage: st });
    const h = make(c);
    const d = new SudokuSession({ storage: st });
    assert.ok(d.resume());
    assert.deepEqual([...d.game.board.value], [...h.board.value]);
  }
  // une grille terminée, elle, n'est plus sauvegardée
  const e = new SudokuSession({ storage: st });
  const k = e.newGame(DIFFICULTY.EASY, 9);
  k.autoComplete();
  e.completeGame();
  assert.equal(st.getItem('5ud0ku:savefile'), null);
  assert.equal(new SudokuSession({ storage: st }).savedInfo(), null);
});

test('gardes : cases données intouchables, effacer une case puis ses notes, notes seulement sur case vide', () => {
  const a = new SudokuSession();
  const g = a.newGame(DIFFICULTY.EASY, 5);
  const donnee = [...Array(81).keys()].find((p) => g.board.isFixed(p));
  const avant = g.board.value[donnee];
  a.setValue(donnee, (avant + 1) % 9);
  a.clearCell(donnee);
  assert.equal(g.board.value[donnee], avant);
  const [p] = videDe(g);
  a.toggleEarmark(p, 0);
  assert.ok(g.board.isEarmarkEnabled(p, 0));
  a.clearCell(p);
  assert.ok(!g.board.hasEarmarks(p));
  a.setValue(p, g.board.solution[p]);
  a.toggleEarmark(p, 1);
  assert.ok(!g.board.isEarmarkEnabled(p, 1));
  a.clearCell(p);
  assert.equal(g.board.value[p], -1);
});

test('nettoyage automatique des notes selon la préférence', () => {
  const a = new SudokuSession();
  const g = a.newGame(DIFFICULTY.EASY, 8);
  a.setPreference('autocleanEarmarks', true);
  const vides = videDe(g);
  const p = vides[0];
  const v = g.board.solution[p];
  const q = vides.find((k) => k !== p && Math.floor(k / 9) === Math.floor(p / 9));
  a.toggleEarmark(q, v);
  a.setValue(p, v);
  assert.ok(!g.board.isEarmarkEnabled(q, v));
});

test('toutes les possibilités notées dès le début quand la préférence est active', () => {
  const a = new SudokuSession();
  a.setPreference('showAllPossibilities', true);
  const g = a.newGame(DIFFICULTY.EASY, 9);
  assert.ok(g.board.totalEarmarks > 0);
  const b = new SudokuSession();
  const h = b.newGame(DIFFICULTY.EASY, 9);
  assert.equal(h.board.totalEarmarks, 0);
  b.setPreference('showAllPossibilities', true);
  assert.equal(h.board.totalEarmarks, g.board.totalEarmarks);
});

test('fin de partie : meilleur temps par difficulté, jamais dégradé', () => {
  const now = horloge();
  const st = memoire();
  const a = new SudokuSession({ storage: st, gameOptions: { now } });
  let g = a.newGame(DIFFICULTY.EASY, 1);
  now.avance(100);
  g.autoComplete();
  assert.ok(g.board.isComplete());
  assert.equal(a.completeGame(), true);
  assert.equal(a.highscores[DIFFICULTY.EASY], 100);
  g = a.newGame(DIFFICULTY.EASY, 2);
  now.avance(150);
  g.autoComplete();
  assert.equal(a.completeGame(), false);
  assert.equal(a.highscores[DIFFICULTY.EASY], 100);
  g = a.newGame(DIFFICULTY.EASY, 3);
  now.avance(40);
  g.autoComplete();
  assert.equal(a.completeGame(), true);
  const b = new SudokuSession({ storage: st });
  assert.equal(b.highscores[DIFFICULTY.EASY], 40);
});

test('avertissements : conflit, écart avec la solution, notes impossibles', () => {
  const a = new SudokuSession();
  const g = a.newGame(DIFFICULTY.EASY, 12);
  const [p] = videDe(g);
  const faux = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((v) => v !== g.board.solution[p]);
  a.setValue(p, faux);
  assert.equal(a.warnings(p).valueError, true);
  a.setPreference('solutionWarnings', false);
  a.setPreference('duplicateWarnings', false);
  assert.equal(a.warnings(p).valueError, false);
  a.setValue(p, g.board.solution[p]);
  assert.equal(a.warnings(p).valueError, false);
  // note impossible : un chiffre déjà présent dans la ligne
  const q = videDe(g).find((k) => k !== p);
  const present = g.board.value[[...Array(9).keys()].map((c) => Math.floor(q / 9) * 9 + c).find((k) => g.board.value[k] !== -1)];
  a.toggleEarmark(q, present);
  assert.deepEqual(a.warnings(q).earmarkErrors, []);
  a.setPreference('earmarkWarnings', true);
  assert.deepEqual(a.warnings(q).earmarkErrors, [present]);
});

test('surlignage selon les préférences', () => {
  const a = new SudokuSession();
  const g = a.newGame(DIFFICULTY.EASY, 14);
  const donnee = [...Array(81).keys()].find((p) => g.board.isFixed(p));
  assert.equal(a.highlights(donnee).cells.size, 0);
  a.setPreference('highlightRowColumn', true);
  assert.equal(a.highlights(donnee).cells.size, 17);        // ligne + colonne, la case elle-même comprise (comme l'amont)
  a.setPreference('highlightBlock', true);
  assert.equal(a.highlights(donnee).cells.size, 21);        // + les 4 autres cases du bloc
  a.setPreference('highlightNumbers', true);
  assert.ok(a.highlights(donnee).sameValue.has(donnee));
  assert.equal(a.highlights(-1).cells.size, 0);
});

test('une partie porte le code de sa grille ; le code rejoue la même grille ; il survit à la sauvegarde', () => {
  const st = memoire();
  const a = new SudokuSession({ storage: st });
  const g = a.newGame(DIFFICULTY.MEDIUM, 4242);
  assert.match(g.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  const h = a.startFrom(g.code);
  assert.equal(h.code, g.code);
  assert.deepEqual([...h.board.value], [...g.board.value]);
  assert.equal(h.difficulty, DIFFICULTY.MEDIUM);
  const [p] = videDe(h);
  a.setValue(p, h.board.solution[p]);
  a.saveGame();
  const b = new SudokuSession({ storage: st });
  assert.ok(b.resume());
  assert.equal(b.game.code, g.code);
  // une grille collée (« # » ou 81 caractères) n'a pas de code de 5ud0ku
  const c = a.startFrom(g.board.fixedToAscii());
  assert.equal(c.code, undefined);
});

test('grille du jour : la même pour tous, par date et difficulté, avec meilleur temps', () => {
  const now = horloge();
  const a = new SudokuSession({ gameOptions: { now } });
  const g1 = a.startDaily(DIFFICULTY.EASY, '2026-10-20');
  const g2 = new SudokuSession().startDaily(DIFFICULTY.EASY, '2026-10-20');
  assert.equal(g1.code, '0112-9A05-6GPM');
  assert.deepEqual([...g1.board.value], [...g2.board.value]);
  const g3 = a.startDaily(DIFFICULTY.EASY, '2026-10-21');
  assert.notDeepEqual([...g1.board.value], [...g3.board.value]);
  assert.equal(a.dailyBest(DIFFICULTY.EASY, '2026-10-20'), null);
  const g = a.startDaily(DIFFICULTY.EASY, '2026-10-20');
  now.avance(75);
  g.autoComplete();
  a.completeGame();
  assert.equal(a.dailyBest(DIFFICULTY.EASY, '2026-10-20'), 75);
  assert.equal(a.dailyBest(DIFFICULTY.HARD, '2026-10-20'), null);
  assert.equal(a.dailyBest(DIFFICULTY.EASY, '2026-10-21'), null);
});

test('statistiques : parties commencées et gagnées, gardées d\'une visite à l\'autre', () => {
  const now = horloge();
  const st = memoire();
  const a = new SudokuSession({ storage: st, gameOptions: { now } });
  assert.deepEqual(a.stats, { started: 0, games: [] });
  a.newGame(DIFFICULTY.EASY, 1);
  const g = a.newGame(DIFFICULTY.EASY, 2);
  now.avance(50);
  g.autoComplete();
  a.completeGame();
  assert.equal(a.stats.started, 2);
  assert.equal(a.stats.games.length, 1);
  assert.equal(a.stats.games[0].t, 50);
  assert.equal(a.stats.games[0].n, DIFFICULTY.EASY);
  assert.equal(a.stats.games[0].c, g.code);
  const b = new SudokuSession({ storage: st });
  assert.equal(b.stats.games.length, 1);
  assert.equal(b.stats.started, 2);
  // reprendre une partie ne la compte pas comme une nouvelle
  b.newGame(DIFFICULTY.EASY, 3);
  const [p] = videDe(b.game);
  b.setValue(p, b.game.board.solution[p]);
  b.saveGame();
  const c = new SudokuSession({ storage: st });
  const before = c.stats.started;
  assert.ok(c.resume());
  assert.equal(c.stats.started, before);
});

test('langue : automatique par défaut, validée, mémorisée, stockage corrompu', () => {
  const st = memoire();
  const a = new SudokuSession({ storage: st });
  assert.equal(a.preferences.lang, 'auto');
  a.setPreference('lang', 'ja');
  a.setPreference('lang', 'pt-br');
  assert.throws(() => a.setPreference('lang', 'klingon'));
  assert.throws(() => a.setPreference('lang', ''));
  assert.equal(new SudokuSession({ storage: st }).preferences.lang, 'pt-br');
  a.setPreference('lang', 'auto');
  assert.equal(new SudokuSession({ storage: st }).preferences.lang, 'auto');
  st.setItem('5ud0ku:prefs', JSON.stringify({ lang: 'piratée' }));
  assert.equal(new SudokuSession({ storage: st }).preferences.lang, 'auto');
});

test('résumé de la partie sauvegardée pour la page d\'accueil, sans la charger', () => {
  const st = memoire();
  const a = new SudokuSession({ storage: st });
  assert.equal(a.savedInfo(), null);
  const g = a.newGame(DIFFICULTY.HARD, 31);
  assert.ok(a.savedInfo(), 'la grille intacte est déjà reprenable');
  const [p] = videDe(g);
  a.setValue(p, g.board.solution[p]);
  a.saveGame();
  const b = new SudokuSession({ storage: st });
  const info = b.savedInfo();
  assert.equal(info.difficulty, DIFFICULTY.HARD);
  assert.equal(typeof info.elapsed, 'number');
  assert.equal(info.code, g.code);
  assert.equal(b.game, null, 'la partie n\'est pas chargée');
  // une ancienne sauvegarde sans temps (-1) : pas de temps affiché plutôt qu'un temps faux
  const old = JSON.parse(st.getItem('5ud0ku:savefile'));
  old.time_elapsed = -1;
  st.setItem('5ud0ku:savefile', JSON.stringify(old));
  assert.equal(new SudokuSession({ storage: st }).savedInfo().elapsed, null);
  st.setItem('5ud0ku:savefile', '{pas du json');
  assert.equal(new SudokuSession({ storage: st }).savedInfo(), null);
  st.setItem('5ud0ku:savefile', JSON.stringify({ cells: [] }));
  assert.equal(new SudokuSession({ storage: st }).savedInfo(), null);
});

test('thème et apparence : valeurs par défaut, validation, mémoire, stockage corrompu', () => {
  const st = memoire();
  const a = new SudokuSession({ storage: st });
  assert.equal(a.preferences.themeFamily, 'epure');
  assert.equal(a.preferences.themeMode, 'auto');
  a.setPreference('themeFamily', 'claudia');
  a.setPreference('themeMode', 'fonce');
  assert.throws(() => a.setPreference('themeFamily', 'inconnu'));
  assert.throws(() => a.setPreference('themeMode', 'sombre'));
  const b = new SudokuSession({ storage: st });
  assert.equal(b.preferences.themeFamily, 'claudia');
  assert.equal(b.preferences.themeMode, 'fonce');
  st.setItem('5ud0ku:prefs', JSON.stringify({ themeFamily: 'piratée', themeMode: 42 }));
  const c = new SudokuSession({ storage: st });
  assert.equal(c.preferences.themeFamily, 'epure');
  assert.equal(c.preferences.themeMode, 'auto');
});

test('modes de saisie : normal, notes, essai ; remis à normal à chaque partie', () => {
  const a = new SudokuSession();
  a.newGame(DIFFICULTY.EASY, 15);
  assert.equal(a.mode, 'normal');
  a.toggleMode('notes');
  assert.equal(a.mode, 'notes');
  a.toggleMode('test');
  assert.equal(a.mode, 'test', 'passer de notes à essai ne passe pas par normal');
  a.toggleMode('test');
  assert.equal(a.mode, 'normal');
  assert.throws(() => a.setMode('autre'));
  a.setMode('test');
  a.newGame(DIFFICULTY.EASY, 16);
  assert.equal(a.mode, 'normal');
});

test('mode essai : seuls les chiffres notés s\'essaient, le même chiffre retire l\'essai, le pavé normal le confirme', () => {
  const a = new SudokuSession();
  const g = a.newGame(DIFFICULTY.EASY, 17);
  const [p] = videDe(g);
  const v = g.board.solution[p];
  a.testValue(p, v);
  assert.equal(g.board.value[p], -1, 'un chiffre non noté ne s\'essaie pas');
  a.toggleEarmark(p, v);
  a.testValue(p, v);
  assert.equal(g.board.value[p], v);
  assert.equal(g.board.test[p], 1);
  a.testValue(p, v);
  assert.equal(g.board.value[p], -1, 'le même chiffre retire l\'essai');
  assert.ok(g.board.isEarmarkEnabled(p, v), 'les notes sont toujours là');
  a.testValue(p, v);
  a.setValue(p, v);
  assert.equal(g.board.test[p], 0, 'le même chiffre au pavé normal confirme');
  assert.equal(g.board.value[p], v);
  assert.ok(!g.board.hasEarmarks(p));
  // une valeur ordinaire n'est pas remplacée en mode essai
  const [, q] = videDe(g);
  a.setValue(q, g.board.solution[q]);
  a.toggleEarmark(q, 0);
  a.testValue(q, 0);
  assert.equal(g.board.value[q], g.board.solution[q]);
  assert.equal(g.board.test[q], 0);
});

test('démarrer depuis un code de partage ou une chaîne', () => {
  const a = new SudokuSession();
  const g = a.newGame(DIFFICULTY.MEDIUM, 4);
  const code = g.board.fixedToAscii();
  const h = a.startFrom(code);
  assert.deepEqual([...h.board.fixed], [...g.board.fixed]);
  assert.throws(() => a.startFrom('#nimporte'));
});
