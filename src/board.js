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
 *  - le fichier de sauvegarde garde le format JSON de l'amont (position [ligne, colonne], valeur 0..9, etc.) ;
 *  - mode Jigsaw (ajout de 5ud0ku) : le plateau lit ses régions dans un tableau case -> région (`regions`, les carrés de 3×3 par défaut) au lieu
 *    de les calculer ; une sauvegarde Jigsaw porte en plus le champ `regions` (81 chiffres), absent des sauvegardes classiques.
 */
import { ALIGNED, DIFFICULTY } from './generator.js';
import { REGIONS_CLASSIQUES, regionsValides } from './jigsaw.js';
import { REGIONS_16, REGIONS_4, regionsValidesN } from './sudoku_n.js';

const NONE = -1;

/** Chiffres affichés du 16×16 : 0 à 9 puis A à F (valeur interne 0..15). */
export const CHIFFRES = '0123456789ABCDEF';
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

const geometries = new WeakMap();

/** Taille (côté) d'un tableau de régions : 9 pour 81 cases, 16 pour 256. */
const tailleDe = (regions) => Math.round(Math.sqrt(regions.length));

/**
 * Lignes, colonnes, cases de chaque région (`blocks`) et cases alignées de chaque case (`aligned21` : la case elle-même, puis sa colonne, sa ligne et sa région, sans
 * doublon, dans le même ordre que l'amont) pour un tableau de régions. Les carrés de 3×3 gardent exactement les tableaux d'origine. Pour des régions irrégulières,
 * une case partage souvent des cases de sa région avec sa ligne ou sa colonne : elle a donc moins de 21 cases alignées. Le 16×16 a 4×4 + 15 + 15 - ... cases alignées.
 */
function geometrie(regions) {
  if (regions === REGIONS_CLASSIQUES) return { n: 9, rows: ROWS, cols: COLS, blocks: BLOCKS, aligned21: ALIGNED21 };
  let g = geometries.get(regions);
  if (!g) {
    const n = tailleDe(regions), N = n * n;
    const rows = Array.from({ length: n }, (_, r) => Int16Array.from({ length: n }, (_, c) => r * n + c));
    const cols = Array.from({ length: n }, (_, c) => Int16Array.from({ length: n }, (_, r) => r * n + c));
    const blocks = Array.from({ length: n }, (_, b) => Int16Array.from(Array.from({ length: N }, (_, p) => p).filter((p) => regions[p] === b)));
    const aligned21 = Array.from({ length: N }, (_, p) => {
      const vus = new Set();
      for (let r = 0; r < n; r++) vus.add(r * n + (p % n));
      for (let c = 0; c < n; c++) vus.add(Math.floor(p / n) * n + c);
      for (const q of blocks[regions[p]]) vus.add(q);
      vus.delete(p);
      return Int16Array.from([p, ...vus]);
    });
    g = { n, rows, cols, blocks, aligned21 };
    geometries.set(regions, g);
  }
  return g;
}

export class SudokuBoard {
  /** @param {Int8Array} [regions] tableau case -> région (les carrés de 3×3 par défaut ; REGIONS_16 pour le 16×16 : la taille se déduit de la longueur) */
  constructor(regions = REGIONS_CLASSIQUES) {
    this.regions = regions;
    const geo = geometrie(regions);
    this.n = geo.n;                        // côté de la grille : 9 ou 16
    this.N = geo.n * geo.n;                // nombre de cases
    this.rows = geo.rows;
    this.cols = geo.cols;
    this.blocks = geo.blocks;
    this.aligned21 = geo.aligned21;
    const n = this.n, N = this.N;
    this.value = new Int8Array(N).fill(NONE);
    this.earmarks = new Uint8Array(N * n);
    this.solution = new Int8Array(N).fill(NONE);
    this.fixed = new Uint8Array(N);
    this.test = new Uint8Array(N);         // 1 = valeur d'essai (affichée en vert, notes conservées) ; ajout de 5ud0ku
    this.inRow = new Int16Array(n * n);    // [chiffre * n + ligne]
    this.inCol = new Int16Array(n * n);
    this.inBlock = new Int16Array(n * n);  // [chiffre * n + bloc]
    this.broken = new Set();
    this.totalFixed = 0;
    this.totalFilled = 0;
    this.totalEarmarks = 0;
    this.difficultyCategory = DIFFICULTY.EASY;
    this.loadedTime = 0;
  }

  /** Grille pleine, sans conflit, et sans valeur d'essai : une valeur d'essai ne fait pas gagner (décision de l'Auctor). */
  isComplete() {
    if (this.broken.size !== 0 || this.totalFilled !== this.N) return false;
    for (let p = 0; p < this.N; p++) if (this.test[p]) return false;
    return true;
  }

  isEmpty() { return this.totalFilled === this.totalFixed && this.totalEarmarks === 0; }

