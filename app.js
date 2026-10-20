/*
 * 5ud0ku — portage PWA de GNOME Sudoku : interface
 * Copyright (C) 2024-2026 Johan Gay et les contributeurs de GNOME Sudoku
 * Copyright (C) 2026 Drusus (Gens Claudia)
 * Ce programme est un logiciel libre ; vous pouvez le redistribuer et/ou le modifier selon les termes de la
 * Licence Publique Générale GNU, version 3 ou (à votre choix) toute version ultérieure.
 *
 * Toute la logique de jeu est dans src/ (générateur, plateau, partie, session) ; ce fichier ne fait que dessiner
 * la grille, relier les gestes (toucher, clavier) à la session et gérer les boîtes de dialogue.
 */
import { SudokuSession } from './src/session.js';
import { DIFFICULTY } from './src/generator.js';
import { SudokuError, ERRORS } from './src/board.js';
import { t, setDictionary, formatTime } from './src/strings.js';
import { LANGUAGES, pickLanguage, loadLanguage, directionOf } from './src/lang/index.js';
import { ICONS } from './src/icons.js';
import { THEMES, MODES, apply as applyTheme } from './src/themes.js';
import { localDate } from './src/code.js';
import { summarize, byDifficulty, recent } from './src/stats.js';
import { VERSION, RELEASE_DATE } from './src/version.js';
import { logoSvg } from './src/logo.js';

const $ =(id) => document.getElementById(id);

function safeStorage() {
  try {
    const s = window.localStorage;
    s.setItem('5ud0ku:test', '1');
    s.removeItem('5ud0ku:test');
    return s;
  } catch { return null; }
}

const session = new SudokuSession({ storage: safeStorage() });
let selected = -1;
let autoPaused = false;
let view = 'home';              // 'home' (page d'accueil) ou 'game' (grille)
let detach = [];

const DIFFS = [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD, DIFFICULTY.VERY_HARD];
const ZOOMS = { small: 0.85, medium: 1, large: 1.25, none: 1 };

// --- textes et pictogrammes ---

function setLabel(btn, icon, label) {
  btn.innerHTML = ICONS[icon] ?? '';                                                      // pictogramme : SVG du dépôt
  btn.append(Object.assign(document.createElement('span'), { textContent: label }));      // texte traduit : jamais interprété comme du HTML
  btn.setAttribute('aria-label', label);
}

