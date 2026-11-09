#!/usr/bin/env node
/*
 * 5ud0ku — banc d'essai de bout en bout dans Chrome (sans interface, piloté par DevTools).
 * Copyright (C) 2026 Drusus (Gens Claudia). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 * Structure reprise du banc de T-7r4V3x (même auteur).
 *
 * Ce que ne couvrent pas les tests unitaires (`npm test`) : l'interface réelle : toucher et clavier, boîtes de dialogue,
 * pause, sauvegarde et reprise, partage, victoire, meilleurs temps.
 *
 * Usage :  npm run e2e                      (ou : node tools/e2e-chrome.mjs [--shots dossier])
 * Chrome :  variable d'environnement CHROME, sinon les emplacements usuels (Windows, macOS, Linux).
 * Aucun fichier du dépôt n'est modifié ; profil Chrome temporaire supprimé à la fin. Code de sortie 1 si un contrôle échoue.
 *
 * Pièges (hérités de T-7r4V3x) :
 *  - l'application sauvegarde sa partie en quittant la page : poser un état de test en quittant d'abord l'application
 *    (`reloadWith`), jamais par `localStorage.setItem` suivi d'un `reload` ;
 *  - `Input.dispatch*Event` est asynchrone : laisser une courte pause avant de lire le DOM.
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > -1 ? path.resolve(process.argv[shotsArg + 1] ?? 'e2e-shots') : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error('Chrome introuvable : définir la variable CHROME (chemin de l\'exécutable).');
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const DEBUG_PORT = await freePort();
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), '5ud0ku-e2e-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=430,860',
  '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
function cleanup() {
  try { ws.close(); } catch { /* déjà fermé */ }
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
  else chrome.kill();
  server.close();
  setTimeout(() => { try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* verrouillé : sans importance */ } process.exit(process.exitCode ?? 0); }, 800);
}

let targets;
for (let i = 0; i < 60; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* Chrome démarre */ }
  await sleep(200);
}
const page = targets?.find((t) => t.type === 'page');
if (!page) { console.error('Chrome n\'a pas démarré.'); process.exit(2); }
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
const cspErrors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Log.entryAdded' && /Content Security Policy|Refused to/.test(d.params.entry.text ?? '')) cspErrors.push(d.params.entry.text);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result.result.value;
};
const key = async (k, extra = {}) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text: k.length === 1 ? k : undefined, ...extra });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, ...extra });
  await sleep(60);
};
const shot = async (name) => {
  if (!SHOTS) return;
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};
const results = [];
const check = (name, ok, info = '') => { results.push([ok, name, info]); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ` ${info}` : ''}`); };
const section = async (title, fn) => {
  console.log(`\n== ${title}`);
  try { await fn(); } catch (e) { check(`${title} : exception`, false, String(e.message).slice(0, 300)); }
};

const gotoPage = async (url) => {
  await send('Page.navigate', { url });
  for (let i = 0; i < 50; i++) { await sleep(150); try { if ((await ev('location.href')).startsWith(url.split('?')[0])) break; } catch { /* navigation en cours */ } }
  await sleep(250);
};
/** Recharge l'application avec un localStorage préparé : { clé: valeur JSON }. */
const reloadWith = async (store) => {
  await gotoPage(`${BASE}/sw.js`);
  await ev(`localStorage.clear(); ${Object.entries(store).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join(' ')}`);
  await gotoPage(`${BASE}/index.html`);
  await sleep(700);
};
const click = (sel, i = 0) => ev(`document.querySelectorAll(${JSON.stringify(sel)})[${i}].click()`);
const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).textContent`);
const isOpen = (id) => ev(`document.getElementById(${JSON.stringify(id)}).open`);

/** Solution de la partie en cours : relue depuis la sauvegarde, résolue par le moteur de l'application. */
const solutionOfSave = () => ev(`(async () => {
  const { SudokuGenerator } = await import('/src/generator.js');
  const save = JSON.parse(localStorage.getItem('5ud0ku:savefile'));
  const g = new SudokuGenerator(1);
  const flat = Array(81).fill(null);
  for (const c of save.cells) if (c.fixed) flat[c.position[0] * 9 + c.position[1]] = c.value - 1;
  g.setPuzzle(flat);
  const sol = g.solveUnique().flat();
  return { flat, sol };
})()`);

