/*
 * 5ud0ku — portage de GNOME Sudoku : plateau
 * Copyright (C) 2024-2026 Johan Gay et les contributeurs de GNOME Sudoku
 * Copyright (C) 2026 Drusus (Gens Claudia)
 * Ce programme est un logiciel libre ; vous pouvez le redistribuer et/ou le modifier selon les termes de la
 * Licence Publique Générale GNU, version 3 ou (à votre choix) toute version ultérieure.
 *
 * Portage de `src/lib/board.rs` (amont gnome-sudoku cc27ff0c). On n'utilise le plateau que par SudokuGame
 * (qui tient la pile annuler/refaire) : ici, seulement l'état et les règles.
 *
 * Cases désignées par un indice 0..80 (ligne * 9 + colonne). Valeurs 0..8 (chiffre affiché = valeur + 1), -1 = vide.
 *
 * Différences voulues avec l'amont :
 *  - les cases en conflit (« broken ») sont recalculées autour de chaque changement, au lieu d'être retirées au cas
 *    par cas : l'amont peut laisser une case marquée en conflit après un remplacement quand trois chiffres
 *    identiques se trouvent dans la même ligne ;
 *  - une sauvegarde à 0 seconde est acceptée (l'amont la refuse) ;
 *  - `fromString` lit « 0 » comme une case vide (l'amont convertirait 0 en valeur négative) ;
 *  - le fichier de sauvegarde garde le format JSON de l'amont (position [ligne, colonne], valeur 0..9, etc.).
 */
import { ALIGNED, DIFFICULTY } from './generator.js';

const NONE = -1;
const idx = (row, col) => row * 9 + col;
const rowOf = (p) => Math.floor(p / 9);
const colOf = (p) => p % 9;
const blockOf = (p) => Math.floor(rowOf(p) / 3) * 3 + Math.floor(colOf(p) / 3);

export const ERRORS = Object.freeze({
  GENERIC: 'SudokuBoard Error',
  FILE_NOT_FOUND: 'Save Not Found',
  INVALID_PUZZLE: 'Invalid Puzzle',
  MULTIPLE_SOLUTIONS: 'Invalid Puzzle: Multiple solutions',
  INVALID_SAVE_DATA: 'Invalid Saved Puzzle',
  INVALID_SHARED_PUZZLE: 'Invalid Shared Puzzle Format',
});

export class SudokuError extends Error {
  constructor(message) { super(message); this.name = 'SudokuError'; }
}

const check = (cond, message = ERRORS.INVALID_SAVE_DATA) => { if (!cond) throw new SudokuError(message); };

// 21 cases alignées d'une case, elle-même comprise (l'amont : aligned_coords de SudokuBoardCell)
export const ALIGNED21 = ALIGNED.map((others, p) => Int8Array.from([p, ...others]));

// les 9 cases de chaque ligne, colonne et bloc
const ROWS = Array.from({ length: 9 }, (_, r) => Int8Array.from({ length: 9 }, (_, c) => idx(r, c)));
const COLS = Array.from({ length: 9 }, (_, c) => Int8Array.from({ length: 9 }, (_, r) => idx(r, c)));
const BLOCKS = Array.from({ length: 9 }, (_, b) => Int8Array.from({ length: 9 }, (_, i) => idx(Math.floor(b / 3) * 3 + Math.floor(i / 3), (b % 3) * 3 + (i % 3))));

export class SudokuBoard {
  constructor() {
    this.value = new Int8Array(81).fill(NONE);
    this.earmarks = new Uint8Array(81 * 9);
    this.solution = new Int8Array(81).fill(NONE);
    this.fixed = new Uint8Array(81);
    this.test = new Uint8Array(81);        // 1 = valeur d'essai (affichée en vert, notes conservées) ; ajout de 5ud0ku
    this.inRow = new Int16Array(9 * 9);    // [chiffre * 9 + ligne]
    this.inCol = new Int16Array(9 * 9);
    this.inBlock = new Int16Array(9 * 9);  // [chiffre * 9 + bloc]
    this.broken = new Set();
    this.totalFixed = 0;
    this.totalFilled = 0;
    this.totalEarmarks = 0;
    this.difficultyCategory = DIFFICULTY.EASY;
    this.loadedTime = 0;
  }

  /** Grille pleine, sans conflit, et sans valeur d'essai : une valeur d'essai ne fait pas gagner (décision de l'Auctor). */
  isComplete() {
    if (this.broken.size !== 0 || this.totalFilled !== 81) return false;
    for (let p = 0; p < 81; p++) if (this.test[p]) return false;
    return true;
  }

  isEmpty() { return this.totalFilled === this.totalFixed && this.totalEarmarks === 0; }

  isFixed(p) { return this.fixed[p] === 1; }

