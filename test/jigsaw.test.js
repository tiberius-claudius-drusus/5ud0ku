import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/generator.js';
import { REGIONS_CLASSIQUES, regionsValides, regionsAleatoires, compterSolutions, remplirGrille, genererJigsaw } from '../src/jigsaw.js';

// Prototype Jigsaw (étape 0) : régions irrégulières, solveur à régions quelconques, grilles à solution unique.
// La vérification d'unicité utilise un DEUXIÈME solveur, écrit autrement (premier vide dans l'ordre des cases, contrôle des voisins un à un, aucun masque
// de bits) : si les deux comptent pareil, l'erreur d'un solveur ne passe pas inaperçue.

function solveurNaif(regions, grille, limite = 2) {
  const g = Array.from(grille);
  let compte = 0;
  const voisin = (p, q) => Math.floor(p / 9) === Math.floor(q / 9) || p % 9 === q % 9 || regions[p] === regions[q];
  const possible = (p, v) => { for (let q = 0; q < 81; q++) if (q !== p && g[q] === v && voisin(p, q)) return false; return true; };
  for (let p = 0; p < 81; p++) if (g[p] >= 0 && !possible(p, g[p])) return 0;
  const chercher = (depart) => {
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
  return compte;
}

const unites = (regions) => [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, g) => Array.from({ length: 81 }, (_, p) => p).filter((p) => regions[p] === g)),
];
const complete = (regions, grille) => unites(regions).every((u) => new Set(u.map((p) => grille[p])).size === 9 && u.every((p) => grille[p] >= 0 && grille[p] <= 8));
const cartes = (n) => Array.from({ length: n }, (_, i) => regionsAleatoires(mulberry32(1000 + i)));

test('régions : les carrés de 3×3 sont valables ; lignes, tailles fausses et morceaux séparés sont refusés', () => {
  assert.ok(regionsValides(REGIONS_CLASSIQUES));
  assert.ok(!regionsValides(Int8Array.from({ length: 81 }, (_, p) => Math.floor(p / 9))), 'des lignes entières ne sont pas des régions');
  assert.ok(!regionsValides(Int8Array.from({ length: 81 }, (_, p) => p % 9)), 'des colonnes entières non plus');
  const tailles = Int8Array.from(REGIONS_CLASSIQUES); tailles[0] = 4;
  assert.ok(!regionsValides(tailles), 'une région de 10 cases et une de 8');
  const coupe = Int8Array.from(REGIONS_CLASSIQUES); coupe[2] = 1; coupe[3] = 0;   // deux cases échangées entre deux carrés voisins : le carré 0 perd sa case 2
  assert.ok(!regionsValides(coupe), 'une région en deux morceaux');
  assert.ok(!regionsValides(new Int8Array(80)) && !regionsValides(null));
});

test('régions aléatoires : 300 graines, toutes valables, déterministes, variées et plus tordues que les carrés', () => {
  const vues = new Set();
  let perimetreTotal = 0;
  for (let i = 0; i < 300; i++) {
    const reg = regionsAleatoires(mulberry32(i + 1));
    assert.ok(regionsValides(reg), `graine ${i + 1}`);
    assert.deepEqual(regionsAleatoires(mulberry32(i + 1)), reg, 'même graine, mêmes régions');
    vues.add(reg.join(''));
    let p = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) { const g = reg[r * 9 + c]; if (r === 8 || reg[(r + 1) * 9 + c] !== g) p++; if (c === 8 || reg[r * 9 + c + 1] !== g) p++; }
    perimetreTotal += p;
  }
  assert.ok(vues.size >= 295, `${vues.size} cartes différentes sur 300`);
  assert.ok(perimetreTotal / 300 > 78, 'les formes sont nettement plus tortueuses que les carrés (périmètre intérieur 36 + 36 = 72 au total avec le bord)');
});