function applyTexts() {
  document.title = t('app.title');
  $('b-menu').innerHTML = ICONS.menu;
  if (!session.game) $('b-pause').innerHTML = ICONS.pause;
  $('b-menu').setAttribute('aria-label', t('game.menu'));
  $('b-menu').title = t('game.menu');
  setLabel($('b-undo'), 'undo', t('game.undo'));
  setLabel($('b-redo'), 'redo', t('game.redo'));
  setLabel($('b-notes'), 'notes', t('game.notes'));
  setLabel($('b-test'), 'test', t('game.test'));
  setLabel($('b-erase'), 'erase', t('game.erase'));
  $('pause-text').textContent = t('game.paused');
  $('b-resume').textContent = t('game.resume');
  $('busy').textContent = t('game.generating');
  $('board').setAttribute('aria-label', t('app.title'));
  const set = (id, key) => { $(id).textContent = t(key); };
  set('menu-title', 'menu.title');
  set('m-resume', 'menu.resume'); set('m-home', 'menu.home'); set('m-restart', 'menu.restart'); set('m-share', 'menu.share');
  set('m-enter', 'menu.enter'); set('m-options', 'menu.options'); set('m-help', 'menu.help'); set('m-about', 'menu.about');
  set('home-title', 'app.title');
  set('h-new', 'home.new'); set('h-stats', 'home.stats'); set('h-options', 'home.options'); set('h-help', 'home.help');
  set('new-title', 'new.title'); set('new-start', 'new.start'); set('new-cancel', 'dialog.close');
  set('new-daily', 'new.daily'); set('new-enter', 'menu.enter'); set('help-about', 'menu.about');
  $('diffs').setAttribute('aria-label', t('home.diffs'));
  $('logo').innerHTML = logoSvg();
  // pied de page de l'accueil, en deux lignes comme 1-5731N : la version et la licence, puis l'inspiration
  $('h-ver').replaceChildren(
    document.createTextNode(t('home.foot', { version: VERSION, date: RELEASE_DATE })),
    Object.assign(document.createElement('a'), { href: 'LICENSE.txt', target: '_blank', rel: 'noopener', textContent: 'GPL3+' }),
  );
  const mark = '\u0000';
  const [before, after = ''] = t('foot.inspired', { name: mark }).split(mark);
  $('h-inspired').replaceChildren(before, Object.assign(document.createElement('i'), { textContent: 'GNOME Sudoku' }), after);
  set('done-title', 'done.title'); set('done-close', 'done.close'); set('done-new', 'done.new');
  set('share-title', 'share.title'); set('share-text', 'share.text'); set('share-copy', 'share.copy'); set('share-copy5', 'share.copy'); set('share-close', 'dialog.close');
  set('share-lbl5', 'share.lbl5'); set('share-lblhash', 'share.lblhash');
  set('m-stats', 'menu.stats');
  set('stats-title', 'stats.title'); set('stats-reset', 'stats.reset'); set('stats-close', 'dialog.close');
  set('enter-title', 'enter.title'); set('enter-text', 'enter.text'); set('enter-start', 'enter.start'); set('enter-close', 'dialog.close');
  set('options-title', 'options.title'); set('options-close', 'dialog.close');
  set('help-title', 'help.title'); set('help-1', 'help.1'); set('help-2', 'help.2'); set('help-3', 'help.3'); set('help-4', 'help.4'); set('help-close', 'dialog.close');
  set('about-title', 'about.title'); set('about-text', 'about.text'); set('about-code', 'about.code'); set('about-licence', 'about.licence'); set('about-close', 'dialog.close');
  $('about-version').textContent = t('about.version', { version: VERSION, date: RELEASE_DATE });
}

// --- construction de la grille ---

const cells = [];

function buildBoard() {
  const board = $('board');
  board.setAttribute('role', 'group');
  for (let p = 0; p < 81; p++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell';
    if (p % 9 === 2 || p % 9 === 5) b.classList.add('cb');
    if (Math.floor(p / 9) === 2 || Math.floor(p / 9) === 5) b.classList.add('rb');
    b.dataset.p = String(p);
    b.tabIndex = -1;
    b.addEventListener('click', () => select(p));
    board.append(b);
    cells.push(b);
  }
  const pad = $('pad');
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(d);
    b.setAttribute('aria-label', String(d));
    b.addEventListener('click', () => input(d - 1));
    pad.append(b);
  }
}

// --- affichage ---

function cellLabel(p, g) {
  const row = Math.floor(p / 9) + 1, col = (p % 9) + 1;
  const v = g.board.value[p];
  const parts = [t('game.cell', { row, col })];
  const w = session.warnings(p);   // une erreur ne doit pas passer par la seule couleur : elle est dite au lecteur d'écran
  if (v !== -1) {
    parts.push(t('game.cell.value', { value: v + 1 }));
    if (g.board.isFixed(p)) parts.push(t('game.cell.given'));
    else if (g.board.test[p]) parts.push(t('game.cell.test'));
    if (w.valueError) parts.push(t('game.cell.error'));
  } else if (g.board.hasEarmarks(p)) {
    const notes = [];
    for (let n = 0; n < 9; n++) if (g.board.isEarmarkEnabled(p, n)) notes.push(n + 1);
    parts.push(t('game.cell.notes', { notes: notes.join(' ') }));
    if (w.earmarkErrors.length) parts.push(t('game.cell.notes.error', { notes: w.earmarkErrors.map((n) => n + 1).join(' ') }));
  } else {
    parts.push(t('game.cell.empty'));
  }
  return parts.join(', ');
}

