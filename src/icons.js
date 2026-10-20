/*
 * 5ud0ku — pictogrammes des boutons (SVG en ligne, trait = couleur du texte du bouton).
 * Licence : GPL-3.0-or-later (voir LICENSE.txt).
 */
const wrap = (body) =>
  `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const ICONS = {
  menu: wrap('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  undo: wrap('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: wrap('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  close: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  notes: wrap('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
  erase: wrap('<path d="M4 17l9-11 7 6-6 8H7z"/><path d="M9 20h11"/>'),
  pause: wrap('<path d="M8 5v14M16 5v14"/>'),
  play: wrap('<path d="M7 5l12 7-12 7z"/>'),
  share: wrap('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/>'),
  test: wrap('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M8 15h8"/>'),
  hint: wrap('<path d="M12 3a6 6 0 0 0-3 11v3h6v-3a6 6 0 0 0-3-11z"/><path d="M10 21h4"/>'),
};