  /** Vrai pour un plateau Jigsaw (régions irrégulières) ; faux pour le sudoku classique. */
  get isJigsaw() { return this.regions !== REGIONS_CLASSIQUES && this.regions !== REGIONS_16 && this.regions !== REGIONS_4; }

  /** Vrai pour la petite grille 4×4 (blocs de 2×2, chiffres 1 à 4, une seule difficulté : débutants et enfants). */
  get isPetit() { return this.n === 4; }

  /** Vrai pour la grande grille 16×16 (blocs de 4×4 ou régions irrégulières, chiffres 0 à 9 puis A à F). */
  get isHex() { return this.n === 16; }

  /** Le partage « # » de l'amont ne sait décrire que le sudoku classique 9×9. */
  get supportsHash() { return this.n === 9 && !this.isJigsaw; }

  rowOf(p) { return Math.floor(p / this.n); }

  colOf(p) { return p % this.n; }

  /** Toutes les cases en un seul tableau : valeur donnée 0..n-1, ou -1 pour une case qui n'est pas donnée. */
  fixedValues() { return Int8Array.from(this.value, (v, p) => (this.fixed[p] ? v : NONE)); }

  isFixed(p) { return this.fixed[p] === 1; }

  /** 9x9 de valeurs 0..8 pour les cases données (fixes), null ailleurs. */
  fixedCells() {
    const n = this.n;
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (this.fixed[r * n + c] ? this.value[r * n + c] : null)));
  }

  // --- notes (earmarks) ---

  isEarmarkEnabled(p, num) { return this.earmarks[p * this.n + num] === 1; }

  enableEarmark(p, num) {
    if (!this.earmarks[p * this.n + num]) this.totalEarmarks++;
    this.earmarks[p * this.n + num] = 1;
  }

  disableEarmark(p, num) {
    if (this.earmarks[p * this.n + num]) this.totalEarmarks--;
    this.earmarks[p * this.n + num] = 0;
  }

  disableAllEarmarks(p) {
    for (let k = 0; k < this.n; k++) if (this.earmarks[p * this.n + k]) this.disableEarmark(p, k);
  }

  hasEarmarks(p) {
    for (let k = 0; k < this.n; k++) if (this.earmarks[p * this.n + k]) return true;
    return false;
  }

  /** Un chiffre est possible dans la case s'il n'apparaît ni dans sa ligne, ni dans sa colonne, ni dans son bloc. */
  isEarmarkPossible(p, num) {
    const n = this.n;
    return this.inRow[num * n + this.rowOf(p)] === 0 && this.inCol[num * n + this.colOf(p)] === 0 && this.inBlock[num * n + this.regions[p]] === 0;
  }

  cellPossibilities(p) { return Array.from({ length: this.n }, (_, k) => this.isEarmarkPossible(p, k)); }

  // --- valeurs ---

  _occ(p, val, delta) {
    const n = this.n;
    this.inRow[val * n + this.rowOf(p)] += delta;
    this.inCol[val * n + this.colOf(p)] += delta;
    this.inBlock[val * n + this.regions[p]] += delta;
  }

  /** Recalcule l'état « en conflit » des cases de la ligne, colonne et bloc de p qui portent l'un des chiffres donnés. */
  _refreshBroken(p, vals) {
    const n = this.n;
    for (const unit of [this.rows[this.rowOf(p)], this.cols[this.colOf(p)], this.blocks[this.regions[p]]]) {
      for (const q of unit) {
        const v = this.value[q];
        if (v === NONE || !vals.includes(v)) continue;
        const dup = this.inRow[v * n + this.rowOf(q)] > 1 || this.inCol[v * n + this.colOf(q)] > 1 || this.inBlock[v * n + this.regions[q]] > 1;
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
    for (let p = 0; p < this.N; p++) if (!this.fixed[p]) ret.push(p);
    return ret;
  }

  // --- constructions ---

  /** Plateau d'un puzzle généré : { puzzle: 9x9 (0..8 | null), solution: 9x9 (0..8), difficulty }. */
  static fromGenerated(puzzle, solution, difficulty, regions = REGIONS_CLASSIQUES) {
    const b = new SudokuBoard(regions);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        b.initCell(idx(r, c), puzzle[r][c]);
        b.solution[idx(r, c)] = solution[r][c];
      }
    }
    b.difficultyCategory = difficulty;
    return b;
  }

  /** Plateau d'un puzzle Jigsaw ou 16×16 généré : puzzle et solution en tableaux de N valeurs (0..n-1, -1 = vide) et le tableau des régions. */
  static fromFlat(puzzle, solution, difficulty, regions) {
    const b = new SudokuBoard(regions);
    for (let p = 0; p < b.N; p++) {
      b.initCell(p, puzzle[p] < 0 ? null : puzzle[p]);
      b.solution[p] = solution[p];
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
    for (let p = 0; p < this.N; p++) ret += this.fixed[p] ? (this.n === 16 ? CHIFFRES[this.value[p]] : String(this.value[p] + 1)) : (this.n === 9 ? '0' : '.');
    return ret;
  }

  /** Neuf lignes de 9 caractères (« . » pour vide), pour l'exportation. */
  fixedToStringPretty() {
    let ret = '';
    const n = this.n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) { const v = this.value[r * n + c]; ret += v === NONE ? '.' : (n === 16 ? CHIFFRES[v] : String(v + 1)); }
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
    if (!this.supportsHash) throw new SudokuError(ERRORS.GENERIC);
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
    const n = this.n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const p = r * n + c;
        const marks = [];
        for (let k = 0; k < n; k++) if (this.earmarks[p * n + k]) marks.push(k + 1);
        const cell = { position: [r, c], value: this.value[p] === NONE ? 0 : this.value[p] + 1, fixed: this.fixed[p] === 1, earmarks: marks };
        if (this.test[p]) cell.test = true; // champ ajouté par 5ud0ku, ignoré par l'amont
        cells.push(cell);
      }
    }
    const json = { difficulty_category: this.difficultyCategory, time_elapsed: elapsedTime, cells };
    // champs ajoutés par 5ud0ku, absents d'une sauvegarde classique : `regions` (mode Jigsaw : un chiffre par case, hexadécimal en 16×16) et `size: 16`
    if (this.isJigsaw) json.regions = Array.from(this.regions, (v) => v.toString(16)).join('');
    if (this.isHex) json.size = 16;
    if (this.isPetit) json.size = 4;
    return json;
  }

  /** @param {object|string} data objet issu de toJson, ou son texte JSON */
  static fromJson(data) {
    let b;
    try { b = typeof data === 'string' ? JSON.parse(data) : data; } catch { throw new SudokuError(ERRORS.INVALID_SAVE_DATA); }
    check(b && Array.isArray(b.cells) && typeof b.time_elapsed === 'number');
    // -1 : minuteur désactivé (l'amont refusait aussi 0, ce qui rendait illisible une sauvegarde faite avant la première seconde)
    check(b.time_elapsed >= 0 || b.time_elapsed === -1);
    let regions = REGIONS_CLASSIQUES;
    if (b.size !== undefined) {   // sauvegarde 16×16 (blocs de 4×4, ou `regions` pour un Jigsaw) ou 4×4 (blocs de 2×2) : les seules tailles admises en plus du 9×9
      check(b.size === 16 || b.size === 4);
      regions = b.size === 16 ? REGIONS_16 : REGIONS_4;
      check(b.size === 16 || b.regions === undefined);
    }
    const n = regions === REGIONS_16 ? 16 : regions === REGIONS_4 ? 4 : 9;
    check(b.cells.length <= n * n);
    if (b.regions !== undefined && n === 16) {   // Jigsaw 16×16 : 256 chiffres hexadécimaux, seize régions valables ; des blocs de 4×4 ramènent au plateau 16×16 ordinaire
      check(typeof b.regions === 'string' && /^[0-9a-f]{256}$/.test(b.regions));
      const lues = Int8Array.from(b.regions, (c) => parseInt(c, 16));
      check(regionsValidesN(lues, 16));
      if (lues.some((v, p) => v !== REGIONS_16[p])) regions = lues;
    } else if (b.regions !== undefined) {   // sauvegarde Jigsaw : 81 chiffres 0..8, neuf régions valables ; des carrés de 3×3 ramènent au plateau classique
      check(typeof b.regions === 'string' && /^[0-8]{81}$/.test(b.regions));
      const lues = Int8Array.from(b.regions, (c) => Number(c));
      check(regionsValides(lues));
      if (lues.some((v, p) => v !== REGIONS_CLASSIQUES[p])) regions = lues;
    }
    const board = new SudokuBoard(regions);
    board.loadedTime = b.time_elapsed;
    // inutilisé : le solveur recalcule la difficulté
    board.difficultyCategory = b.difficulty_category ?? DIFFICULTY.EASY;
    for (const cell of b.cells) {
      check(Array.isArray(cell.position) && cell.position.length === 2);
      const [row, col] = cell.position;
      check(Number.isInteger(row) && row >= 0 && row < n);
      check(Number.isInteger(col) && col >= 0 && col < n);
      const p = row * n + col;
      const val = cell.value;
      check(Number.isInteger(val) && val >= 0 && val <= n);
      if (val !== 0) {
        board.insert(p, val - 1);
        if (cell.fixed) { board.totalFixed++; board.fixed[p] = 1; } else if (cell.test === true) board.test[p] = 1;
      }
      check(Array.isArray(cell.earmarks) && cell.earmarks.length <= n);
      for (const num of cell.earmarks) {
        check(Number.isInteger(num) && num >= 1 && num <= n);
        check(!board.isEarmarkEnabled(p, num - 1));
        board.enableEarmark(p, num - 1);
      }
    }
    return board;
  }
}

export { idx, rowOf, colOf, blockOf };
