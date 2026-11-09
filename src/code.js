/*
 * 5ud0ku — codes de grille, grille du jour
 * Copyright (C) 2026 Drusus (Gens Claudia). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 *
 * Idée reprise de T-7r4V3x et 1-5731N (Gens Claudia) : une grille est entièrement déterminée par un petit code, ce qui
 * permet de la rejouer, de la partager, et d'en tirer une « grille du jour » identique pour tous.
 *
 * Un code tient en 12 symboles de l'alphabet de Crockford (sans I, L, O, U), affichés en trois groupes de quatre :
 *
 *     M V | D | S S S S S S S | K K        ex. « 0112-9A05-6GPM » (classique) ; un code puzzle commence par « 11 » (voir `makeCode`)
 *     type de grille, version | difficulté | graine (32 bits) | deux symboles de contrôle
 *
 *  - type de grille (M) : 0 classique 9×9, 1 puzzle (Jigsaw) 9×9, 2 classique 16×16, 3 puzzle 16×16, 4 petit 4×4 (difficulté unique : 1) ;
 *  - version (V) : 1 symbole, la version de l'ALGORITHME de génération de ce type ; « 01 » + difficulté = exactement les codes classiques d'avant (aucun ne change) ;
 *  - difficulté : 1 symbole, TOUJOURS 1 facile, 2 moyen, 3 difficile, 4 très difficile ;
 *  - ANCIEN FORMAT, toujours lu (2.1.0 et avant) : le type était caché dans le symbole de difficulté, après « 01 » : 5 à 8 puzzle 9×9, 9 à 12 classique 16×16,
 *    13 à 16 puzzle 16×16 (difficulté + 4, + 8, + 12). Ces codes donnent la même grille que le code uniforme du même type ; on n'affiche plus que le nouveau format ;
 *  - graine : alimente le générateur de `SudokuGenerator` (7 symboles = 35 bits, la graine en occupe 32) ;
 *  - contrôle : détecte toute faute de frappe d'un symbole et tout échange de deux symboles voisins, au lieu de jouer en
 *    silence une autre grille. Le premier symbole pondère par des poids impairs (inversibles modulo 32 : une substitution
 *    est toujours vue), le second par la position (deux symboles voisins distincts échangés changent toujours la somme).
 *
 * RÈGLE D'OR : un code ne doit JAMAIS changer de grille. La grille dépend de l'algorithme de `src/generator.js`
 * (ordre des tirages, techniques de résolution qui fixent la difficulté) et du générateur pseudo-aléatoire. Si l'un d'eux
 * doit changer, on crée la version 2 (CODE_VERSION) et on GARDE la version 1 appelable ; sinon les codes déjà partagés
 * donneraient d'autres grilles. Les tests de `test/code.test.js` figent des grilles de référence pour le détecter.
 */
import { SudokuGenerator, DIFFICULTY } from './generator.js';
import { genererJigsawNiveau } from './jigsaw_solveur.js';
import { moteurDe, genererJigsawN, REGIONS_16, REGIONS_4 } from './sudoku_n.js';

export const CODE_VERSION = 1;          // version de l'algorithme du mode classique
export const JIGSAW_CODE_VERSION = 1;   // version de l'algorithme du mode Jigsaw (src/jigsaw.js, src/jigsaw_solveur.js) : même règle d'or, indépendante de la précédente
export const HEX_CODE_VERSION = 1;      // version de l'algorithme du 16×16 (src/sudoku_n.js) : même règle d'or, indépendante des deux autres
export const HEXJIGSAW_CODE_VERSION = 1; // version de l'algorithme du Jigsaw 16×16 (src/sudoku_n.js) : même règle d'or, indépendante des trois autres
export const PETIT_CODE_VERSION = 1;    // version de l'algorithme du 4×4 (src/sudoku_n.js, 7 indices au moins), difficulté unique : 1
export const MODE = Object.freeze({ CLASSIQUE: 'classique', JIGSAW: 'jigsaw', HEX: 'hex', HEXJIGSAW: 'hexjigsaw', PETIT: 'petit' });

