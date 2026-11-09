/*
 * 5ud0ku — portage de GNOME Sudoku : session (préférences, meilleurs temps, sauvegarde)
 * Copyright (C) 2024-2026 Johan Gay et les contributeurs de GNOME Sudoku
 * Copyright (C) 2026 Drusus (Gens Claudia)
 * Ce programme est un logiciel libre ; vous pouvez le redistribuer et/ou le modifier selon les termes de la
 * Licence Publique Générale GNU, version 3 ou (à votre choix) toute version ultérieure.
 *
 * Portage de `src/lib/backend.rs` et `src/lib/data.rs` (amont gnome-sudoku cc27ff0c). Le « backend » de l'amont
 * relie l'interface à la partie en cours, aux préférences (GSettings), aux meilleurs temps et à la sauvegarde
 * (fichiers). Ici : le stockage du navigateur (`localStorage` ou équivalent injecté), qui peut manquer ou lever
 * une exception (navigation privée) : la session fonctionne alors sans mémoire.
 *
 * Les préférences et leurs valeurs par défaut sont celles du schéma de l'amont (data/org.gnome.Sudoku.gschema.xml).
 */
import { DIFFICULTY } from './generator.js';
import { SudokuGame } from './game.js';
import { rowOf, colOf, SudokuBoard } from './board.js';
import { THEMES, MODES, DEFAULT_FAMILY, normalize as normalizeTheme } from './themes.js';
import { MODE, makeCode, parseCode, canonicalCode, dailySeed, dailyCode, localDate } from './code.js';
import { normalizeStats, addGame, bestFor } from './stats.js';
import { CODES } from './lang/index.js';

export const ZOOM = Object.freeze(['none', 'small', 'medium', 'large']);

export const DEFAULT_PREFERENCES = Object.freeze({
  zoom: 'medium',
  themeFamily: DEFAULT_FAMILY,    // voir src/themes.js
  themeMode: 'auto',              // 'auto' (suit le système), 'clair' ou 'fonce'
  lang: 'auto',                   // 'auto' (langue du navigateur) ou un code de src/lang/index.js
  showAllPossibilities: false,
  highlightRowColumn: false,
  highlightBlock: false,
  highlightNumbers: false,
  duplicateWarnings: true,
  solutionWarnings: true,
  earmarkWarnings: false,
  autocleanEarmarks: false,
  pickerSecondClick: false,
  startFullscreen: true,          // plein écran au premier geste (si le navigateur le permet)
});

const KEY_SAVE = '5ud0ku:savefile';
const KEY_DATA = '5ud0ku:data';
const KEY_PREFS = '5ud0ku:prefs';

const PLAYABLE = [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD, DIFFICULTY.VERY_HARD];