function renderBoard() {
  const g = session.game;
  const hide = !g || (g.paused && !autoPaused);
  for (let p = 0; p < 81; p++) {
    const el = cells[p];
    el.className = el.className.split(' ').filter((c) => c === 'cell' || c === 'cb' || c === 'rb').join(' ');
    if (!g || hide) { el.innerHTML = ''; el.tabIndex = -1; el.setAttribute('aria-label', ''); continue; }
    el.tabIndex = p === (selected >= 0 ? selected : 0) ? 0 : -1;
  }
  if (!g || hide) return;
  const hl = session.highlights(selected);
  for (let p = 0; p < 81; p++) {
    const el = cells[p];
    const v = g.board.value[p];
    const w = session.warnings(p);
    if (g.board.isFixed(p)) el.classList.add('given');
    if (g.board.test[p]) el.classList.add('test');
    if (hl.cells.has(p)) el.classList.add('hl');
    if (hl.sameValue.has(p)) el.classList.add('same');
    if (p === selected) el.classList.add('sel');
    if (w.valueError) el.classList.add('err');
    if (v !== -1) {
      el.innerHTML = `<span class="v">${v + 1}</span>`;
    } else if (g.board.hasEarmarks(p)) {
      let html = '<span class="m">';
      for (let n = 0; n < 9; n++) {
        if (!g.board.isEarmarkEnabled(p, n)) { html += '<i></i>'; continue; }
        const cls = [w.earmarkErrors.includes(n) ? 'err' : '', hl.sameEarmark.get(p) === n ? 'on-same' : ''].filter(Boolean).join(' ');
        html += `<i${cls ? ` class="${cls}"` : ''}>${n + 1}</i>`;
      }
      el.innerHTML = `${html}</span>`;
    } else {
      el.innerHTML = '';
    }
    el.setAttribute('aria-label', cellLabel(p, g));
  }
}

/**
 * Pavé 3×3. Normal : bleu, toutes les touches. Notes : jaune, les chiffres déjà notés dans la case sélectionnée sont
 * en négatif. Essai : vert, seuls les chiffres notés dans la case sont présents (les autres gardent leur place mais
 * sont invisibles) et l'essai en cours est en négatif.
 */
function renderPad(g) {
  const pad = $('pad');
  const mode = session.mode;
  pad.classList.toggle('notes', mode === 'notes');
  pad.classList.toggle('test', mode === 'test');
  const usable = !!g && !g.paused && !g.finished && selected >= 0 && !g.board.isFixed(selected);
  const b = g?.board;
  let hint = '';
  let noted = 0;
  for (let d = 0; d < 9; d++) {
    const btn = pad.children[d];
    const isNoted = usable && b.isEarmarkEnabled(selected, d);
    if (isNoted) noted++;
    let on = false;
    let absent = false;
    if (mode === 'notes') on = isNoted;
    else if (mode === 'test') {
      absent = usable && !isNoted && !(b.test[selected] && b.value[selected] === d);
      on = usable && b.test[selected] === 1 && b.value[selected] === d;
    }
    btn.disabled = !usable || (mode === 'test' && (b.value[selected] !== -1 && !b.test[selected]));
    btn.classList.toggle('on', on);
    btn.classList.toggle('absent', absent);
    btn.setAttribute('aria-pressed', mode === 'normal' ? 'false' : String(on));
  }
  if (mode === 'test' && usable) {
    if (b.value[selected] !== -1 && !b.test[selected]) hint = t('game.test.fixed');
    else if (noted === 0 && !b.test[selected]) hint = t('game.test.empty');
  }
  $('padhint').textContent = hint;
}