test('solveur général sur les régions classiques : les puzzles QQWing ont une solution unique, les autres cas sont comptés', () => {
  for (const nom of ['easy', 'medium', 'hard', 'veryhard']) {
    const lignes = readFileSync(new URL(`./fixtures/qqwing-${nom}.txt`, import.meta.url), 'utf8').split('\n').filter(Boolean).slice(0, 40);
    for (const l of lignes) {
      const grille = Int8Array.from(l.slice(0, 81), (c) => (c === '.' ? -1 : Number(c) - 1));
      assert.equal(compterSolutions(REGIONS_CLASSIQUES, grille, 2), 1, `${nom} : ${l}`);
    }
  }
  assert.equal(compterSolutions(REGIONS_CLASSIQUES, new Int8Array(81).fill(-1), 2), 2, 'grille vide : au moins deux solutions (comptées jusqu\'à la limite)');
  const impossible = new Int8Array(81).fill(-1); impossible[0] = 0; impossible[1] = 0;
  assert.equal(compterSolutions(REGIONS_CLASSIQUES, impossible, 2), 0, 'deux 1 dans une ligne');
});

test('grille complète pour des régions Jigsaw : chaque grille trouvée porte les neuf chiffres par ligne, colonne et région (beaucoup de partitions n\'en ont aucune : rejetées)', () => {
  let trouvees = 0;
  const cartes60 = cartes(60);
  for (const reg of cartes60) {
    const sol = remplirGrille(reg, mulberry32(7));
    if (sol === null) continue;                        // partition sans grille complète (ou trop longue à trouver) : le générateur en tire une autre
    trouvees++;
    assert.ok(complete(reg, sol), 'grille complète valide');
  }
  assert.ok(trouvees >= 10 && trouvees < cartes60.length, `${trouvees} partitions sur ${cartes60.length} ont une grille complète : le rejet est utile et le générateur ne boucle pas longtemps`);
});

test('Jigsaw : 25 graines, solution complète valide, puzzle contenu dans la solution, solution UNIQUE pour les deux solveurs, même graine = même puzzle', () => {
  for (let graine = 1; graine <= 25; graine++) {
    const g = genererJigsaw(graine, { indicesMin: 32 });
    assert.ok(regionsValides(g.regions) && complete(g.regions, g.solution), `graine ${graine} : régions et solution`);
    assert.equal(g.indices, 32);
    assert.equal(g.puzzle.filter((v) => v >= 0).length, 32);
    assert.ok(g.puzzle.every((v, p) => v < 0 || v === g.solution[p]), 'les indices sont ceux de la solution');
    assert.equal(compterSolutions(g.regions, g.puzzle, 2), 1, `graine ${graine} : solveur à masques`);
    assert.equal(solveurNaif(g.regions, g.puzzle, 2), 1, `graine ${graine} : solveur indépendant`);
    const encore = genererJigsaw(graine, { indicesMin: 32 });
    assert.deepEqual(encore.puzzle, g.puzzle);
    assert.deepEqual(encore.regions, g.regions);
  }
});

test('Jigsaw : grilles à 24 indices, unicité confirmée par le solveur indépendant', () => {
  for (let graine = 1; graine <= 6; graine++) {
    const g = genererJigsaw(graine, { indicesMin: 24 });
    assert.equal(g.indices, 24);
    assert.equal(compterSolutions(g.regions, g.puzzle, 2), 1, `graine ${graine} : solveur à masques`);
    assert.equal(solveurNaif(g.regions, g.puzzle, 2), 1, `graine ${graine} : solveur indépendant`);
  }
});

test('les deux solveurs comptent pareil sur des grilles à plusieurs solutions (retraits au hasard dans des puzzles Jigsaw)', () => {
  const rng = mulberry32(99);
  for (let i = 0; i < 12; i++) {
    const g = genererJigsaw(100 + i, { indicesMin: 34 });
    const trou = Int8Array.from(g.puzzle);
    const retirer = 4 + (i % 5);
    for (let k = 0, n = 0; n < retirer && k < 200; k++) { const p = Math.floor(rng() * 81); if (trou[p] >= 0) { trou[p] = -1; n++; } }
    const a = compterSolutions(g.regions, trou, 3), b = solveurNaif(g.regions, trou, 3);
    assert.equal(a, b, `cas ${i} : ${a} contre ${b}`);
    assert.ok(a >= 1);
  }
});
