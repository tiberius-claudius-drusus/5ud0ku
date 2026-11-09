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
import { moteurDe, memoriserJigsawN } from './src/sudoku_n.js';
import { DIFFICULTY, randomSeed } from './src/generator.js';
import { SudokuError, ERRORS, CHIFFRES } from './src/board.js';
import { t, setDictionary, formatTime } from './src/strings.js';
import { LANGUAGES, pickLanguage, loadLanguage, directionOf } from './src/lang/index.js';
import { ICONS } from './src/icons.js';
import { THEMES, MODES, apply as applyTheme } from './src/themes.js';
import { localDate, dailySeed, parseCode } from './src/code.js';
import { summarize, byDifficulty, recent, modeOf } from './src/stats.js';
import { REGIONS_CLASSIQUES } from './src/jigsaw.js';
import { MODE } from './src/code.js';
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
  set('h-new', 'home.new'); set('h-stats', 'home.stats'); set('h-options', 'home.options'); set('h-help', 'home.help'); set('h-quit', 'home.quit');
  set('new-title', 'new.title'); set('new-size-lbl', 'new.size'); set('new-type-lbl', 'new.type'); set('new-start', 'new.start'); set('new-cancel', 'dialog.close');
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
  set('help-title', 'help.title'); set('help-1', 'help.1'); set('help-2', 'help.2'); set('help-3', 'help.3'); set('help-4', 'help.4'); set('help-5', 'help.5'); set('help-close', 'dialog.close');
  set('about-title', 'about.title'); set('about-text', 'about.text'); set('about-code', 'about.code'); set('about-licence', 'about.licence'); set('about-close', 'dialog.close');
  $('about-version').textContent = t('about.version', { version: VERSION, date: RELEASE_DATE });
}

// --- construction de la grille ---

const cells = [];

let boardN = 0;   // taille actuellement construite (0 : rien) : 9 ou 16

/** Nom court d'un type de grille pour le niveau affiché et les statistiques (rien pour le classique 9×9). */
const nomDuMode = (mode) => ({
  [MODE.JIGSAW]: t('mode.jigsaw'),
  [MODE.HEX]: t('mode.hex'),
  [MODE.HEXJIGSAW]: `${t('mode.hex')} ${t('mode.jigsaw')}`,
  [MODE.PETIT]: t('mode.petit'),
}[mode] ?? '');
const modeDe = (board) => (board.isPetit ? MODE.PETIT : board.isHex ? (board.isJigsaw ? MODE.HEXJIGSAW : MODE.HEX) : board.isJigsaw ? MODE.JIGSAW : MODE.CLASSIQUE);

/** Symbole d'une valeur interne : 1 à 9 en 9×9 ; 0 à 9 puis A à F en 16×16. */
const symbole = (v, n = boardN) => (n === 16 ? CHIFFRES[v] : String(v + 1));

/** (Re)construit les cases et le pavé pour une taille : 81 cases et 9 touches, ou 256 cases et 16 touches. */
function buildBoard(n = 9) {
  if (boardN === n) return;
  boardN = n;
  const board = $('board');
  board.setAttribute('role', 'group');
  board.replaceChildren();
  cells.length = 0;
  board.style.setProperty('--n', String(n));
  board.dataset.n = String(n);
  for (let p = 0; p < n * n; p++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell';
    b.dataset.p = String(p);
    b.tabIndex = -1;
    b.addEventListener('click', () => select(p));
    board.append(b);
    cells.push(b);
  }
  const pad = $('pad');
  pad.replaceChildren();
  pad.dataset.n = String(n);
  for (let d = 0; d < n; d++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = symbole(d, n);
    b.setAttribute('aria-label', symbole(d, n));
    b.addEventListener('click', () => input(d));
    pad.append(b);
  }
}

// --- affichage ---

function cellLabel(p, g) {
  const n = g.board.n;
  const row = Math.floor(p / n) + 1, col = (p % n) + 1;
  const v = g.board.value[p];
  const parts = [t('game.cell', { row, col })];
  const w = session.warnings(p);   // une erreur ne doit pas passer par la seule couleur : elle est dite au lecteur d'écran
  if (v !== -1) {
    parts.push(t('game.cell.value', { value: symbole(v) }));
    if (g.board.isFixed(p)) parts.push(t('game.cell.given'));
    else if (g.board.test[p]) parts.push(t('game.cell.test'));
    if (w.valueError) parts.push(t('game.cell.error'));
  } else if (g.board.hasEarmarks(p)) {
    const notes = [];
    for (let k = 0; k < n; k++) if (g.board.isEarmarkEnabled(p, k)) notes.push(symbole(k));
    parts.push(t('game.cell.notes', { notes: notes.join(' ') }));
    if (w.earmarkErrors.length) parts.push(t('game.cell.notes.error', { notes: w.earmarkErrors.map((k) => symbole(k)).join(' ') }));
  } else {
    parts.push(t('game.cell.empty'));
  }
  return parts.join(', ');
}