function renderChrome() {
  const g = session.game;
  const hide = !!g && g.paused && !autoPaused;
  $('pause').hidden = !hide;
  // une grille terminée (g.finished) ne se modifie plus : ni annuler, ni notes, ni pause (audit G1)
  const frozen = !g || g.paused || g.finished;
  $('b-undo').disabled = frozen || !g.canUndo;
  $('b-redo').disabled = frozen || !g.canRedo;
  $('b-erase').disabled = frozen || selected < 0 || g.board.isFixed(selected) || (g.board.value[selected] === -1 && !g.board.hasEarmarks(selected));
  $('b-notes').setAttribute('aria-pressed', String(session.mode === 'notes'));
  $('b-test').setAttribute('aria-pressed', String(session.mode === 'test'));
  $('b-notes').disabled = frozen;
  $('b-test').disabled = frozen;
  renderPad(g);
  const gcode = $('g-code');
  gcode.hidden = !g?.code;
  if (g?.code && !gcode.classList.contains('copied')) {
    gcode.textContent = g.code;
    gcode.setAttribute('aria-label', `${t('code.copy')} : ${g.code}`);
  }
  // le chronomètre est toujours affiché (ce n'est pas une option) ; le bouton de droite est la pause
  if (g) {
    $('clock').textContent = formatTime(g.totalTimePlayed());
    $('g-level').textContent = t(`diff.${g.difficulty}`);
    const paused = g.paused && !autoPaused;
    $('b-pause').innerHTML = paused ? ICONS.play : ICONS.pause;
    $('b-pause').setAttribute('aria-label', paused ? t('game.resume') : t('game.pause'));
    $('b-pause').title = paused ? t('game.resume') : t('game.pause');
  }
  $('b-pause').disabled = !g || g.finished;
  document.documentElement.style.setProperty('--zoom', String(ZOOMS[session.preferences.zoom] ?? 1));
}

function render() { renderBoard(); renderChrome(); }

function announce(text) { $('live').textContent = ''; $('live').textContent = text; }

// --- gestes ---

function select(p) {
  selected = p;
  render();
  cells[p].focus({ preventScroll: true });
}

function input(d) {
  const g = session.game;
  if (!g || g.paused || selected < 0 || g.board.isFixed(selected)) return;
  if (session.mode === 'notes') session.toggleEarmark(selected, d);
  else if (session.mode === 'test') session.testValue(selected, d);
  else session.setValue(selected, d);
}

function erase() {
  const g = session.game;
  if (!g || g.paused || selected < 0) return;
  session.clearCell(selected);
}

function toggleMode(mode) {
  session.toggleMode(mode);
  const key = { notes: 'game.notes', test: 'game.test' }[mode];
  announce(t(`${key}.${session.mode === mode ? 'on' : 'off'}`));
  render();
}

function togglePause() {
  const g = session.game;
  if (!g) return;
  autoPaused = false;
  g.togglePause();
}

function move(dr, dc) {
  const from = selected < 0 ? 40 : selected;
  const r = Math.min(8, Math.max(0, Math.floor(from / 9) + dr));
  const c = Math.min(8, Math.max(0, (from % 9) + dc));
  select(r * 9 + c);
}

document.addEventListener('keydown', (ev) => {
  if (view !== 'game') return;
  if (document.querySelector('dialog[open]')) return;
  if (ev.altKey) return;
  const mod = ev.ctrlKey || ev.metaKey;
  const g = session.game;
  if (mod) {
    if (g?.paused || g?.finished) return;   // annuler / rétablir ne doivent pas agir sous l'écran de pause ni sur une grille terminée
    const k = ev.key.toLowerCase();
    if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); g?.undo(); }
    else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); g?.redo(); }
    return;
  }
  switch (ev.key) {
    case 'ArrowUp': ev.preventDefault(); move(-1, 0); break;
    case 'ArrowDown': ev.preventDefault(); move(1, 0); break;
    case 'ArrowLeft': ev.preventDefault(); move(0, -1); break;
    case 'ArrowRight': ev.preventDefault(); move(0, 1); break;
    case 'Backspace': case 'Delete': case '0': ev.preventDefault(); erase(); break;
    case 'n': case 'N': if (!g?.paused && !g?.finished) toggleMode('notes'); break;
    case 't': case 'T': if (!g?.paused && !g?.finished) toggleMode('test'); break;
    case 'p': case 'P': togglePause(); break;
    default:
      if (/^[1-9]$/.test(ev.key)) { ev.preventDefault(); input(Number(ev.key) - 1); }
  }
});

