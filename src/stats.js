/*
 * 5ud0ku — statistiques des parties terminées
 * Copyright (C) 2026 Drusus (Gens Claudia). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 *
 * Fonctions pures sur une liste de parties gagnées { d: date 'AAAA-MM-JJ', t: secondes, n: difficulté 1..4,
 * c: code de la grille ou null }. Gardées dans le stockage du navigateur (voir session.js) ; les 500 dernières seulement.
 */

export const MAX_GAMES = 500;
const DIFFS = [1, 2, 3, 4];

export const emptyStats = () => ({ started: 0, games: [] });

const validGame = (g) => g && typeof g === 'object' && typeof g.d === 'string' && Number.isFinite(g.t) && g.t >= 0
  && DIFFS.includes(g.n) && (g.c === null || g.c === undefined || typeof g.c === 'string');

/** Statistiques valides à partir d'un contenu éventuellement corrompu (stockage du navigateur). */
export function normalizeStats(raw) {
  const games = Array.isArray(raw?.games) ? raw.games.filter(validGame).map((g) => ({ d: g.d, t: g.t, n: g.n, c: g.c ?? null })).slice(-MAX_GAMES) : [];
  const started = Number.isInteger(raw?.started) && raw.started >= 0 ? raw.started : games.length;
  return { started: Math.max(started, games.length), games };
}

/** Ajoute une partie gagnée (renvoie de nouvelles statistiques) ; `record` : meilleur temps de sa difficulté. */
export function addGame(stats, game) {
  if (!validGame(game)) throw new Error('Partie invalide');
  const best = bestOf(stats.games.filter((g) => g.n === game.n));
  const games = [...stats.games, { d: game.d, t: game.t, n: game.n, c: game.c ?? null }].slice(-MAX_GAMES);
  return { stats: { started: Math.max(stats.started, games.length), games }, record: best === null || game.t < best };
}

function bestOf(games) {
  let best = null;
  for (const g of games) if (best === null || g.t < best) best = g.t;
  return best;
}

/** Parties gagnées, meilleur temps et temps moyen d'un ensemble de parties. */
export function summarize(games) {
  const won = games.length;
  return { won, best: bestOf(games), avg: won ? games.reduce((s, g) => s + g.t, 0) / won : null };
}

/** Une ligne par difficulté ayant au moins une victoire. */
export function byDifficulty(games) {
  return DIFFS.map((n) => ({ difficulty: n, ...summarize(games.filter((g) => g.n === n)) })).filter((r) => r.won > 0);
}

/** Les n dernières parties, la plus récente en premier. */
export const recent = (games, n = 10) => games.slice(-n).reverse();

/** Meilleur temps pour un code de grille (par exemple la grille du jour), ou null si jamais gagnée. */
export function bestFor(games, code) {
  return code ? bestOf(games.filter((g) => g.c === code)) : null;
}
