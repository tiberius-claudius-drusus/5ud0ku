// Banc du Jigsaw n×n : vitesse de génération et indices par niveau. Usage : node tools/bench_jigsawn.mjs [b=4] [graines=5] [niveaux=1,2,3,4]
import { genererJigsawNSansCache, moteur } from '../src/sudoku_n.js';
import { mulberry32 } from '../src/generator.js';

const b = Number(process.argv[2] ?? 4);
const nb = Number(process.argv[3] ?? 5);
const niveaux = (process.argv[4] ?? '1,2,3,4').split(',').map(Number);
const n = b * b;
console.log(`Jigsaw ${n}×${n}`);
for (const niveau of niveaux) {
  const temps = [], indices = [], essais = [];
  let echecs = 0;
  for (let s = 1; s <= nb; s++) {
    const t0 = performance.now();
    const r = genererJigsawNSansCache(b, s * 1013 + niveau, niveau);
    const ms = performance.now() - t0;
    if (!r) { echecs++; continue; }
    temps.push(ms); indices.push(r.indices); essais.push(r.tentatives);
    const m = moteur(b, r.regions);
    const nbSol = m.compterEssais(m.copie(m.etatInitial(r.puzzle)), 2, { fort: true });
    if (nbSol !== 1) console.log(`  ATTENTION : niveau ${niveau} graine ${s} : ${nbSol} solution(s)`);
  }
  const med = (a) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN;
  console.log(`niveau ${niveau} : ${temps.length}/${nb} grilles, ${echecs} échec(s) ; durée médiane ${med(temps).toFixed(0)} ms (max ${Math.max(...temps, 0).toFixed(0)}) ; indices médians ${med(indices)} ; tentatives médianes ${med(essais)}`);
}