export class SudokuSession {
  /**
   * @param {{storage?: {getItem(k: string): string|null, setItem(k: string, v: string): void, removeItem(k: string): void}|null,
   *          gameOptions?: object}} [options]
   */
  constructor({ storage = null, gameOptions = {} } = {}) {
    this._storage = storage;
    this._gameOptions = gameOptions;
    this._listeners = new Map();
    this.game = null;
    this.mode = 'normal';           // mode de saisie : 'normal', 'notes' ou 'test' (non sauvegardé, remis à 'normal' à chaque partie)
    this.preferences = { ...DEFAULT_PREFERENCES, ...this._read(KEY_PREFS) };
    const theme = normalizeTheme({ family: this.preferences.themeFamily, mode: this.preferences.themeMode });
    this.preferences.themeFamily = theme.family;
    this.preferences.themeMode = theme.mode;
    if (this.preferences.lang !== 'auto' && !CODES.includes(this.preferences.lang)) this.preferences.lang = 'auto';
    const data = this._read(KEY_DATA);
    this.highscores = {};
    for (const d of PLAYABLE) if (typeof data.highscores?.[d] === 'number' && data.highscores[d] >= 0) this.highscores[d] = data.highscores[d];
    this.highscoresJigsaw = {};   // meilleurs temps du mode Jigsaw, par difficulté (ceux du classique restent dans `highscores`)
    for (const d of PLAYABLE) if (typeof data.highscoresJigsaw?.[d] === 'number' && data.highscoresJigsaw[d] >= 0) this.highscoresJigsaw[d] = data.highscoresJigsaw[d];
    this.selectedDifficulty = PLAYABLE.includes(data.selectedDifficulty) ? data.selectedDifficulty : DIFFICULTY.EASY;
    this.selectedMode = Object.values(MODE).includes(data.selectedMode) ? data.selectedMode : MODE.CLASSIQUE;
    this.highscoresPetit = {};   // meilleurs temps du 4×4 (une seule difficulté)
    for (const d of PLAYABLE) if (typeof data.highscoresPetit?.[d] === 'number' && data.highscoresPetit[d] >= 0) this.highscoresPetit[d] = data.highscoresPetit[d];
    this.highscoresHexJigsaw = {};   // meilleurs temps du Jigsaw 16×16, par difficulté
    for (const d of PLAYABLE) if (typeof data.highscoresHexJigsaw?.[d] === 'number' && data.highscoresHexJigsaw[d] >= 0) this.highscoresHexJigsaw[d] = data.highscoresHexJigsaw[d];
    this.highscoresHex = {};      // meilleurs temps du 16×16, par difficulté
    for (const d of PLAYABLE) if (typeof data.highscoresHex?.[d] === 'number' && data.highscoresHex[d] >= 0) this.highscoresHex[d] = data.highscoresHex[d];
    this.stats = normalizeStats(data.stats);
  }

  // --- stockage ---

  _read(key) {
    try {
      const raw = this._storage?.getItem(key);
      const v = raw ? JSON.parse(raw) : null;
      return v && typeof v === 'object' ? v : {};
    } catch { return {}; }
  }

