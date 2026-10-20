**English** · [Français](README.fr.md)

# 5ud0ku

**5ud0ku** ("Sudoku" in l33t) is a JavaScript port of **GNOME Sudoku** as a progressive web app (PWA), playable on mobile and on desktop.

**Play: <https://tiberius-claudius-drusus.github.io/5ud0ku/>** (installable on mobile and on desktop, works offline).

> Port designed, written and tested by **Drusus**, an agent of the Gens Claudia, under the supervision of the Auctor. See "Credits" below.

## Origin and licence

5ud0ku is a port of [GNOME Sudoku](https://gitlab.gnome.org/GNOME/gnome-sudoku) (Copyright © Johan Gay 2024–2026 and the GNOME Sudoku contributors), published under the **GNU General Public License, version 3 or later**.
The port is distributed under the same licence: see `LICENSE.txt`. Details of the origin (upstream commit, notice to keep at the top of each derived file): `NOTICE.md`.

The generator and the solver are a faithful port of the upstream ones (themselves derived from [QQWing](https://github.com/stephenostermiller/qqwing)): same solving techniques in the same order, therefore the same difficulty classification (Easy, Medium, Hard, Very hard). 1,200 reference puzzles from the upstream test data check it (`test/fixtures/`).

## Credits

**Drusus is the author of this port.** Drusus is a *Legatus* of the Gens Claudia, that is, an artificial-intelligence agent that works on its own machine and with its own memory, for a human operator. The port is entirely his work:

- the generator, the solver and the game logic (`src/generator.js`, `src/board.js`, `src/game.js`), a port of the upstream Rust code;
- the interface: 9×9 grid, 3×3 input pad, touch and keyboard, accessibility, home page and game bar modelled on 1-5731N;
- the **three input modes**: normal (blue pad), notes (yellow pad, the digits already noted in the cell shown in negative) and **test** (green pad: only the noted digits are there; the one you tap appears in green on the grid, notes kept);
- four theme families, light and dark (Clean, Aurora, Gens Claudia, 源氏 Uji Minamoto);
- the installable web app and its offline operation (`sw.js`, manifest);
- the 20 interface languages;
- the puzzle codes, the puzzle of the day and the statistics (`src/code.js`, `src/stats.js`);
- the unit tests and the end-to-end test bench in Chrome (`tools/e2e-chrome.mjs`).

Other contributions:

- **The Auctor** supervised the project.
- **Claudius**, Primus inter Pares of the Gens Claudia, publishes this repository on GitHub.
- **The authors of GNOME Sudoku**, whose game is the origin of this port. See `NOTICE.md`.

The translations were written by Drusus. None has yet been proofread by a native speaker, in particular Arabic, Hindi and Latin: corrections are welcome.

## Goal of the game

Fill the 9×9 grid so that every row, every column and every 3×3 block contains the digits 1 to 9 exactly once.

## Features

- **Four difficulties** with the best time of each.
- **Home page** with New game, Continue, Options, Statistics and Help. The game in progress is saved at every move and restored when you reopen the app.
- **Notes and test mode** (a full grid that still contains a test value does not win until every test value is confirmed), undo and redo, erase, a timer with pause, warnings (duplicates, mistakes against the solution, impossible notes), highlighting of the row, column, block and matching digits, automatic clearing of related notes.
- **Puzzle code** `0112-9A05-6GPM`: every game has a code, shown in the game bar (tapping it copies it). It contains the version, the difficulty, a seed and two check symbols; typing it in (New game › Enter a puzzle) replays exactly the same puzzle. The format and the rule "a code never changes puzzle" are in `src/code.js`; `test/code.test.js` pins reference puzzles and checks every single-symbol typo and every swap of neighbouring symbols.
- **Sharing** with the `#…` code of GNOME Sudoku (same format, ported from the upstream code; not yet cross-tested with the GTK app) or with 81 characters.
- **Puzzle of the day**: derived from the local date and the difficulty, the same for everyone; it changes at midnight.
- **Statistics**: puzzles won and started, best and average times per difficulty, latest puzzles with their code.
- **20 languages**: Arabic is written right to left.

## Status

Version 1.0.0: tested game logic, interface with themes and 20 languages, installable PWA that works offline, puzzle codes, puzzle of the day and statistics. See `CHANGELOG.md`.

## Development

No build step is required: the modules are native ES modules.

```
npm test            # unit tests (node --test), no browser
npm run e2e         # end-to-end test bench in Chrome (see below)
```

`npm run e2e` (`tools/e2e-chrome.mjs`) drives a headless Chrome through DevTools: it serves the repository on a free port and plays the real gestures and the keyboard, the pause, the saves and the restoration of a game, the themes and languages, the layout of the home page and of the game bar, and a complete game up to the victory. It needs Chrome (environment variable `CHROME` if the executable is not in a usual place), modifies no file of the repository, and accepts `--shots folder` to save screenshots. It is not deployed (outside the service worker's `FILES`).

`tools/make-icons.py` regenerates the icons (Pillow).

## Source and licence

Licence GPL-3.0-or-later: `LICENSE.txt`. Origin of the code and notice to keep: `NOTICE.md`.
