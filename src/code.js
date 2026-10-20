/*
 * 5ud0ku — codes de grille, grille du jour
 * Copyright (C) 2026 Drusus (Gens Claudia). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 *
 * Idée reprise de T-7r4V3x et 1-5731N (Gens Claudia) : une grille est entièrement déterminée par un petit code, ce qui
 * permet de la rejouer, de la partager, et d'en tirer une « grille du jour » identique pour tous.
 *
 * Un code tient en 12 symboles de l'alphabet de Crockford (sans I, L, O, U), affichés en trois groupes de quatre :
 *
 *     V V | D | S S S S S S S | K K        ex. « 0112-9A05-6GPM »
 *     version | difficulté | graine (32 bits) | deux symboles de contrôle
 *
 *  - version : 2 chiffres, la version de l'ALGORITHME de génération ;
 *  - difficulté : 1 symbole (1 facile, 2 moyen, 3 difficile, 4 très difficile) ;
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

export const CODE_VERSION = 1;

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

/** Code d'une grille : `makeCode(DIFFICULTY.EASY, 12345)`. */
export function makeCode(difficulty, seed) {
  if (!PLAYABLE.includes(difficulty)) throw new Error('Difficulté inconnue');
  const body = String(CODE_VERSION).padStart(2, '0') + sym(difficulty) + seedToSymbols(seed);
  return body + checksum(body);
}

/** Texte saisi -> 12 symboles propres (majuscules, O->0, I/L->1, séparateurs ôtés), ou null si des symboles sont interdits. */
function clean(text) {
  const s = String(text ?? '').toUpperCase().replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return s.length > 0 && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

/** Décode un code : { version, difficulty, seed } ou null (longueur, symbole, somme de contrôle, version ou difficulté invalides). */
export function parseCode(text) {
  const s = clean(text);
  if (!s || s.length !== CODE_LENGTH) return null;
  if (checksum(s.slice(0, -2)) !== s.slice(-2)) return null;
  const version = Number(s.slice(0, 2));
  if (!Number.isInteger(version) || version !== CODE_VERSION) return null;
  const difficulty = ALPHABET.indexOf(s[2]);
  if (!PLAYABLE.includes(difficulty)) return null;
  let seed = 0;
  for (const c of s.slice(3, 3 + SEED_LENGTH)) seed = seed * 32 + ALPHABET.indexOf(c);
  if (seed > 0xffffffff) return null;
  return { version, difficulty, seed };
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

/** Graine de la grille du jour : la même pour tous, pour une date et une difficulté. */
export function dailySeed(date, difficulty) {
  if (!validDate(date)) throw new Error('Date invalide');
  return fnv1a(`5ud0ku:${CODE_VERSION}:${date}:${difficulty}`);
}

export function dailyCode(date, difficulty) {
  return makeCode(difficulty, dailySeed(date, difficulty));
}

/** Grille d'un code (même code, même grille) : { puzzle, solution, difficulty, seed }. Lève une erreur si le code est invalide. */
export function puzzleFromCode(text) {
  const c = parseCode(text);
  if (!c) throw new Error('Code invalide');
  return SudokuGenerator.generate(c.difficulty, c.seed);
}