// premier symbole du code (type de grille) et version de l'algorithme de chaque mode
const SYMBOLE_TYPE = { [MODE.CLASSIQUE]: 0, [MODE.JIGSAW]: 1, [MODE.HEX]: 2, [MODE.HEXJIGSAW]: 3, [MODE.PETIT]: 4 };
// ancien format (≤ 2.1.0) : décalage du symbole de difficulté, sous la version « 01 »
const DECALAGE_ANCIEN = { [MODE.CLASSIQUE]: 0, [MODE.JIGSAW]: 4, [MODE.HEX]: 8, [MODE.HEXJIGSAW]: 12 };
const VERSION_DU = { [MODE.CLASSIQUE]: CODE_VERSION, [MODE.JIGSAW]: JIGSAW_CODE_VERSION, [MODE.HEX]: HEX_CODE_VERSION, [MODE.HEXJIGSAW]: HEXJIGSAW_CODE_VERSION, [MODE.PETIT]: PETIT_CODE_VERSION };

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford : pas de I, L, O, U (pas de confusions à la saisie)
const SEED_LENGTH = 7;
const CODE_LENGTH = 2 + 1 + SEED_LENGTH + 2;
const PLAYABLE = [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD, DIFFICULTY.VERY_HARD];

const sym = (n) => ALPHABET[n];

/** Deux symboles de contrôle (voir l'en-tête) calculés sur les 10 premiers symboles. */
function checksum(body) {
  let a = 0, b = 0;
  for (let i = 0; i < body.length; i++) {
    const v = ALPHABET.indexOf(body[i]);
    a += v * (2 * i + 1);
    b += v * (i + 1);
  }
  return sym(a % 32) + sym(b % 32);
}

/** Graine 32 bits (nombre) -> 7 symboles. */
function seedToSymbols(seed) {
  let out = '';
  let n = seed >>> 0;
  for (let i = 0; i < SEED_LENGTH; i++) { out = sym(n % 32) + out; n = Math.floor(n / 32); }
  return out;
}

/** Code d'une grille : `makeCode(DIFFICULTY.EASY, 12345)` ; mode Jigsaw : `makeCode(DIFFICULTY.EASY, 12345, MODE.JIGSAW)`. */
export function makeCode(difficulty, seed, mode = MODE.CLASSIQUE) {
  if (!PLAYABLE.includes(difficulty)) throw new Error('Difficulté inconnue');
  if (!(mode in SYMBOLE_TYPE)) throw new Error('Mode inconnu');
  if (mode === MODE.PETIT && difficulty !== DIFFICULTY.EASY) throw new Error('Le 4×4 n\'a qu\'une difficulté');
  const body = sym(SYMBOLE_TYPE[mode]) + sym(VERSION_DU[mode]) + sym(difficulty) + seedToSymbols(seed);
  return body + checksum(body);
}