  /** 9x9 de valeurs 0..8 pour les cases données (fixes), null ailleurs. */
  fixedCells() {
    return Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => (this.fixed[idx(r, c)] ? this.value[idx(r, c)] : null)));
  }

  // --- notes (earmarks) ---

  isEarmarkEnabled(p, num) { return this.earmarks[p * 9 + num] === 1; }

  enableEarmark(p, num) {
    if (!this.earmarks[p * 9 + num]) this.totalEarmarks++;
    this.earmarks[p * 9 + num] = 1;
  }

  disableEarmark(p, num) {
    if (this.earmarks[p * 9 + num]) this.totalEarmarks--;
    this.earmarks[p * 9 + num] = 0;
  }

  disableAllEarmarks(p) {
    for (let n = 0; n < 9; n++) if (this.earmarks[p * 9 + n]) this.disableEarmark(p, n);
  }

  hasEarmarks(p) {
    for (let n = 0; n < 9; n++) if (this.earmarks[p * 9 + n]) return true;
    return false;
  }

  /** Un chiffre est possible dans la case s'il n'apparaît ni dans sa ligne, ni dans sa colonne, ni dans son bloc. */
  isEarmarkPossible(p, num) {
    return this.inRow[num * 9 + rowOf(p)] === 0 && this.inCol[num * 9 + colOf(p)] === 0 && this.inBlock[num * 9 + blockOf(p)] === 0;
  }

  cellPossibilities(p) { return Array.from({ length: 9 }, (_, n) => this.isEarmarkPossible(p, n)); }

  // --- valeurs ---

  _occ(p, val, delta) {
    this.inRow[val * 9 + rowOf(p)] += delta;
    this.inCol[val * 9 + colOf(p)] += delta;
    this.inBlock[val * 9 + blockOf(p)] += delta;
  }

  /** Recalcule l'état « en conflit » des cases de la ligne, colonne et bloc de p qui portent l'un des chiffres donnés. */
  _refreshBroken(p, vals) {
    for (const unit of [ROWS[rowOf(p)], COLS[colOf(p)], BLOCKS[blockOf(p)]]) {
      for (const q of unit) {
        const v = this.value[q];
        if (v === NONE || !vals.includes(v)) continue;
        const dup = this.inRow[v * 9 + rowOf(q)] > 1 || this.inCol[v * 9 + colOf(q)] > 1 || this.inBlock[v * 9 + blockOf(q)] > 1;
        if (dup) this.broken.add(q); else this.broken.delete(q);
      }
    }
  }

  remove(p) {
    const old = this.value[p];
    if (old === NONE) throw new SudokuError(ERRORS.GENERIC);
    this._occ(p, old, -1);
    this.totalFilled--;
    this.value[p] = NONE;
    this.test[p] = 0;
    this.broken.delete(p);
    this._refreshBroken(p, [old]);
  }

  insert(p, val) {
    const old = this.value[p];
    if (old !== NONE) this._occ(p, old, -1); else this.totalFilled++;
    this.value[p] = val;
    this.test[p] = 0;
    this._occ(p, val, +1);
    this.broken.delete(p);
    this._refreshBroken(p, old === NONE ? [val] : [old, val]);
  }

  /** @param {number} val 0..8 ou -1/null pour effacer ; @param {boolean} test valeur d'essai (jamais sur une case donnée) */
  setValue(p, val, test = false) {
    if (val == null || val === NONE) { this.remove(p); return; }
    this.insert(p, val);
    if (test && !this.fixed[p]) this.test[p] = 1;
  }

  initCell(p, val) {
    if (val == null || val === NONE) return;
    this.insert(p, val);
    this.fixed[p] = 1;
    this.totalFixed++;
  }

  cellsNotFixed() {
    const ret = [];
    for (let p = 0; p < 81; p++) if (!this.fixed[p]) ret.push(p);
    return ret;
  }

  // --- constructions ---

  /** Plateau d'un puzzle généré : { puzzle: 9x9 (0..8 | null), solution: 9x9 (0..8), difficulty }. */
  static fromGenerated(puzzle, solution, difficulty) {
    const b = new SudokuBoard();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        b.initCell(idx(r, c), puzzle[r][c]);
        b.solution[idx(r, c)] = solution[r][c];
      }
    }
    b.difficultyCategory = difficulty;
    return b;
  }

  /** 81 caractères : chiffres 1..9 pour les cases données, « . », espace ou « - » (ou 0) pour une case vide. */
  static fromString(s) {
    check(s.length >= 81 && s.length <= 100);
    const b = new SudokuBoard();
    let p = 0;
    for (const ch of s) {
      if (ch === '\n') continue;
      if (ch >= '1' && ch <= '9') b.initCell(p, ch.charCodeAt(0) - 49);
      else if (ch !== '.' && ch !== ' ' && ch !== '-' && ch !== '0') continue;
      if (++p === 81) return b;
    }
    throw new SudokuError(ERRORS.INVALID_SAVE_DATA);
  }

  fixedToString() {
    let ret = '';
    for (let p = 0; p < 81; p++) ret += this.fixed[p] ? String(this.value[p] + 1) : '0';
    return ret;
  }

  /** Neuf lignes de 9 caractères (« . » pour vide), pour l'exportation. */
  fixedToStringPretty() {
    let ret = '';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) { const v = this.value[idx(r, c)]; ret += v === NONE ? '.' : String(v + 1); }
      ret += '\n';
    }
    return ret;
  }

  /** Neuf premiers chiffres donnés, utilisés pour nommer un fichier. */
  fixedToStringShort() {
    let ret = '';
    for (let p = 0; p < 81; p++) {
      if (this.fixed[p]) { ret += String(this.value[p] + 1); if (ret.length === 9) return ret; }
    }
    return ret;
  }

  // --- partage « #… » (format de l'amont, compatible) ---

  /**
   * Chaîne de partage : « # », cinq caractères donnant le nombre de cases données de chaque chiffre (deux par
   * caractère), puis les positions, chiffre par chiffre. Format identique à l'amont.
   * Limite héritée : un chiffre donné neuf fois fausse le décodage de la longueur (limite de l'amont).
   */
  fixedToAscii() {
    const enc = (v0, v1) => String.fromCharCode(v0 + 33 + v1 * 9);
    const positions = Array.from({ length: 9 }, () => []);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.fixed[idx(r, c)]) positions[this.value[idx(r, c)]].push(enc(r, c));
      }
    }
    let ret = '#';
    for (let i = 0; i < 5; i++) {
      const len0 = positions[i * 2].length;
      const len1 = i !== 4 ? positions[i * 2 + 1].length : 0;
      ret += enc(len0, len1);
    }
    for (const list of positions) ret += list.join('');
    return ret;
  }

  static fromAscii(s) {
    const bad = () => new SudokuError(ERRORS.INVALID_SHARED_PUZZLE);
    if (typeof s !== 'string' || !s.startsWith('#') || s.length < 6) throw bad();
    const dec = (ch) => { const v = ch.charCodeAt(0) - 33; return [((v % 9) + 9) % 9, Math.floor(v / 9)]; };
    const ascii = s.slice(1);
    const lengths = ascii.slice(0, 5);
    const positions = ascii.slice(5);
    const sizes = [];
    [...lengths].forEach((ch, i) => {
      const [a, b] = dec(ch);
      sizes.push(a);
      if (i !== 4) sizes.push(b);
    });
    if (sizes.length !== 9) throw bad();
    let sum = 6;
    for (const n of sizes) sum += n;
    if (sum !== s.length) throw bad();
    const board = new SudokuBoard();
    let count = 0, current = 0;
    for (const ch of positions) {
      while (count >= sizes[current]) {
        count = 0;
        current++;
        if (current >= 9) throw bad();
      }
      const [row, col] = dec(ch);
      if (row >= 9 || col >= 9) throw bad();
      board.initCell(idx(row, col), current);
      count++;
    }
    return board;
  }

  // --- sauvegarde JSON (format de l'amont) ---

  /** @returns {object} objet sérialisable : { difficulty_category, time_elapsed, cells[81] } */
  toJson(elapsedTime) {
    const cells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = idx(r, c);
        const marks = [];
        for (let n = 0; n < 9; n++) if (this.earmarks[p * 9 + n]) marks.push(n + 1);
        const cell = { position: [r, c], value: this.value[p] === NONE ? 0 : this.value[p] + 1, fixed: this.fixed[p] === 1, earmarks: marks };
        if (this.test[p]) cell.test = true; // champ ajouté par 5ud0ku, ignoré par l'amont
        cells.push(cell);
      }
    }
    return { difficulty_category: this.difficultyCategory, time_elapsed: elapsedTime, cells };
  }

  /** @param {object|string} data objet issu de toJson, ou son texte JSON */
  static fromJson(data) {
    let b;
    try { b = typeof data === 'string' ? JSON.parse(data) : data; } catch { throw new SudokuError(ERRORS.INVALID_SAVE_DATA); }
    check(b && Array.isArray(b.cells) && typeof b.time_elapsed === 'number');
    // -1 : minuteur désactivé (l'amont refusait aussi 0, ce qui rendait illisible une sauvegarde faite avant la première seconde)
    check(b.time_elapsed >= 0 || b.time_elapsed === -1);
    check(b.cells.length <= 81);
    const board = new SudokuBoard();
    board.loadedTime = b.time_elapsed;
    // inutilisé : le solveur recalcule la difficulté
    board.difficultyCategory = b.difficulty_category ?? DIFFICULTY.EASY;
    for (const cell of b.cells) {
      check(Array.isArray(cell.position) && cell.position.length === 2);
      const [row, col] = cell.position;
      check(Number.isInteger(row) && row >= 0 && row < 9);
      check(Number.isInteger(col) && col >= 0 && col < 9);
      const p = idx(row, col);
      const val = cell.value;
      check(Number.isInteger(val) && val >= 0 && val <= 9);
      if (val !== 0) {
        board.insert(p, val - 1);
        if (cell.fixed) { board.totalFixed++; board.fixed[p] = 1; } else if (cell.test === true) board.test[p] = 1;
      }
      check(Array.isArray(cell.earmarks) && cell.earmarks.length <= 9);
      for (const num of cell.earmarks) {
        check(Number.isInteger(num) && num >= 1 && num <= 9);
        check(!board.isEarmarkEnabled(p, num - 1));
        board.enableEarmark(p, num - 1);
      }
    }
    return board;
  }
}

export { idx, rowOf, colOf, blockOf };
