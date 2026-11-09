/*
 * 5ud0ku — Jigsaw : sudoku à régions irrégulières (étape 0 : briques du mode)
 * Copyright (C) 2026 Drusus (Gens Claudia). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 *
 * Ce module n'existe pas dans GNOME Sudoku : c'est un ajout du portage (demande de Philippe, 2026-11-08). Il ne touche pas au mode classique
 * (`generator.js`, `board.js`) ; il pose les briques du mode Jigsaw :
 *
 *  - un TABLEAU des régions (case 0..80 -> région 0..8) à la place des carrés de 3×3 calculés par formule ;
 *  - un générateur de neuf régions connexes de neuf cases (déplacements de cases entre régions voisines à partir des carrés de 3×3), tiré d'une graine (`mulberry32`) ;
 *  - un solveur à régions quelconques (masques de bits, case la plus contrainte d'abord) qui compte les solutions jusqu'à une limite ;
 *  - un générateur de grille : régions -> grille complète -> retrait des indices un à un tant que la solution reste unique.
 *
 * La difficulté (`jigsaw_solveur.js`) et les codes de partage (`code.js`, JIGSAW_CODE_VERSION) s'y ajoutent depuis la 1.1.0. Toute évolution de l'algorithme change les
 * grilles d'un même numéro : le même principe que `code.js` s'applique (version de l'algorithme dans le code, règle d'or).
 */
import { mulberry32 } from './generator.js';

const N = 81;
const idx = (r, c) => r * 9 + c;
const ligneDe = (p) => Math.floor(p / 9);
const colonneDe = (p) => p % 9;

/** Régions du sudoku classique (carrés de 3×3) sous forme de tableau : sert de témoin au solveur général. */
export const REGIONS_CLASSIQUES = Int8Array.from({ length: N }, (_, p) => Math.floor(ligneDe(p) / 3) * 3 + Math.floor(colonneDe(p) / 3));

const VOISINS = Array.from({ length: N }, (_, p) => {
  const r = ligneDe(p), c = colonneDe(p), v = [];
  if (r > 0) v.push(idx(r - 1, c));
  if (r < 8) v.push(idx(r + 1, c));
  if (c > 0) v.push(idx(r, c - 1));
  if (c < 8) v.push(idx(r, c + 1));
  return v;
});

const POP = Uint8Array.from({ length: 512 }, (_, m) => { let n = 0; for (let x = m; x; x &= x - 1) n++; return n; });

export function melanger(tableau, rng) {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
}

/**
 * Un tableau de régions est valable si : 81 cases, chaque région 0..8 compte exactement 9 cases, est d'un seul tenant (voisins par un côté),
 * et n'est ni une ligne ni une colonne entière (elle doublerait alors une contrainte existante : la grille perdrait son intérêt).
 */
export function regionsValides(regions) {
  if (!regions || regions.length !== N) return false;
  const cases = Array.from({ length: 9 }, () => []);
  for (let p = 0; p < N; p++) {
    const g = regions[p];
    if (!Number.isInteger(g) || g < 0 || g > 8) return false;
    cases[g].push(p);
  }
  for (const liste of cases) {
    if (liste.length !== 9) return false;
    if (liste.every((p) => ligneDe(p) === ligneDe(liste[0])) || liste.every((p) => colonneDe(p) === colonneDe(liste[0]))) return false;
    const vus = new Set([liste[0]]);
    const pile = [liste[0]];
    while (pile.length) {
      const p = pile.pop();
      for (const q of VOISINS[p]) if (regions[q] === regions[p] && !vus.has(q)) { vus.add(q); pile.push(q); }
    }
    if (vus.size !== 9) return false;
  }
  return true;
}

/** Vrai si, à partir de la case `depart` (de la région g), on atteint 9 cases de la région g de proche en proche : la région est d'un seul tenant. */
function connexe(reg, g, depart) {
  const vus = [depart];
  for (let i = 0; i < vus.length; i++) {
    for (const q of VOISINS[vus[i]]) if (reg[q] === g && !vus.includes(q)) vus.push(q);
  }
  return vus.length === 9;
}

/**
 * Neuf régions connexes de neuf cases, tirées au hasard : on part des carrés de 3×3 (une partition valable) puis on déplace des cases d'une région à sa voisine.
 * Un pas déplace une case a de la région A vers la région B voisine, puis ramène dans A une case c de B qui touche A : chacune garde neuf cases, et on
 * refuse le pas si l'une des deux régions n'est plus d'un seul tenant. La partition reste donc valable à chaque pas : aucune tentative n'échoue. (Faire
 * grandir des régions au hasard depuis neuf graines bloque presque toujours sur les dernières cases : 300 essais sur 300 en échec au prototype ; l'échange
 * de deux cases voisines est lui presque toujours refusé, la case qui change de région perdant son seul lien.)
 * @param {number} pas nombre de pas acceptés (mélange des formes)
 * @returns {Int8Array} le tableau case -> région
 */
export function regionsAleatoires(rng, { pas = 400 } = {}) {
  for (let reprise = 0; reprise < 50; reprise++) {
    const reg = Int8Array.from(REGIONS_CLASSIQUES);
    let faits = 0;
    for (let essais = 0; faits < pas && essais < pas * 80; essais++) {
      const a = Math.floor(rng() * N);
      const voisines = VOISINS[a].filter((q) => reg[q] !== reg[a]);
      if (!voisines.length) continue;
      const A = reg[a], B = reg[voisines[Math.floor(rng() * voisines.length)]];
      reg[a] = B;                                    // A n'a plus que 8 cases, B en a 10
      const candidates = [];
      for (let p = 0; p < N; p++) if (reg[p] === B && p !== a && VOISINS[p].some((q) => reg[q] === A)) candidates.push(p);
      let fait = false;
      for (const c of melanger(candidates, rng)) {
        reg[c] = A;                                  // une case de B revient dans A : 9 et 9
        const departA = c, departB = a;
        if (connexe(reg, A, departA) && connexe(reg, B, departB)) { fait = true; break; }
        reg[c] = B;
      }
      if (fait) faits++; else reg[a] = A;
    }
    if (regionsValides(reg)) return reg;           // refus d'une ligne ou colonne entière (très rare)
  }
  throw new Error('Jigsaw : aucune partition en régions trouvée');
}

