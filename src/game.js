/*
 * 5ud0ku — portage de GNOME Sudoku : partie (annuler/refaire, notes, minuteur)
 * Copyright (C) 2024-2026 Johan Gay et les contributeurs de GNOME Sudoku
 * Copyright (C) 2026 Drusus (Gens Claudia)
 * Ce programme est un logiciel libre ; vous pouvez le redistribuer et/ou le modifier selon les termes de la
 * Licence Publique Générale GNU, version 3 ou (à votre choix) toute version ultérieure.
 *
 * Portage de `src/lib/game.rs` (amont gnome-sudoku cc27ff0c). Les signaux GObject deviennent des événements :
 * `game.on('value-changed', (p, ancienne, nouvelle) => …)`, `on('earmark-changed', (p, num, actif) => …)`,
 * `on('action-completed', (action) => …)`, `on('completed')`, `on('paused', (enPause) => …)`, `on('tick')`.
 *
 * Différences voulues avec l'amont :
 *  - le temps est en secondes fractionnaires, horloge injectable (tests) ;
 *  - `canUndo` est exact (l'amont répond comme `canRedo` à la place) ;
 *  - activer toutes les possibilités sans rien changer n'efface plus la pile « refaire » ;
 *  - `playOrder` complète avec les cases remplies avant un chargement (l'amont visait la même chose mais sa
 *    condition était inversée, si bien que la liste restait incomplète).
 */
import { SudokuGenerator, DIFFICULTY } from './generator.js';
import { SudokuBoard, SudokuError, ERRORS, ALIGNED21 } from './board.js';
import { canonicalCode } from './code.js';

export const STACK_ACTION = Object.freeze({
  NONE: 'none',
  INSERT: 'insert',
  REMOVE: 'remove',
  ENABLE_EARMARK: 'enable-earmark',
  DISABLE_EARMARK: 'disable-earmark',
  DISABLE_ALL_EARMARKS: 'disable-all-earmarks',
  INSERT_AND_DISABLE_ALIGNED_EARMARKS: 'insert-and-disable-aligned-earmarks',
  ENABLE_ALL_EARMARK_POSSIBILITIES: 'enable-all-earmark-possibilities',
  RESET: 'reset',
  INSERT_TEST: 'insert-test',
  CONFIRM_TEST: 'confirm-test',
});

const NONE = -1;

export class SudokuGame {
  /**
   * @param {SudokuBoard} board plateau déjà résolu (solution et difficulté renseignées)
   * @param {{now?: () => number, rand?: () => number}} [options] horloge (ms) et hasard injectables
   */
  constructor(board, { now = () => Date.now(), rand = Math.random } = {}) {
    this.board = board;
    this._now = now;
    this._rand = rand;
    this._listeners = new Map();
    this._timerStart = null;       // ms, null si l'horloge est arrêtée
    this._storedTime = 0;          // secondes
    this._tickHandle = null;
    this.paused = false;
    this.finished = false;         // grille terminée : posé une seule fois (voir _checkCompleted), plus aucune action ensuite
    this.stack = [];
    this.head = -1;                // indice de la dernière action appliquée, -1 si aucune
    this.currentAction = STACK_ACTION.NONE;
  }