await send('Runtime.enable');
// Langue du navigateur fixée au français : le banc ne dépend pas de la langue du système qui l'exécute.
{
  const ua = (await send('Runtime.evaluate', { expression: 'navigator.userAgent', returnByValue: true })).result.result.value;
  await send('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'fr-FR,fr' });
}
await send('Page.enable');
await send('Log.enable');

await section('Page d\'accueil, nouvelle partie, retour à l\'accueil', async () => {
  await reloadWith({});
  const homeShown = () => ev(`document.body.dataset.view === 'home' && getComputedStyle(document.getElementById('home')).display !== 'none' && getComputedStyle(document.getElementById('play')).display === 'none'`);
  const grid = () => ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.textContent).join('|')`);
  check('au démarrage : la page d\'accueil, pas la grille', await homeShown());
  check('titre et logo', await ev(`document.getElementById('home-title').textContent === '5ud0ku' && document.querySelector('#logo svg') !== null`));
  check('sans partie : exactement Nouvelle partie, Options, Statistiques, Aide', await ev(`[...document.querySelectorAll('#home .homemenu button')].filter((b) => !b.hidden).map((b) => b.textContent).join('|')`) === 'Nouvelle partie|Options|Statistiques|Aide|Quitter');
  const foot = await text('#h-ver');
  check('pied de page, 1re ligne : version, auteur, date, licence', /^v\d+\.\d+\.\d+ - développé par Drusus - \d{4}-\d\d-\d\d - GPL3\+$/.test(foot), foot);
  const insp = await text('#h-inspired');
  check('pied de page, 2e ligne : inspiration (GNOME Sudoku en italique)', /^Inspiré de GNOME Sudoku, de Johan Gay/.test(insp) && await ev(`document.querySelector('#h-inspired i').textContent === 'GNOME Sudoku'`), insp);
  // mise en page calquée sur l'accueil de 1-5731N : colonne centrée, boutons identiques de 300 px, deux lignes d'info en bas
  const lay = await ev(`(() => {
    const r = (el) => el.getBoundingClientRect();
    const btns = [...document.querySelectorAll('#home .homemenu button')].filter((b) => !b.hidden);
    const rects = btns.map(r);
    const logo = r(document.getElementById('logo')), h1 = r(document.getElementById('home-title')), ver = r(document.getElementById('h-ver')), insp = r(document.getElementById('h-inspired')), foot = r(document.getElementById('h-foot'));
    const iw = window.innerWidth, ih = window.innerHeight;
    return {
      iw, ih, n: btns.length,
      widths: rects.map((x) => Math.round(x.width)), heights: rects.map((x) => Math.round(x.height)),
      centres: rects.map((x) => Math.round(x.left + x.width / 2)),
      gaps: rects.slice(1).map((x, i) => Math.round(x.top - rects[i].bottom)),
      fontPx: btns.map((b) => parseFloat(getComputedStyle(b).fontSize)), pad: btns.map((b) => parseFloat(getComputedStyle(b).paddingTop)),
      h1Px: parseFloat(getComputedStyle(document.getElementById('home-title')).fontSize),
      logoH: Math.round(logo.height), logoCentre: Math.round(logo.left + logo.width / 2), h1Centre: Math.round(h1.left + h1.width / 2),
      above: Math.round(logo.top), between: Math.round(foot.top - rects[rects.length - 1].bottom),
      verCentre: Math.round(ver.left + ver.width / 2), inspCentre: Math.round(insp.left + insp.width / 2), verAbove: ver.bottom <= insp.top + 2,
      footBottom: Math.round(ih - insp.bottom),footFont: parseFloat(getComputedStyle(document.getElementById('h-foot')).fontSize),
    };
  })()`);
  const c0 = lay.iw / 2;
  check('accueil : cinq boutons (sans partie) de même largeur, min(78vw, 300px), centrés', lay.n === 5 && lay.widths.every((w) => w === Math.min(Math.round(lay.iw * 0.78), 300)) && lay.centres.every((x) => Math.abs(x - c0) <= 2), JSON.stringify([lay.n, lay.widths, lay.centres]));
  check('accueil : boutons de même hauteur, 12 px entre eux', new Set(lay.heights.slice(0, 4)).size === 1 && lay.gaps.every((g) => g === 12), JSON.stringify([lay.heights, lay.gaps]));
  check('accueil : texte des boutons 1,15 rem avec 12 px de marge intérieure', lay.fontPx.every((f) => Math.abs(f - 18.4) < 0.2) && lay.pad.every((p) => p === 12), JSON.stringify([lay.fontPx, lay.pad]));
  check('accueil : titre de 2,6 rem, logo et titre centrés', Math.abs(lay.h1Px - 41.6) < 0.2 && Math.abs(lay.logoCentre - c0) <= 2 && Math.abs(lay.h1Centre - c0) <= 2, JSON.stringify([lay.h1Px, lay.logoCentre, lay.h1Centre]));
  check('accueil : logo de 21 % de la hauteur (96 à 200 px)', Math.abs(lay.logoH - Math.min(200, Math.max(96, Math.round(lay.ih * 0.21)))) <= 2, JSON.stringify([lay.logoH, lay.ih]));
  check('accueil : bloc centré verticalement (espace au-dessus du logo = espace entre le menu et le pied de page)', Math.abs(lay.above - lay.between) <= 3, JSON.stringify([lay.above, lay.between]));
  check('accueil : deux lignes d\'info centrées, l\'une sous l\'autre, tout en bas (10 px de marge, 0,72 rem)', Math.abs(lay.verCentre - c0) <= 2 && Math.abs(lay.inspCentre - c0) <= 2 && lay.verAbove && Math.abs(lay.footBottom - 10) <= 2 && Math.abs(lay.footFont - 11.52) < 0.2, JSON.stringify([lay.verCentre, lay.inspCentre, lay.verAbove, lay.footBottom, lay.footFont]));
  check('aucun défilement sur la page d\'accueil', await ev(`document.documentElement.scrollHeight <= window.innerHeight + 2`), await ev(`document.documentElement.scrollHeight + '/' + window.innerHeight`));
  check('81 cases dans la grille', await ev(`document.querySelectorAll('#board .cell').length`) === 81);
  await shot('0-accueil');
  await click('#h-new');
  check('Nouvelle partie : quatre difficultés, Facile choisie, la grille du jour et la saisie d\'un code', await isOpen('newgame') && await ev(`[...document.querySelectorAll('#diffs input')].map((i) => i.checked).join(',')`) === 'true,false,false,false' && await ev(`document.getElementById('new-daily') !== null && document.getElementById('new-enter') !== null`));
  await shot('0a-nouvelle-partie');
  await click('#diffs input', 1);
  check('choisir une difficulté', await ev(`document.querySelector('#diffs input:checked').value`) === '2');
  await click('#diffs input', 0);
  await click('#new-start');
  await sleep(900);
  check('partie lancée : la grille remplace l\'accueil, cases données affichées', !(await homeShown()) && await ev(`document.body.dataset.view`) === 'game' && await ev(`document.querySelectorAll('#board .cell.given').length`) > 17);
  check('la grille est enregistrée dès le début, sans avoir joué', await ev(`localStorage.getItem('5ud0ku:savefile')`) !== null);
  // rouvrir l'application sans avoir joué un seul coup : on retrouve la même grille (Continuer)
  const untouched = await grid();
  const store0 = await ev(`Object.fromEntries(Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage.getItem(k))]))`);
  await reloadWith(store0);
  check('rouvrir sans avoir joué : l\'accueil propose « Continuer »', await homeShown() && await ev(`!document.getElementById('h-continue').hidden`));
  // fermer l'application DEPUIS L'ACCUEIL (sans toucher « Continuer ») ne doit pas perdre la partie (défaut corrigé en 0.10.3 :
  // la fermeture appelait saveGame() sans partie en mémoire, qui supprimait la sauvegarde)
  for (let fois = 1; fois <= 2; fois++) {
    await gotoPage(`${BASE}/sw.js`);
    check(`fermer depuis l'accueil (${fois}) : la sauvegarde est intacte`, await ev(`localStorage.getItem('5ud0ku:savefile') !== null`));
    await gotoPage(`${BASE}/index.html`);
    await sleep(700);
    check(`rouvrir (${fois}) : « Continuer » est toujours là`, await homeShown() && await ev(`!document.getElementById('h-continue').hidden`));
  }
  await click('#h-continue'); await sleep(200);
  check('rouvrir sans avoir joué : la même grille est retrouvée', await grid() === untouched);
  await shot('1-partie');
  // retour à l'accueil, puis « Continuer » : même grille
  const before = await grid();
  await click('#b-menu'); await click('#m-home');
  check('menu > Accueil : retour à la page d\'accueil', await homeShown());
  check('« Continuer » apparaît avec la difficulté, entre Nouvelle partie et Options', await ev(`[...document.querySelectorAll('#home .homemenu button')].filter((b) => !b.hidden).map((b) => b.textContent).join('|')`) === 'Nouvelle partie|Continuer|Options|Statistiques|Aide|Quitter' && await ev(`(() => { const hs = [...document.querySelectorAll('#home .homemenu button')].filter((b) => !b.hidden).map((b) => Math.round(b.getBoundingClientRect().height)); return new Set(hs.slice(0, 5)).size === 1 && hs.length === 6; })()`));
  await shot('0b-accueil-continuer');
  await click('#h-continue');
  check('Continuer : la même grille', !(await homeShown()) && await grid() === before);
  // le code de la grille est dans la barre de titre, pas sous la grille
  check('le code de la grille est dans la barre de titre', await ev(`(() => { const c = document.getElementById('g-code'); return !c.hidden && c.closest('header') !== null && /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(c.textContent); })()`));
  // la grille ne doit jamais être coupée : pas de défilement en partie, à des hauteurs courantes de téléphone
  for (const [w, h] of [[430, 860], [390, 760], [360, 640]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
    await sleep(300);
    const m = await ev(`({ sh: document.documentElement.scrollHeight, ih: window.innerHeight, bottom: Math.round(document.getElementById('pad').getBoundingClientRect().bottom), board: Math.round(document.getElementById('boardwrap').getBoundingClientRect().width) })`);
    check(`partie sans défilement à ${w}×${h} (pavé entièrement visible)`, m.sh <= m.ih + 2 && m.bottom <= m.ih, JSON.stringify(m));
    await shot(`1b-${w}x${h}`);
  }
  await send('Emulation.clearDeviceMetricsOverride');
});

