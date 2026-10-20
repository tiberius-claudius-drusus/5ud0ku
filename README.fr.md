[English](README.md) · **Français**

# 5ud0ku

**5ud0ku** (« Sudoku » en l33t) est un portage JavaScript de **GNOME Sudoku** sous forme d'application web progressive (PWA), jouable sur mobile et sur ordinateur.

**Jouer : <https://tiberius-claudius-drusus.github.io/5ud0ku/>** (installable sur mobile et sur ordinateur, fonctionne hors ligne).

> Portage conçu, écrit et testé par **Drusus**, agent de la Gens Claudia, sous la supervision de l'Auctor. Voir « Crédits » ci-dessous.

## Origine et licence

5ud0ku est un portage de [GNOME Sudoku](https://gitlab.gnome.org/GNOME/gnome-sudoku) (Copyright © Johan Gay 2024–2026 et les contributeurs de GNOME Sudoku), publié sous la **Licence Publique Générale GNU, version 3 ou ultérieure**.
Le portage est distribué sous la même licence : voir `LICENSE.txt`. Détail de l'origine (commit amont, mention à conserver en tête de chaque fichier dérivé) : `NOTICE.md`.

Le générateur et le solveur sont un portage fidèle de ceux de l'amont (eux-mêmes issus de [QQWing](https://github.com/stephenostermiller/qqwing)) : mêmes techniques de résolution dans le même ordre, donc la même classification de difficulté (Facile, Moyen, Difficile, Très difficile). 1 200 grilles de référence issues des données de test de l'amont le vérifient (`test/fixtures/`).

## Crédits

**Drusus est l'auteur de ce portage.** Drusus est un *Legatus* de la Gens Claudia, c'est-à-dire un agent d'intelligence artificielle qui travaille sur sa propre machine et avec sa propre mémoire, pour un opérateur humain. Le portage est entièrement son œuvre :

- le générateur, le solveur et la logique de jeu (`src/generator.js`, `src/board.js`, `src/game.js`), portage du code Rust de l'amont ;
- l'interface : grille 9×9, pavé de saisie 3×3, tactile et clavier, accessibilité, page d'accueil et bandeau de partie sur le modèle de 1-5731N ;
- les **trois modes de saisie** : normal (pavé bleu), notes (pavé jaune, les chiffres déjà notés dans la case en négatif) et **essai** (pavé vert : seuls les chiffres notés y figurent ; celui qu'on touche apparaît en vert sur la grille, notes conservées) ;
- quatre familles de thèmes, clairs et foncés (Épuré, Aurora, Gens Claudia, 源氏 Uji Minamoto) ;
- l'application web installable et son fonctionnement hors ligne (`sw.js`, manifeste) ;
- les 20 langues de l'interface ;
- les codes de grille, la grille du jour et les statistiques (`src/code.js`, `src/stats.js`) ;
- les tests unitaires et le banc d'essai de bout en bout dans Chrome (`tools/e2e-chrome.mjs`).

Autres contributions :

- **L'Auctor** a supervisé le projet.
- **Claudius**, Primus inter Pares de la Gens Claudia, publie ce dépôt sur GitHub.
- **Les auteurs de GNOME Sudoku**, dont le jeu est l'origine de ce portage. Voir `NOTICE.md`.

Les traductions ont été écrites par Drusus. Aucune n'a encore été relue par un locuteur natif, en particulier l'arabe, l'hindi et le latin : les corrections sont les bienvenues.

## But du jeu

Remplir la grille de 9×9 pour que chaque ligne, chaque colonne et chaque bloc de 3×3 contiennent une seule fois les chiffres de 1 à 9.

## Fonctions

- **Quatre difficultés**, avec le meilleur temps de chacune.
- **Page d'accueil** : Nouvelle partie, Continuer, Options, Statistiques, Aide. La partie en cours est enregistrée à chaque coup et retrouvée à la réouverture.
- **Notes et mode essai** (une grille pleine qui contient encore une valeur d'essai ne gagne qu'une fois toutes les valeurs d'essai confirmées), annuler et rétablir, effacer, chronomètre avec pause, avertissements (doublons, erreurs par rapport à la solution, notes impossibles), surlignage de la ligne, de la colonne, du bloc et des mêmes chiffres, effacement automatique des notes liées.
- **Code de grille** `0112-9A05-6GPM` : chaque partie a un code, affiché dans le bandeau de partie (un toucher le copie). Il contient la version, la difficulté, une graine et deux symboles de contrôle ; le saisir (Nouvelle partie › Saisir une grille) rejoue exactement la même grille. Le format et la règle « un code ne change jamais de grille » sont dans `src/code.js` ; `test/code.test.js` fige des grilles de référence et vérifie toute faute d'un symbole et tout échange de deux symboles voisins.
- **Partage** avec le code `#…` de GNOME Sudoku (même format, repris du code de l'amont ; pas encore croisé avec l'application GTK) ou avec 81 caractères.
- **Grille du jour** : tirée de la date locale et de la difficulté, la même pour tous ; elle change à minuit.
- **Statistiques** : grilles gagnées et commencées, meilleur temps et temps moyen par difficulté, dernières grilles avec leur code.
- **20 langues** : l'arabe s'écrit de droite à gauche.

## État

Version 1.0.0 : logique de jeu testée, interface avec thèmes et 20 langues, PWA installable qui fonctionne hors ligne, codes de grille, grille du jour et statistiques. Voir `CHANGELOG.md`.

## Développement

Aucune étape de construction : les modules sont des modules ES natifs.

```
npm test            # tests unitaires (node --test), sans navigateur
npm run e2e         # banc d'essai de bout en bout dans Chrome (voir ci-dessous)
```

`npm run e2e` (`tools/e2e-chrome.mjs`) pilote un Chrome sans interface par DevTools : il sert le dépôt sur un port libre et joue les vrais gestes et le clavier, la pause, les sauvegardes et la reprise d'une partie, les thèmes et les langues, la mise en page de l'accueil et du bandeau de partie, et une partie complète jusqu'à la victoire. Il demande Chrome (variable d'environnement `CHROME` si l'exécutable n'est pas à un emplacement usuel), ne modifie aucun fichier du dépôt et accepte `--shots dossier` pour enregistrer des captures d'écran. Il n'est pas déployé (hors de `FILES` du service worker).

`tools/make-icons.py` régénère les icônes (Pillow).

## Sources et licence

Licence GPL-3.0-or-later : `LICENSE.txt`. Origine du code et mention à conserver : `NOTICE.md`.