// --- partie ---

function attach() {
  for (const off of detach) off();
  detach = [];
  const g = session.game;
  if (!g) { render(); return; }
  detach.push(g.on('action-completed', () => { session.saveGame(); render(); }));
  detach.push(g.on('completed', onCompleted));
  detach.push(g.on('paused', () => render()));
  let ticks = 0;
  detach.push(g.on('tick', () => {
    renderChrome();
    if (++ticks % 10 === 0) session.saveGame();   // le temps joué est enregistré toutes les 10 secondes, même sans coup
  }));
  render();
}

function onCompleted() {
  const g = session.game;
  const record = session.completeGame();
  announce(t('done.title'));
  $('done-text').textContent = t('done.text', { difficulty: t(`diff.${g.difficulty}`), time: formatTime(g.totalTimePlayed()) });
  $('done-record').textContent = record ? t('done.record') : '';
  $('done-record').hidden = !record;
  render();   // les boutons et le pavé prennent tout de suite l'état « terminée »
  $('done').showModal();
}

async function startNew(difficulty, daily = false) {
  $('home').setAttribute('aria-busy', 'true');
  $('busy').hidden = false;
  showGame();                    // la grille est affichée (vide) sous le message « Génération… »
  await new Promise((r) => setTimeout(r, 30));
  try {
    session.setSelectedDifficulty(difficulty);
    selected = -1;
    autoPaused = false;
    if (daily) session.startDaily(difficulty); else session.newGame(difficulty);
  } catch (e) {
    showHome();
    throw e;
  } finally {
    $('busy').hidden = true;
    $('home').removeAttribute('aria-busy');
  }
}

// --- vues : accueil et partie ---

/** Arrête le chronomètre sans afficher l'écran de pause (on quitte la grille ou la page est cachée). */
function autoPause() {
  const g = session.game;
  if (g && !g.paused && !g.finished) { g.stopClock(); autoPaused = true; }
}

function autoResume() {
  const g = session.game;
  if (!autoPaused) return;
  autoPaused = false;
  if (g && !g.finished) {
    g.startClock();
    g.paused = false;
  }
}

function showHome() {
  closeAll();
  if (view === 'game') autoPause();
  session.saveGame();
  view = 'home';
  document.body.dataset.view = 'home';
  renderHome();
  $((session.game || session.savedInfo()) ? 'h-continue' : 'h-new').focus({ preventScroll: true });
}

function showGame() {
  view = 'game';
  document.body.dataset.view = 'game';
  autoResume();
  render();
}

/** Partie en cours (en mémoire) ou sauvegardée : { difficulty, elapsed } ou null. */
function continuable() {
  const g = session.game;
  if (g && !g.board.isComplete()) return { difficulty: g.difficulty, elapsed: g.totalTimePlayed() };
  return g ? null : session.savedInfo();
}

function renderHome() {
  const info = continuable();
  document.body.dataset.hasSave = info ? '1' : '0';
  const btn = $('h-continue');
  btn.hidden = !info;
  btn.textContent = t('home.continue');   // cinq boutons identiques, une seule ligne chacun, comme 1-5731N
}

function continueGame() {
  if (session.game) { showGame(); return; }
  if (session.resume()) { selected = -1; showGame(); return; }
  renderHome();                                   // la sauvegarde illisible a été mise de côté : plus de bouton « Continuer »
  window.alert(t('home.save.unreadable'));
}

// --- boîtes de dialogue ---

function open(id) { const d = $(id); if (!d.open) d.showModal(); }

function closeAll() { for (const d of document.querySelectorAll('dialog[open]')) d.close(); }

const chosenDifficulty = () => {
  const c = document.querySelector('#diffs input:checked');
  return c ? Number(c.value) : session.selectedDifficulty;
};

function updateDailyInfo() {
  const best = session.dailyBest(chosenDifficulty());
  $('new-daily-info').textContent = best === null ? t('new.daily.todo', { date: localDate() }) : t('new.daily.done', { time: formatTime(best) });
}

