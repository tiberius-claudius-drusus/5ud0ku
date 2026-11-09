// Banc de l'étape 0 du 16×16 : vitesse de génération et indices par niveau, pour b = 3 (témoin 9×9) ou 4 (16×16).
// Usage : node tools/bench_n16.mjs [b=4] [graines=5] [niveaux=1,2,3,4]
import { moteur } from '../src/sudoku_n.js';

const b = Number(process.argv[2] ?? 4);
const nb = Number(process.argv[3] ?? 5);
const niveaux = (process.argv[4] ?? '1,2,3,4').split(',').map(Number);
const m = moteur(b);
console.log(`${m.n}×${m.n}, blocs ${b}×${b}`);

// 1. la grille complète est valable
const rng = (await import('../src/generator.js')).mulberry32(1);
const g = m.grilleComplete(rng);
const verifie = m.analyser(g).resolu;
console.log(`grille complète valable : ${verifie}`);

for (const niveau of niveaux) {
  const temps = [], indices = [], essais = [];
  let echecs = 0;
  for (let s = 1; s <= nb; s++) {
    const t0 = performance.now();
    const r = m.generer(s * 1013 + niveau, niveau);
    const ms = performance.now() - t0;
    if (!r) { echecs++; continue; }
    temps.push(ms); indices.push(r.indices); essais.push(r.tentatives);
    // contrôle croisé : solution unique (hypothèses comptées jusqu'à 2)
    const st = m.etatInitial(r.puzzle);
    const nbSol = m.compterEssais(m.copie(st), 2);
    if (nbSol !== 1) console.log(`  ATTENTION : niveau ${niveau} graine ${s} : ${nbSol} solution(s)`);
  }
  const med = (a) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN;
  console.log(`niveau ${niveau} : ${temps.length}/${nb} grilles, ${echecs} échec(s) ; durée médiane ${med(temps).toFixed(0)} ms (max ${Math.max(...temps, 0).toFixed(0)}) ; indices médians ${med(indices)} (min ${Math.min(...indices)}, max ${Math.max(...indices)}) ; tentatives médianes ${med(essais)}`);
}
