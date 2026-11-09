/*
 * 5ud0ku — Jigsaw 9×9 : solveur par techniques et niveaux de difficulté
 * Copyright (C) 2026 Drusus (Gens Claudia). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 *
 * Même échelle de difficulté que le mode classique (celle de GNOME Sudoku / QQWing) et mêmes familles de techniques, appliquées dans le même ordre, mais
 * pour des régions QUELCONQUES (tableau case -> région) au lieu des carrés de 3×3 :
 *
 *     niveau 1 Facile          : cases à une seule possibilité (« single »)
 *     niveau 2 Moyen           : + valeur unique dans une ligne, une colonne ou une région (« hidden single »)
 *     niveau 3 Difficile       : + paires nues, paires cachées, « pointantes » et réductions (voir ci-dessous)
 *     niveau 4 Très difficile  : au moins un essai (hypothèse)
 *
 * « Pointante » généralisée : un chiffre qui, dans une unité U (ligne, colonne ou région), ne peut aller que dans les cases qu'elle partage avec une unité V d'un
 * autre genre (ligne ou colonne contre région) est retiré des autres cases de V. Pour les carrés de 3×3 c'est exactement la paire ou le triplet pointant et la
 * réduction ligne-bloc de l'amont ; pour des régions tordues, l'intersection peut compter de 2 à 8 cases.
 *
 * Chaque étape applique UNE technique (la plus facile qui avance) puis repart de la plus facile, comme l'amont : la difficulté d'une grille est celle de la
 * technique la plus difficile employée. Sur les régions classiques le classement doit donc redonner celui des fichiers de référence QQWing (test).
 */
import { mulberry32 } from './generator.js';
import { regionsAleatoires, remplirGrille, melanger } from './jigsaw.js';

export const NIVEAU = Object.freeze({ FACILE: 1, MOYEN: 2, DIFFICILE: 3, TRES_DIFFICILE: 4 });

const N = 81;
const POP = Uint8Array.from({ length: 512 }, (_, m) => { let n = 0; for (let x = m; x; x &= x - 1) n++; return n; });
const LOG = new Int8Array(512).fill(-1);
for (let v = 0; v < 9; v++) LOG[1 << v] = v;
const structures = new WeakMap();

/** Unités (9 lignes, 9 colonnes, 9 régions), voisins de chaque case et intersections ligne/colonne-région, calculés une fois par tableau de régions. */
function structure(regions) {
  let s = structures.get(regions);
  if (s) return s;
  const unites = [];
  for (let r = 0; r < 9; r++) unites.push(Int8Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) unites.push(Int8Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let g = 0; g < 9; g++) unites.push(Int8Array.from(Array.from({ length: N }, (_, p) => p).filter((p) => regions[p] === g)));
  const uDe = Array.from({ length: N }, (_, p) => [Math.floor(p / 9), 9 + (p % 9), 18 + regions[p]]);
  const voisins = Array.from({ length: N }, (_, p) => Int8Array.from(new Set(uDe[p].flatMap((u) => Array.from(unites[u]))).keys()).filter((q) => q !== p));
  const genre = (u) => Math.floor(u / 9);   // 0 ligne, 1 colonne, 2 région
  const croisements = [];
  for (let u = 0; u < 27; u++) {
    for (let v = 0; v < 27; v++) {
      if (genre(u) === genre(v) || (genre(u) < 2 && genre(v) < 2)) continue;   // ligne-colonne : une seule case, c'est une valeur unique
      const dansV = new Set(unites[v]);
      const inter = unites[u].filter((p) => dansV.has(p));
      if (inter.length < 2) continue;
      const dansU = new Set(unites[u]);
      croisements.push({ de: u, vers: v, inter: new Set(inter), reste: unites[v].filter((p) => !dansU.has(p)) });
    }
  }
  s = { unites, uDe, voisins, croisements };
  structures.set(regions, s);
  return s;
}

function etatInitial(regions, grille) {
  const st = { regions, s: structure(regions), val: new Int8Array(N).fill(-1), cand: new Int16Array(N).fill(511), restant: N };
  for (let p = 0; p < N; p++) if (grille[p] >= 0 && !poser(st, p, grille[p])) return null;
  return st;
}

function copie(st) {
  return { regions: st.regions, s: st.s, val: Int8Array.from(st.val), cand: Int16Array.from(st.cand), restant: st.restant };
}