/** Contexte d'un solveur : masques des chiffres déjà présents par ligne, colonne et région (bit v = chiffre v + 1). */
function contexte(regions, donnees) {
  const val = Int8Array.from(donnees);
  const ligne = new Int16Array(9), col = new Int16Array(9), reg = new Int16Array(9);
  let vides = 0;
  for (let p = 0; p < N; p++) {
    if (val[p] < 0) { vides++; continue; }
    const bit = 1 << val[p];
    if ((ligne[ligneDe(p)] | col[colonneDe(p)] | reg[regions[p]]) & bit) return null;   // deux fois le même chiffre : grille impossible
    ligne[ligneDe(p)] |= bit; col[colonneDe(p)] |= bit; reg[regions[p]] |= bit;
  }
  return { val, ligne, col, reg, vides };
}

/**
 * Nombre de solutions d'une grille (valeurs 0..8, -1 = vide), compté jusqu'à `limite` : 0 = impossible, 1 = solution unique, `limite` = au moins autant.
 * Fonctionne pour toute partition en régions (classique ou Jigsaw).
 */
export function compterSolutions(regions, donnees, limite = 2) {
  const k = contexte(regions, donnees);
  if (!k) return 0;
  const { val, ligne, col, reg } = k;
  let compte = 0;
  const descendre = (restant) => {
    if (restant === 0) { compte++; return compte >= limite; }
    let meilleur = -1, masque = 0, nb = 10;
    for (let p = 0; p < N; p++) {
      if (val[p] >= 0) continue;
      const m = ~(ligne[ligneDe(p)] | col[colonneDe(p)] | reg[regions[p]]) & 511;
      const c = POP[m];
      if (c < nb) { meilleur = p; masque = m; nb = c; if (c <= 1) break; }
    }
    if (nb === 0) return false;
    const l = ligneDe(meilleur), c = colonneDe(meilleur), g = regions[meilleur];
    for (let v = 0; v < 9; v++) {
      const bit = 1 << v;
      if (!(masque & bit)) continue;
      val[meilleur] = v; ligne[l] |= bit; col[c] |= bit; reg[g] |= bit;
      const fini = descendre(restant - 1);
      val[meilleur] = -1; ligne[l] &= ~bit; col[c] &= ~bit; reg[g] &= ~bit;
      if (fini) return true;
    }
    return false;
  };
  descendre(k.vides);
  return compte;
}

/** Une grille complète au hasard pour ces régions, ou null si la recherche dépasse `budget` nœuds (les régions sont alors refaites). */
export function remplirGrille(regions, rng, budget = 40000) {
  const k = contexte(regions, new Int8Array(N).fill(-1));
  const { val, ligne, col, reg } = k;
  let noeuds = 0;
  const descendre = (restant) => {
    if (restant === 0) return true;
    if (++noeuds > budget) return false;
    let meilleur = -1, masque = 0, nb = 10;
    for (let p = 0; p < N; p++) {
      if (val[p] >= 0) continue;
      const m = ~(ligne[ligneDe(p)] | col[colonneDe(p)] | reg[regions[p]]) & 511;
      const c = POP[m];
      if (c < nb) { meilleur = p; masque = m; nb = c; if (c <= 1) break; }
    }
    if (nb === 0) return false;
    const l = ligneDe(meilleur), c = colonneDe(meilleur), g = regions[meilleur];
    const chiffres = [];
    for (let v = 0; v < 9; v++) if (masque & (1 << v)) chiffres.push(v);
    for (const v of melanger(chiffres, rng)) {
      const bit = 1 << v;
      val[meilleur] = v; ligne[l] |= bit; col[c] |= bit; reg[g] |= bit;
      if (descendre(restant - 1)) return true;
      val[meilleur] = -1; ligne[l] &= ~bit; col[c] &= ~bit; reg[g] &= ~bit;
      if (noeuds > budget) return false;
    }
    return false;
  };
  return descendre(N) ? val : null;
}

/**
 * Une grille Jigsaw déterminée par la graine : régions, solution complète, puzzle à solution unique (les indices sont retirés un à un, dans un ordre tiré de
 * la graine, tant que la solution reste unique ; on s'arrête à `indicesMin` indices ou quand plus aucun ne peut partir).
 * @returns {{regions: Int8Array, solution: Int8Array, puzzle: Int8Array, indices: number, graine: number}}
 */
export function genererJigsaw(graine, { indicesMin = 0 } = {}) {
  const rng = mulberry32(graine);
  for (;;) {
    const regions = regionsAleatoires(rng);
    const solution = remplirGrille(regions, rng);
    if (!solution) continue;
    const puzzle = Int8Array.from(solution);
    let indices = N;
    for (const p of melanger(Array.from({ length: N }, (_, i) => i), rng)) {
      if (indices <= indicesMin) break;
      const v = puzzle[p];
      puzzle[p] = -1;
      if (compterSolutions(regions, puzzle, 2) === 1) indices--; else puzzle[p] = v;
    }
    return { regions, solution, puzzle, indices, graine };
  }
}