  _write(key, value) {
    try { this._storage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }

  _remove(key) {
    try { this._storage?.removeItem(key); } catch { /* sans mémoire */ }
  }

  saveData() {
    this._write(KEY_DATA, { highscores: this.highscores, highscoresJigsaw: this.highscoresJigsaw, highscoresHex: this.highscoresHex, highscoresHexJigsaw: this.highscoresHexJigsaw, highscoresPetit: this.highscoresPetit, selectedDifficulty: this.selectedDifficulty, selectedMode: this.selectedMode, stats: this.stats });
  }

  // --- événements ---

  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, new Set());
    this._listeners.get(name).add(fn);
    return () => this._listeners.get(name)?.delete(fn);
  }

  _emit(name, ...args) { for (const fn of this._listeners.get(name) ?? []) fn(...args); }

  // --- préférences ---

  setPreference(name, value) {
    if (!(name in DEFAULT_PREFERENCES)) throw new Error(`Préférence inconnue : ${name}`);
    if (name === 'zoom' && !ZOOM.includes(value)) throw new Error(`Zoom inconnu : ${value}`);
    if (name === 'themeFamily' && !THEMES[value]) throw new Error(`Thème inconnu : ${value}`);
    if (name === 'themeMode' && !MODES.includes(value)) throw new Error(`Mode de thème inconnu : ${value}`);
    if (name === 'lang' && value !== 'auto' && !CODES.includes(value)) throw new Error(`Langue inconnue : ${value}`);
    if (!['zoom', 'themeFamily', 'themeMode', 'lang'].includes(name) && typeof value !== 'boolean') throw new Error(`Préférence booléenne attendue : ${name}`);
    this.preferences[name] = value;
    this._write(KEY_PREFS, this.preferences);
    if (name === 'showAllPossibilities' && value && this.game) this.game.enableAllEarmarkPossibilities();
    this._emit('preference-changed', name, value);
  }

  setSelectedDifficulty(d) {
    if (!PLAYABLE.includes(d)) throw new Error('Difficulté inconnue');
    this.selectedDifficulty = d;
    this.saveData();
  }

  /** Type de grille choisi à l'écran « Nouvelle partie » : classique, Jigsaw, 16×16, Jigsaw 16×16 ou 4×4. */
  setSelectedMode(mode) {
    if (!Object.values(MODE).includes(mode)) throw new Error('Mode inconnu');
    this.selectedMode = mode;
    this.saveData();
  }

  /** Meilleurs temps d'un mode, par difficulté. */
  highscoresOf(mode = this.selectedMode) {
    return { [MODE.JIGSAW]: this.highscoresJigsaw, [MODE.HEX]: this.highscoresHex, [MODE.HEXJIGSAW]: this.highscoresHexJigsaw, [MODE.PETIT]: this.highscoresPetit }[mode] ?? this.highscores;
  }

  // --- parties ---

  _setGame(game) {
    this.game?.dispose();
    this.game = game;
    this.mode = 'normal';
    game.autoTick = true;
    if (game._timerStart !== null) game.startTicking();
    this._emit('game-changed');
  }

  /** Nouvelle partie de la difficulté choisie, classique ou Jigsaw (graine facultative : même graine, même partie). */
  newGame(difficulty = this.selectedDifficulty, seed, mode = MODE.CLASSIQUE) {
    const game = mode === MODE.JIGSAW
      ? SudokuGame.fromJigsaw(difficulty, seed, this._gameOptions)
      : mode === MODE.HEX
        ? SudokuGame.fromHex(difficulty, seed, this._gameOptions)
        : mode === MODE.HEXJIGSAW
          ? SudokuGame.fromHexJigsaw(difficulty, seed, this._gameOptions)
          : mode === MODE.PETIT
            ? SudokuGame.fromPetit(seed, this._gameOptions)
            : SudokuGame.fromGenerator(difficulty, seed, this._gameOptions);
    game.code = canonicalCode(makeCode(difficulty, game.seed, mode));
    return this._begin(game);
  }

  /**
   * « Recommencer » une grille terminée : nouvelle partie de la MÊME grille, temps à zéro, SANS rien régénérer (la grille, sa solution et ses régions sont déjà là ;
   * régénérer un 16×16 prenait jusqu'à 10 s sur le fil principal quand la grille venait d'une sauvegarde). Le code et la graine sont conservés.
   */
  restartFinished() {
    const old = this.game;
    const b = old.board;
    const game = new SudokuGame(SudokuBoard.fromFlat(b.fixedValues(), b.solution, b.difficultyCategory, b.regions), this._gameOptions);
    game.code = old.code;
    game.seed = old.seed;
    game.startClock();
    return this._begin(game);
  }

  /** Grille du jour (la même pour tous) de la difficulté choisie. */
  startDaily(difficulty = this.selectedDifficulty, date = localDate(), mode = MODE.CLASSIQUE) {
    return this.newGame(difficulty, dailySeed(date, difficulty, mode), mode);
  }

  /** Meilleur temps déjà obtenu sur la grille du jour d'une difficulté, ou null. */
  dailyBest(difficulty = this.selectedDifficulty, date = localDate(), mode = MODE.CLASSIQUE) {
    return bestFor(this.stats.games, canonicalCode(dailyCode(date, difficulty, mode)));
  }

  /**
   * Partie à partir de ce que le joueur colle : un code de 5ud0ku (« 0112-9A05-6GPM »), un code de partage « #… » de
   * GNOME Sudoku ou 81 caractères (chiffres 1 à 9, « . » pour vide). Lève SudokuError.
   */
  startFrom(text) {
    const c = parseCode(text);
    if (c) return this.newGame(c.difficulty, c.seed, c.mode);
    const game = text.trim().startsWith('#') ? SudokuGame.fromAscii(text.trim(), this._gameOptions) : SudokuGame.fromString(text, this._gameOptions);
    return this._begin(game);
  }

  _begin(game) {
    if (this.preferences.showAllPossibilities) game.enableAllEarmarkPossibilities();
    this.stats = { ...this.stats, started: this.stats.started + 1 };
    this.saveData();
    this._setGame(game);
    this.saveGame();   // dès le début : fermer l'application avant le premier coup ne doit pas perdre la grille
    return game;
  }

  /**
   * Résumé de la partie sauvegardée, sans la charger : { difficulty, elapsed (secondes, ou null si le chronomètre était
   * masqué), code } ou null s'il n'y en a pas (ou si la sauvegarde est illisible). Sert à la page d'accueil.
   */
  savedInfo() {
    const data = this._read(KEY_SAVE);
    if (!Array.isArray(data.cells) || data.cells.length === 0) return null;
    try { SudokuBoard.fromJson(data); } catch { return null; }   // une sauvegarde qui ne se relit pas n'est pas « reprenable »
    const difficulty = PLAYABLE.includes(data.difficulty_category) ? data.difficulty_category : null;
    const elapsed = typeof data.time_elapsed === 'number' && data.time_elapsed >= 0 ? data.time_elapsed : null;
    return { difficulty, elapsed, code: canonicalCode(data.code), mode: data.size === 4 ? MODE.PETIT : data.size === 16 ? (typeof data.regions === 'string' ? MODE.HEXJIGSAW : MODE.HEX) : typeof data.regions === 'string' ? MODE.JIGSAW : MODE.CLASSIQUE };
  }

  /** Reprend la partie sauvegardée, si elle existe et est lisible. Renvoie true si une partie est reprise. */
  resume() {
    const data = this._read(KEY_SAVE);
    if (!data.cells) return false;
    try {
      const game = SudokuGame.fromJson(data, this._gameOptions);
      if (this.preferences.showAllPossibilities && game.board.loadedTime === 0) game.enableAllEarmarkPossibilities();
      this._setGame(game);
      return true;
    } catch {
      // sauvegarde illisible (corrompue, format futur, grille sans solution unique) : on la met de côté pour examen et on la
      // retire, pour que « Continuer » ne reste pas affiché sans rien faire (audit de Claudius, M2)
      this._write(`${KEY_SAVE}.illisible`, data);
      this._remove(KEY_SAVE);
      return false;
    }
  }

  /**
   * Enregistre la partie en cours ; supprime la sauvegarde si elle est terminée. Une grille intacte est enregistrée aussi
   * (l'amont ne le fait pas) : en rouvrant l'application, on retrouve la grille commencée, même sans y avoir joué.
   */
  saveGame() {
    const g = this.game;
    // Aucune partie en mémoire (l'accueil est affiché, « Continuer » n'a pas été touché) : on ne touche SURTOUT PAS à la
    // sauvegarde existante. Une version précédente la supprimait ici, donc fermer l'application depuis l'accueil
    // faisait perdre la partie en cours.
    if (!g) return;
    if (g.finished || g.board.isComplete()) this._remove(KEY_SAVE);
    else this._write(KEY_SAVE, g.toJson());
  }

  deleteGame() {
    this.game?.dispose();
    this.game = null;
    this._remove(KEY_SAVE);
    this._emit('game-changed');
  }

  /** À appeler quand la grille est complète : meilleur temps (renvoie true si battu) et fin de la sauvegarde. */
  completeGame() {
    const g = this.game;
    // le chronomètre est déjà figé par le jeu (SudokuGame._checkCompleted) ; une victoire ne se compte qu'une fois
    if (g.counted) return false;
    g.counted = true;
    this._remove(KEY_SAVE);
    const t = g.totalTimePlayed();
    const d = g.difficulty;
    const mode = g.board.isPetit ? MODE.PETIT : g.board.isHex ? (g.board.isJigsaw ? MODE.HEXJIGSAW : MODE.HEX) : g.board.isJigsaw ? MODE.JIGSAW : MODE.CLASSIQUE;
    const scores = this.highscoresOf(mode);
    const old = scores[d];
    const record = old === undefined || old > t;
    if (record) scores[d] = t;
    this.stats = addGame(this.stats, { d: localDate(), t, n: d, c: g.code ?? null, ...(mode !== MODE.CLASSIQUE ? { m: mode } : {}) }).stats;
    this.saveData();
    return record;
  }

  /** Efface les statistiques et les meilleurs temps. */
  resetStats() {
    this.stats = normalizeStats(null);
    this.highscores = {};
    this.highscoresJigsaw = {};
    this.highscoresHex = {};
    this.highscoresHexJigsaw = {};
    this.highscoresPetit = {};
    this.saveData();
  }

  // --- gestes de l'interface (gardes de SudokuBackend) ---

  /** Mode de saisie : 'normal', 'notes' (le pavé note des candidats) ou 'test' (le pavé essaie un candidat noté). */
  setMode(mode) {
    if (!['normal', 'notes', 'test'].includes(mode)) throw new Error(`Mode inconnu : ${mode}`);
    this.mode = mode;
    this._emit('mode-changed', mode);
  }

  /** Bascule un mode : le quitte s'il est actif, l'active sinon. */
  toggleMode(mode) { this.setMode(this.mode === mode ? 'normal' : mode); }

  /**
   * Mode essai : le chiffre noté devient valeur d'essai (verte, notes conservées) ; le même chiffre retire l'essai.
   * Seuls les chiffres déjà notés dans la case peuvent être essayés, et une valeur ordinaire n'est pas remplacée.
   */
  testValue(p, val) {
    const g = this.game;
    const b = g.board;
    if (b.isFixed(p)) return;
    if (b.test[p] && b.value[p] === val) { g.remove(p); return; }
    if (b.value[p] !== -1 && !b.test[p]) return;
    if (!b.isEarmarkEnabled(p, val)) return;
    g.insertTest(p, val);
  }

  setValue(p, val) {
    const g = this.game;
    if (g.board.isFixed(p)) return;
    // le même chiffre sur une valeur d'essai la confirme (elle devient ordinaire)
    if (g.board.test[p] && g.board.value[p] === val) { g.confirmTest(p); return; }
    if (g.board.value[p] === val) return;
    if (this.preferences.autocleanEarmarks) g.insertAndDisableAlignedEarmarks(p, val); else g.insert(p, val);
  }

  clearCell(p) {
    const g = this.game;
    if (g.board.isFixed(p)) return;
    if (g.board.value[p] !== -1) g.remove(p);
    else if (g.board.hasEarmarks(p)) g.disableAllEarmarks(p);
  }

  toggleEarmark(p, num) {
    const g = this.game;
    if (g.board.value[p] !== -1) return;
    if (g.board.isEarmarkEnabled(p, num)) g.disableEarmark(p, num); else g.enableEarmark(p, num);
  }

  // --- aides d'affichage ---

  /** Cases à surligner autour d'une case sélectionnée, d'après les préférences. */
  highlights(selected) {
    const g = this.game;
    const out = { cells: new Set(), sameValue: new Set(), sameEarmark: new Map() };
    if (selected == null || selected < 0) return out;
    const { highlightRowColumn, highlightBlock, highlightNumbers } = this.preferences;
    for (const q of g.board.aligned21[selected]) {
      const sameLine = g.board.rowOf(q) === g.board.rowOf(selected) || g.board.colOf(q) === g.board.colOf(selected);
      if ((highlightRowColumn && sameLine) || (highlightBlock && !sameLine)) out.cells.add(q);
    }
    // Jigsaw : une région irrégulière peut longer la ligne ou la colonne de la case ; « région » surligne toutes ses cases
    if (highlightBlock && g.board.isJigsaw) for (const q of g.board.blocks[g.board.regions[selected]]) out.cells.add(q);
    const v = g.board.value[selected];
    if (highlightNumbers && v !== -1) {
      for (let q = 0; q < g.board.N; q++) {
        if (g.board.value[q] === v) out.sameValue.add(q);
        else if (g.board.value[q] === -1 && g.board.isEarmarkEnabled(q, v)) out.sameEarmark.set(q, v);
      }
    }
    return out;
  }

  /** Erreurs à afficher pour une case : valeur fausse (conflit ou écart avec la solution) et notes impossibles. */
  warnings(p) {
    const b = this.game.board;
    const v = b.value[p];
    let valueError = false;
    const earmarkErrors = [];
    if (v !== -1) {
      if (this.preferences.duplicateWarnings && b.broken.has(p)) valueError = true;
      else if (this.preferences.solutionWarnings) valueError = v !== b.solution[p];
    } else if (this.preferences.earmarkWarnings) {
      for (let n = 0; n < b.n; n++) if (b.isEarmarkEnabled(p, n) && !b.isEarmarkPossible(p, n)) earmarkErrors.push(n);
    }
    return { valueError, earmarkErrors };
  }
}

export { DIFFICULTY };
