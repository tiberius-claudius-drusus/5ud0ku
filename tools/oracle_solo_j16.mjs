// Oracle Solo (Simon Tatham, MIT) pour le Jigsaw 16×16 : sens « nous → Solo » seulement.
// Le générateur de Solo ne produit pas de Jigsaw 16×16 (préréglage « 16j » : aucune grille en 250 s sur Hermes, il refait des partitions sans fin, comme nous avant d'avoir
// construit les régions avec leur grille) ; son SOLVEUR, lui, accepte la description « 16j:grille,régions ».
//   node tools/oracle_solo_j16.mjs exporter [N]   écrit tools/oracle/mes-j16.tsv : N grilles par niveau de NOTRE générateur au format de Solo
//   node tools/oracle_solo_j16.mjs aval           lit tools/oracle/mes-j16-solo.txt (sortie de `solo_solveur -g`, voir verifier_j16_sur_hermes.sh) : aucune de nos grilles
//        ne doit être « Ambiguous » ni « Impossible » pour le solveur de Solo ; sa note de difficulté est comparée à nos niveaux.
import { readFileSync, writeFileSync } from 'node:fs';
import { genererJigsawNSansCache } from '../src/sudoku_n.js';

const DIR = new URL('./oracle/', import.meta.url);
const n = 16, N = 256;

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

function encoderRegions(regions) {
  const fusion = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n - 1; x++) fusion.push(regions[y * n + x] === regions[y * n + x + 1]);
  for (let x = 0; x < n; x++) for (let y = 0; y < n - 1; y++) fusion.push(regions[y * n + x] === regions[(y + 1) * n + x]);
  fusion.push(false);   // arête fictive finale
  let out = '', run = 0;
  for (const m of fusion) {
    if (m) { if (++run === 26) { out += 'z'; run = 0; } } else { out += run ? String.fromCharCode(96 + run) : '_'; run = 0; }
  }
  return out;
}

function exporter(nb) {
  const sortie = [];
  for (let niveau = 1; niveau <= 4; niveau++) {
    for (let g = 1; g <= nb; g++) {
      const x = genererJigsawNSansCache(4, g * 7919 + niveau, niveau);
      if (!x) { console.log(`pas de grille niveau ${niveau} graine ${g}`); continue; }
      sortie.push(`${niveau}\t16j:${encoderGrille(x.puzzle)},${encoderRegions(x.regions)}`);
    }
  }
  writeFileSync(new URL('mes-j16.tsv', DIR), sortie.join('\n') + '\n');
  console.log(`${sortie.length} grilles écrites dans tools/oracle/mes-j16.tsv`);
}

function aval() {
  const mes = readFileSync(new URL('mes-j16.tsv', DIR), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[0]);
  const rep = readFileSync(new URL('mes-j16-solo.txt', DIR), 'utf8').split('\n').filter((l) => l.startsWith('Difficulty rating') || l.startsWith('ERREUR'));
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
if (mode === 'exporter') exporter(Number(arg) || 6);
else if (mode === 'aval') aval();
else console.log('usage : node tools/oracle_solo_j16.mjs exporter [N] | aval');