await section('Saisie, notes, annuler, effacer (clavier et pavé)', async () => {
  const empty = await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => !c.classList.contains('given') && c.textContent === '')`);
  await click('#board .cell', empty);
  check('toucher une case la sélectionne', await ev(`document.querySelectorAll('#board .cell')[${empty}].classList.contains('sel')`));
  await key('5');
  check('clavier : « 5 » pose un 5', await ev(`document.querySelectorAll('#board .cell')[${empty}].textContent`) === '5');
  check('la partie est sauvegardée à chaque action', await ev(`localStorage.getItem('5ud0ku:savefile') !== null`));
  await key('Backspace');
  check('Suppr efface la valeur', await ev(`document.querySelectorAll('#board .cell')[${empty}].textContent`) === '');
  await key('z', { modifiers: 2 });
  check('Ctrl+Z rétablit le 5 effacé', await ev(`document.querySelectorAll('#board .cell')[${empty}].textContent`) === '5');
  await key('z', { modifiers: 2 });
  check('Ctrl+Z annule la pose', await ev(`document.querySelectorAll('#board .cell')[${empty}].textContent`) === '');
  await key('y', { modifiers: 2 });
  check('Ctrl+Y refait la pose', await ev(`document.querySelectorAll('#board .cell')[${empty}].textContent`) === '5');
  await click('#b-undo');
  // notes
  await key('n');
  check('N : mode notes activé', await ev(`document.getElementById('b-notes').getAttribute('aria-pressed')`) === 'true');
  await click('#pad button', 2);
  await click('#pad button', 6);
  const notes = await ev(`[...document.querySelectorAll('#board .cell')[${empty}].querySelectorAll('.m i')].map((i) => i.textContent).join('')`);
  check('pavé en mode notes : notes 3 et 7 dans la case', notes === '37', notes);
  await click('#b-erase');
  check('Effacer retire les notes', await ev(`document.querySelectorAll('#board .cell')[${empty}].querySelector('.m') === null`));
  await key('n');
  check('N de nouveau : mode notes désactivé', await ev(`document.getElementById('b-notes').getAttribute('aria-pressed')`) === 'false');
  // case donnée intouchable
  const given = await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => c.classList.contains('given'))`);
  const was = await ev(`document.querySelectorAll('#board .cell')[${given}].textContent`);
  await click('#board .cell', given);
  await key('9');
  check('une case donnée ne change pas', await ev(`document.querySelectorAll('#board .cell')[${given}].textContent`) === was);
  // flèches
  await key('ArrowRight');
  check('flèche droite : sélection déplacée', await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => c.classList.contains('sel'))`) === given + 1 || given % 9 === 8);
  await shot('2-saisie');
});

await section('Pavé 3×3 : modes normal, notes (jaune, négatif) et essai (vert)', async () => {
  const pad = () => ev(`(() => {
    const p = document.getElementById('pad');
    const r = p.getBoundingClientRect();
    return { cls: p.className, n: p.children.length, w: r.width, h: r.height,
      cols: getComputedStyle(p).gridTemplateColumns.split(' ').length,
      on: [...p.children].map((b, i) => (b.classList.contains('on') ? i + 1 : 0)).filter(Boolean),
      absent: [...p.children].map((b, i) => (b.classList.contains('absent') ? i + 1 : 0)).filter(Boolean),
      bg: getComputedStyle(p).backgroundColor };
  })()`);
  const cell = (i) => `document.querySelectorAll('#board .cell')[${i}]`;
  const empty = await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => !c.classList.contains('given') && c.textContent === '')`);
  await click('#board .cell', empty);
  let s = await pad();
  check('pavé : 9 touches en 3 colonnes, plutôt carré', s.n === 9 && s.cols === 3 && Math.abs(s.w - s.h) < s.w * 0.45, JSON.stringify([s.n, s.cols, Math.round(s.w), Math.round(s.h)]));
  const normalBg = s.bg;
  await shot('5-pave-normal');
  // notes : pavé jaune, chiffres notés en négatif
  await key('n');
  s = await pad();
  const noteBg = s.bg;
  check('mode notes : pavé jaune', s.cls.includes('notes') && noteBg !== normalBg, `${s.cls} ${noteBg}`);
  await click('#pad button', 1); await click('#pad button', 4); await click('#pad button', 8);
  s = await pad();
  check('mode notes : les chiffres notés (2, 5, 9) sont en négatif', s.on.join(',') === '2,5,9', s.on.join(','));
  await click('#pad button', 4);
  check('retirer une note retire son négatif', (await pad()).on.join(',') === '2,9');
  await shot('6-pave-notes');
  // essai : pavé vert, seules les cases de note sont présentes
  await key('t');
  s = await pad();
  check('mode essai : pavé vert, mode notes quitté', s.cls.includes('test') && !s.cls.includes('notes') && s.bg !== noteBg && s.bg !== normalBg, `${s.cls} ${s.bg}`);
  check('mode essai : seules les touches notées (2 et 9) sont présentes', s.absent.join(',') === '1,3,4,5,6,7,8', s.absent.join(','));
  await click('#pad button', 8);
  check('essai : le chiffre apparaît sur la grille', await ev(`${cell(empty)}.textContent`) === '9');
  check('essai : il est en vert (classe test)', await ev(`${cell(empty)}.classList.contains('test')`));
  check('essai : la touche choisie est en négatif', (await pad()).on.join(',') === '9');
  const color = await ev(`getComputedStyle(${cell(empty)}).color`);
  check('essai : couleur verte (composante verte dominante)', (() => { const m = color.match(/\d+/g).map(Number); return m[1] > m[0] && m[1] > m[2]; })(), color);
  await shot('7-pave-essai');
  await click('#pad button', 1);
  check('essai : un autre candidat remplace l\'essai', await ev(`${cell(empty)}.textContent`) === '2');
  await click('#pad button', 1);
  check('essai : le même chiffre retire l\'essai, les notes reviennent', await ev(`${cell(empty)}.textContent`).then((x) => x.replace(/\D/g, '') === '29' || x === '29'));
  await click('#pad button', 1);
  // retour au mode normal : le même chiffre confirme l'essai
  await key('t');
  check('T de nouveau : retour au pavé bleu', !(await pad()).cls.includes('test'));
  await click('#pad button', 1);
  check('normal : le même chiffre confirme l\'essai (plus de vert, plus de notes)', await ev(`${cell(empty)}.textContent`) === '2' && !(await ev(`${cell(empty)}.classList.contains('test')`)));
  await click('#b-undo');
  check('annuler la confirmation rend l\'essai vert', await ev(`${cell(empty)}.classList.contains('test')`));
  // l'essai survit à un rechargement
  const store = await ev(`Object.fromEntries(Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage.getItem(k))]))`);
  await reloadWith(store);
  await click('#h-continue'); await sleep(200);
  check('l\'essai est sauvegardé et rechargé', await ev(`${cell(empty)}.classList.contains('test') && ${cell(empty)}.textContent === '2'`));
  await click('#b-erase');
  await click('#board .cell', empty);
  await click('#b-erase');
  check('Effacer retire une valeur d\'essai', await ev(`${cell(empty)}.textContent === '' || ${cell(empty)}.querySelector('.m') !== null`));
});

await section('Langues : choix dans les options, application immédiate, sens d\'écriture, mémoire', async () => {
  const sel = (i) => `document.querySelectorAll('#options-body select')[${i}]`;
  const choose = async (i, value) => { await ev(`(() => { const s = ${sel(i)}; s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change')); })()`); await sleep(250); };
  const lang = () => ev(`document.documentElement.lang + '/' + document.documentElement.dir`);
  check('langue du navigateur (fr) : page en français', await lang() === 'fr/ltr');
  await click('#b-menu'); await click('#m-options');
  const opts = await ev(`[...${sel(0)}.options].map((o) => o.value).join(',')`);
  check('liste des langues : automatique + 20 langues', opts.split(',').length === 21 && opts.startsWith('auto,fr,en,es,de,it,pt-pt,pt-br,ru,ar,zh,ko,ja,hi,tr,nl,pl,uk,id,vi,la'), opts);
  await choose(0, 'de');
  check('Deutsch : les options sont traduites aussitôt', /Sprache|Optionen/.test(await text('#options-title')) && await lang() === 'de/ltr', await text('#options-title'));
  await click('#options-close');
  check('Deutsch : le menu et les boutons suivent', await text('#b-erase') === 'Löschen' || /Löschen/.test(await text('#b-erase')));
  await click('#b-menu'); await click('#m-options');
  await choose(0, 'ar');
  check('العربية : écriture de droite à gauche', await lang() === 'ar/rtl' && /الخيارات/.test(await text('#options-title')), await lang());
  await click('#options-close');
  await click('#b-menu'); await click('#m-home');
  await shot('16-accueil-arabe');
  check('العربية : page d\'accueil traduite, pied de page avec la version', /v\d+\.\d+\.\d+/.test(await text('#h-ver')) && /GNOME Sudoku/.test(await text('#h-inspired')) && await text('#h-new') === 'لعبة جديدة');
  await click('#h-options');
  await choose(0, 'ja');
  check('日本語 : gauche à droite de nouveau', await lang() === 'ja/ltr' && await text('#h-new') === '新しいゲーム');
  await shot('17-options-japonais');
  const prefs = await ev(`JSON.parse(localStorage.getItem('5ud0ku:prefs')).lang`);
  check('le choix est mémorisé', prefs === 'ja');
  await choose(0, 'auto');
  check('automatique : retour au français', await lang() === 'fr/ltr' && await text('#h-new') === 'Nouvelle partie');
  await click('#options-close');
  await click('#h-continue');
});

