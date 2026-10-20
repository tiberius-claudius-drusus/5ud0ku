/*
 * 5ud0ku — portage de GNOME Sudoku : générateur et solveur
 * Copyright (C) 2024-2026 Johan Gay et les contributeurs de GNOME Sudoku
 * Copyright (C) 2026 Drusus (Gens Claudia)
 * Ce programme est un logiciel libre ; vous pouvez le redistribuer et/ou le modifier selon les termes de la
 * Licence Publique Générale GNU, version 3 ou (à votre choix) toute version ultérieure.
 *
 * Portage fidèle de `src/lib/board_generator.rs` (amont gnome-sudoku cc27ff0c), lui-même un portage de QQWing
 * (https://github.com/stephenostermiller/qqwing). Mêmes techniques de résolution, dans le même ordre, donc la même
 * classification de difficulté :
 *     1. cases à une seule possibilité (« single »)            -> Facile
 *     2. valeur unique dans une ligne, colonne ou bloc          -> Moyen
 *     3. paires nues, paires pointantes, réductions de bloc,
 *        paires cachées                                         -> Difficile
 *     4. au moins un essai (« guess »)                          -> Très difficile
 *
 * Différences voulues avec l'amont :
 *  - le générateur pseudo-aléatoire est une graine de 32 bits (mulberry32) : un même numéro donne le même puzzle ;
 *    l'amont utilise `fastrand` sans graine ;
 *  - l'ordre des 20 cases alignées d'une case est déterministe (l'amont l'obtient d'un HashSet, donc dans un ordre
 *    quelconque) ;
 *  - valeurs 0..8 comme dans l'amont (le chiffre affiché est valeur + 1) ; « aucune » est -1 au lieu d'`Option`.
 */

export const DIFFICULTY = Object.freeze({ UNKNOWN: 0, EASY: 1, MEDIUM: 2, HARD: 3, VERY_HARD: 4, CUSTOM: 5 });

const NONE = -1;

// Actions du solveur (GeneratorAction de l'amont)
const A = Object.freeze({
  SINGLE: 0, HIDDEN_SINGLE_ROW: 1, HIDDEN_SINGLE_COL: 2, HIDDEN_SINGLE_BLOCK: 3, GUESS: 4,
  NAKED_PAIR_ROW: 5, NAKED_PAIR_COL: 6, NAKED_PAIR_BLOCK: 7,
  POINTING_ROW: 8, POINTING_COL: 9, ROW_BLOCK_REDUCTION: 10, COL_BLOCK_REDUCTION: 11,
  HIDDEN_PAIR_ROW: 12, HIDDEN_PAIR_COL: 13, HIDDEN_PAIR_BLOCK: 14,
});

const idx = (row, col) => row * 9 + col;