/** Pose la valeur v en p et la retire des possibilités des voisins ; faux si cela crée une contradiction. */
function poser(st, p, v) {
  if (st.val[p] >= 0) return st.val[p] === v;
  const bit = 1 << v;
  if (!(st.cand[p] & bit)) return false;
  st.val[p] = v; st.cand[p] = bit; st.restant--;
  for (const q of st.s.voisins[p]) {
    if (st.val[q] >= 0) { if (st.val[q] === v) return false; continue; }
    if (st.cand[q] & bit) { st.cand[q] &= ~bit; if (st.cand[q] === 0) return false; }
  }
  return true;
}

/** Retire les chiffres de `masque` des possibilités de la case q ; renvoie 1 si quelque chose a changé, -1 si la case n'a plus aucune possibilité, 0 sinon. */
function retirer(st, q, masque) {
  if (st.val[q] >= 0 || !(st.cand[q] & masque)) return 0;
  st.cand[q] &= ~masque;
  return st.cand[q] === 0 ? -1 : 1;
}

// Chaque technique fait UNE avancée et renvoie 1 (avancé), 0 (rien) ou -1 (contradiction).

function singleNu(st) {
  for (let p = 0; p < N; p++) {
    if (st.val[p] >= 0) continue;
    if (POP[st.cand[p]] === 1) return poser(st, p, LOG[st.cand[p]]) ? 1 : -1;
  }
  return 0;
}

function valeurUnique(st) {
  for (const u of st.s.unites) {
    let pris = 0;
    for (const p of u) if (st.val[p] >= 0) pris |= 1 << st.val[p];
    for (let d = 0; d < 9; d++) {
      const bit = 1 << d;
      if (pris & bit) continue;
      let nb = 0, ou = -1;
      for (const p of u) if (st.val[p] < 0 && (st.cand[p] & bit)) { nb++; ou = p; }
      if (nb === 0) return -1;
      if (nb === 1) return poser(st, ou, d) ? 1 : -1;
    }
  }
  return 0;
}

function pairesNues(st) {
  for (const u of st.s.unites) {
    for (let i = 0; i < 9; i++) {
      const a = u[i];
      if (st.val[a] >= 0 || POP[st.cand[a]] !== 2) continue;
      for (let j = i + 1; j < 9; j++) {
        const b = u[j];
        if (st.val[b] >= 0 || st.cand[b] !== st.cand[a]) continue;
        let progres = 0;
        for (const q of u) {
          if (q === a || q === b) continue;
          const r = retirer(st, q, st.cand[a]);
          if (r < 0) return -1;
          progres |= r;
        }
        if (progres) return 1;
      }
    }
  }
  return 0;
}

function pointantes(st) {
  for (const x of st.s.croisements) {
    const U = st.s.unites[x.de];
    for (let d = 0; d < 9; d++) {
      const bit = 1 << d;
      let nb = 0, dehors = false;
      for (const p of U) if (st.val[p] < 0 && (st.cand[p] & bit)) { nb++; if (!x.inter.has(p)) { dehors = true; break; } }
      if (dehors || nb < 2) continue;
      let progres = 0;
      for (const q of x.reste) {
        const r = retirer(st, q, bit);
        if (r < 0) return -1;
        progres |= r;
      }
      if (progres) return 1;
    }
  }
  return 0;
}

function pairesCachees(st) {
  for (const u of st.s.unites) {
    const places = new Int16Array(9);   // pour chaque chiffre, les positions (0..8 dans l'unité) où il reste possible
    for (let i = 0; i < 9; i++) {
      const p = u[i];
      if (st.val[p] >= 0) continue;
      for (let d = 0; d < 9; d++) if (st.cand[p] & (1 << d)) places[d] |= 1 << i;
    }
    for (let d1 = 0; d1 < 9; d1++) {
      if (POP[places[d1]] !== 2) continue;
      for (let d2 = d1 + 1; d2 < 9; d2++) {
        if (places[d2] !== places[d1]) continue;
        const garder = (1 << d1) | (1 << d2);
        let progres = 0;
        for (let i = 0; i < 9; i++) {
          if (!(places[d1] & (1 << i))) continue;
          const r = retirer(st, u[i], ~garder & 511);
          if (r < 0) return -1;
          progres |= r;
        }
        if (progres) return 1;
      }
    }
  }
  return 0;
}

const TECHNIQUES = [[1, singleNu], [2, valeurUnique], [3, pairesNues], [3, pointantes], [3, pairesCachees]];