function renderBoard() {
  const g = session.game;
  const hide = !g || (g.paused && !autoPaused);
  buildBoard(g ? g.board.n : boardN || 9);
  const n = boardN, N = n * n;
  const reg = g ? g.board.regions : REGIONS_CLASSIQUES;
  for (let p = 0; p < N; p++) {
    const el = cells[p];
    el.className = 'cell';
    if (p % n < n - 1 && reg[p] !== reg[p + 1]) el.classList.add('cb');   // trait épais à droite quand la région change
    if (p < N - n && reg[p] !== reg[p + n]) el.classList.add('rb');      // et en dessous
    if (!g || hide) { el.innerHTML = ''; el.tabIndex = -1; el.setAttribute('aria-label', ''); continue; }
    el.tabIndex = p === (selected >= 0 ? selected : 0) ? 0 : -1;
  }
  if (!g || hide) return;
  const hl = session.highlights(selected);
  for (let p = 0; p < N; p++) {
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
      el.innerHTML = `<span class="v">${symbole(v)}</span>`;
    } else if (g.board.hasEarmarks(p)) {
      let html = '<span class="m">';
      for (let k = 0; k < n; k++) {
        if (!g.board.isEarmarkEnabled(p, k)) { html += '<i></i>'; continue; }
        const cls = [w.earmarkErrors.includes(k) ? 'err' : '', hl.sameEarmark.get(p) === k ? 'on-same' : ''].filter(Boolean).join(' ');
        html += `<i${cls ? ` class="${cls}"` : ''}>${symbole(k)}</i>`;
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
  for (let d = 0; d < pad.children.length; d++) {
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
    const nom = nomDuMode(modeDe(g.board));
    $('g-level').textContent = nom ? `${nom} · ${t(`diff.${g.difficulty}`)}` : t(`diff.${g.difficulty}`);
    const paused = g.paused && !autoPaused;
    $('b-pause').innerHTML = paused ? ICONS.play : ICONS.pause;
    $('b-pause').setAttribute('aria-label', paused ? t('game.resume') : t('game.pause'));
    $('b-pause').title = paused ? t('game.resume') : t('game.pause');
  }
  $('b-pause').disabled = !g || g.finished;
  document.documentElement.style.setProperty('--zoom', String(ZOOMS[session.preferences.zoom] ?? 1));
}

function render() { renderBoard(); renderChrome(); renderFull(); keepAwake(); }

// --- plein écran ---

const canFull = () => !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';
const isFull = () => !!document.fullscreenElement;

async function toggleFullscreen() {
  try {
    if (isFull()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { /* refusé par le navigateur : rien à faire */ }
}

/** Touche du bandeau : absente si le navigateur n'a pas de plein écran (iPhone) ; pictogramme et libellé selon l'état. */
function renderFull() {
  const b = $('b-full');
  b.hidden = !canFull();
  const full = isFull();
  b.innerHTML = full ? ICONS.shrink : ICONS.expand;
  const label = t(full ? 'game.fullscreen.exit' : 'game.fullscreen');
  b.setAttribute('aria-label', label);
  b.title = label;
  b.setAttribute('aria-pressed', String(full));
}

/** Écran allumé pendant qu'une partie court (pas en pause, pas terminée, page visible) : l'économiseur d'écran ne doit pas couper la partie. */
let wakeLock = null;
let wakeLockPending = false;   // une demande est en cours : deux render() rapprochés ne doivent pas en lancer deux (le premier verrou ne serait jamais relâché)
async function keepAwake() {
  const g = session.game;
  const want = view === 'game' && document.visibilityState === 'visible' && !!g && !g.paused && !g.finished;
  try {
    if (want && !wakeLock && !wakeLockPending && navigator.wakeLock) {
      wakeLockPending = true;
      let lock;
      try { lock = await navigator.wakeLock.request('screen'); } finally { wakeLockPending = false; }
      const toujours = view === 'game' && document.visibilityState === 'visible' && !!session.game && !session.game.paused && !session.game.finished;
      if (!toujours) { await lock.release(); return; }   // la partie s'est arrêtée pendant la demande : on rend le verrou
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    } else if (!want && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      await lock.release();
    }
  } catch { /* refusé (économie d'énergie) ou non pris en charge : la partie continue normalement */ }
}

function announce(text) { $('live').textContent = ''; $('live').textContent = text; }

// --- gestes ---

function select(p) {
  selected = p;
  render();
  cells[p].focus({ preventScroll: true });
}

function input(d) {
  const g = session.game;
  if (!g || g.paused || selected < 0 || g.board.isFixed(selected) || d >= g.board.n) return;
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
  const n = boardN;
  const from = selected < 0 ? Math.floor(n * n / 2) : selected;
  const r = Math.min(n - 1, Math.max(0, Math.floor(from / n) + dr));
  const c = Math.min(n - 1, Math.max(0, (from % n) + dc));
  select(r * n + c);
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
    case 'Backspace': case 'Delete': ev.preventDefault(); erase(); break;
    case '0': if (boardN === 16) { ev.preventDefault(); input(0); } else { ev.preventDefault(); erase(); } break;   // 16×16 : 0 est un chiffre
    case 'n': case 'N': if (!g?.paused && !g?.finished) toggleMode('notes'); break;
    case 't': case 'T': if (!g?.paused && !g?.finished) toggleMode('test'); break;
    case 'p': case 'P': togglePause(); break;
    default:
      if (boardN === 16) {   // chiffres 0 à 9 puis A à F (le 0 est traité plus haut)
        const v = CHIFFRES.indexOf(ev.key.toUpperCase());
        if (ev.key.length === 1 && v > 0 && !'nNtTpP'.includes(ev.key)) { ev.preventDefault(); input(v); }
      } else if (/^[1-9]$/.test(ev.key)) { ev.preventDefault(); input(Number(ev.key) - 1); }
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

/**
 * Grille 16×16 générée par un Web Worker (le niveau 4 prend ~1 s sur un ordinateur, davantage sur un téléphone) puis déposée dans le cache du moteur : la création
 * de la partie qui suit, dans le fil principal, ne refait pas le calcul. Sans Worker (ou en cas d'échec), on retombe sur le calcul direct dans le fil principal.
 */
function genererHexAilleurs(graine, niveau, jigsaw = false) {
  return new Promise((resolve) => {
    let w;
    try { w = new Worker('./src/hex_worker.js', { type: 'module' }); } catch { resolve(); return; }
    const fini = () => { w.terminate(); resolve(); };
    w.onmessage = (e) => {
      if (e.data?.ok) { if (jigsaw) memoriserJigsawN(4, graine, niveau, e.data.grille); else moteurDe(4).memoriser(graine, niveau, e.data.grille); }
      fini();
    };
    w.onerror = fini;
    w.postMessage({ graine, niveau, jigsaw });
  });
}

async function startNew(difficulty, daily = false) {
  $('home').setAttribute('aria-busy', 'true');
  $('busy').hidden = false;
  showGame();                    // la grille est affichée (vide) sous le message « Génération… »
  await new Promise((r) => setTimeout(r, 30));
  try {
    if (session.selectedMode !== MODE.PETIT) session.setSelectedDifficulty(difficulty);   // le 4×4 n'a qu'une difficulté : on garde le choix des autres types
    selected = -1;
    autoPaused = false;
    const mode = session.selectedMode;
    let graine;
    if (mode === MODE.HEX || mode === MODE.HEXJIGSAW) {
      graine = daily ? dailySeed(localDate(), difficulty, mode) : randomSeed();
      await genererHexAilleurs(graine, difficulty, mode === MODE.HEXJIGSAW);
    }
    if (daily) session.startDaily(difficulty, undefined, mode); else session.newGame(difficulty, graine, mode);
  } catch (e) {
    showHome();
    window.alert(t('game.generation.failed'));   // échec de génération (très improbable) : un message plutôt qu'un retour muet à l'accueil
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
  keepAwake();
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
  if (chosenMode() === MODE.PETIT) return DIFFICULTY.EASY;   // une seule difficulté
  const c = document.querySelector('#diffs input:checked');
  return c ? Number(c.value) : session.selectedDifficulty;
};

/** Type de grille choisi : la combinaison des deux lignes « Taille » (9×9, 16×16) et « Type » (classique, puzzle). */
const chosenMode = () => {
  const taille = document.querySelector('#sizes input:checked')?.value;
  const type = document.querySelector('#types input:checked')?.value;
  if (!taille || !type) return session.selectedMode;
  if (taille === '4') return MODE.PETIT;   // le 4×4 n'existe qu'en classique
  if (taille === '16') return type === 'puzzle' ? MODE.HEXJIGSAW : MODE.HEX;
  return type === 'puzzle' ? MODE.JIGSAW : MODE.CLASSIQUE;
};

function updateDailyInfo() {
  const best = session.dailyBest(chosenDifficulty(), undefined, chosenMode());
  $('new-daily-info').textContent = best === null ? t('new.daily.todo', { date: localDate() }) : t('new.daily.done', { time: formatTime(best) });
}

/** « Nouvelle partie » : la difficulté (avec son meilleur temps), la grille du jour, ou la saisie d'un code. */
function renderDiffs() {
  const box = $('diffs');
  box.replaceChildren();
  const petit = chosenMode() === MODE.PETIT;
  box.hidden = petit;   // 4×4 : une seule difficulté, rien à choisir
  if (petit) { $('new-best-petit').textContent = session.highscoresPetit[1] === undefined ? t('new.none') : t('new.best', { time: formatTime(session.highscoresPetit[1]) }); }
  $('new-best-petit').hidden = !petit;
  const scores = session.highscoresOf(chosenMode());
  for (const d of DIFFS) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'diff'; radio.value = String(d);
    radio.checked = d === session.selectedDifficulty;
    radio.addEventListener('change', updateDailyInfo);
    const name = document.createElement('span');
    name.textContent = t(`diff.${d}`);
    const best = document.createElement('small');
    best.textContent = scores[d] === undefined ? t('new.none') : t('new.best', { time: formatTime(scores[d]) });
    label.append(radio, name, best);
    box.append(label);
  }
  updateDailyInfo();
}

/** Phrase d'explication sous les deux choix, propre à la combinaison (rien pour le classique 9×9). */
function majIndiceMode() {
  const m = chosenMode();
  const phrases = [];
  if (m === MODE.PETIT) phrases.push(t('mode.petit.hint'));
  else if (m === MODE.HEXJIGSAW) phrases.push(t('mode.hexjigsaw.hint'));
  else if (m === MODE.HEX) phrases.push(t('mode.hex.hint'));
  else if (m === MODE.JIGSAW) phrases.push(t('mode.jigsaw.hint'));
  $('new-mode-hint').textContent = phrases.join(' ');
  $('new-mode-hint').hidden = phrases.length === 0;
}

/** Une ligne de deux choix (boutons radio côte à côte) : « Taille » ou « Type ». */
function ligneDeChoix(boite, nom, choix, actuel) {
  boite.replaceChildren();
  for (const [valeur, libelle] of choix) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = nom; radio.value = valeur;
    radio.checked = valeur === actuel;
    radio.addEventListener('change', () => {
      // 4×4 : classique seulement (le choix « puzzle » est grisé et ramené à « classique »)
      const petit = document.querySelector('#sizes input:checked')?.value === '4';
      const puzzle = document.querySelector('#types input[value="puzzle"]');
      if (puzzle) { puzzle.disabled = petit; puzzle.closest('label').classList.toggle('off', petit); if (petit) document.querySelector('#types input[value="classique"]').checked = true; }
      majIndiceMode();
      renderDiffs();   // les meilleurs temps affichés suivent le type de grille
    });
    const span = document.createElement('span');
    span.textContent = libelle;
    label.append(radio, span);
    boite.append(label);
  }
}

function openNewGame() {
  const m = session.selectedMode;
  ligneDeChoix($('sizes'), 'size', [['4', '4×4'], ['9', '9×9'], ['16', '16×16']], m === MODE.PETIT ? '4' : m === MODE.HEX || m === MODE.HEXJIGSAW ? '16' : '9');
  ligneDeChoix($('types'), 'type', [['classique', t('mode.classic')], ['puzzle', t('mode.jigsaw')]], m === MODE.JIGSAW || m === MODE.HEXJIGSAW ? 'puzzle' : 'classique');
  const puzzle = document.querySelector('#types input[value="puzzle"]');
  if (puzzle) { puzzle.disabled = m === MODE.PETIT; puzzle.closest('label').classList.toggle('off', m === MODE.PETIT); }
  majIndiceMode();
  renderDiffs();
  open('newgame');
}

function openShare() {
  const g = session.game;
  if (!g) return;
  $('share-code').textContent = g.board.supportsHash ? g.board.fixedToAscii() : '';
  $('share-code5').textContent = g.code ?? '';
  $('share-wrap5').hidden = !g.code;
  $('share-wrap-hash').hidden = !g.board.supportsHash;   // le partage « # » de l'amont ne sait décrire que les carrés 3×3
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
  for (const mode of [MODE.JIGSAW, MODE.HEX, MODE.HEXJIGSAW, MODE.PETIT]) {
    const lignes = byDifficulty(games, mode);
    if (!lignes.length) continue;
    body.append(el('h3', `${nomDuMode(mode)} — ${t('stats.bydiff')}`));
    body.append(table([t('stats.col.diff'), t('stats.col.won'), t('stats.col.best'), t('stats.col.avg')],
      lignes.map((r) => [t(`diff.${r.difficulty}`), String(r.won), time(r.best), time(r.avg)])));
  }
  body.append(el('h3', t('stats.last')));
  body.append(table(null, recent(games).map((g) => {
    const cell = g.c ? (() => {
      const b = el('button', g.c, 'codecopy');
      b.type = 'button';
      b.setAttribute('aria-label', `${t('code.copy')} : ${g.c}`);
      b.addEventListener('click', () => copyWithFeedback(b, g.c, () => g.c));
      return b;
    })() : '';
    const nom = nomDuMode(modeOf(g));
    return [`${g.d} · ${nom ? `${nom} · ` : ''}${t(`diff.${g.n}`)}`, cell, formatTime(g.t)];
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
  ['startFullscreen', 'options.fullscreen'],
];

function openOptions() {
  const body = $('options-body');
  body.replaceChildren();
  for (const [name, key] of OPTIONS) {
    if (name === 'startFullscreen' && !canFull()) continue;   // pas de plein écran sur ce navigateur : l'option n'aurait aucun effet
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

async function startFromField() {
  const err = $('enter-err');
  err.hidden = true;
  try {
    selected = -1;
    autoPaused = false;
    const c = parseCode($('enter-field').value);
    if (c?.mode === MODE.HEX || c?.mode === MODE.HEXJIGSAW) {
      // génération par le Worker : « Génération… » sur le bouton, boutons inactifs (un second appui lançait un second calcul)
      const libelle = $('enter-start').textContent;
      $('enter-start').disabled = true; $('enter-close').disabled = true;
      $('enter-start').textContent = t('game.generating');
      try { await genererHexAilleurs(c.seed, c.difficulty, c.mode === MODE.HEXJIGSAW); } finally {
        $('enter-start').disabled = false; $('enter-close').disabled = false; $('enter-start').textContent = libelle;
      }
    }
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
      session.restartFinished();   // la grille est déjà là : rien à générer (plus de blocage de plusieurs secondes en 16×16)
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
  $('b-full').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', renderFull);
  // Démarrage en plein écran : le navigateur l'exige après un geste de l'utilisateur ; on le prend au premier appui ou à la première touche,
  // une seule fois par chargement (si on quitte le plein écran ensuite, on ne le redemande pas).
  const premierGeste = (ev) => {
    if (ev.type === 'keydown' && ev.key === 'Escape') return;
    document.removeEventListener('click', premierGeste, true);
    document.removeEventListener('keydown', premierGeste, true);
    if (ev.target?.closest?.('#b-full')) return;   // le bouton fait déjà son travail
    if (session.preferences.startFullscreen && canFull() && !isFull()) toggleFullscreen();
  };
  document.addEventListener('click', premierGeste, true);
  document.addEventListener('keydown', premierGeste, true);
  $('h-continue').addEventListener('click', continueGame);
  $('h-new').addEventListener('click', openNewGame);
  $('h-stats').addEventListener('click', openStats);
  $('h-options').addEventListener('click', openOptions);
  $('h-help').addEventListener('click', () => open('help'));
  $('h-quit').addEventListener('click', quitter);
  $('help-about').addEventListener('click', () => { $('help').close(); open('about'); });
  $('new-cancel').addEventListener('click', () => $('newgame').close());
  $('new-start').addEventListener('click', async () => {
    const d = chosenDifficulty();
    session.setSelectedMode(chosenMode());
    $('newgame').close();
    await startNew(d);
  });
  $('new-daily').addEventListener('click', async () => {
    const d = chosenDifficulty();
    session.setSelectedMode(chosenMode());
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

/**
 * Quitter l'application, c'est-à-dire revenir à l'écran d'accueil du téléphone. Une page web ne peut pas le demander : on tente de fermer
 * la fenêtre (cela marche pour une application installée sur certains téléphones) et, si elle reste ouverte, on dit quoi faire.
 */
function quitter() {
  session.saveGame();
  window.close();
  setTimeout(() => { if (!document.hidden) window.alert(t('home.quit.manuel')); }, 500);
}