/** « Nouvelle partie » : la difficulté (avec son meilleur temps), la grille du jour, ou la saisie d'un code. */
function openNewGame() {
  const box = $('diffs');
  box.replaceChildren();
  for (const d of DIFFS) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'diff'; radio.value = String(d);
    radio.checked = d === session.selectedDifficulty;
    radio.addEventListener('change', updateDailyInfo);
    const name = document.createElement('span');
    name.textContent = t(`diff.${d}`);
    const best = document.createElement('small');
    best.textContent = session.highscores[d] === undefined ? t('new.none') : t('new.best', { time: formatTime(session.highscores[d]) });
    label.append(radio, name, best);
    box.append(label);
  }
  updateDailyInfo();
  open('newgame');
}

function openShare() {
  const g = session.game;
  if (!g) return;
  $('share-code').textContent = g.board.fixedToAscii();
  $('share-code5').textContent = g.code ?? '';
  $('share-wrap5').hidden = !g.code;
  $('share-copy').textContent = t('share.copy');
  $('share-copy5').textContent = t('share.copy');
  open('share');
}

/** Bouton qui copie un code et le confirme un instant (même geste sous la grille et dans les statistiques). */
async function copyWithFeedback(btn, text, restore) {
  if (!(await copyText(text))) return;
  announce(t('code.copied'));
  btn.classList.add('copied');
  btn.textContent = t('code.copied');
  setTimeout(() => { btn.classList.remove('copied'); btn.textContent = restore(); }, 1500);
}