/** Possibilités qui avancent par les seules cases à une possibilité et valeurs uniques, jusqu'au bout ; faux si contradiction. */
function propager(st) {
  for (;;) {
    let r = singleNu(st);
    if (r === 0) r = valeurUnique(st);
    if (r < 0) return false;
    if (r === 0) return true;
  }
}

/** Nombre de solutions (comptées jusqu'à `limite`) en partant de cet état, avec essais : propagation puis hypothèse sur la case la plus contrainte. */
function compterEssais(st, limite, sortie = {}) {
  if (!propager(st)) return 0;
  if (st.restant === 0) { sortie.solution ??= Int8Array.from(st.val); return 1; }
  let meilleur = -1, nb = 10;
  for (let p = 0; p < N; p++) if (st.val[p] < 0 && POP[st.cand[p]] < nb) { nb = POP[st.cand[p]]; meilleur = p; }
  let total = 0;
  for (let v = 0; v < 9 && total < limite; v++) {
    if (!(st.cand[meilleur] & (1 << v))) continue;
    const c = copie(st);
    if (!poser(c, meilleur, v)) continue;
    total += compterEssais(c, limite - total, sortie);
  }
  return total;
}

/**
 * Résout une grille (valeurs 0..8, -1 = vide) avec les techniques jusqu'au niveau `niveauMax` (1 à 4).
 * @returns {{resolu: boolean, niveau: number, solution?: Int8Array, impossible?: boolean, ambigue?: boolean}} `niveau` = technique la plus difficile employée (0 si rien à faire) ;
 *          `solution` = les 81 valeurs de la solution quand `resolu`.
 *          `resolu` vaut vrai si la grille est entièrement résolue de façon unique avec ces techniques seulement (niveau 4 : avec hypothèses, solution unique).
 */
export function analyser(regions, grille, niveauMax = NIVEAU.TRES_DIFFICILE) {
  const st = etatInitial(regions, grille);
  if (!st) return { resolu: false, niveau: 0, impossible: true };
  let niveau = 0;
  for (;;) {
    if (st.restant === 0) return { resolu: true, niveau, solution: Int8Array.from(st.val) };
    let avance = false;
    for (const [n, technique] of TECHNIQUES) {
      if (n > niveauMax) continue;
      const r = technique(st);
      if (r < 0) return { resolu: false, niveau, impossible: true };
      if (r > 0) { niveau = Math.max(niveau, n); avance = true; break; }
    }
    if (avance) continue;
    if (niveauMax < NIVEAU.TRES_DIFFICILE) return { resolu: false, niveau };
    const sortie = {};
    const nb = compterEssais(copie(st), 2, sortie);
    if (nb === 1) return { resolu: true, niveau: NIVEAU.TRES_DIFFICILE, solution: sortie.solution };
    return { resolu: false, niveau, impossible: nb === 0, ambigue: nb > 1 };
  }
}

/**
 * Une grille Jigsaw du niveau demandé, déterminée par la graine : on retire les indices un à un (ordre tiré de la graine) tant que la grille reste résoluble
 * avec les techniques du niveau voulu au plus ; si le résultat exige bien une technique du niveau (et pas moins), il est retenu, sinon on recommence avec
 * d'autres régions. Aucun comptage de solutions : une grille résolue par déduction a une solution unique (niveau 4 : unicité comptée avec essais).
 * @returns {{regions: Int8Array, solution: Int8Array, puzzle: Int8Array, indices: number, niveau: number, graine: number}}
 */
export function genererJigsawNiveau(graine, niveau, { tentatives = 300 } = {}) {
  const rng = mulberry32(graine);
  for (let t = 0; t < tentatives; t++) {
    const regions = regionsAleatoires(rng);
    const solution = remplirGrille(regions, rng);
    if (!solution) continue;
    const puzzle = Int8Array.from(solution);
    let indices = N;
    for (const p of melanger(Array.from({ length: N }, (_, i) => i), rng)) {
      const v = puzzle[p];
      puzzle[p] = -1;
      if (analyser(regions, puzzle, niveau).resolu) indices--; else puzzle[p] = v;
    }
    const r = analyser(regions, puzzle, NIVEAU.TRES_DIFFICILE);
    if (r.resolu && r.niveau === niveau) return { regions, solution, puzzle, indices, niveau, graine };
  }
  throw new Error(`Jigsaw : pas de grille de niveau ${niveau} en ${tentatives} tentatives`);
}
