import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REGIONS_CLASSIQUES, regionsValides, compterSolutions } from '../src/jigsaw.js';
import { analyser, genererJigsawNiveau, NIVEAU } from '../src/jigsaw_solveur.js';

// Étape 1 du mode Jigsaw : difficulté par techniques généralisées aux régions quelconques.
// Fidélité : sur les carrés de 3×3, le classement doit être celui des fichiers de référence QQWing de l'amont (easy = 1 … veryhard = 4).

const fixture = (nom) => readFileSync(new URL(`./fixtures/qqwing-${nom}.txt`, import.meta.url), 'utf8').split('\n').filter(Boolean);
const enGrille = (ligne) => Int8Array.from(ligne.slice(0, 81), (c) => (c === '.' ? -1 : Number(c) - 1));

// Solveur indépendant (premier vide, voisins un à un) : voir test/jigsaw.test.js
// Renvoie null si la recherche dépasse `budget` nœuds (peu d'indices : le solveur naïf peut mettre très longtemps) : on ne conclut alors rien.
function solveurNaif(regions, grille, limite = 2, budget = 3e6) {
  const g = Array.from(grille);
  let compte = 0, noeuds = 0, abandon = false;
  const voisin = (p, q) => Math.floor(p / 9) === Math.floor(q / 9) || p % 9 === q % 9 || regions[p] === regions[q];
  const possible = (p, v) => { for (let q = 0; q < 81; q++) if (q !== p && g[q] === v && voisin(p, q)) return false; return true; };
  const chercher = (depart) => {
    if (++noeuds > budget) { abandon = true; return true; }
    let p = depart;
    while (p < 81 && g[p] >= 0) p++;
    if (p === 81) { compte++; return compte >= limite; }
    for (let v = 0; v < 9; v++) {
      if (!possible(p, v)) continue;
      g[p] = v;
      const fini = chercher(p + 1);
      g[p] = -1;
      if (fini) return true;
    }
    return false;
  };
  chercher(0);
  return abandon ? null : compte;
}

for (const [nom, niveau] of [['easy', 1], ['medium', 2], ['hard', 3], ['veryhard', 4]]) {
  test(`fidélité à l'amont : les 300 puzzles QQWing « ${nom} » sont classés niveau ${niveau} par le solveur généralisé (carrés de 3×3)`, () => {
    for (const ligne of fixture(nom)) {
      const r = analyser(REGIONS_CLASSIQUES, enGrille(ligne));
      assert.ok(r.resolu, `non résolu : ${ligne}`);
      assert.equal(r.niveau, niveau, `${ligne}`);
    }
  });
}

test('analyse : niveau maximal respecté, contradictions et grilles ambiguës reconnues', () => {
  const dur = enGrille(fixture('hard')[0]);
  assert.equal(analyser(REGIONS_CLASSIQUES, dur, NIVEAU.FACILE).resolu, false, 'un puzzle difficile n\'est pas résolu avec les seules cases à une possibilité');
  assert.equal(analyser(REGIONS_CLASSIQUES, dur, NIVEAU.MOYEN).resolu, false);
  assert.equal(analyser(REGIONS_CLASSIQUES, dur, NIVEAU.DIFFICILE).resolu, true);
  const tresDur = enGrille(fixture('veryhard')[0]);
  assert.equal(analyser(REGIONS_CLASSIQUES, tresDur, NIVEAU.DIFFICILE).resolu, false, 'il faut des hypothèses');
  assert.equal(analyser(REGIONS_CLASSIQUES, tresDur, NIVEAU.TRES_DIFFICILE).resolu, true);
  const contradiction = new Int8Array(81).fill(-1); contradiction[0] = 0; contradiction[1] = 0;
  assert.equal(analyser(REGIONS_CLASSIQUES, contradiction).impossible, true);
  const vide = analyser(REGIONS_CLASSIQUES, new Int8Array(81).fill(-1));
  assert.deepEqual([vide.resolu, vide.ambigue], [false, true], 'une grille vide a beaucoup de solutions');
});

const NIVEAUX = [1, 2, 3, 4];

for (const niveau of NIVEAUX) {
  test(`Jigsaw niveau ${niveau} : 6 graines, niveau exact, solution unique, même graine = même grille`, () => {
    let verifiees = 0;
    for (let graine = 1; graine <= 6; graine++) {
      const g = genererJigsawNiveau(graine, niveau);
      assert.ok(regionsValides(g.regions), 'régions valables');
      assert.equal(g.niveau, niveau);
      const exact = analyser(g.regions, g.puzzle);
      assert.deepEqual([exact.resolu, exact.niveau], [true, niveau], `graine ${graine} : le niveau demandé est bien le niveau mesuré`);
      if (niveau > 1) assert.equal(analyser(g.regions, g.puzzle, niveau - 1).resolu, false, `graine ${graine} : pas résoluble avec des techniques plus faciles`);
      assert.equal(g.puzzle.filter((v) => v >= 0).length, g.indices);
      assert.ok(g.puzzle.every((v, p) => v < 0 || v === g.solution[p]), 'indices pris dans la solution');
      assert.equal(compterSolutions(g.regions, g.puzzle, 2), 1, `graine ${graine} : solution unique (solveur à masques)`);
      const naif = solveurNaif(g.regions, g.puzzle, 2);
      if (naif !== null) { verifiees++; assert.equal(naif, 1, `graine ${graine} : solution unique (solveur indépendant)`); }
      const encore = genererJigsawNiveau(graine, niveau);
      assert.deepEqual(encore.puzzle, g.puzzle);
      assert.deepEqual(encore.regions, g.regions);
    }
    // niveau 4 : 13 à 18 indices, le solveur naïf abandonne presque toujours ; l'unicité y est comptée par deux autres méthodes (masques, essais avec propagation) puis, plus tard, par Solo
    assert.ok(verifiees >= (niveau === 4 ? 1 : 2), `${verifiees} grilles sur 6 vérifiées par le solveur indépendant dans son budget`);
  });
}

test('Jigsaw : plus le niveau monte, moins il y a d\'indices (en moyenne sur 6 graines)', () => {
  const moyenne = (niveau) => { let t = 0; for (let s = 1; s <= 6; s++) t += genererJigsawNiveau(s, niveau).indices; return t / 6; };
  const m = NIVEAUX.map(moyenne);
  assert.ok(m[0] > m[1] && m[1] > m[2] && m[2] >= m[3] - 1, `indices moyens par niveau : ${m.map((x) => x.toFixed(1)).join(' > ')}`);
});
