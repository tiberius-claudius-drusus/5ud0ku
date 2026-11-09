/*
 * 5ud0ku — sudoku n×n à blocs b×b (n = b²) : moteur de la version 16×16 (2.0.0), promu du prototype des étapes 0 et 1.
 * Copyright (C) 2026 Drusus (Gens Claudia). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 *
 * Même échelle de difficulté et mêmes techniques que le mode Jigsaw (`src/jigsaw_solveur.js`), écrites pour une taille quelconque :
 *     niveau 1 : cases à une seule possibilité ; niveau 2 : + valeur unique dans une unité ; niveau 3 : + paires nues, paires cachées, pointantes ;
 *     niveau 4 : au moins une hypothèse.
 * Le sudoku classique 9×9 garde son propre moteur (`generator.js`, règle d'or des codes) ; ce moteur-ci sert aux grandes grilles.
 * Valeurs 0..n-1 (affichées 0 à 9 puis A à F pour n = 16), -1 = case vide.
 */
import { mulberry32 } from './generator.js';

export const NIVEAU = Object.freeze({ FACILE: 1, MOYEN: 2, DIFFICILE: 3, TRES_DIFFICILE: 4 });

export function melanger(tableau, rng) {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
}

/** Régions en blocs b×b : tableau case -> bloc. */
export const regionsBlocs = (b) => Int8Array.from({ length: b ** 4 }, (_, p) => Math.floor(Math.floor(p / b ** 2) / b) * b + Math.floor((p % b ** 2) / b));

/**
 * Le moteur d'une taille : b = 3 (9×9) ou 4 (16×16), avec des blocs b×b ou, au choix, des RÉGIONS quelconques (tableau case -> région, mode Jigsaw :
 * n régions connexes de n cases). Les techniques, le comptage et la génération sont les mêmes ; seule la construction d'une grille complète diffère.
 */
