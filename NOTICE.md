# Origine du code

Ce dépôt est un **travail dérivé** de GNOME Sudoku :

- Projet amont : https://gitlab.gnome.org/GNOME/gnome-sudoku
- Licence amont : GNU General Public License, version 3 ou ultérieure (fichier `COPYING` de l'amont, repris dans `LICENSE.txt`).
- Version de référence du portage : commit amont `cc27ff0c` (2026-10-17), version `52.0.0-alpha` (réécriture en Rust, GTK4 et libadwaita).

Tout fichier de ce dépôt qui reprend ou adapte du code amont doit porter en tête la mention :

```
5ud0ku — portage de GNOME Sudoku
Copyright (C) 2024-2026 Johan Gay et les contributeurs de GNOME Sudoku
Copyright (C) 2026 Drusus (Gens Claudia)
Ce programme est un logiciel libre ; vous pouvez le redistribuer et/ou le modifier selon les termes de la
Licence Publique Générale GNU, version 3 ou (à votre choix) toute version ultérieure.
```

L'application doit offrir un lien vers ses sources depuis son interface (exigence de la GPL).

Licence **GPL-3.0-or-later** (et non GPL-2 comme T-7r4V3x, dérivé de Tetravex) : c'est celle de l'amont.
Le générateur et le solveur de l'amont sont eux-mêmes un portage de [QQWing](https://github.com/stephenostermiller/qqwing)
(Copyright © Stephen Ostermiller et les contributeurs de QQWing, GNU General Public License version 2 ou ultérieure) : merci à ses auteurs.

Les éléments graphiques de l'amont ne sont **pas** repris sans vérification de leur licence individuelle.

## Données de test

`test/fixtures/qqwing-*.txt` : les 300 premières lignes de `test/qqwing-simple`, `-easy`, `-intermediate` et `-expert` de l'amont
(puzzles QQWing, difficulté connue), renommés par difficulté (facile, moyen, difficile, très difficile). Même licence que l'amont.
