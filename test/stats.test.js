import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStats, normalizeStats, addGame, summarize, byDifficulty, recent, bestFor, MAX_GAMES } from '../src/stats.js';

const g = (n, t, c = null, d = '2026-10-20') => ({ d, t, n, c });

test('ajout de parties : meilleur temps par difficulté, jamais dégradé', () => {
  let s = emptyStats();
  let r = addGame(s, g(1, 100));
  assert.ok(r.record);
  s = r.stats;
  r = addGame(s, g(1, 150));
  assert.ok(!r.record);
  s = r.stats;
  r = addGame(s, g(2, 400));
  assert.ok(r.record, 'premier temps d\'une autre difficulté');
  s = r.stats;
  r = addGame(s, g(1, 90));
  assert.ok(r.record);
  assert.equal(r.stats.games.length, 4);
  assert.ok(r.stats.started >= 4);
});

test('résumé global et par difficulté', () => {
  const games = [g(1, 100), g(1, 200), g(3, 600), g(3, 300)];
  assert.deepEqual(summarize(games), { won: 4, best: 100, avg: 300 });
  assert.deepEqual(summarize([]), { won: 0, best: null, avg: null });
  const rows = byDifficulty(games);
  assert.deepEqual(rows.map((r) => [r.difficulty, r.won, r.best, r.avg]), [[1, 2, 100, 150], [3, 2, 300, 450]]);
});

test('dernières parties : la plus récente d\'abord, limitées à n', () => {
  const games = [g(1, 1), g(1, 2), g(1, 3), g(1, 4)];
  assert.deepEqual(recent(games, 2).map((x) => x.t), [4, 3]);
  assert.equal(recent(games).length, 4);
});

test('meilleur temps d\'une grille précise (grille du jour)', () => {
  const games = [g(1, 120, 'AAAA'), g(1, 90, 'AAAA'), g(1, 50, 'BBBB')];
  assert.equal(bestFor(games, 'AAAA'), 90);
  assert.equal(bestFor(games, 'CCCC'), null);
  assert.equal(bestFor(games, null), null);
});

test('l\'historique est borné', () => {
  let s = emptyStats();
  for (let i = 0; i < MAX_GAMES + 20; i++) s = addGame(s, g(1, i)).stats;
  assert.equal(s.games.length, MAX_GAMES);
  assert.equal(s.games.at(-1).t, MAX_GAMES + 19);
});

test('contenu corrompu : ramené à des statistiques valides, parties invalides ignorées', () => {
  assert.deepEqual(normalizeStats(null), emptyStats());
  assert.deepEqual(normalizeStats('x'), emptyStats());
  const s = normalizeStats({ started: -3, games: [g(1, 10), { d: 5 }, g(9, 10), g(2, -1), g(2, 20, 'X'), null] });
  assert.equal(s.games.length, 2);
  assert.ok(s.started >= 2);
  assert.throws(() => addGame(emptyStats(), { d: 'x', t: 'y', n: 1 }));
});