export function moteur(b, regionsDonnees = null) {
  const n = b * b, N = n * n, PLEIN = (1 << n) - 1;
  const POP = new Uint8Array(1 << n);
  for (let m = 1; m < POP.length; m++) POP[m] = POP[m >> 1] + (m & 1);
  const LOG = new Int8Array(1 << n).fill(-1);
  for (let v = 0; v < n; v++) LOG[1 << v] = v;

  const regions = regionsDonnees ?? regionsBlocs(b);

  // unités : n lignes, n colonnes, n blocs ; voisins ; croisements ligne/colonne-bloc
  const unites = [];
  for (let r = 0; r < n; r++) unites.push(Int16Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) unites.push(Int16Array.from({ length: n }, (_, r) => r * n + c));
  for (let g = 0; g < n; g++) unites.push(Int16Array.from(Array.from({ length: N }, (_, p) => p).filter((p) => regions[p] === g)));
  const uDe = Array.from({ length: N }, (_, p) => [Math.floor(p / n), n + (p % n), 2 * n + regions[p]]);
  const voisins = Array.from({ length: N }, (_, p) => Int16Array.from(new Set(uDe[p].flatMap((u) => Array.from(unites[u]))).keys()).filter((q) => q !== p));
  const genre = (u) => Math.floor(u / n);
  const croisements = [];
  for (let u = 0; u < 3 * n; u++) {
    for (let v = 0; v < 3 * n; v++) {
      if (genre(u) === genre(v) || (genre(u) < 2 && genre(v) < 2)) continue;
      const dansV = new Set(unites[v]);
      const inter = unites[u].filter((p) => dansV.has(p));
      if (inter.length < 2) continue;
      const dansU = new Set(unites[u]);
      croisements.push({ de: u, vers: v, inter: new Set(inter), reste: unites[v].filter((p) => !dansU.has(p)) });
    }
  }

  function etatInitial(grille) {
    const st = { val: new Int8Array(N).fill(-1), cand: new Int32Array(N).fill(PLEIN), restant: N };
    for (let p = 0; p < N; p++) if (grille[p] >= 0 && !poser(st, p, grille[p])) return null;
    return st;
  }
  const copie = (st) => ({ val: Int8Array.from(st.val), cand: Int32Array.from(st.cand), restant: st.restant });

  function poser(st, p, v) {
    if (st.val[p] >= 0) return st.val[p] === v;
    const bit = 1 << v;
    if (!(st.cand[p] & bit)) return false;
    st.val[p] = v; st.cand[p] = bit; st.restant--;
    for (const q of voisins[p]) {
      if (st.val[q] >= 0) { if (st.val[q] === v) return false; continue; }
      if (st.cand[q] & bit) { st.cand[q] &= ~bit; if (st.cand[q] === 0) return false; }
    }
    return true;
  }
  function retirer(st, q, masque) {
    if (st.val[q] >= 0 || !(st.cand[q] & masque)) return 0;
    st.cand[q] &= ~masque;
    return st.cand[q] === 0 ? -1 : 1;
  }

  function singleNu(st) {
    for (let p = 0; p < N; p++) {
      if (st.val[p] >= 0) continue;
      if (POP[st.cand[p]] === 1) return poser(st, p, LOG[st.cand[p]]) ? 1 : -1;
    }
    return 0;
  }
  function valeurUnique(st) {
    for (const u of unites) {
      let pris = 0;
      for (const p of u) if (st.val[p] >= 0) pris |= 1 << st.val[p];
      for (let d = 0; d < n; d++) {
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
    for (const u of unites) {
      for (let i = 0; i < n; i++) {
        const a = u[i];
        if (st.val[a] >= 0 || POP[st.cand[a]] !== 2) continue;
        for (let j = i + 1; j < n; j++) {
          const c = u[j];
          if (st.val[c] >= 0 || st.cand[c] !== st.cand[a]) continue;
          let progres = 0;
          for (const q of u) {
            if (q === a || q === c) continue;
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
    for (const x of croisements) {
      const U = unites[x.de];
      for (let d = 0; d < n; d++) {
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
    for (const u of unites) {
      const places = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const p = u[i];
        if (st.val[p] >= 0) continue;
        for (let d = 0; d < n; d++) if (st.cand[p] & (1 << d)) places[d] |= 1 << i;
      }
      for (let d1 = 0; d1 < n; d1++) {
        if (POP[places[d1]] !== 2) continue;
        for (let d2 = d1 + 1; d2 < n; d2++) {
          if (places[d2] !== places[d1]) continue;
          const garder = (1 << d1) | (1 << d2);
          let progres = 0;
          for (let i = 0; i < n; i++) {
            if (!(places[d1] & (1 << i))) continue;
            const r = retirer(st, u[i], ~garder & PLEIN);
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

  function propager(st, fort = false) {
    for (;;) {
      let r = singleNu(st);
      if (r === 0) r = valeurUnique(st);
      if (r === 0 && fort) r = pairesNues(st) || pointantes(st) || pairesCachees(st);   // propagation renforcée : bien moins d'hypothèses à explorer
      if (r < 0) return false;
      if (r === 0) return true;
    }
  }
  function compterEssais(st, limite, sortie = {}) {
    if (sortie.budget !== undefined && --sortie.budget < 0) return limite;   // budget épuisé : on compte « au moins la limite » (le retrait est refusé)
    if (!propager(st, sortie.fort)) return 0;
    if (st.restant === 0) { sortie.solution ??= Int8Array.from(st.val); return 1; }
    let meilleur = -1, nb = n + 1;
    for (let p = 0; p < N; p++) if (st.val[p] < 0 && POP[st.cand[p]] < nb) { nb = POP[st.cand[p]]; meilleur = p; }
    let total = 0;
    for (let v = 0; v < n && total < limite; v++) {
      if (!(st.cand[meilleur] & (1 << v))) continue;
      const c = copie(st);
      if (!poser(c, meilleur, v)) continue;
      total += compterEssais(c, limite - total, sortie);
    }
    return total;
  }

  function analyser(grille, niveauMax = NIVEAU.TRES_DIFFICILE) {
    const st = etatInitial(grille);
    if (!st) return { resolu: false, niveau: 0, impossible: true };
    let niveau = 0;
    for (;;) {
      if (st.restant === 0) return { resolu: true, niveau, solution: Int8Array.from(st.val) };
      let avance = false;
      for (const [k, technique] of TECHNIQUES) {
        if (k > niveauMax) continue;
        const r = technique(st);
        if (r < 0) return { resolu: false, niveau, impossible: true };
        if (r > 0) { niveau = Math.max(niveau, k); avance = true; break; }
      }
      if (avance) continue;
      if (niveauMax < NIVEAU.TRES_DIFFICILE) return { resolu: false, niveau };
      const sortie = { fort: true };   // propagation renforcée : mêmes résultats, bien moins d'hypothèses (reprise d'une sauvegarde de niveau 4)
      const nbSol = compterEssais(copie(st), 2, sortie);
      if (nbSol === 1) return { resolu: true, niveau: NIVEAU.TRES_DIFFICILE, solution: sortie.solution };
      return { resolu: false, niveau, impossible: nbSol === 0, ambigue: nbSol > 1 };
    }
  }

  /**
   * Grille complète pour des régions quelconques : recherche avec propagation (singles) et choix de la case la plus contrainte, chiffres dans un ordre tiré de la
   * graine ; `null` si le budget de nœuds est dépassé (beaucoup de partitions n'ont aucune grille complète : les régions sont alors refaites).
   */
  function remplir(rng, budget = 4000, stats = {}) {
    let noeuds = 0;
    const descendre = (st) => {
      if (!propager(st)) return null;
      if (st.restant === 0) return st;
      if (++noeuds > budget) return null;
      // branchement façon « liens dansants » : la contrainte la plus serrée entre une case (ses chiffres possibles) et un couple unité-chiffre (ses places possibles)
      let meilleur = -1, nb = n + 1;
      for (let p = 0; p < N; p++) if (st.val[p] < 0 && POP[st.cand[p]] < nb) { nb = POP[st.cand[p]]; meilleur = p; }
      let uniteMeilleure = -1, chiffreMeilleur = -1, nbPlaces = n + 1;
      for (let u = 0; u < unites.length && nbPlaces > 2; u++) {
        const U = unites[u];
        for (let d = 0; d < n; d++) {
          const bit = 1 << d;
          let k = 0, dejaPose = false;
          for (const p of U) { if (st.val[p] === d) { dejaPose = true; break; } if (st.val[p] < 0 && (st.cand[p] & bit)) k++; }
          if (!dejaPose && k < nbPlaces) { nbPlaces = k; uniteMeilleure = u; chiffreMeilleur = d; if (k <= 1) break; }
        }
      }
      if (nbPlaces < nb) {
        const places = unites[uniteMeilleure].filter((p) => st.val[p] < 0 && (st.cand[p] & (1 << chiffreMeilleur)));
        for (const p of melanger(Array.from(places), rng)) {
          const c = copie(st);
          if (!poser(c, p, chiffreMeilleur)) continue;
          const r = descendre(c);
          if (r) return r;
          if (noeuds > budget) return null;
        }
        return null;
      }
      const chiffres = [];
      for (let v = 0; v < n; v++) if (st.cand[meilleur] & (1 << v)) chiffres.push(v);
      for (const v of melanger(chiffres, rng)) {
        const c = copie(st);
        if (!poser(c, meilleur, v)) continue;
        const r = descendre(c);
        if (r) return r;
        if (noeuds > budget) return null;
      }
      return null;
    };
    const r = descendre(etatInitial(new Int8Array(N).fill(-1)));
    stats.noeuds = noeuds;
    stats.epuise = !r && noeuds <= budget;   // vrai : la recherche a tout exploré, la partition n'a AUCUNE grille complète
    return r ? Int8Array.from(r.val) : null;
  }

  /** Grille complète valable tirée de la graine : motif de base puis permutations (lignes dans une bande, bandes, colonnes dans une pile, piles, chiffres). */
  function grilleComplete(rng) {
    if (regionsDonnees) return remplir(rng);
    const ordre = () => melanger(Array.from({ length: b }, (_, i) => i), rng).flatMap((g) => melanger(Array.from({ length: b }, (_, i) => i), rng).map((i) => g * b + i));
    const lignes = ordre(), colonnes = ordre(), chiffres = melanger(Array.from({ length: n }, (_, i) => i), rng);
    const motif = (r, c) => (b * (r % b) + Math.floor(r / b) + c) % n;
    return Int8Array.from({ length: N }, (_, p) => chiffres[motif(lignes[Math.floor(p / n)], colonnes[p % n])]);
  }

  /** Grille du niveau demandé, déterminée par la graine (même méthode que Jigsaw : retrait tant que résoluble au niveau voulu au plus). */
  const cache = new Map();   // (graine, niveau) -> grille : la génération peut avoir été faite ailleurs (Web Worker) et déposée ici par `memoriser`
  const cle = (graine, niveau) => `${graine >>> 0}:${niveau}`;
  function memoriser(graine, niveau, grille) {
    if (cache.size >= 8) cache.delete(cache.keys().next().value);
    cache.set(cle(graine, niveau), grille);
  }

  function generer(graine, niveau, options = {}) {
    const connue = cache.get(cle(graine, niveau));
    if (connue) return connue;
    const r = genererSansCache(graine, niveau, options);
    if (r) memoriser(graine, niveau, r);
    return r;
  }

  /** Retire les indices d'une solution complète pour viser un niveau (voir `genererSansCache`) ; { puzzle, indices } ou null si la grille obtenue n'est pas du niveau. */
  function viser(solution, niveau, rng, { indicesMin = 0 } = {}) {
    const puzzle = Int8Array.from(solution);
    let indices = N;
    const ordre = melanger(Array.from({ length: N }, (_, i) => i), rng);
    // 1. retrait tant que la grille reste résoluble avec les techniques du niveau voulu au plus (niveau 4 : jusqu'au 3, c'est rapide)
    const technique = Math.min(niveau, NIVEAU.DIFFICILE);
    for (const p of ordre) {
      if (indices <= indicesMin) break;   // grille de débutant : on laisse des indices (aucune incidence quand indicesMin vaut 0)
      const v = puzzle[p];
      puzzle[p] = -1;
      if (analyser(puzzle, technique).resolu) indices--; else puzzle[p] = v;
    }
    let r;
    if (niveau === NIVEAU.TRES_DIFFICILE) {
      // 2. niveau 4 : on retire encore des indices (unicité comptée avec hypothèses) jusqu'au premier qui rend les techniques 1 à 3 insuffisantes.
      //    Le comptage d'une grille presque minimale à 16×16 coûte des dizaines de secondes : on s'arrête donc dès que la grille exige une hypothèse.
      r = { resolu: false };
      let essaisRestants = 60;   // borne le coût : au-delà, on refait une grille
      for (const p of ordre) {
        if (puzzle[p] < 0) continue;
        if (--essaisRestants < 0) break;
        const v = puzzle[p];
        puzzle[p] = -1;
        if (compterEssais(copie(etatInitial(puzzle)), 2, { budget: 400, fort: true }) !== 1) { puzzle[p] = v; continue; }
        indices--;
        if (!analyser(puzzle, NIVEAU.DIFFICILE).resolu) { r = { resolu: true, niveau }; break; }
      }
    } else r = analyser(puzzle, NIVEAU.TRES_DIFFICILE);
    return r.resolu && r.niveau === niveau ? { puzzle, indices } : null;
  }

  function genererSansCache(graine, niveau, { tentatives = 40, indicesMin = 0 } = {}) {
    const rng = mulberry32(graine);
    for (let t = 0; t < tentatives; t++) {
      const solution = grilleComplete(rng);
      const r = viser(solution, niveau, rng, { indicesMin });
      if (r) return { solution, puzzle: r.puzzle, indices: r.indices, niveau, graine, tentatives: t + 1 };
    }
    return null;
  }

  return { b, n, N, regions, analyser, grilleComplete, generer, genererSansCache, viser, remplir, memoriser, compterEssais, etatInitial, copie };
}

/** Régions du 4×4 : quatre blocs de 2×2. */
export const REGIONS_4 = Int8Array.from({ length: 16 }, (_, p) => Math.floor(Math.floor(p / 4) / 2) * 2 + Math.floor((p % 4) / 2));

/** Régions du 16×16 : seize blocs de 4×4, tableau case (0..255) -> bloc (0..15). */
export const REGIONS_16 = Int8Array.from({ length: 256 }, (_, p) => Math.floor(Math.floor(p / 16) / 4) * 4 + Math.floor((p % 16) / 4));

const moteurs = new Map();
/** Le moteur d'une taille (b = 4 pour le 16×16), construit une fois. */
export function moteurDe(b) {
  if (!moteurs.has(b)) moteurs.set(b, moteur(b));
  return moteurs.get(b);
}

// --- Jigsaw en grande taille : n régions connexes de n cases ---

const voisinsN = (n) => Array.from({ length: n * n }, (_, p) => {
  const r = Math.floor(p / n), c = p % n, v = [];
  if (r > 0) v.push(p - n);
  if (r < n - 1) v.push(p + n);
  if (c > 0) v.push(p - 1);
  if (c < n - 1) v.push(p + 1);
  return v;
});

/** Régions valables : N cases, n régions de n cases chacune, d'un seul tenant, aucune n'étant une ligne ou une colonne entière. */
export function regionsValidesN(regions, n) {
  const N = n * n;
  if (!regions || regions.length !== N) return false;
  const V = voisinsN(n);
  const cases = Array.from({ length: n }, () => []);
  for (let p = 0; p < N; p++) {
    const g = regions[p];
    if (!Number.isInteger(g) || g < 0 || g >= n) return false;
    cases[g].push(p);
  }
  for (const liste of cases) {
    if (liste.length !== n) return false;
    if (liste.every((p) => Math.floor(p / n) === Math.floor(liste[0] / n)) || liste.every((p) => p % n === liste[0] % n)) return false;
    const vus = new Set([liste[0]]);
    const pile = [liste[0]];
    while (pile.length) {
      const p = pile.pop();
      for (const q of V[p]) if (regions[q] === regions[p] && !vus.has(q)) { vus.add(q); pile.push(q); }
    }
    if (vus.size !== n) return false;
  }
  return true;
}

/**
 * n régions connexes de n cases tirées au hasard : on part des blocs b×b puis on déplace des cases entre régions voisines (une case a de A passe dans B, une case
 * de B qui touche A revient dans A : chacune garde n cases) en refusant tout pas qui déconnecte l'une des deux (même méthode que le Jigsaw 9×9, `src/jigsaw.js`).
 * Par défaut 300 pas en 16×16 : environ 38 % des cases hors de leur bloc d'origine (50 % au Jigsaw 9×9) ; au-delà, de moins en moins de partitions ont une
 * grille complète.
 */
export function regionsAleatoiresN(b, rng, { pas = null } = {}) {
  const n = b * b, N = n * n, V = voisinsN(n);
  const cible = pas ?? Math.round(N * 1.2);
  const connexe = (reg, g, depart) => {
    const vus = [depart];
    for (let i = 0; i < vus.length; i++) for (const q of V[vus[i]]) if (reg[q] === g && !vus.includes(q)) vus.push(q);
    return vus.length === n;
  };
  for (let reprise = 0; reprise < 50; reprise++) {
    const reg = Int8Array.from(regionsBlocs(b));
    let faits = 0;
    for (let essais = 0; faits < cible && essais < cible * 80; essais++) {
      const a = Math.floor(rng() * N);
      const voisines = V[a].filter((q) => reg[q] !== reg[a]);
      if (!voisines.length) continue;
      const A = reg[a], B = reg[voisines[Math.floor(rng() * voisines.length)]];
      reg[a] = B;
      const candidates = [];
      for (let p = 0; p < N; p++) if (reg[p] === B && p !== a && V[p].some((q) => reg[q] === A)) candidates.push(p);
      let fait = false;
      for (const c of melanger(candidates, rng)) {
        reg[c] = A;
        if (connexe(reg, A, c) && connexe(reg, B, a)) { fait = true; break; }
        reg[c] = B;
      }
      if (fait) faits++; else reg[a] = A;
    }
    if (regionsValidesN(reg, n)) return reg;
  }
  throw new Error('Jigsaw : aucune partition en régions trouvée');
}

const cacheJigsawN = new Map();
/** Dépose une grille Jigsaw générée ailleurs (Web Worker) : la génération suivante, même graine et même niveau, la retrouve. */
export function memoriserJigsawN(b, graine, niveau, grille) {
  if (cacheJigsawN.size >= 8) cacheJigsawN.delete(cacheJigsawN.keys().next().value);
  cacheJigsawN.set(`${b}:${graine >>> 0}:${niveau}`, grille);
}

/**
 * Une grille Jigsaw n×n du niveau demandé, déterminée par la graine : régions, grille complète, retrait des indices (même méthode que `moteur(b).generer`). Les régions sans
 * grille complète (au budget près) sont refaites. @returns {{regions, solution, puzzle, indices, niveau, graine}} ou null.
 */
export function genererJigsawN(b, graine, niveau, { tentatives = 300 } = {}) {
  const connue = cacheJigsawN.get(`${b}:${graine >>> 0}:${niveau}`);
  if (connue) return connue;
  const r = genererJigsawNSansCache(b, graine, niveau, { tentatives });
  if (r) memoriserJigsawN(b, graine, niveau, r);
  return r;
}

export function genererJigsawNSansCache(b, graine, niveau, { tentatives = 300 } = {}) {
  const rng = mulberry32(graine);
  for (let t = 0; t < tentatives; t++) {
    const regions = regionsAleatoiresN(b, rng);
    const m = moteur(b, regions);
    // en 16×16 environ une partition sur dix a une grille complète : l'essai est court (budget de nœuds), on en refait une autre sinon
    const solution = m.remplir(rng, 1000);
    if (!solution) continue;
    const r = m.viser(solution, niveau, rng);
    if (r) return { regions, solution, puzzle: r.puzzle, indices: r.indices, niveau, graine, tentatives: t + 1 };
  }
  return null;
}
