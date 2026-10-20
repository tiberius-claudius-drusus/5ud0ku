/*
 * 5ud0ku — registre des langues (les mêmes que T-7r4V3x et 1-5731N) et chargement à la demande.
 * Licence : GPL-3.0-or-later (voir LICENSE.txt).
 */
import { FR, EN } from '../strings.js';

/** Langues proposées : code de fichier `src/lang/<code>.js` (sauf `fr` et `en`, intégrées), nom dans la langue elle-même. */
export const LANGUAGES = [
  { code: 'fr', name: 'Français' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt-pt', name: 'Português (Portugal)' },
  { code: 'pt-br', name: 'Português (Brasil)' },
  { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'zh', name: '中文' },
  { code: 'ko', name: '한국어' },
  { code: 'ja', name: '日本語' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'uk', name: 'Українська' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'la', name: 'Latina' },
];

export const CODES = LANGUAGES.map((l) => l.code);

/** Code de langue retenu pour une liste de préférences (ex. navigator.languages) ; `en` si rien ne convient. */
export function pickLanguage(preferred = []) {
  for (const raw of preferred) {
    const tag = String(raw).toLowerCase();
    if (CODES.includes(tag)) return tag;
    const base = tag.split('-')[0];
    if (base === 'pt') return 'pt-pt';
    if (CODES.includes(base)) return base;
  }
  return 'en';
}

export const directionOf = (code) => LANGUAGES.find((l) => l.code === code)?.dir ?? 'ltr';

/** Dictionnaire d'une langue ; le français et l'anglais sont intégrés, les autres sont importés à la demande. */
export async function loadLanguage(code) {
  if (code === 'fr') return FR;
  if (code === 'en' || !CODES.includes(code)) return EN;
  try {
    return (await import(`./${code}.js`)).default;
  } catch {
    return EN;
  }
}
