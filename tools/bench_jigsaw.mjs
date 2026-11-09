#!/usr/bin/env node
/*
 * 5ud0ku — mesures du prototype Jigsaw (étape 0) : temps de génération, nombre d'indices, forme des régions.
 * Usage : node tools/bench_jigsaw.mjs [nombre de graines, 200 par défaut] [--minimal]
 * Copyright (C) 2026 Drusus (Gens Claudia). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 */
import { performance } from 'node:perf_hooks';
import { mulberry32 } from '../src/generator.js';
import { genererJigsaw, regionsAleatoires, regionsValides, REGIONS_CLASSIQUES } from '../src/jigsaw.js';
import { genererJigsawNiveau } from '../src/jigsaw_solveur.js';

const NB = Number(process.argv[2] || 200);
const quantile = (t, q) => { const s = [...t].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const fmt = (t) => `médiane ${quantile(t, 0.5).toFixed(1)} ms, 95 % ${quantile(t, 0.95).toFixed(1)} ms, max ${Math.max(...t).toFixed(1)} ms`;

// périmètre total des régions : nombre de côtés de cases entre deux régions différentes ou au bord de la grille, chacun compté une fois (72 pour les carrés de 3×3)
function perimetre(reg) {
  let n = 0;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const g = reg[r * 9 + c];
    if (r === 0) n++;
    if (c === 0) n++;
    if (r === 8 || reg[(r + 1) * 9 + c] !== g) n++;
    if (c === 8 || reg[r * 9 + c + 1] !== g) n++;
  }
  return n;
}

console.log(`Régions classiques (carrés 3×3) : valables = ${regionsValides(REGIONS_CLASSIQUES)}, périmètre ${perimetre(REGIONS_CLASSIQUES)}`);

const tR = [], per = [];
for (let s = 1; s <= NB; s++) {
  const rng = mulberry32(s);
  const t0 = performance.now();
  const reg = regionsAleatoires(rng);
  tR.push(performance.now() - t0);
  per.push(perimetre(reg));
}
console.log(`\nRégions seules (${NB} graines) : ${fmt(tR)} ; périmètre médian ${quantile(per, 0.5)} (min ${Math.min(...per)}, max ${Math.max(...per)})`);

const AVEC_MINIMAL = process.argv.includes('--minimal');   // le minimal est LENT (jusqu'à 35 s pour une grille : solveur sans déductions)
const CAS = [['arrêt à 32 indices', { indicesMin: 32 }], ['arrêt à 26 indices', { indicesMin: 26 }], ['arrêt à 22 indices', { indicesMin: 22 }]];
if (AVEC_MINIMAL) CAS.push(['indices retirés tant que la solution reste unique (minimal)', {}]);
for (const [nom, options] of CAS) {
  const t = [], indices = [];
  for (let s = 1; s <= NB; s++) {
    const t0 = performance.now();
    const g = genererJigsaw(s, options);
    t.push(performance.now() - t0);
    indices.push(g.indices);
  }
  console.log(`\nGrille complète (${nom}) : ${fmt(t)}`);
  console.log(`   indices : min ${Math.min(...indices)}, médiane ${quantile(indices, 0.5)}, max ${Math.max(...indices)}`);
}

// Par niveau de difficulté (étape 1) : 1 Facile, 2 Moyen, 3 Difficile, 4 Très difficile
for (const niveau of [1, 2, 3, 4]) {
  const t = [], indices = [];
  for (let s = 1; s <= Math.min(NB, 60); s++) {
    const t0 = performance.now();
    const g = genererJigsawNiveau(s, niveau);
    t.push(performance.now() - t0);
    indices.push(g.indices);
  }
  console.log(`\nNiveau ${niveau} (${t.length} graines) : ${fmt(t)}`);
  console.log(`   indices : min ${Math.min(...indices)}, médiane ${quantile(indices, 0.5)}, max ${Math.max(...indices)}`);
}