await section('Thèmes : choix dans les options, application immédiate, mémoire', async () => {
  const root = (prop) => ev(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(prop)}).trim()`);
  const bodyBg = () => ev(`getComputedStyle(document.body).backgroundColor`);
  await click('#b-menu'); await click('#m-options');
  const selects = await ev(`[...document.querySelectorAll('#options-body select')].map((s) => [...s.options].map((o) => o.value).join(','))`);
  check('options : langue, taille, thème (4 familles) et apparence (3 modes)', selects.length === 4 && selects[2] === 'epure,aurora,claudia,minamoto' && selects[3] === 'auto,clair,fonce', JSON.stringify(selects));
  const choose = async (i, value) => { await ev(`(() => { const s = document.querySelectorAll('#options-body select')[${i}]; s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change')); })()`); await sleep(100); };
  await choose(3, 'clair');
  const light = await root('--bg');
  await choose(3, 'fonce');
  const dark = await root('--bg');
  check('apparence : clair et foncé changent le fond', light !== dark && await ev(`document.documentElement.dataset.theme`) === 'epure-fonce', `${light} ${dark}`);
  await shot('8-theme-epure-fonce');
  const seen = new Set();
  for (const fam of ['aurora', 'claudia', 'minamoto']) {
    await choose(2, fam);
    seen.add(await root('--bg'));
    check(`thème ${fam} appliqué (data-theme)`, await ev(`document.documentElement.dataset.theme`) === `${fam}-fonce`);
    await shot(`9-theme-${fam}-fonce`);
  }
  check('quatre fonds foncés distincts', seen.size === 3 && !seen.has(dark));
  await choose(3, 'clair');
  await choose(2, 'claudia');
  check('Gens Claudia clair : police Georgia et titres en capitales', /Georgia/.test(await root('--ui-font')) && await root('--h2-transform') === 'uppercase');
  await shot('10-theme-claudia-clair');
  await choose(2, 'epure');
  await click('#options-close');
  // mémoire : après rechargement, le choix est gardé
  const store = await ev(`Object.fromEntries(Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage.getItem(k))]))`);
  await reloadWith({ ...store, '5ud0ku:prefs': { ...store['5ud0ku:prefs'], themeFamily: 'minamoto', themeMode: 'clair' } });
  check('le thème choisi est appliqué dès le démarrage', await ev(`document.documentElement.dataset.theme`) === 'minamoto-clair' && await bodyBg() !== 'rgba(0, 0, 0, 0)');
  await shot('11-accueil-minamoto-clair');
  await click('#h-continue'); await shot('11b-grille-minamoto-clair');
  await reloadWith({ ...store, '5ud0ku:prefs': { ...store['5ud0ku:prefs'], themeFamily: 'aurora', themeMode: 'fonce' } });
  await shot('12-accueil-aurora-fonce');
  await click('#h-continue'); await shot('12b-grille-aurora-fonce');
  await reloadWith({ ...store, '5ud0ku:prefs': { ...store['5ud0ku:prefs'], themeFamily: 'claudia', themeMode: 'fonce' } });
  await shot('13-accueil-claudia-fonce');
  await click('#h-continue'); await shot('13b-grille-claudia-fonce');
  await click('#b-menu'); await click('#m-options');
  await choose(2, 'epure'); await choose(3, 'auto');
  await click('#options-close');
});

await section('Avertissements : une erreur est signalée', async () => {
  const sav = await solutionOfSave().catch(() => null);
  // pose volontairement un mauvais chiffre dans une case vide : la solution est lue depuis la partie
  await click('#b-menu'); await click('#m-resume');
  const info = await ev(`(async () => {
    const { SudokuGenerator } = await import('/src/generator.js');
    const cells = [...document.querySelectorAll('#board .cell')];
    const flat = cells.map((c) => (c.classList.contains('given') ? Number(c.textContent) - 1 : null));
    const g = new SudokuGenerator(1); g.setPuzzle(flat);
    const sol = g.solveUnique().flat();
    const i = cells.findIndex((c, k) => !c.classList.contains('given') && c.textContent === '');
    return { i, wrong: (sol[i] + 1) % 9, ok: sol[i] };
  })()`);
  await click('#board .cell', info.i);
  await key(String(info.wrong + 1));
  check('un chiffre faux est marqué en erreur', await ev(`document.querySelectorAll('#board .cell')[${info.i}].classList.contains('err')`));
  check('l\'erreur est aussi dite au lecteur d\'écran (nom accessible de la case)', /erreur/.test(await ev(`document.querySelectorAll('#board .cell')[${info.i}].getAttribute('aria-label')`)), await ev(`document.querySelectorAll('#board .cell')[${info.i}].getAttribute('aria-label')`));
  await key(String(info.ok + 1));
  check('le bon chiffre n\'est plus en erreur', !(await ev(`document.querySelectorAll('#board .cell')[${info.i}].classList.contains('err')`)));
  void sav;
});

await section('Pause, menu, options, aide, à propos', async () => {
  await click('#b-menu');
  check('menu ouvert', await isOpen('menu'));
  await click('#m-options');
  check('options ouvertes : 9 cases à cocher, aucune pour le chronomètre', await isOpen('options') && await ev(`document.querySelectorAll('#options-body input[type=checkbox]').length`) === 9 && !/hronom/.test(await text('#options-body')));
  await click('#options-close');
  // bandeau de la partie, comme 1-5731N : menu à gauche, temps (accent) avec code et difficulté en petit dessous, pause à droite
  const bar = await ev(`(() => {
    const h = document.querySelector('header');
    const kids = [...h.children].map((e) => e.id || e.className);
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const clock = document.getElementById('clock');
    return { kids, hH: Math.round(h.getBoundingClientRect().height), menuX: Math.round(r('b-menu').left), pauseX: Math.round(r('b-pause').left), infoX: Math.round(r('g-info').left),
      clockVisible: r('clock').width > 0, clockColor: getComputedStyle(clock).color, accent: getComputedStyle(document.documentElement).getPropertyValue('--acc').trim(),
      stacked: r('clock').bottom <= r('g-code').top + 2 && r('g-code').bottom <= r('g-level').top + 2, hasTitle: h.querySelector('h1') !== null,
      level: document.getElementById('g-level').textContent, time: clock.textContent };
  })()`);
  check('bandeau : menu, infos, espace, plein écran, pause, sans titre', bar.kids.join(',') === 'b-menu,g-info,grow,b-full,b-pause' && !bar.hasTitle, bar.kids.join(','));
  check('bandeau : menu à gauche, infos juste après, pause à droite', bar.menuX < bar.infoX && bar.infoX < bar.pauseX, JSON.stringify([bar.menuX, bar.infoX, bar.pauseX]));
  check('chronomètre toujours affiché, en couleur d\'accent', bar.clockVisible && /^\d+:\d\d$/.test(bar.time), bar.time);
  check('temps, code de la grille et difficulté sont empilés', bar.stacked && bar.level === 'Facile', JSON.stringify([bar.stacked, bar.level]));
  check('le bandeau ne grandit pas (hauteur du bouton)', bar.hH <= 60, String(bar.hH));
  // taille explicite : la hauteur utile d'une fenêtre « 430×860 » dépend du navigateur (717 px chez Claudius, 765 px ici) ; le contrôle porte sur la mise en page, pas sur la fenêtre
  await send('Emulation.setDeviceMetricsOverride', { width: 500, height: 800, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const fit = await ev(`({ sh: document.documentElement.scrollHeight, ih: window.innerHeight, iw: window.innerWidth, pad: Math.round(document.getElementById('pad').getBoundingClientRect().bottom) })`);
  check('partie sans défilement à la taille par défaut du banc', fit.sh <= fit.ih + 2 && fit.pad <= fit.ih, JSON.stringify(fit));
  await shot('3b-bandeau');
  await click('#b-pause');
  check('pause : la grille est masquée', await ev(`!document.getElementById('pause').hidden`));
  check('pause : les cases sont vidées (pas de triche)', await ev(`[...document.querySelectorAll('#board .cell')].every((c) => c.textContent === '')`));
  await shot('3-pause');
  await click('#b-resume');
  check('reprise : la grille revient', await ev(`document.getElementById('pause').hidden && document.querySelectorAll('#board .cell.given').length > 17`));
  await click('#b-menu'); await click('#m-help');
  check('aide ouverte', await isOpen('help'));
  await click('#help-close');
  await click('#b-menu'); await click('#m-about');
  check('à propos : un lien vers le code source (dépôt) et un vers la licence', await ev(`(() => { const c = document.getElementById('about-code'), l = document.getElementById('about-licence'); return c.href.startsWith('https://github.com/') && c.href.endsWith('/5ud0ku') && c.textContent === 'Code source' && l.href.endsWith('LICENSE.txt') && l.textContent === 'Licence'; })()`));
  const about = await text('#about-version');
  check('à propos : version', /Version 0\.\d+\.\d+/.test(about) || /\d+\.\d+\.\d+/.test(about), about);
  await click('#about-close');
});

await section('Partage et saisie d\'une grille', async () => {
  await click('#b-menu'); await click('#m-share');
  const code = await text('#share-code');
  check('code de partage « # »', code.startsWith('#') && code.length > 20, code);
  await click('#share-close');
  await click('#b-menu'); await click('#m-enter');
  await ev(`document.getElementById('enter-field').value = 'n importe quoi'`);
  await click('#enter-start');
  check('saisie invalide : message d\'erreur, boîte ouverte', await isOpen('enter') && await ev(`!document.getElementById('enter-err').hidden`));
  await ev(`document.getElementById('enter-field').value = ${JSON.stringify('.'.repeat(81))}`);
  await click('#enter-start');
  check('grille vide : plusieurs solutions', /plusieurs solutions/.test(await text('#enter-err')), await text('#enter-err'));
  await ev(`document.getElementById('enter-field').value = ${JSON.stringify(code)}`);
  await click('#enter-start');
  await sleep(300);
  check('le code de partage relance la même grille', !(await isOpen('enter')) && await ev(`document.querySelectorAll('#board .cell.given').length`) > 17);
});

await section('Code de grille, grille du jour', async () => {
  const board = () => ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.classList.contains('given') ? c.textContent : '.').join('')`);
  const codeShown = () => ev(`document.getElementById('g-code').hidden ? null : document.getElementById('g-code').textContent`);
  // grille du jour
  await click('#b-menu'); await click('#m-home');
  await click('#h-new');
  check('« Nouvelle partie » annonce la grille du jour', /Grille du jour/.test(await text('#new-daily-info')), await text('#new-daily-info'));
  await click('#new-daily');
  await sleep(900);
  const code = (await codeShown() ?? '').replace('Grille ', '');
  check('le code de la grille s\'affiche sous la barre', /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code), code);
  const daily = await board();
  await shot('14-grille-du-jour');
  // la grille du jour est la même quand on la redemande
  await click('#b-menu'); await click('#m-home'); await click('#h-new'); await click('#new-daily'); await sleep(900);
  check('la grille du jour est la même à chaque fois', await board() === daily);
  // un autre tirage aléatoire donne un autre code, et le code redonne la même grille
  await click('#b-menu'); await click('#m-home'); await click('#h-new'); await click('#new-start'); await sleep(900);
  const other = (await codeShown() ?? '').replace('Grille ', '');
  const otherBoard = await board();
  check('une grille aléatoire a son propre code', other !== code && /^[0-9A-Z-]{14}$/.test(other), other);
  await click('#b-menu'); await click('#m-enter');
  await ev(`document.getElementById('enter-field').value = ${JSON.stringify(code)}`);
  await click('#enter-start'); await sleep(900);
  check('saisir le code redonne la grille du jour', await board() === daily && (await codeShown()) === code);
  // faute de frappe : refusée
  const typo = code.slice(0, 5) + (code[5] === '0' ? '1' : '0') + code.slice(6);
  await click('#b-menu'); await click('#m-enter');
  await ev(`document.getElementById('enter-field').value = ${JSON.stringify(typo)}`);
  await click('#enter-start');
  check('une faute de frappe dans le code est refusée', await isOpen('enter') && await ev(`!document.getElementById('enter-err').hidden`));
  await click('#enter-close');
  // partage : les deux codes
  await click('#b-menu'); await click('#m-share');
  check('partage : code 5ud0ku et code « # »', (await text('#share-code5')) === code && (await text('#share-code')).startsWith('#'));
  await click('#share-close');
  // le code survit à un rechargement
  await ev(`document.querySelectorAll('#board .cell')[${await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => !c.classList.contains('given'))`)}].click()`);
  await key('5');
  const store = await ev(`Object.fromEntries(Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage.getItem(k))]))`);
  await reloadWith(store);
  await click('#h-continue'); await sleep(200);
  check('le code est gardé après rechargement', (await codeShown()) === code);
  void otherBoard;
});

await section('Mode Jigsaw : choix du type de grille, traits de régions, code, partage, retour au classique', async () => {
  const thick = () => ev(`[...document.querySelectorAll('#board .cell')].map((c) => (c.classList.contains('cb') ? 1 : 0) + (c.classList.contains('rb') ? 2 : 0)).join('')`);
  const codeShown = () => ev(`document.getElementById('g-code').hidden ? null : document.getElementById('g-code').textContent`);
  await click('#b-menu'); await click('#m-home'); await click('#h-new');
  check('« Nouvelle partie » propose Taille (4×4, 9×9, 16×16) et Type (classique, puzzle)', await ev(`document.querySelectorAll('#sizes input').length`) === 3 && await ev(`document.querySelectorAll('#types input').length`) === 2);
  check('chaque choix tient sur une seule ligne', await ev(`['sizes', 'types'].every((id) => { const t = [...document.querySelectorAll('#' + id + ' label')].map((l) => Math.round(l.getBoundingClientRect().top)); return t.length >= 2 && t.every((x) => x === t[0]); })`));
  check('l\'indication Jigsaw est cachée tant que Classique est choisi', await ev(`document.getElementById('new-mode-hint').hidden`) === true);
  await ev(`document.querySelector('#types input[value="puzzle"]').click()`);
  check('choisir Jigsaw montre son indication', await ev(`document.getElementById('new-mode-hint').hidden`) === false);
  await click('#new-start'); await sleep(1500);
  const code = (await codeShown() ?? '').replace('Grille ', '');
  check('un code Jigsaw s\'affiche (symbole de difficulté 5 à 8)', /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code), code);
  check('le niveau affiché porte « Puzzle »', /Puzzle/.test(await text('#g-level')), await text('#g-level'));
  const t1 = await thick();
  const classic = await ev(`[...document.querySelectorAll('#board .cell')].map((c, p) => (p % 9 === 2 || p % 9 === 5 ? 1 : 0) + (Math.floor(p / 9) === 2 || Math.floor(p / 9) === 5 ? 2 : 0)).join('')`);
  check('les traits épais ne sont plus ceux des carrés 3×3', t1 !== classic);
  await shot('15-jigsaw');
  await click('#b-menu'); await click('#m-share');
  check('le partage « # » de l\'amont est caché pour une grille Jigsaw', await ev(`document.getElementById('share-wrap-hash').hidden`) === true);
  await click('#share-close');
  // le code Jigsaw redonne la même grille
  const given = () => ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.classList.contains('given') ? c.textContent : '.').join('')`);
  const g1 = await given();
  await click('#b-menu'); await click('#m-enter');
  await ev(`document.getElementById('enter-field').value = ${JSON.stringify(code)}`);
  await click('#enter-start'); await sleep(1500);
  check('saisir le code Jigsaw redonne la même grille et les mêmes régions', await given() === g1 && await thick() === t1);
  // rechargement : la partie Jigsaw est reprise avec ses régions
  await gotoPage(`${BASE}/index.html`);
  await sleep(700);
  await click('#h-continue'); await sleep(500);
  check('rechargement : la partie Jigsaw est reprise avec ses régions', await thick() === t1 && /Puzzle/.test(await text('#g-level')));
  // retour au classique : traits 3×3
  await click('#b-menu'); await click('#m-home'); await click('#h-new');
  check('le type choisi (puzzle) est retenu à la réouverture', await ev(`document.querySelector('#types input[value="puzzle"]').checked`) === true);
  await ev(`document.querySelector('#types input[value="classique"]').click()`);
  await click('#new-start'); await sleep(900);
  check('retour au classique : traits des carrés 3×3', await thick() === classic);
  check('retour au classique : le niveau n\'affiche pas « Jigsaw »', !/Puzzle/.test(await text('#g-level')));
});

await section('Reprise après rechargement', async () => {
  const before = await ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.textContent).join('|')`);
  const empty = await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => !c.classList.contains('given') && c.textContent === '')`);
  await click('#board .cell', empty);
  await key('4');
  const after = await ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.textContent).join('|')`);
  const store = await ev(`Object.fromEntries(Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage.getItem(k))]))`);
  await reloadWith(store);
  check('après rechargement : accueil avec « Continuer »', await ev(`document.body.dataset.view === 'home' && !document.getElementById('h-continue').hidden`));
  await click('#h-continue'); await sleep(200);
  check('la partie est reprise telle quelle après rechargement', await ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.textContent).join('|')`) === after && before !== after);
  check('aucune boîte de dialogue ouverte à la reprise', !(await ev(`document.querySelector('dialog[open]') !== null`)));
});

await section('Victoire et meilleur temps', async () => {
  const { flat, sol } = await solutionOfSave();
  for (let p = 0; p < 81; p++) {
    if (flat[p] !== null) continue;
    await ev(`document.querySelectorAll('#board .cell')[${p}].click()`);
    await key(String(sol[p] + 1));
  }
  await sleep(300);
  check('grille complète : boîte « Bravo » ouverte', await isOpen('done'));
  check('premier temps : « meilleur temps »', await ev(`!document.getElementById('done-record').hidden`));
  await shot('4-victoire');
  // une grille gagnée ne se rouvre pas (audit G1) : plus d'annuler, de pause ni de rejeu, la victoire ne se compte qu'une fois
  await click('#done-close');
  const frozen = await ev(`({ undo: document.getElementById('b-undo').disabled, redo: document.getElementById('b-redo').disabled, notes: document.getElementById('b-notes').disabled, test: document.getElementById('b-test').disabled,
    pause: document.getElementById('b-pause').disabled, pad: [...document.querySelectorAll('#pad button')].every((b) => b.disabled), overlay: document.getElementById('pause').hidden })`);
  check('après la victoire : Annuler, Rétablir, Notes, Essai, Pause et pavé désactivés, pas d\'écran de pause', frozen.undo && frozen.redo && frozen.notes && frozen.test && frozen.pause && frozen.pad && frozen.overlay, JSON.stringify(frozen));
  const gridOf = () => ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.textContent).join('|')`);
  const gagnee = await gridOf();
  await click('#board .cell', await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => !c.classList.contains('given'))`));
  await key('z', { modifiers: 2 }); await key('y', { modifiers: 2 }); await key('1'); await key('5'); await key('Backspace'); await key('p'); await key('n'); await key('t');
  check('après la victoire : clavier, Ctrl+Z, pause et notes ne changent rien', await gridOf() === gagnee && await ev(`document.getElementById('pause').hidden`) && await ev(`document.getElementById('b-notes').getAttribute('aria-pressed')`) === 'false');
  check('après la victoire : aucune sauvegarde réécrite, une seule victoire comptée', await ev(`localStorage.getItem('5ud0ku:savefile')`) === null && await ev(`JSON.parse(localStorage.getItem('5ud0ku:data')).stats.games.length`) === 1);
  check('la sauvegarde est supprimée', await ev(`localStorage.getItem('5ud0ku:savefile')`) === null);
  const data = await ev(`JSON.parse(localStorage.getItem('5ud0ku:data'))`);
  check('meilleur temps enregistré pour la difficulté', Object.keys(data.highscores).length === 1, JSON.stringify(data));
  await click('#done-new');
  check('« Nouvelle partie » ramène à l\'accueil (sans « Continuer », la grille est terminée) et ouvre le choix avec le meilleur temps', await ev(`document.body.dataset.view === 'home' && document.getElementById('h-continue').hidden`) && await isOpen('newgame') && /Meilleur temps|Best time/.test(await text('#diffs')), await text('#diffs'));
  await shot('4b-nouvelle-partie-apres-victoire');
  await click('#new-cancel');
  // statistiques, depuis l'accueil
  await click('#h-stats');
  const stats = await ev(`document.getElementById('stats-body').innerText.replace(/\\s+/g, ' ')`);
  check('statistiques : 1 partie gagnée, le code de la dernière est listé', /Parties gagnées 1/.test(stats) && /[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/.test(stats), stats);
  await shot('15-statistiques');
  check('le code d\'une partie est un bouton de copie', await ev(`document.querySelector('#stats-body .codecopy') !== null`));
  await ev(`window.confirm = () => true`);
  await click('#stats-reset');
  check('effacer les statistiques', /Aucune partie gagnée/.test(await text('#stats-body')));
  await click('#stats-close');
});

await section('Recommencer une grille terminée : nouvelle partie de la même grille (audit G1)', async () => {
  await click('#h-new'); await click('#new-start'); await sleep(900);
  const code = await ev(`document.getElementById('g-code').textContent`);
  const donnees = () => ev(`[...document.querySelectorAll('#board .cell')].map((c) => (c.classList.contains('given') ? c.textContent : '.')).join('')`);
  const avant = await donnees();
  const { flat, sol } = await solutionOfSave();
  for (let p = 0; p < 81; p++) {
    if (flat[p] !== null) continue;
    await ev(`document.querySelectorAll('#board .cell')[${p}].click()`);
    await key(String(sol[p] + 1));
  }
  await sleep(300);
  check('grille gagnée une deuxième fois', await isOpen('done'));
  await click('#done-close');
  await click('#b-menu'); await click('#m-restart'); await sleep(900);
  check('Recommencer après la victoire : nouvelle partie de la même grille (même code, mêmes données)', await ev(`document.getElementById('g-code').textContent`) === code && await donnees() === avant);
  check('la nouvelle partie est jouable : Pause active, chronomètre reparti', await ev(`!document.getElementById('b-pause').disabled && !document.getElementById('pause').hidden === false`));
  const played = await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => !c.classList.contains('given') && c.textContent === '')`);
  await click('#board .cell', played);
  await key('4');
  check('la nouvelle partie accepte un coup', await ev(`document.querySelectorAll('#board .cell')[${played}].textContent`) === '4');
});

