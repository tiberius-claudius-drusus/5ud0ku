// Oracle Solo (Simon Tatham, MIT) pour le 16×16 (blocs 4×4) : contrôles croisés avec le VRAI code C de Solo, comme tools/oracle_solo.mjs pour Jigsaw.
//   node tools/oracle_solo16.mjs amont          Solo → nous : 120 grilles 4x4 de son générateur (Basic, Intermediate, Advanced ; graines 1 à 40,
//        tools/oracle/parties-solo-16.tsv) ; notre solveur doit les résoudre, à solution unique, avec la solution de Solo.
//   node tools/oracle_solo16.mjs exporter [N]   écrit tools/oracle/mes-16.tsv : N grilles par niveau de NOTRE générateur, au format de Solo (« 4x4:description »).
//   node tools/oracle_solo16.mjs aval           lit tools/oracle/mes-16-solo.txt (sortie de `solo_solveur -g`, voir verifier_16_sur_hermes.sh) : aucune de nos grilles
//        ne doit être « Ambiguous » ni « Impossible » pour le solveur de Solo ; la note de Solo est comparée à nos niveaux.
import { readFileSync, writeFileSync } from 'node:fs';
import { moteur } from '../src/sudoku_n.js';

const DIR = new URL('./oracle/', import.meta.url);
const m = moteur(4);
const N = m.N;

function decoderGrille(desc) {
  const g = [];
  let i = 0;
  while (i < desc.length) {
    const c = desc[i++];
    if (c >= 'a' && c <= 'z') for (let k = c.charCodeAt(0) - 96; k > 0; k--) g.push(-1);
    else if (c === '_') { /* séparateur */ } else if (c >= '1' && c <= '9') {
      let n = c; while (desc[i] >= '0' && desc[i] <= '9') n += desc[i++];
      g.push(Number(n) - 1);
    } else throw new Error(`caractère inattendu « ${c} »`);
  }
  if (g.length !== N) throw new Error(`grille de ${g.length} cases`);
  return Int8Array.from(g);
}

function encoderGrille(puzzle) {
  let out = '', vide = 0, apres = false;
  const lacher = () => { while (vide > 0) { const k = Math.min(vide, 26); out += String.fromCharCode(96 + k); vide -= k; } };
  for (let p = 0; p < N; p++) {
    if (puzzle[p] < 0) { vide++; apres = false; continue; }
    lacher();
    if (apres) out += '_';
    out += String(puzzle[p] + 1);
    apres = true;
  }
  lacher();
  return out;
}

function amont() {
  const lignes = readFileSync(new URL('parties-solo-16.tsv', DIR), 'utf8').split('\n').filter(Boolean);
  let ok = 0, echecs = 0;
  const tab = {};
  for (const l of lignes) {
    const [, params, graine, desc, aux] = l.split('\t');
    try {
      const grille = decoderGrille(desc);
      const solutionSolo = aux.replace(/^S/, '').split(',').map((v) => Number(v) - 1);
      const r = m.analyser(grille);
      if (!r.resolu) throw new Error(`non résolue (${r.ambigue ? 'ambiguë' : r.impossible ? 'impossible' : 'bloquée'})`);
      if (Array.from(r.solution).join() !== solutionSolo.join()) throw new Error('solution différente de celle de Solo');
      ok++;
      const cle = `${params} → niveau ${r.niveau}`;
      tab[cle] = (tab[cle] ?? 0) + 1;
    } catch (e) { echecs++; console.log(`ECHEC ${params} graine ${graine} : ${e.message}`); }
  }
  console.log(`Solo → nous : ${ok} grilles sur ${lignes.length} résolues avec la solution de Solo, ${echecs} échec(s)`);
  for (const [k, v] of Object.entries(tab).sort()) console.log(`  ${k} : ${v}`);
  process.exitCode = echecs ? 1 : 0;
}

function exporter(n) {
  const sortie = [];
  for (let niveau = 1; niveau <= 4; niveau++) {
    for (let g = 1; g <= n; g++) {
      const x = m.generer(g * 7919 + niveau, niveau);
      if (!x) { console.log(`pas de grille niveau ${niveau} graine ${g}`); continue; }
      sortie.push(`${niveau}\t4x4:${encoderGrille(x.puzzle)}`);
    }
  }
  writeFileSync(new URL('mes-16.tsv', DIR), sortie.join('\n') + '\n');
  console.log(`${sortie.length} grilles écrites dans tools/oracle/mes-16.tsv`);
}

function aval() {
  const mes = readFileSync(new URL('mes-16.tsv', DIR), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[0]);
  const rep = readFileSync(new URL('mes-16-solo.txt', DIR), 'utf8').split('\n').filter((l) => l.startsWith('Difficulty rating') || l.startsWith('ERREUR'));
  if (rep.length !== mes.length) { console.log(`ECHEC : ${rep.length} réponses de Solo pour ${mes.length} grilles`); process.exitCode = 1; return; }
  let mauvais = 0;
  const tab = {};
  rep.forEach((r, i) => {
    const note = r.replace('Difficulty rating: ', '').split(' ')[0];
    if (note === 'Ambiguous' || note === 'Impossible' || r.startsWith('ERREUR')) { mauvais++; console.log(`ECHEC grille ${i + 1} (niveau ${mes[i]}) : ${r}`); }
    const cle = `niveau ${mes[i]} → Solo ${note}`;
    tab[cle] = (tab[cle] ?? 0) + 1;
  });
  console.log(`Nous → Solo : ${rep.length - mauvais} grilles sur ${rep.length} jugées à solution unique par le solveur de Solo, ${mauvais} échec(s)`);
  for (const [k, v] of Object.entries(tab).sort()) console.log(`  ${k} : ${v}`);
  process.exitCode = mauvais ? 1 : 0;
}

const [mode, arg] = process.argv.slice(2);
if (mode === 'amont') amont();
else if (mode === 'exporter') exporter(Number(arg) || 8);
else if (mode === 'aval') aval();
else console.log('usage : node tools/oracle_solo16.mjs amont | exporter [N] | aval');
