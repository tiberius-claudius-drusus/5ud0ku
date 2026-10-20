/*
 * 5ud0ku — logo : une grille de sudoku 9×9 avec quelques chiffres, dessinée en SVG avec les couleurs du thème courant
 * (variables CSS). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 */

// [ligne, colonne, chiffre, genre] ; genre : 'g' donné, 'e' joueur, 't' essai
export const LOGO_DIGITS = [
  [0, 0, 5, 'g'], [0, 4, 7, 'e'], [1, 2, 3, 'g'], [2, 6, 9, 'g'], [3, 1, 6, 'e'], [3, 7, 1, 'g'],
  [4, 4, 2, 't'], [5, 3, 8, 'g'], [6, 8, 4, 'g'], [7, 5, 3, 'e'], [8, 2, 1, 'g'], [8, 6, 8, 'g'],
];

const SIZE = 100;
const MARGIN = 4;
const CELL = (SIZE - 2 * MARGIN) / 9;
const COLOR = { g: 'var(--given)', e: 'var(--entry)', t: 'var(--test)' };

/** Marque SVG (chaîne) ; couleurs via les variables du thème, donc elle suit le thème et le mode clair ou foncé. */
export function logoSvg() {
  const parts = [`<rect x="${MARGIN}" y="${MARGIN}" width="${SIZE - 2 * MARGIN}" height="${SIZE - 2 * MARGIN}" rx="5" fill="var(--cell)"/>`];
  for (let i = 1; i < 9; i++) {
    const pos = (MARGIN + i * CELL).toFixed(2);
    const strong = i % 3 === 0;
    const stroke = strong ? 'var(--line-strong)' : 'var(--line)';
    const w = strong ? 1.6 : 0.5;
    parts.push(`<line x1="${pos}" y1="${MARGIN}" x2="${pos}" y2="${SIZE - MARGIN}" stroke="${stroke}" stroke-width="${w}"/>`);
    parts.push(`<line x1="${MARGIN}" y1="${pos}" x2="${SIZE - MARGIN}" y2="${pos}" stroke="${stroke}" stroke-width="${w}"/>`);
  }
  parts.push(`<rect x="${MARGIN}" y="${MARGIN}" width="${SIZE - 2 * MARGIN}" height="${SIZE - 2 * MARGIN}" rx="5" fill="none" stroke="var(--line-strong)" stroke-width="2.2"/>`);
  for (const [r, c, d, kind] of LOGO_DIGITS) {
    const x = (MARGIN + (c + 0.5) * CELL).toFixed(2);
    const y = (MARGIN + (r + 0.5) * CELL + 3.4).toFixed(2);
    parts.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="9.4" font-weight="700" font-family="var(--digit-font,inherit)" fill="${COLOR[kind]}">${d}</text>`);
  }
  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="5ud0ku" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}