  // --- événements ---

  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, new Set());
    this._listeners.get(name).add(fn);
    return () => this._listeners.get(name)?.delete(fn);
  }

  _emit(name, ...args) {
    for (const fn of this._listeners.get(name) ?? []) fn(...args);
  }

  // --- constructions ---

  /** Résout le plateau (solution unique exigée) : renseigne les solutions et la difficulté. Lève SudokuError. */
  static solve(board) {
    // une grille entièrement donnée n'est pas un puzzle (rien à résoudre, donc aucune difficulté) : refusée proprement
    if (board.totalFixed >= 81) throw new SudokuError(ERRORS.INVALID_PUZZLE);
    const g = new SudokuGenerator(1);
    if (!g.setPuzzle(board.fixedCells())) throw new SudokuError(ERRORS.INVALID_PUZZLE);
    const solution = g.solveUnique();
    if (!solution) throw new SudokuError(ERRORS.MULTIPLE_SOLUTIONS);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) board.solution[r * 9 + c] = solution[r][c];
    board.difficultyCategory = g.difficulty();
  }

  static _fromBoard(board, options) {
    SudokuGame.solve(board);
    const game = new SudokuGame(board, options);
    game.startClock();
    return game;
  }

  /** Reprend une sauvegarde ; le code de la grille (champ `code`, ajout de 5ud0ku) est conservé s'il est valide. */
  static fromJson(data, options) {
    const game = SudokuGame._fromBoard(SudokuBoard.fromJson(data), options);
    const code = canonicalCode(data?.code ?? (typeof data === 'string' ? JSON.parse(data).code : ''));
    if (code) game.code = code;
    return game;
  }

  static fromString(text, options) { return SudokuGame._fromBoard(SudokuBoard.fromString(text), options); }

  static fromAscii(text, options) { return SudokuGame._fromBoard(SudokuBoard.fromAscii(text), options); }

  /** Génère un puzzle de la difficulté demandée (une graine donnée donne toujours le même puzzle). */
  static fromGenerator(difficulty, seed, options) {
    const r = SudokuGenerator.generate(difficulty, seed);
    const game = new SudokuGame(SudokuBoard.fromGenerated(r.puzzle, r.solution, difficulty), options);
    game.seed = r.seed;
    game.startClock();
    return game;
  }

  get difficulty() { return this.board.difficultyCategory; }

  // --- minuteur ---

  startClock() {
    if (this.finished) return;
    if (this._timerStart === null) {
      this._timerStart = this._now();
      this.paused = false;
      if (this.autoTick) this.startTicking();
    }
  }

  /** Émet « tick » chaque seconde tant que l'horloge tourne (le rappel ne retient pas le processus de test). */
  startTicking() {
    if (this._tickHandle === null && typeof setInterval === 'function') {
      this._tickHandle = setInterval(() => this._emit('tick'), 1000);
      this._tickHandle.unref?.();
    }
  }

  stopClock() {
    if (this._timerStart !== null) {
      if (this._tickHandle !== null) { clearInterval(this._tickHandle); this._tickHandle = null; }
      this._storedTime += (this._now() - this._timerStart) / 1000;
      this._timerStart = null;
      this.paused = true;
    }
  }

  togglePause() {
    if (this.finished) return;
    const wasPaused = this.paused;
    if (wasPaused) this.startClock(); else this.stopClock();
    this._emit('paused', !wasPaused);
  }

  /** Secondes jouées, y compris le temps d'une partie chargée. */
  totalTimePlayed() {
    let t = this._storedTime;
    if (this._timerStart !== null) t += (this._now() - this._timerStart) / 1000;
    return t + (this.board.loadedTime > 0 ? this.board.loadedTime : 0);
  }

  /** À appeler quand la partie est abandonnée : arrête le minuteur et son rappel. */
  dispose() {
    if (this._tickHandle !== null) { clearInterval(this._tickHandle); this._tickHandle = null; }
    this._listeners.clear();
  }

  /**
   * Fin de partie : posée UNE fois, quand la grille devient complète. Le temps final est figé ici et plus aucune action n'est
   * acceptée ensuite (annuler, rejouer, pause, réinitialiser) : sinon une partie gagnée pouvait être rouverte et sa victoire
   * comptée deux fois (défaut relevé par l'audit de Claudius, G1). `paused` redevient faux : ce n'est pas une pause.
   */
  _checkCompleted() {
    if (this.finished || !this.board.isComplete()) return;
    this.finished = true;
    this.stopClock();
    this.paused = false;
    this._emit('completed');
  }

  // --- pile annuler / refaire ---

  get canUndo() { return this.head >= 0; }

  get canRedo() { return this.head < this.stack.length - 1; }

  _newItem(type) {
    this.currentAction = type;
    return { actionType: type, valueChanges: [], earmarkChanges: [] };
  }

  _finish(item) {
    this.stack.length = this.head + 1;      // efface ce qui pouvait être refait
    this.stack.push(item);
    this.head = this.stack.length - 1;
    this.currentAction = STACK_ACTION.NONE;
    this._emit('action-completed', item.actionType);
  }

  _valueStep(item, p, oldVal, newVal, newTest = false) {
    item.valueChanges.push({ pos: p, oldVal, newVal, oldTest: this.board.test[p] === 1, newTest });
    this.board.setValue(p, newVal, newTest);
    this._emit('value-changed', p, oldVal, newVal);
  }

  _earmarkStep(item, p, num, enabled) {
    item.earmarkChanges.push({ pos: p, num, enabled });
    if (enabled) this.board.enableEarmark(p, num); else this.board.disableEarmark(p, num);
    this._emit('earmark-changed', p, num, enabled);
  }

  _disableAllEarmarksHelper(item, p) {
    for (let n = 0; n < 9; n++) if (this.board.isEarmarkEnabled(p, n)) this._earmarkStep(item, p, n, false);
  }

  undo() {
    if (this.finished) return;
    if (!this.canUndo) return;
    const item = this.stack[this.head];
    this.currentAction = item.actionType;
    for (const vc of [...item.valueChanges].reverse()) {
      this.board.setValue(vc.pos, vc.oldVal, vc.oldTest);
      this._emit('value-changed', vc.pos, vc.newVal, vc.oldVal);
    }
    for (const ec of [...item.earmarkChanges].reverse()) {
      if (ec.enabled) this.board.disableEarmark(ec.pos, ec.num); else this.board.enableEarmark(ec.pos, ec.num);
      this._emit('earmark-changed', ec.pos, ec.num, !ec.enabled);
    }
    if (item.actionType === STACK_ACTION.RESET && item.timeBefore != null) {
      const since = this.totalTimePlayed();        // temps écoulé depuis le « Recommencer »
      this._zeroClock();
      this._storedTime = item.timeBefore + since;
    }
    this.head--;
    this.currentAction = STACK_ACTION.NONE;
    this._emit('action-completed', item.actionType);
  }

  redo() {
    if (this.finished) return;
    if (!this.canRedo) return;
    const item = this.stack[this.head + 1];
    this.currentAction = item.actionType;
    for (const vc of item.valueChanges) {
      this.board.setValue(vc.pos, vc.newVal, vc.newTest);
      this._emit('value-changed', vc.pos, vc.oldVal, vc.newVal);
    }
    for (const ec of item.earmarkChanges) {
      if (ec.enabled) this.board.enableEarmark(ec.pos, ec.num); else this.board.disableEarmark(ec.pos, ec.num);
      this._emit('earmark-changed', ec.pos, ec.num, ec.enabled);
    }
    if (item.actionType === STACK_ACTION.RESET) {
      item.timeBefore = this.totalTimePlayed();
      this._zeroClock();
    }
    this.head++;
    this.currentAction = STACK_ACTION.NONE;
    this._emit('action-completed', item.actionType);
  }

  // --- actions ---

  enableEarmark(p, num) {
    if (this.finished) return;
    const item = this._newItem(STACK_ACTION.ENABLE_EARMARK);
    this._earmarkStep(item, p, num, true);
    this._finish(item);
  }

  disableEarmark(p, num) {
    if (this.finished) return;
    const item = this._newItem(STACK_ACTION.DISABLE_EARMARK);
    this._earmarkStep(item, p, num, false);
    this._finish(item);
  }

  disableAllEarmarks(p) {
    if (this.finished) return;
    const item = this._newItem(STACK_ACTION.DISABLE_ALL_EARMARKS);
    this._disableAllEarmarksHelper(item, p);
    this._finish(item);
  }

  /** Note tous les chiffres encore possibles dans chaque case vide. Sans effet (et sans entrée dans la pile) si rien à ajouter. */
  enableAllEarmarkPossibilities() {
    if (this.finished) return;
    const item = this._newItem(STACK_ACTION.ENABLE_ALL_EARMARK_POSSIBILITIES);
    for (let p = 0; p < 81; p++) {
      if (this.board.value[p] !== NONE) continue;
      const possible = this.board.cellPossibilities(p);
      for (let n = 0; n < 9; n++) if (!this.board.isEarmarkEnabled(p, n) && possible[n]) this._earmarkStep(item, p, n, true);
    }
    if (item.earmarkChanges.length > 0) this._finish(item); else this.currentAction = STACK_ACTION.NONE;
  }

  insert(p, val) {
    if (this.finished) return;
    const oldVal = this.board.value[p];
    const item = this._newItem(STACK_ACTION.INSERT);
    if (this.board.hasEarmarks(p)) this._disableAllEarmarksHelper(item, p);
    this._valueStep(item, p, oldVal, val);
    this._finish(item);
    this._checkCompleted();
  }

  /** Pose un chiffre et retire ce chiffre des notes des cases alignées (option « nettoyer les notes »). */
  insertAndDisableAlignedEarmarks(p, val) {
    if (this.finished) return;
    const oldVal = this.board.value[p];
    const item = this._newItem(STACK_ACTION.INSERT_AND_DISABLE_ALIGNED_EARMARKS);
    for (const q of ALIGNED21[p]) {
      if (q === p) continue;
      if (this.board.isEarmarkEnabled(q, val)) this._earmarkStep(item, q, val, false);
    }
    if (this.board.hasEarmarks(p)) this._disableAllEarmarksHelper(item, p);
    this._valueStep(item, p, oldVal, val);
    this._finish(item);
    this._checkCompleted();
  }

  /**
   * Valeur d'essai (ajout de 5ud0ku) : pose un chiffre en le marquant « essai » et CONSERVE les notes de la case,
   * pour pouvoir essayer un autre candidat. Annulable comme toute action.
   */
  insertTest(p, val) {
    if (this.finished) return;
    const oldVal = this.board.value[p];
    const item = this._newItem(STACK_ACTION.INSERT_TEST);
    this._valueStep(item, p, oldVal, val, true);
    this._finish(item);
    this._checkCompleted();
  }

  /** Transforme la valeur d'essai de la case en valeur ordinaire : ses notes sont alors effacées, comme à une pose. */
  confirmTest(p) {
    if (this.finished) return;
    if (!this.board.test[p]) return;
    const val = this.board.value[p];
    const item = this._newItem(STACK_ACTION.CONFIRM_TEST);
    this._disableAllEarmarksHelper(item, p);
    this._valueStep(item, p, val, val, false);
    this._finish(item);
    this._checkCompleted();   // confirmer la dernière valeur d'essai peut achever la grille
  }

  remove(p) {
    if (this.finished) return;
    const oldVal = this.board.value[p];
    const item = this._newItem(STACK_ACTION.REMOVE);
    this._valueStep(item, p, oldVal, NONE);
    this._finish(item);
  }

  /** Efface tout ce que le joueur a ajouté (valeurs et notes), en une seule action annulable. */
  reset() {
    if (this.finished) return;
    const item = this._newItem(STACK_ACTION.RESET);
    item.timeBefore = this.totalTimePlayed();      // pour qu'Annuler rende aussi le temps (relecture de Claudius, R1)
    for (let p = 0; p < 81; p++) {
      if (this.board.isFixed(p)) continue;
      const v = this.board.value[p];
      if (v !== NONE) this._valueStep(item, p, v, NONE);
      else if (this.board.hasEarmarks(p)) this._disableAllEarmarksHelper(item, p);
    }
    // grille remise à l'état initial : le chronomètre repart de zéro (décision de l'Auctor), y compris le temps d'une partie reprise
    this._zeroClock();
    this._finish(item);
  }

  _zeroClock() {
    this._storedTime = 0;
    this.board.loadedTime = 0;
    if (this._timerStart !== null) this._timerStart = this._now();
  }

  /** Ordre dans lequel les cases ont été remplies (la plus récente en premier), pour l'animation de fin. */
  playOrder() {
    const seen = new Set();
    const order = [];
    for (const item of this.stack) for (const vc of item.valueChanges) if (!seen.has(vc.pos)) { seen.add(vc.pos); order.push(vc.pos); }
    order.reverse();
    if (order.length === 81 - this.board.totalFixed) return order;
    // partie chargée : les cases déjà remplies avant la sauvegarde sont placées au hasard
    const rest = this.board.cellsNotFixed().filter((p) => !seen.has(p));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(this._rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return order.concat(rest);
  }

  /** Remplit toute la grille avec la solution (essais). */
  autoComplete() {
    for (let p = 0; p < 81; p++) if (this.board.value[p] !== this.board.solution[p]) this.insert(p, this.board.solution[p]);
  }

  /** Sauvegarde JSON de la partie en cours. */
  toJson(elapsed = this.totalTimePlayed()) {
    const json = this.board.toJson(elapsed);
    if (this.code) json.code = this.code; // champ ajouté par 5ud0ku, ignoré par l'amont
    return json;
  }
}

export { DIFFICULTY };