/** Graine -> générateur de nombres dans [0, 1) (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  const b = new Uint32Array(1);
  globalThis.crypto.getRandomValues(b);
  return b[0];
}

// 20 cases alignées (même ligne, même colonne, même bloc), la case elle-même exclue
export const ALIGNED = Array.from({ length: 81 }, (_, i) => {
  const row = Math.floor(i / 9), col = i % 9;
  const seen = new Set();
  for (let r = 0; r < 9; r++) seen.add(idx(r, col));
  for (let c = 0; c < 9; c++) seen.add(idx(row, c));
  const r0 = Math.floor(row / 3) * 3, c0 = Math.floor(col / 3) * 3;
  for (let r = r0; r < r0 + 3; r++) for (let c = c0; c < c0 + 3; c++) seen.add(idx(r, c));
  seen.delete(i);
  return Int8Array.from(seen);
});

const newCounts = () => ({
  singles: 0, hiddenSinglesRow: 0, hiddenSinglesCol: 0, hiddenSinglesBlock: 0, guesses: 0,
  nakedPairsRow: 0, nakedPairsCol: 0, nakedPairsBlock: 0,
  pointingPairsTripleRow: 0, pointingPairsTripleCol: 0, rowBlockReductions: 0, colBlockReductions: 0,
  hiddenPairsRow: 0, hiddenPairsCol: 0, hiddenPairsBlock: 0,
});

function addAction(c, action) {
  switch (action) {
    case A.SINGLE: c.singles++; break;
    case A.HIDDEN_SINGLE_ROW: c.hiddenSinglesRow++; break;
    case A.HIDDEN_SINGLE_COL: c.hiddenSinglesCol++; break;
    case A.HIDDEN_SINGLE_BLOCK: c.hiddenSinglesBlock++; break;
    case A.GUESS: c.guesses++; break;
    case A.NAKED_PAIR_ROW: c.nakedPairsRow++; break;
    case A.NAKED_PAIR_COL: c.nakedPairsCol++; break;
    case A.NAKED_PAIR_BLOCK: c.nakedPairsBlock++; break;
    case A.POINTING_ROW: c.pointingPairsTripleRow++; break;
    case A.POINTING_COL: c.pointingPairsTripleCol++; break;
    case A.ROW_BLOCK_REDUCTION: c.rowBlockReductions++; break;
    case A.COL_BLOCK_REDUCTION: c.colBlockReductions++; break;
    case A.HIDDEN_PAIR_ROW: c.hiddenPairsRow++; break;
    case A.HIDDEN_PAIR_COL: c.hiddenPairsCol++; break;
    case A.HIDDEN_PAIR_BLOCK: c.hiddenPairsBlock++; break;
  }
}

export class SudokuGenerator {
  /** @param {number} [seed] graine 32 bits ; au hasard si absente */
  constructor(seed = randomSeed()) {
    this.seed = seed >>> 0;
    this.rand = mulberry32(this.seed);
    this.value = new Int8Array(81).fill(NONE);        // valeurs données (0..8), inchangées pendant la résolution
    this.solVal = new Int8Array(81).fill(NONE);       // valeur trouvée par le solveur
    this.solRound = new Int16Array(81).fill(NONE);
    this.imp = new Int16Array(81 * 9).fill(NONE);     // tour où la possibilité a été écartée, NONE = encore possible
    // positions : ordre de l'amont (colonne par colonne)
    this.positions = Array.from({ length: 81 }, (_, i) => idx(i % 9, Math.floor(i / 9)));
    this.positionsRandom = this.positions.slice();
    this.randomPossibility = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    this.counts = newCounts();
  }

  // --- aléatoire ---

  _int(n) { return Math.floor(this.rand() * n); }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this._int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  shuffleArrays() {
    this._shuffle(this.positionsRandom);
    this._shuffle(this.randomPossibility);
  }

  // --- état ---

  _cellReset(p) {
    this.solVal[p] = NONE; this.solRound[p] = NONE;
    this.imp.fill(NONE, p * 9, p * 9 + 9);
  }

  _reset() {
    for (const p of this.positions) { this._cellReset(p); this.value[p] = NONE; }
    this.counts = newCounts();
  }

  /** Ne réinitialise pas les valeurs données. Renvoie false si les données se contredisent. */
  _localReset() {
    for (let p = 0; p < 81; p++) this._cellReset(p);
    for (let p = 0; p < 81; p++) {
      const v = this.value[p];
      if (v !== NONE) {
        if (this.imp[p * 9 + v] !== NONE) { this._reset(); return false; }
        this._mark(p, 0, v);
      }
    }
    this.counts = newCounts();
    return true;
  }

  /** @param {(number|null)[][]|number[]} puzzle 9x9 de valeurs 0..8 ou null/-1, ou 81 valeurs à plat */
  setPuzzle(puzzle) {
    this._reset();
    const flat = Array.isArray(puzzle[0]) ? puzzle.flat() : puzzle;
    for (let p = 0; p < 81; p++) this.value[p] = flat[p] == null ? NONE : flat[p];
    return this._localReset();
  }

  /** Format QQWing : 81 caractères, « . » pour une case vide, chiffres 1..9 sinon (retours à la ligne ignorés). */
  setPuzzleQQWing(text) {
    this._reset();
    let p = 0;
    for (const c of text) {
      if (c === '\n' || c === '\r') continue;
      if (c >= '1' && c <= '9') this.value[p] = c.charCodeAt(0) - 49;
      else if (c !== '.') throw new Error('Puzzle QQWing invalide');
      if (++p === 81) break;
    }
    return this._localReset();
  }

  getPuzzle() {
    return Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => (this.value[idx(r, c)] === NONE ? null : this.value[idx(r, c)])));
  }

  getSolution() {
    return Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => {
      const v = this.solVal[idx(r, c)];
      if (v === NONE) throw new Error('Pas de solution');
      return v;
    }));
  }

  isSolved() {
    for (let p = 0; p < 81; p++) if (this.solVal[p] === NONE) return false;
    return true;
  }

  /** Écarte, dans les cases alignées, la valeur posée (mark de l'amont). */
  _mark(p, round, value) {
    if (this.solVal[p] !== NONE) throw new Error('Marking position that already has been marked.');
    if (this.imp[p * 9 + value] !== NONE) throw new Error('Marking impossible position.');
    this.solVal[p] = value; this.solRound[p] = round;
    for (let n = 0; n < 9; n++) if (this.imp[p * 9 + n] === NONE) this.imp[p * 9 + n] = round;
    for (const q of ALIGNED[p]) if (this.imp[q * 9 + value] === NONE) this.imp[q * 9 + value] = round;
  }

  _isImpossible() {
    outer: for (let p = 0; p < 81; p++) {
      if (this.solVal[p] !== NONE) continue;
      for (let n = 0; n < 9; n++) if (this.imp[p * 9 + n] === NONE) continue outer;
      return true;
    }
    return false;
  }

  _countPossibilitiesLimited(p, limit) {
    let count = 0;
    for (let n = 0; n < 9; n++) {
      if (this.imp[p * 9 + n] !== NONE) continue;
      if (++count > limit) return false;
    }
    return count === limit;
  }

  _findCellWithFewestPossibilities() {
    let min = Infinity, best = 0;
    for (let p = 0; p < 81; p++) {
      if (this.solVal[p] !== NONE) continue;
      let count = 0, skip = false;
      for (let n = 0; n < 9; n++) {
        if (this.imp[p * 9 + n] !== NONE) continue;
        if (++count >= min) { skip = true; break; }
      }
      if (skip) continue;
      if (count < min) { min = count; best = p; if (min === 1) return best; }
    }
    return best;
  }

  // --- techniques de résolution (chacune renvoie une action de pile ou null) ---

  _soloCell(round) {
    for (let p = 0; p < 81; p++) {
      if (this.solVal[p] !== NONE) continue;
      let value = NONE, several = false;
      for (let n = 0; n < 9; n++) {
        if (this.imp[p * 9 + n] !== NONE) continue;
        if (value !== NONE) { several = true; break; }
        value = n;
      }
      if (!several && value !== NONE) {
        this._mark(p, round, value);
        return { pos: p, action: A.SINGLE, round };
      }
    }
    return null;
  }

  /** Valeur n'ayant qu'une case possible dans un groupe de 9 cases (ligne, colonne ou bloc). */
  _hiddenSingle(cellsOf, action, round, numOuter) {
    const run = (num, g) => {
      let found = NONE;
      for (let i = 0; i < 9; i++) {
        const p = cellsOf(g, i);
        if (this.imp[p * 9 + num] === NONE) { if (found !== NONE) return null; found = p; }
      }
      if (found !== NONE) { this._mark(found, round, num); return { pos: found, action, round }; }
      return null;
    };
    if (numOuter) {
      for (let num = 0; num < 9; num++) for (let g = 0; g < 9; g++) { const r = run(num, g); if (r) return r; }
    } else {
      for (let g = 0; g < 9; g++) for (let num = 0; num < 9; num++) { const r = run(num, g); if (r) return r; }
    }
    return null;
  }

  _onlyInRow(round) { return this._hiddenSingle((g, i) => idx(g, i), A.HIDDEN_SINGLE_ROW, round, true); }
  _onlyInCol(round) { return this._hiddenSingle((g, i) => idx(i, g), A.HIDDEN_SINGLE_COL, round, false); }
  _onlyInBlock(round) {
    return this._hiddenSingle(blockCell, A.HIDDEN_SINGLE_BLOCK, round, false);
  }

  _checkIfNakedPair(p0, p1) {
    for (let n = 0; n < 9; n++) if ((this.imp[p0 * 9 + n] === NONE) !== (this.imp[p1 * 9 + n] === NONE)) return false;
    return true;
  }

  _pairPossibility(p) {
    const ret = [];
    for (let n = 0; n < 9 && ret.length < 2; n++) if (this.imp[p * 9 + n] === NONE) ret.push(n);
    return ret;
  }

  _clearPair(round, p0, p1) {
    const poss = this._pairPossibility(p0);
    const row0 = Math.floor(p0 / 9), col0 = p0 % 9, row1 = Math.floor(p1 / 9), col1 = p1 % 9;
    const sameBlock = Math.floor(row0 / 3) === Math.floor(row1 / 3) && Math.floor(col0 / 3) === Math.floor(col1 / 3);
    const strike = (q) => {
      let did = false;
      for (const n of poss) if (this.imp[q * 9 + n] === NONE) { this.imp[q * 9 + n] = round; did = true; }
      return did;
    };
    if (sameBlock) {
      let did = false;
      const rs = Math.floor(row0 / 3) * 3, cs = Math.floor(col0 / 3) * 3;
      for (let r = rs; r < rs + 3; r++) {
        for (let c = cs; c < cs + 3; c++) {
          if ((c === col0 && r === row0) || (c === col1 && r === row1)) continue;
          if (strike(idx(r, c))) did = true;
        }
      }
      if (did) return { pos: idx(rs, cs), action: A.NAKED_PAIR_BLOCK, round };
    }
    if (col0 === col1) {
      let did = false;
      for (let r = 0; r < 9; r++) { if (r === row0 || r === row1) continue; if (strike(idx(r, col0))) did = true; }
      if (did) return { pos: idx(0, col0), action: A.NAKED_PAIR_COL, round };
    } else if (row0 === row1) {
      let did = false;
      for (let c = 0; c < 9; c++) { if (c === col0 || c === col1) continue; if (strike(idx(row0, c))) did = true; }
      if (did) return { pos: idx(row0, 0), action: A.NAKED_PAIR_ROW, round };
    }
    return null;
  }

  _nakedPairs(round) {
    for (let p = 0; p < 81; p++) {
      if (!this._countPossibilitiesLimited(p, 2)) continue;
      for (const q of ALIGNED[p]) {
        if (!this._checkIfNakedPair(p, q)) continue;
        const a = this._clearPair(round, p, q);
        if (a) return a;
      }
    }
    return null;
  }

  _nakify(num0, num1, p0, p1, round, action) {
    for (const p of [p0, p1]) {
      let did = false;
      for (let n = 0; n < 9; n++) {
        if (n === num0 || n === num1) continue;
        if (this.imp[p * 9 + n] === NONE) { did = true; this.imp[p * 9 + n] = round; }
      }
      // un seul des deux est traité à la fois, à cause de la méthode de retour arrière
      if (did) return { pos: p, action, round };
    }
    return null;
  }

  /** Deux cases exactement pour un nombre dans un groupe : renvoie [p, q] ou null. */
  _twoCells(cellsOf, g, num) {
    let a = NONE, b = NONE;
    for (let i = 0; i < 9; i++) {
      const p = cellsOf(g, i);
      if (this.imp[p * 9 + num] !== NONE) continue;
      if (a === NONE) a = p; else if (b === NONE) b = p; else return null;
    }
    return a !== NONE && b !== NONE ? [a, b] : null;
  }

  _hiddenPairs(round, cellsOf, action, same) {
    for (let num0 = 0; num0 < 9; num0++) {
      for (let g = 0; g < 9; g++) {
        const pair0 = this._twoCells(cellsOf, g, num0);
        if (!pair0) continue;
        for (let num1 = num0 + 1; num1 < 9; num1++) {
          const pair1 = this._twoCells(cellsOf, g, num1);
          if (!pair1) continue;
          if (!same(pair0, pair1)) continue;
          const a = this._nakify(num0, num1, pair0[0], pair1[1], round, action);
          if (a) return a;
        }
      }
    }
    return null;
  }

  // Les conditions de l'amont pour les lignes et colonnes ne comparent qu'une coordonnée ; reprises à l'identique.
  _pairsInRow(round) {
    const col = (p) => p % 9;
    return this._hiddenPairs(round, (g, i) => idx(g, i), A.HIDDEN_PAIR_ROW,
      (p0, p1) => !((col(p0[0]) !== col(p1[0]) || col(p0[1]) !== col(p1[1])) && (col(p0[1]) !== col(p1[1]) || col(p0[1]) !== col(p1[0]))));
  }

  _pairsInCol(round) {
    const row = (p) => Math.floor(p / 9);
    return this._hiddenPairs(round, (g, i) => idx(i, g), A.HIDDEN_PAIR_COL,
      (p0, p1) => !((row(p0[0]) !== row(p1[0]) || row(p0[1]) !== row(p1[1])) && (row(p0[1]) !== row(p1[1]) || row(p0[1]) !== row(p1[0]))));
  }

  _pairsInBlock(round) {
    return this._hiddenPairs(round, blockCell, A.HIDDEN_PAIR_BLOCK,
      (p0, p1) => !((p0[0] !== p1[0] || p0[1] !== p1[1]) && (p0[0] !== p1[1] || p0[1] !== p1[0])));
  }

  /** Dans un bloc, un nombre possible seulement sur une même ligne (2 ou 3 cases) : retiré du reste de la ligne. */
  _pointingRow(round) {
    for (let rb = 0; rb < 3; rb++) for (let cb = 0; cb < 3; cb++) for (let num = 0; num < 9; num++) {
      let row = NONE, count = 0, bad = false;
      for (let i = 0; i < 9; i++) {
        const r = rb * 3 + Math.floor(i / 3), c = cb * 3 + (i % 3);
        if (this.imp[idx(r, c) * 9 + num] !== NONE) continue;
        if (row !== NONE) { if (row === r) count++; else { bad = true; break; } } else { row = r; count++; }
      }
      if (bad || count < 2) continue;
      let did = false;
      for (let tc = 0; tc < 9; tc++) {
        if (Math.floor(tc / 3) === cb) continue;
        const k = idx(row, tc) * 9 + num;
        if (this.imp[k] === NONE) { this.imp[k] = round; did = true; }
      }
      if (did) return { pos: idx(row, cb * 3), action: A.POINTING_ROW, round };
    }
    return null;
  }

  _pointingCol(round) {
    for (let rb = 0; rb < 3; rb++) for (let cb = 0; cb < 3; cb++) for (let num = 0; num < 9; num++) {
      let col = NONE, count = 0, bad = false;
      for (let i = 0; i < 9; i++) {
        const r = rb * 3 + Math.floor(i / 3), c = cb * 3 + (i % 3);
        if (this.imp[idx(r, c) * 9 + num] !== NONE) continue;
        if (col !== NONE) { if (col === c) count++; else { bad = true; break; } } else { col = c; count++; }
      }
      if (bad || count < 2) continue;
      let did = false;
      for (let tr = 0; tr < 9; tr++) {
        if (Math.floor(tr / 3) === rb) continue;
        const k = idx(tr, col) * 9 + num;
        if (this.imp[k] === NONE) { this.imp[k] = round; did = true; }
      }
      if (did) return { pos: idx(rb * 3, col), action: A.POINTING_COL, round };
    }
    return null;
  }

  /** Dans une ligne, un nombre possible seulement dans un même bloc : retiré du reste du bloc. */
  _rowBlockReduction(round) {
    for (let row = 0; row < 9; row++) for (let num = 0; num < 9; num++) {
      let count = 0, cb = NONE, bad = false;
      for (let col = 0; col < 9; col++) {
        if (this.imp[idx(row, col) * 9 + num] !== NONE) continue;
        if (cb !== NONE) { if (cb === Math.floor(col / 3)) count++; else { bad = true; break; } } else { cb = Math.floor(col / 3); count++; }
      }
      if (bad || count < 2) continue;
      const cs = cb * 3, rs = Math.floor(row / 3) * 3;
      let did = false;
      for (let tr = rs; tr < rs + 3; tr++) for (let col = cs; col < cs + 3; col++) {
        if (tr === row) continue;
        const k = idx(tr, col) * 9 + num;
        if (this.imp[k] === NONE) { this.imp[k] = round; did = true; }
      }
      if (did) return { pos: idx(rs, cs), action: A.ROW_BLOCK_REDUCTION, round };
    }
    return null;
  }

  _colBlockReduction(round) {
    for (let col = 0; col < 9; col++) for (let num = 0; num < 9; num++) {
      let count = 0, rb = NONE, bad = false;
      for (let row = 0; row < 9; row++) {
        if (this.imp[idx(row, col) * 9 + num] !== NONE) continue;
        if (rb !== NONE) { if (rb === Math.floor(row / 3)) count++; else { bad = true; break; } } else { rb = Math.floor(row / 3); count++; }
      }
      if (bad || count < 2) continue;
      const rs = rb * 3, cs = Math.floor(col / 3) * 3;
      let did = false;
      for (let row = rs; row < rs + 3; row++) for (let tc = cs; tc < cs + 3; tc++) {
        if (tc === col) continue;
        const k = idx(row, tc) * 9 + num;
        if (this.imp[k] === NONE) { this.imp[k] = round; did = true; }
      }
      if (did) return { pos: idx(rs, cs), action: A.COL_BLOCK_REDUCTION, round };
    }
    return null;
  }

  _singleSolveMove(round) {
    return this._soloCell(round) || this._onlyInRow(round) || this._onlyInCol(round) || this._onlyInBlock(round)
      || this._nakedPairs(round) || this._pointingRow(round) || this._pointingCol(round)
      || this._rowBlockReduction(round) || this._colBlockReduction(round)
      || this._pairsInRow(round) || this._pairsInCol(round) || this._pairsInBlock(round);
  }

  // --- retour arrière ---

  _rollbackCell(p, round) {
    this.solVal[p] = NONE; this.solRound[p] = NONE;
    for (let n = 0; n < 9; n++) if (this.imp[p * 9 + n] === round) this.imp[p * 9 + n] = NONE;
  }

  _rollbackPos(p, round) {
    for (let n = 0; n < 9; n++) if (this.imp[p * 9 + n] === round) this.imp[p * 9 + n] = NONE;
  }

  _rollbackAligned(p, round) {
    this._rollbackCell(p, round);
    for (const q of ALIGNED[p]) for (let n = 0; n < 9; n++) if (this.imp[q * 9 + n] === round) this.imp[q * 9 + n] = NONE;
  }

  _rollbackStack({ pos, action, round }) {
    const row = Math.floor(pos / 9), col = pos % 9;
    switch (action) {
      case A.GUESS: case A.SINGLE: case A.HIDDEN_SINGLE_COL: case A.HIDDEN_SINGLE_BLOCK: case A.HIDDEN_SINGLE_ROW:
        this._rollbackAligned(pos, round); break;
      case A.POINTING_ROW: case A.NAKED_PAIR_ROW:
        for (let c = 0; c < 9; c++) this._rollbackPos(idx(row, c), round);
        break;
      case A.POINTING_COL: case A.NAKED_PAIR_COL:
        for (let r = 0; r < 9; r++) this._rollbackPos(idx(r, col), round);
        break;
      case A.ROW_BLOCK_REDUCTION: case A.COL_BLOCK_REDUCTION: case A.NAKED_PAIR_BLOCK: {
        const rs = Math.floor(row / 3) * 3, cs = Math.floor(col / 3) * 3;
        for (let r = rs; r < rs + 3; r++) for (let c = cs; c < cs + 3; c++) this._rollbackPos(idx(r, c), round);
        break;
      }
      default: this._rollbackCell(pos, round);
    }
  }

  // --- résolution ---

  _solver(round) {
    if (this.isSolved()) return true;
    const action = this._singleSolveMove(round);
    if (action) {
      if (this._isImpossible()) this._rollbackStack(action);
      else if (!this._solver(round + 1)) { this._rollbackStack(action); return false; }
      else { addAction(this.counts, action.action); return true; }
    }
    const order = this.randomPossibility.slice();
    const pos = this._findCellWithFewestPossibilities();
    for (const value of order) {
      if (this.imp[pos * 9 + value] !== NONE) continue;
      this._mark(pos, round, value);
      const guess = { pos, action: A.GUESS, round };
      if (this._isImpossible()) this._rollbackStack(guess);
      else if (!this._solver(round + 1)) this._rollbackStack(guess);
      else { addAction(this.counts, guess.action); return true; }
    }
    return false;
  }

  /** Résout (une solution quelconque). Renvoie la grille 9x9 ou null si impossible. */
  solve() {
    if (!this._localReset()) throw new Error('solve error');
    this.shuffleArrays();
    return this._solver(1) ? this.getSolution() : null;
  }

  _solverUnique(round) {
    if (this.isSolved()) return 1;
    let solutions = 0;
    const action = this._singleSolveMove(round);
    if (action) {
      if (this._isImpossible()) { this._rollbackStack(action); return 0; }
      solutions += this._solverUnique(round + 1);
      this._rollbackStack(action);
      return solutions;
    }
    const order = this.randomPossibility.slice();
    const pos = this._findCellWithFewestPossibilities();
    for (const value of order) {
      if (this.imp[pos * 9 + value] !== NONE) continue;
      this._mark(pos, round, value);
      const guess = { pos, action: A.GUESS, round };
      if (this._isImpossible()) this._rollbackStack(guess);
      else {
        solutions += this._solverUnique(round + 1);
        this._rollbackStack(guess);
        if (solutions > 1) break;
      }
    }
    return solutions;
  }

  checkUniqueSolution() {
    if (!this._localReset()) throw new Error('solve error');
    this.shuffleArrays();
    const solutions = this._solverUnique(1);
    this._localReset();
    return solutions === 1;
  }

  /** Résout si et seulement si la solution est unique ; sinon null. */
  solveUnique() {
    return this.checkUniqueSolution() ? this.solve() : null;
  }

  difficulty() {
    const c = this.counts;
    if (c.guesses > 0) return DIFFICULTY.VERY_HARD;
    if (c.nakedPairsRow + c.nakedPairsCol + c.nakedPairsBlock > 0) return DIFFICULTY.HARD;
    if (c.hiddenPairsRow + c.hiddenPairsCol + c.hiddenPairsBlock > 0) return DIFFICULTY.HARD;
    if (c.pointingPairsTripleRow + c.pointingPairsTripleCol > 0) return DIFFICULTY.HARD;
    if (c.rowBlockReductions + c.colBlockReductions > 0) return DIFFICULTY.HARD;
    if (c.hiddenSinglesRow + c.hiddenSinglesCol + c.hiddenSinglesBlock > 0) return DIFFICULTY.MEDIUM;
    if (c.singles > 0) return DIFFICULTY.EASY;
    throw new Error('unreachable difficulty');
  }

  // --- génération ---

  /** Génère un puzzle à solution unique, avec une symétrie tirée au hasard. */
  newPuzzle() {
    this._reset();
    const symmetry = this._int(4); // 0 rotation 90°, 1 rotation 180°, 2 miroir, 3 retournement
    if (!this.solve()) throw new Error('Impossible de remplir une grille');
    for (const p of this.positions) this.value[p] = this.solVal[p];
    this.shuffleArrays();
    for (const p of this.positionsRandom.slice()) {
      const value = this.value[p];
      if (value === NONE) continue;
      const r = Math.floor(p / 9), c = p % 9;
      let syms;
      switch (symmetry) {
        case 0: syms = [idx(8 - r, 8 - c), idx(8 - c, r), idx(c, 8 - r)]; break;
        case 1: syms = [idx(8 - r, 8 - c)]; break;
        case 2: syms = [idx(r, 8 - c)]; break;
        default: syms = [idx(8 - r, c)];
      }
      this.value[p] = NONE;
      const saved = syms.map((s) => this.value[s]);
      for (const s of syms) if (this.value[s] !== NONE) this.value[s] = NONE;
      if (this.checkUniqueSolution()) continue;
      this.value[p] = value;
      syms.forEach((s, i) => { if (saved[i] !== NONE) this.value[s] = saved[i]; });
    }
  }

  /** Génère jusqu'à obtenir la difficulté demandée. Renvoie { puzzle, solution, difficulty, seed }. */
  static generate(difficulty, seed = randomSeed()) {
    const g = new SudokuGenerator(seed);
    for (;;) {
      g.newPuzzle();
      g.solve();
      if (g.difficulty() === difficulty) return { puzzle: g.getPuzzle(), solution: g.getSolution(), difficulty, seed };
    }
  }
}

/** i-ème case (0..8) du bloc g (0..8, numérotés par ligne de blocs puis colonne de blocs). */
function blockCell(g, i) {
  return idx(Math.floor(g / 3) * 3 + Math.floor(i / 3), (g % 3) * 3 + (i % 3));
}