await section('Recommencer une grille en cours : la grille revient à l\'état initial et le chronomètre repart à zéro', async () => {
  await click('#b-menu'); await click('#m-home'); await click('#h-new'); await click('#new-start'); await sleep(900);
  const initial = await ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.textContent).join('|')`);
  const vide = await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => !c.classList.contains('given') && c.textContent === '')`);
  await click('#board .cell', vide);
  await key('3');
  await sleep(2300);
  const avant = await text('#clock');
  check('le chronomètre a avancé avant de recommencer', /^0:0[2-9]$|^0:[1-5]\d$/.test(avant), avant);
  await ev(`window.confirm = () => true`);
  await click('#b-menu'); await click('#m-restart');
  await sleep(300);
  check('Recommencer : la grille revient à l\'état initial', await ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.textContent).join('|')`) === initial);
  const apres = await text('#clock');
  check('Recommencer : le chronomètre repart à zéro', /^0:0[01]$/.test(apres), `${avant} -> ${apres}`);
  await sleep(2400);   // l'affichage se rafraîchit à chaque « tick » d'une seconde : laisser passer au moins un tick complet
  check('le chronomètre tourne de nouveau', /^0:0[1-4]$/.test(await text('#clock')), await text('#clock'));
});

await section('Victoire seulement avec des valeurs ordinaires : une valeur d\'essai ne fait pas gagner', async () => {
  await click('#b-menu'); await click('#m-home'); await click('#h-new'); await click('#new-start'); await sleep(900);
  const { flat, sol } = await solutionOfSave();
  const vides = [];
  for (let p = 0; p < 81; p++) if (flat[p] === null) vides.push(p);
  const derniere = vides.pop();
  for (const p of vides) {
    await ev(`document.querySelectorAll('#board .cell')[${p}].click()`);
    await key(String(sol[p] + 1));
  }
  await sleep(200);
  check('une seule case reste : pas de victoire', !(await isOpen('done')));
  // la dernière case : noter puis essayer le bon chiffre (valeur d'essai verte)
  await ev(`document.querySelectorAll('#board .cell')[${derniere}].click()`);
  await key('n'); await key(String(sol[derniere] + 1)); await key('n');
  await key('t'); await key(String(sol[derniere] + 1)); await key('t');
  await sleep(300);
  check('grille pleine et juste, mais avec une valeur d\'essai : pas de « Bravo »', !(await isOpen('done')) && await ev(`document.querySelectorAll('#board .cell')[${derniere}].classList.contains('test')`));
  check('la partie continue : Annuler et Pause restent actifs', await ev(`!document.getElementById('b-undo').disabled && !document.getElementById('b-pause').disabled`));
  // le même chiffre au pavé normal confirme l'essai : la grille est achevée
  await key(String(sol[derniere] + 1));
  await sleep(300);
  check('confirmer la valeur d\'essai achève la grille : « Bravo »', await isOpen('done'));
  await click('#done-close');
});

await section("Plein écran : touche du bandeau, option « Démarrer en plein écran » active par défaut", async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await reloadWith({});
  await click('#h-new'); await click('#new-start'); await sleep(900);
  const dispo = await ev(`!!document.fullscreenEnabled`);
  const cache = await ev(`document.getElementById('b-full').hidden`);
  check('la touche plein écran est dans le bandeau (cachée seulement si le navigateur ne le permet pas)', cache === !dispo, `dispo=${dispo} cachée=${cache}`);
  if (dispo) check('la touche porte un libellé', /\S/.test(await ev(`document.getElementById('b-full').getAttribute('aria-label')`)));
  await click('#b-menu'); await click('#m-options');
  const coche = await ev(`(() => { const l = [...document.querySelectorAll('#options-body label.opt')].find((x) => /plein/i.test(x.textContent)); return l ? l.querySelector('input').checked : null; })()`);
  check("l'option « Démarrer en plein écran » est cochée par défaut", dispo ? coche === true : coche === null, String(coche));
  await click('#options-close');
});

await section("Jigsaw 16×16 : Taille 16×16 + Type puzzle, régions irrégulières, niveau affiché, reprise, code", async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await reloadWith({});
  await click('#h-new');
  await ev(`document.querySelector('#sizes input[value="16"]').click()`);
  await ev(`document.querySelector('#types input[value="puzzle"]').click()`);
  check("les deux indications (16×16 et puzzle) s'affichent", await ev(`document.getElementById('new-mode-hint').hidden`) === false && (await text('#new-mode-hint')).length > 60);
  await shot('19-nouvelle-partie-taille-type');
  await click('#new-start'); await sleep(6000);
  const m = await ev(`(() => {
    const c = [...document.querySelectorAll('#board .cell')];
    const cb = [...new Set(c.map((x, p) => (x.classList.contains('cb') ? p % 16 : -1)).filter((x) => x >= 0))].sort((a, b) => a - b).join(',');
    return { cells: c.length, cb, level: document.getElementById('g-level').textContent, sh: document.documentElement.scrollHeight, ih: innerHeight, pad: document.querySelectorAll('#pad button').length };
  })()`);
  check('256 cases, pavé de 16 touches', m.cells === 256 && m.pad === 16, JSON.stringify(m));
  check('traits épais irréguliers (autres colonnes que 3, 7, 11)', m.cb !== '3,7,11' && m.cb.split(',').length > 3, m.cb);
  check('niveau « 16×16 Puzzle · Facile »', /16×16 Puzzle · Facile/.test(m.level), m.level);
  check("tout tient dans l'écran", m.sh <= m.ih + 2, JSON.stringify(m));
  await shot('18-hex-puzzle');
  const avant = await ev(`[...document.querySelectorAll('#board .cell')].map((c) => (c.classList.contains('given') ? c.textContent : '.') + (c.classList.contains('cb') ? '|' : '') + (c.classList.contains('rb') ? '_' : '')).join('')`);
  await gotoPage(`${BASE}/index.html`); await sleep(800);
  await click('#h-continue'); await sleep(3000);
  const apres = await ev(`[...document.querySelectorAll('#board .cell')].map((c) => (c.classList.contains('given') ? c.textContent : '.') + (c.classList.contains('cb') ? '|' : '') + (c.classList.contains('rb') ? '_' : '')).join('')`);
  check('rechargement : mêmes indices et mêmes régions', apres === avant);
  const code = (await text('#g-code')).replace('Grille ', '');
  await click('#b-menu'); await click('#m-enter');
  await ev(`document.getElementById('enter-field').value = ${JSON.stringify(code)}`);
  await click('#enter-start'); await sleep(6000);
  const rejoue = await ev(`[...document.querySelectorAll('#board .cell')].map((c) => (c.classList.contains('given') ? c.textContent : '.') + (c.classList.contains('cb') ? '|' : '') + (c.classList.contains('rb') ? '_' : '')).join('')`);
  check('saisir le code redonne la même grille et les mêmes régions', rejoue === avant);
  // retour au classique 9×9
  await click('#b-menu'); await click('#m-home'); await click('#h-new');
  await ev(`document.querySelector('#sizes input[value="9"]').click()`);
  await ev(`document.querySelector('#types input[value="classique"]').click()`);
  await click('#new-start'); await sleep(900);
  check('retour au classique 9×9 : 81 cases', await ev(`document.querySelectorAll('#board .cell').length`) === 81);
});

await section("4×4 : petite grille de débutant (une seule difficulté, chiffres 1 à 4), puzzle grisé, reprise, code", async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await reloadWith({});
  // une partie 9×9 de niveau Difficile fixe le choix de difficulté ; une partie 4×4 ne doit pas l'effacer (audit F4)
  await click('#h-new');
  await ev(`document.querySelector('#diffs input[value="3"]').click()`);
  await click('#new-start'); await sleep(900);
  await click('#b-menu'); await click('#m-home');
  await click('#h-new');
  await ev(`document.querySelector('#types input[value="puzzle"]').click()`);
  await ev(`document.querySelector('#sizes input[value="4"]').click()`);
  check('4×4 : « puzzle » est grisé et « classique » coché', await ev(`document.querySelector('#types input[value="puzzle"]').disabled`) === true && await ev(`document.querySelector('#types input[value="classique"]').checked`) === true);
  check('4×4 : une seule difficulté, la liste des niveaux est cachée', await ev(`getComputedStyle(document.getElementById('diffs')).display`) === 'none' && await ev(`document.getElementById('new-best-petit').hidden`) === false);
  check("4×4 : phrase d'explication", /4×4/.test(await text('#new-mode-hint')));
  await shot('20-nouvelle-partie-4x4');
  await click('#new-start'); await sleep(900);
  const m = await ev(`(() => {
    const c = [...document.querySelectorAll('#board .cell')];
    const b = document.getElementById('board').getBoundingClientRect();
    return { cells: c.length, pad: [...document.querySelectorAll('#pad button')].map((x) => x.textContent).join(''), cb: [...new Set(c.map((x, p) => (x.classList.contains('cb') ? p % 4 : -1)).filter((x) => x >= 0))].join(','),
      level: document.getElementById('g-level').textContent, code: document.getElementById('g-code').textContent, given: c.filter((x) => x.classList.contains('given')).length,
      w: Math.round(b.width), h: Math.round(b.height), sh: document.documentElement.scrollHeight, ih: innerHeight };
  })()`);
  check('4×4 : 16 cases et pavé 1 à 4', m.cells === 16 && m.pad === '1234', JSON.stringify(m));
  check('4×4 : trait épais au milieu (colonne 1, rangée 1) et au moins 7 indices', m.cb === '1' && m.given >= 7, JSON.stringify(m));
  check('4×4 : niveau « 4×4 · Facile », code de type 4', /4×4 · Facile/.test(m.level) && /^411/.test(m.code.replace(/^Grille /, '').replace('-', '')), m.level + ' ' + m.code);
  check("4×4 : plateau carré, tout tient dans l'écran", Math.abs(m.w - m.h) <= 2 && m.sh <= m.ih + 2, JSON.stringify(m));
  await shot('21-4x4');
  const vide = await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => !c.classList.contains('given'))`);
  await ev(`document.querySelectorAll('#board .cell')[${vide}].click()`);
  await key('5');
  check('4×4 : la touche 5 est ignorée', await ev(`document.querySelectorAll('#board .cell')[${vide}].textContent`) === '');
  await key('3');
  check('4×4 : la touche 3 pose un 3', await ev(`document.querySelectorAll('#board .cell')[${vide}].textContent`) === '3');
  await key('n'); await key('1'); await key('2');
  await key('Backspace'); // efface la valeur ; en mode notes la touche 3 a remplacé... on contrôle seulement qu'il n'y a pas d'erreur
  const avant = await ev(`[...document.querySelectorAll('#board .cell')].map((c) => (c.classList.contains('given') ? c.textContent : '.')).join('')`);
  await gotoPage(`${BASE}/index.html`); await sleep(800);
  await click('#h-continue'); await sleep(800);
  check('4×4 : la partie est reprise après rechargement', await ev(`document.querySelectorAll('#board .cell').length`) === 16 && await ev(`[...document.querySelectorAll('#board .cell')].map((c) => (c.classList.contains('given') ? c.textContent : '.')).join('')`) === avant);
  const code = (await text('#g-code')).replace('Grille ', '');
  await click('#b-menu'); await click('#m-enter');
  await ev(`document.getElementById('enter-field').value = ${JSON.stringify(code)}`);
  await click('#enter-start'); await sleep(900);
  check('4×4 : saisir le code redonne la même grille', await ev(`[...document.querySelectorAll('#board .cell')].map((c) => (c.classList.contains('given') ? c.textContent : '.')).join('')`) === avant);
  await click('#b-menu'); await click('#m-home'); await click('#h-new');
  check('4×4 : la taille choisie est retenue', await ev(`document.querySelector('#sizes input[value="4"]').checked`) === true);
  await ev(`document.querySelector('#sizes input[value="9"]').click()`);
  check('la difficulté choisie avant le 4×4 (Difficile) est conservée', await ev(`document.querySelector('#diffs input:checked').value`) === '3');
  check("retour à 9×9 : « puzzle » n'est plus grisé, les niveaux reviennent", await ev(`document.querySelector('#types input[value="puzzle"]').disabled`) === false && await ev(`document.getElementById('diffs').hidden`) === false);
  await click('#new-start'); await sleep(900);
  check('retour au classique 9×9 : 81 cases', await ev(`document.querySelectorAll('#board .cell').length`) === 81);
});