function renderStats() {
  const body = $('stats-body');
  body.replaceChildren();
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const table = (heads, rows) => {
    const tb = el('table');
    if (heads) { const tr = el('tr'); for (const h of heads) tr.append(el('th', h)); tb.append(tr); }
    for (const cells of rows) {
      const tr = el('tr');
      for (const c of cells) { const td = el('td'); if (c instanceof Node) td.append(c); else td.textContent = c; tr.append(td); }
      tb.append(tr);
    }
    return tb;
  };
  const time = (s) => (s === null ? '–' : formatTime(s));
  const { games, started } = session.stats;
  $('stats-reset').hidden = games.length === 0 && started === 0;
  if (!games.length) { body.append(el('p', t('stats.none'))); return; }
  const all = summarize(games);
  body.append(table(null, [[t('stats.won'), String(all.won)], [t('stats.started'), String(started)], [t('stats.best'), time(all.best)], [t('stats.avg'), time(all.avg)]]));
  body.append(el('h3', t('stats.bydiff')));
  body.append(table([t('stats.col.diff'), t('stats.col.won'), t('stats.col.best'), t('stats.col.avg')],
    byDifficulty(games).map((r) => [t(`diff.${r.difficulty}`), String(r.won), time(r.best), time(r.avg)])));
  body.append(el('h3', t('stats.last')));
  body.append(table(null, recent(games).map((g) => {
    const cell = g.c ? (() => {
      const b = el('button', g.c, 'codecopy');
      b.type = 'button';
      b.setAttribute('aria-label', `${t('code.copy')} : ${g.c}`);
      b.addEventListener('click', () => copyWithFeedback(b, g.c, () => g.c));
      return b;
    })() : '';
    return [`${g.d} · ${t(`diff.${g.n}`)}`, cell, formatTime(g.t)];
  })));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* repli ci-dessous */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

const OPTIONS = [
  ['showAllPossibilities', 'options.possibilities'],
  ['autocleanEarmarks', 'options.autoclean'],
  ['duplicateWarnings', 'options.duplicates'],
  ['solutionWarnings', 'options.solution'],
  ['earmarkWarnings', 'options.earmarks'],
  ['highlightRowColumn', 'options.hl.rowcol'],
  ['highlightBlock', 'options.hl.block'],
  ['highlightNumbers', 'options.hl.numbers'],
];

function openOptions() {
  const body = $('options-body');
  body.replaceChildren();
  for (const [name, key] of OPTIONS) {
    const label = document.createElement('label');
    label.className = 'opt';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = session.preferences[name];
    box.addEventListener('change', () => session.setPreference(name, box.checked));
    const span = document.createElement('span');
    span.textContent = t(key);
    label.append(box, span);
    body.append(label);
  }
  const zoomNow = session.preferences.zoom === 'none' ? 'medium' : session.preferences.zoom;
  // la langue en premier : quelqu'un qui tombe sur une interface qu'il ne lit pas doit la trouver tout de suite
  body.prepend(selectRow('options.lang', [['auto', t('options.lang.auto')], ...LANGUAGES.map((l) => [l.code, l.name])], session.preferences.lang, (v) => session.setPreference('lang', v)));
  body.append(
    selectRow('options.zoom', ['small', 'medium', 'large'].map((z) => [z, t(`zoom.${z}`)]), zoomNow, (v) => session.setPreference('zoom', v)),
    selectRow('options.theme', Object.entries(THEMES).map(([k, f]) => [k, f.label]), session.preferences.themeFamily, (v) => session.setPreference('themeFamily', v)),
    selectRow('options.mode', MODES.map((m) => [m, t(`mode.${m}`)]), session.preferences.themeMode, (v) => session.setPreference('themeMode', v)),
  );
  open('options');
}

/** Ligne « libellé + liste déroulante » des options. */
function selectRow(labelKey, entries, current, onChange) {
  const row = document.createElement('label');
  row.className = 'opt';
  const span = document.createElement('span');
  span.textContent = t(labelKey);
  const sel = document.createElement('select');
  for (const [value, label] of entries) {
    const o = document.createElement('option');
    o.value = value; o.textContent = label; o.selected = value === current;
    sel.append(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  row.append(span, sel);
  return row;
}

// --- thème ---

const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function applyPreferredTheme() {
  applyTheme({ family: session.preferences.themeFamily, mode: session.preferences.themeMode }, Boolean(darkQuery?.matches));
}

function startFromField() {
  const err = $('enter-err');
  err.hidden = true;
  try {
    selected = -1;
    autoPaused = false;
    session.startFrom($('enter-field').value);
    $('enter').close();
    showGame();
  } catch (e) {
    if (!(e instanceof SudokuError)) throw e;
    err.textContent = t(e.message === ERRORS.MULTIPLE_SOLUTIONS ? 'enter.error.multiple' : 'enter.error.invalid');
    err.hidden = false;
  }
}

function wire() {
  $('b-menu').addEventListener('click', () => { $('m-resume').hidden = !session.game; open('menu'); });
  $('b-pause').addEventListener('click', togglePause);
  $('b-resume').addEventListener('click', togglePause);
  $('b-undo').addEventListener('click', () => session.game?.undo());
  $('b-redo').addEventListener('click', () => session.game?.redo());
  $('b-notes').addEventListener('click', () => toggleMode('notes'));
  $('b-test').addEventListener('click', () => toggleMode('test'));
  $('b-erase').addEventListener('click', erase);

  $('m-resume').addEventListener('click', () => $('menu').close());
  $('m-home').addEventListener('click', () => { $('menu').close(); showHome(); });
  $('m-restart').addEventListener('click', () => {
    $('menu').close();
    const g = session.game;
    if (!g) return;
    if (g.finished) {
      // grille terminée : « recommencer » ouvre une NOUVELLE partie de la même grille (temps à zéro), l'objet terminé ne bouge plus
      selected = -1;
      autoPaused = false;
      session.startFrom(g.code ?? g.board.fixedToAscii());
    } else if (window.confirm(t('confirm.restart'))) {
      g.reset();
    }
  });
  $('m-share').addEventListener('click', () => { $('menu').close(); openShare(); });
  $('m-enter').addEventListener('click', () => { $('menu').close(); $('enter-field').value = ''; $('enter-err').hidden = true; open('enter'); $('enter-field').focus(); });
  $('m-options').addEventListener('click', () => { $('menu').close(); openOptions(); });
  $('m-help').addEventListener('click', () => { $('menu').close(); open('help'); });
  $('m-about').addEventListener('click', () => { $('menu').close(); open('about'); });

  // page d'accueil
  const openEnter = () => { $('enter-field').value = ''; $('enter-err').hidden = true; open('enter'); $('enter-field').focus(); };
  const openStats = () => { renderStats(); open('stats'); };
  $('h-continue').addEventListener('click', continueGame);
  $('h-new').addEventListener('click', openNewGame);
  $('h-stats').addEventListener('click', openStats);
  $('h-options').addEventListener('click', openOptions);
  $('h-help').addEventListener('click', () => open('help'));
  $('help-about').addEventListener('click', () => { $('help').close(); open('about'); });
  $('new-cancel').addEventListener('click', () => $('newgame').close());
  $('new-start').addEventListener('click', async () => {
    const d = chosenDifficulty();
    $('newgame').close();
    await startNew(d);
  });
  $('new-daily').addEventListener('click', async () => {
    const d = chosenDifficulty();
    $('newgame').close();
    await startNew(d, true);
  });
  $('new-enter').addEventListener('click', () => { $('newgame').close(); openEnter(); });
  $('m-stats').addEventListener('click', () => { $('menu').close(); renderStats(); open('stats'); });
  $('stats-close').addEventListener('click', () => $('stats').close());
  $('stats-reset').addEventListener('click', () => {
    if (window.confirm(t('stats.reset.confirm'))) { session.resetStats(); renderStats(); }
  });
  $('g-code').addEventListener('click', () => {
    const code = session.game?.code;
    if (code) copyWithFeedback($('g-code'), code, () => code);
  });
  $('share-copy5').addEventListener('click', async () => {
    if (await copyText($('share-code5').textContent)) { $('share-copy5').textContent = t('share.copied'); announce(t('share.copied')); }
  });
  $('done-close').addEventListener('click', () => $('done').close());
  $('done-new').addEventListener('click', () => { $('done').close(); showHome(); openNewGame(); });
  $('share-close').addEventListener('click', () => $('share').close());
  $('share-copy').addEventListener('click', async () => {
    if (await copyText($('share-code').textContent)) { $('share-copy').textContent = t('share.copied'); announce(t('share.copied')); }
  });
  $('enter-close').addEventListener('click', () => $('enter').close());
  $('enter-start').addEventListener('click', startFromField);
  $('options-close').addEventListener('click', () => $('options').close());
  $('help-close').addEventListener('click', () => $('help').close());
  $('about-close').addEventListener('click', () => $('about').close());

  session.on('game-changed', attach);
  session.on('preference-changed', async (name) => {
    if (name === 'themeFamily' || name === 'themeMode') applyPreferredTheme();
    if (name === 'lang') {
      await applyLanguage();
      applyTexts();
      if (view === 'home') renderHome();
      if ($('options').open) openOptions();
      if ($('stats').open) renderStats();
    }
    render();
  });
  darkQuery?.addEventListener?.('change', () => { if (session.preferences.themeMode === 'auto') applyPreferredTheme(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      session.saveGame();
      if (view === 'game') autoPause();
    } else if (view === 'game') {
      autoResume();
      render();
    }
  });
  window.addEventListener('pagehide', () => session.saveGame());
}

// --- démarrage ---

/** Charge la langue choisie (ou celle du navigateur) et règle la langue et le sens d'écriture de la page. */
async function applyLanguage() {
  const pref = session.preferences.lang;
  const code = pref === 'auto' ? pickLanguage(navigator.languages ?? [navigator.language]) : pref;
  setDictionary(await loadLanguage(code));
  document.documentElement.lang = code;
  document.documentElement.dir = directionOf(code);
}

async function main() {
  await applyLanguage();
  applyPreferredTheme();
  applyTexts();
  buildBoard();
  wire();
  render();
  showHome();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try { await navigator.serviceWorker.register('sw.js'); } catch { /* hors ligne non disponible */ }
  }
}

main();