/** Texte saisi -> 12 symboles propres (majuscules, O->0, I/L->1, séparateurs ôtés), ou null si des symboles sont interdits. */
function clean(text) {
  const s = String(text ?? '').toUpperCase().replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return s.length > 0 && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

/** Décode un code : { version, difficulty, seed, mode } ou null (longueur, symbole, somme de contrôle, version ou difficulté invalides). */
export function parseCode(text) {
  const s = clean(text);
  if (!s || s.length !== CODE_LENGTH) return null;
  if (checksum(s.slice(0, -2)) !== s.slice(-2)) return null;
  const symboleType = ALPHABET.indexOf(s[0]);
  const version = ALPHABET.indexOf(s[1]);
  const symbole = ALPHABET.indexOf(s[2]);
  let mode = Object.keys(SYMBOLE_TYPE).find((m) => SYMBOLE_TYPE[m] === symboleType);
  let difficulty = symbole;
  if (!PLAYABLE.includes(difficulty)) {
    // ancien format : « 01 » puis la difficulté décalée selon le type
    if (symboleType !== 0 || version !== 1) return null;
    mode = Object.keys(DECALAGE_ANCIEN).find((m) => PLAYABLE.includes(symbole - DECALAGE_ANCIEN[m]));
    if (!mode) return null;
    difficulty = symbole - DECALAGE_ANCIEN[mode];
  }
  if (!mode || version !== VERSION_DU[mode]) return null;
  if (mode === MODE.PETIT && difficulty !== DIFFICULTY.EASY) return null;
  let seed = 0;
  for (const c of s.slice(3, 3 + SEED_LENGTH)) seed = seed * 32 + ALPHABET.indexOf(c);
  if (seed > 0xffffffff) return null;
  return { version, difficulty, seed, mode };
}

/** Deux codes (ancien ou nouveau format) désignent-ils la même grille ? */
export function memeGrille(a, b) {
  const x = parseCode(a), y = parseCode(b);
  return !!x && !!y && x.mode === y.mode && x.difficulty === y.difficulty && x.seed === y.seed;
}

/** Forme canonique d'affichage « XXXX-XXXX-XXX » (ou null si le code est invalide). */
export function canonicalCode(text) {
  if (!parseCode(text)) return null;
  const s = clean(text);
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/** Mise en forme au fil de la frappe : majuscules, séparateurs, tirets tous les 4 symboles. */
export function typeCode(text) {
  const s = String(text ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, '').slice(0, CODE_LENGTH);
  return [s.slice(0, 4), s.slice(4, 8), s.slice(8)].filter(Boolean).join('-');
}

// --- grille du jour ---

export function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** Date locale « AAAA-MM-JJ » (le jour change à minuit, heure de l'appareil). */
export function localDate(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** FNV-1a 32 bits d'un texte : graine reproductible. */
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Graine de la grille du jour : la même pour tous, pour une date, une difficulté et un mode (le mode classique garde sa graine d'origine). */
export function dailySeed(date, difficulty, mode = MODE.CLASSIQUE) {
  if (!validDate(date)) throw new Error('Date invalide');
  if (mode === MODE.JIGSAW) return fnv1a(`5ud0ku:jigsaw:${JIGSAW_CODE_VERSION}:${date}:${difficulty}`);
  if (mode === MODE.HEX) return fnv1a(`5ud0ku:hex:${HEX_CODE_VERSION}:${date}:${difficulty}`);
  if (mode === MODE.PETIT) return fnv1a(`5ud0ku:petit:${PETIT_CODE_VERSION}:${date}:${difficulty}`);
  if (mode === MODE.HEXJIGSAW) return fnv1a(`5ud0ku:hexjigsaw:${HEXJIGSAW_CODE_VERSION}:${date}:${difficulty}`);
  return fnv1a(`5ud0ku:${CODE_VERSION}:${date}:${difficulty}`);
}

export function dailyCode(date, difficulty, mode = MODE.CLASSIQUE) {
  return makeCode(difficulty, dailySeed(date, difficulty, mode), mode);
}

/**
 * Grille d'un code (même code, même grille). Mode classique : { puzzle, solution, difficulty, seed } (tableaux 9×9). Mode Jigsaw : { mode, puzzle, solution, regions,
 * difficulty, seed } (puzzle et solution en 81 valeurs 0..8, -1 = vide). Lève une erreur si le code est invalide.
 */
export function puzzleFromCode(text) {
  const c = parseCode(text);
  if (!c) throw new Error('Code invalide');
  if (c.mode === MODE.JIGSAW) {
    const g = genererJigsawNiveau(c.seed, c.difficulty);
    return { mode: MODE.JIGSAW, puzzle: g.puzzle, solution: g.solution, regions: g.regions, difficulty: c.difficulty, seed: c.seed };
  }
  if (c.mode === MODE.PETIT) {
    const g = moteurDe(2).generer(c.seed, c.difficulty, { indicesMin: 7 });
    if (!g) throw new Error('Génération impossible');
    return { mode: MODE.PETIT, puzzle: g.puzzle, solution: g.solution, regions: REGIONS_4, difficulty: c.difficulty, seed: c.seed };
  }
  if (c.mode === MODE.HEXJIGSAW) {
    const g = genererJigsawN(4, c.seed, c.difficulty);
    if (!g) throw new Error('Génération impossible');
    return { mode: MODE.HEXJIGSAW, puzzle: g.puzzle, solution: g.solution, regions: g.regions, difficulty: c.difficulty, seed: c.seed };
  }
  if (c.mode === MODE.HEX) {
    const g = moteurDe(4).generer(c.seed, c.difficulty);
    if (!g) throw new Error('Génération impossible');
    return { mode: MODE.HEX, puzzle: g.puzzle, solution: g.solution, regions: REGIONS_16, difficulty: c.difficulty, seed: c.seed };
  }
  return SudokuGenerator.generate(c.difficulty, c.seed);
}