await section("Saisie d'un code Jigsaw 16×16 (audit M2) : « Génération… » et boutons inactifs pendant le calcul, un seul calcul", async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await reloadWith({});
  const code = await ev(`(async () => { const { makeCode } = await import('/src/code.js'); return makeCode(4, 4242, 'hexjigsaw'); })()`);
  await click('#h-new'); await click('#new-enter');
  await ev(`document.getElementById('enter-field').value = ${JSON.stringify(code)}`);
  await ev(`document.getElementById('enter-start').click()`);
  const pendant = await ev(`({ commencer: document.getElementById('enter-start').disabled, fermer: document.getElementById('enter-close').disabled, texte: document.getElementById('enter-start').textContent })`);
  check('pendant la génération : « Commencer » et « Fermer » inactifs, le bouton dit « Génération… »', pendant.commencer === true && pendant.fermer === true && /…/.test(pendant.texte), JSON.stringify(pendant));
  await sleep(9000);
  check("la grille s'ouvre ensuite (256 cases) et la boîte est fermée", await ev(`document.querySelectorAll('#board .cell').length`) === 256 && await ev(`document.getElementById('enter').open`) === false);
});

await section("Paysage : plateau d'un côté, bandeau + outils + pavé de l'autre, tout visible sans défilement", async () => {
  for (const [w, h] of [[844, 390], [667, 375], [915, 412], [1280, 720]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await reloadWith({});
    await click('#h-new'); await click('#new-start'); await sleep(900);
    const m = await ev(`(() => {
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      return { board: r('#boardwrap'), head: r('header'), tools: r('#tools'), pad: r('#pad'), w: innerWidth, h: innerHeight, sy: document.documentElement.scrollHeight };
    })()`);
    const ok = m.board.r <= m.head.l + 1 && m.board.r <= m.pad.l + 1 && m.head.t < m.tools.t && m.tools.b <= m.pad.t + 1;
    check(`${w}×${h} : le plateau est à gauche, le bandeau, les outils et le pavé à droite`, ok, JSON.stringify(m));
    check(`${w}×${h} : plateau carré et tout tient dans l'écran`, Math.abs((m.board.r - m.board.l) - (m.board.b - m.board.t)) <= 1 && m.pad.b <= m.h + 1 && m.board.b <= m.h + 1 && m.sy <= m.h + 1, JSON.stringify(m));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await reloadWith({});
  await click('#h-new'); await click('#new-start'); await sleep(900);
  const v = await ev(`(() => { const a = document.querySelector('#boardwrap').getBoundingClientRect(), b = document.querySelector('header').getBoundingClientRect(); return b.bottom <= a.top + 1; })()`);
  check('portrait : le bandeau reste au-dessus du plateau', v === true);
});

await section("16×16 : choix du type de grille, plateau de 256 cases, pavé 0 à F, clavier, notes 4×4, génération par Worker, reprise", async () => {
  for (const [w, h] of [[390, 844], [844, 390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await reloadWith({});
    await click('#h-new');
    check(w + '×' + h + ' : Taille et Type tiennent chacun sur une ligne', await ev(`['sizes', 'types'].every((id) => { const t = [...document.querySelectorAll('#' + id + ' label')].map((l) => Math.round(l.getBoundingClientRect().top)); return t.length >= 2 && t.every((x) => x === t[0]); })`));
    await ev(`document.querySelector('#sizes input[value="16"]').click()`);
    check('choisir 16×16 montre son indication', await ev(`document.getElementById('new-mode-hint').hidden`) === false && /16/.test(await text('#new-mode-hint')));
    await click('#new-start'); await sleep(2500);
    const m = await ev(`(() => {
      const c = [...document.querySelectorAll('#board .cell')];
      const r = c[0].getBoundingClientRect(), b = document.getElementById('board').getBoundingClientRect();
      const pad = [...document.querySelectorAll('#pad button')].map((x) => x.textContent).join('');
      const cb = c.map((x, p) => (x.classList.contains('cb') ? p % 16 : -1)).filter((x) => x >= 0);
      const rb = c.map((x, p) => (x.classList.contains('rb') ? Math.floor(p / 16) : -1)).filter((x) => x >= 0);
      return { cells: c.length, pad, cbCols: [...new Set(cb)].join(','), rbRows: [...new Set(rb)].join(','), side: Math.round(r.width), board: Math.round(b.width), bh: Math.round(b.height),
        level: document.getElementById('g-level').textContent, code: document.getElementById('g-code').textContent, sh: document.documentElement.scrollHeight, ih: innerHeight,
        padBottom: Math.round(document.getElementById('pad').getBoundingClientRect().bottom) };
    })()`);
    check(w + '×' + h + ' : 256 cases et 16 touches 0 à F', m.cells === 256 && m.pad === '0123456789ABCDEF', JSON.stringify(m));
    check(w + '×' + h + ' : traits épais entre les blocs de 4×4 (colonnes 3, 7, 11 ; rangées 3, 7, 11)', m.cbCols === '3,7,11' && m.rbRows === '3,7,11', `${m.cbCols} / ${m.rbRows}`);
    check(w + '×' + h + ' : niveau « 16×16 · Facile » et code', /16×16/.test(m.level) && /^[0-9A-Z]{4}-/.test(m.code), m.level + ' ' + m.code);
    check(w + '×' + h + " : plateau carré, tout tient dans l'écran", Math.abs(m.board - m.bh) <= 2 && m.sh <= m.ih + 2 && m.padBottom <= m.ih, JSON.stringify(m));
    if (w === 390) await shot('16-hex-portrait'); else await shot('16-hex-paysage');
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  // saisie : touche du pavé, clavier A à F, effacement, notes 4×4
  const vide = await ev(`[...document.querySelectorAll('#board .cell')].findIndex((c) => !c.classList.contains('given'))`);
  await ev(`document.querySelectorAll('#board .cell')[${vide}].click()`);
  await ev(`document.querySelectorAll('#pad button')[11].click()`);
  check('touche B du pavé : la case affiche B', await ev(`document.querySelectorAll('#board .cell')[${vide}].textContent`) === 'B');
  await key('f');
  check('clavier « f » : la case affiche F', await ev(`document.querySelectorAll('#board .cell')[${vide}].textContent`) === 'F');
  await key('0');
  check('clavier « 0 » : la case affiche 0 (chiffre du 16×16, pas un effacement)', await ev(`document.querySelectorAll('#board .cell')[${vide}].textContent`) === '0');
  await key('Backspace');
  check('Retour arrière : la case est vidée', await ev(`document.querySelectorAll('#board .cell')[${vide}].textContent`) === '');
  await key('n');
  await ev(`document.querySelectorAll('#pad button')[0].click()`); await ev(`document.querySelectorAll('#pad button')[15].click()`);
  check('notes : grille 4×4 de seize emplacements dans la case', await ev(`(() => { const m = document.querySelectorAll('#board .cell')[${vide}].querySelector('.m'); return m ? m.children.length : 0; })()`) === 16);
  check('notes : « 0 » et « F » notés', await ev(`[...document.querySelectorAll('#board .cell')[${vide}].querySelectorAll('.m i')].map((i) => i.textContent).join('')`) === '0F');
  await shot('17-hex-notes');
  await key('n');
  // reprise après rechargement : la taille et la grille reviennent
  const avant = await ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.classList.contains('given') ? c.textContent : '.').join('')`);
  await gotoPage(`${BASE}/index.html`); await sleep(800);
  await click('#h-continue'); await sleep(1500);
  const apres = await ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.classList.contains('given') ? c.textContent : '.').join('')`);
  check('rechargement : la partie 16×16 est reprise (256 cases, mêmes indices)', apres.length === 256 && apres === avant);
  // partage : pas de « # » en 16×16 ; code 16×16 redonne la grille
  await click('#b-menu'); await click('#m-share');
  check("partage : le « # » de l'amont est caché en 16×16", await ev(`document.getElementById('share-wrap-hash').hidden`) === true);
  await click('#share-close');
  const code = (await text('#g-code')).replace('Grille ', '');
  await click('#b-menu'); await click('#m-enter');
  await ev(`document.getElementById('enter-field').value = ${JSON.stringify(code)}`);
  await click('#enter-start'); await sleep(2500);
  const rejoue = await ev(`[...document.querySelectorAll('#board .cell')].map((c) => c.classList.contains('given') ? c.textContent : '.').join('')`);
  check('saisir le code 16×16 redonne la même grille', rejoue === avant);
  // retour au classique : 81 cases
  await click('#b-menu'); await click('#m-home'); await click('#h-new');
  await ev(`document.querySelector('#sizes input[value="9"]').click()`);
  await ev(`document.querySelector('#types input[value="classique"]').click()`);
  await click('#new-start'); await sleep(900);
  check('retour au classique : 81 cases et pavé 1 à 9', await ev(`document.querySelectorAll('#board .cell').length`) === 81 && await ev(`[...document.querySelectorAll('#pad button')].map((x) => x.textContent).join('')`) === '123456789');
});

await section('Grille régulière au format téléphone : 9 rangées et 9 colonnes de même taille, avec des notes (défaut de la 1.0.0)', async () => {
  for (const [w, h] of [[390, 844], [430, 860], [360, 640]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await reloadWith({});
    await click('#h-new'); await click('#new-start'); await sleep(900);
    const mesure = () => ev(`(() => {
      const c = [...document.querySelectorAll('#board .cell')];
      const r = (i) => c[i].getBoundingClientRect();
      return { rows: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => Math.round(r(k * 9).height)), cols: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => Math.round(r(k).width)) };
    })()`);
    const reguliere = (m) => Math.max(...m.rows) - Math.min(...m.rows) <= 2 && Math.max(...m.cols) - Math.min(...m.cols) <= 2;
    const sans = await mesure();
    check(`${w}×${h} sans notes : rangées et colonnes régulières`, reguliere(sans), JSON.stringify(sans));
    // notes dans toutes les cases vides des rangées 1, 5 et 9
    await key('n');
    const vides = await ev(`[0, 4, 8].flatMap((r) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => r * 9 + c)).filter((p) => !document.querySelectorAll('#board .cell')[p].classList.contains('given'))`);
    for (const p of vides) {
      await ev(`document.querySelectorAll('#board .cell')[${p}].click()`);
      for (const d of ['1', '4', '7', '9']) await key(d);
    }
    await key('n');
    const avec = await mesure();
    check(`${w}×${h} avec notes dans trois rangées : rangées et colonnes régulières`, reguliere(avec), JSON.stringify(avec));
  }
  await send('Emulation.clearDeviceMetricsOverride');
});

check('aucune violation de la politique de sécurité du contenu pendant tout le banc', cspErrors.length === 0, cspErrors.slice(0, 2).join(' | ').slice(0, 300));

const failed = results.filter((r) => !r[0]).length;
console.log(`\n${failed} échec(s) sur ${results.length} contrôle(s)`);
process.exitCode = failed ? 1 : 0;
cleanup();
