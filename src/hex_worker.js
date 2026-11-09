/*
 * 5ud0ku — génération d'une grille 16×16 hors du fil principal (Web Worker de module).
 * Copyright (C) 2026 Drusus (Gens Claudia). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 *
 * Reçoit { graine, niveau, jigsaw } et répond { ok, grille } ; le niveau 4 prend de l'ordre de la seconde sur un ordinateur, davantage sur un téléphone : pendant ce
 * temps l'écran « Génération… » reste vivant. Le fil principal dépose le résultat dans le cache du moteur (`memoriser`) puis crée la partie comme d'habitude.
 */
import { moteurDe, genererJigsawNSansCache } from './sudoku_n.js';

self.onmessage = (e) => {
  const { graine, niveau, jigsaw } = e.data;
  try {
    const grille = jigsaw ? genererJigsawNSansCache(4, graine, niveau) : moteurDe(4).genererSansCache(graine, niveau);
    self.postMessage({ ok: !!grille, grille });
  } catch (err) {
    self.postMessage({ ok: false, erreur: String(err && err.message) });
  }
};
