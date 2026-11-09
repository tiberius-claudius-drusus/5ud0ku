# Changelog — 5ud0ku

Format : une entrée par version, la plus récente en premier.

## [2.2.1] - 2026-11-09

Corrections de l'audit de Claudius (Opus) sur la 2.2.0 :
- **M1** : « Recommencer » une grille 16×16 terminée, reprise d'une sauvegarde, régénérait la grille sur le fil principal (jusqu'à 10 s en Jigsaw 16×16, page figée). La grille, sa solution et ses régions étant déjà là, on recrée la partie sans rien calculer (`restartFinished`) : instantané pour les cinq types, même code.
- **M2** : saisie d'un code 16×16 ou Jigsaw 16×16 : le bouton « Commencer » devient « Génération… » et « Commencer » comme « Fermer » sont inactifs pendant le calcul (plus de second calcul sur un second appui).
- **F1** : l'écran maintenu allumé ne demande plus le verrou deux fois quand deux affichages se suivent (le premier verrou n'était jamais relâché) ; un verrou obtenu après l'arrêt de la partie est rendu aussitôt.
- **F2** : l'aide décrit le 4×4, le 16×16 (clavier 0-9 et A-F, Retour arrière pour effacer) et le type puzzle (Jigsaw), dans les 20 langues.
- **F3** : commentaires d'en-tête remis à jour.
- **F4** : lancer un 4×4 n'efface plus le choix de difficulté des autres types.
- **F5** : le contrôle « partie sans défilement à la taille par défaut du banc » fixe sa taille (500×800) : la hauteur utile d'une fenêtre « 430×860 » dépend du navigateur.
- **F7** : un échec de génération (très improbable) affiche « Impossible de générer la grille. Réessayez. » au lieu d'un retour muet à l'accueil.
- **F8** : espagnol : tutoiement partout.
Non traités : F6 (16×16 sur téléphone : accepté tel quel par Philippe). 176 tests unitaires, banc Chrome 212 contrôles.

## [2.2.0] - 2026-11-09

**Nouveau : grille 4×4** (demande de Philippe), pour les débutants et les enfants. « Taille » propose maintenant 4×4, 9×9 et 16×16 sur une seule ligne. Blocs de 2×2, chiffres 1 à 4, **une seule difficulté** (facile, 7 indices ou plus : aucun niveau à choisir, un seul meilleur temps), classique seulement (le choix « puzzle » est grisé). Grosses cases, pavé de 4 touches en 2×2, notes en 2×2. Code de grille de type 4 (« 411… »), grille du jour, sauvegarde `size: 4`, statistiques à part. Contrôlé contre le solveur de Solo (Simon Tatham, MIT) : 60 de nos grilles 4×4 jugées à solution unique. 175 tests unitaires, banc Chrome 209 contrôles.

## [2.1.1] - 2026-11-09

**Codes de grille uniformes** (demande de Philippe). Le premier symbole du code indique maintenant le type de grille (0 classique 9×9, 1 puzzle 9×9, 2 classique 16×16, 3 puzzle 16×16), le deuxième la version de l'algorithme, et la difficulté vaut toujours 1 à 4 quel que soit le type (avant : 5 à 8, 9 à 12, 13 à 16 selon le type). Les codes classiques existants (« 01… ») sont déjà dans ce format et ne changent pas. Les codes des versions 1.1 à 2.1.0 pour les autres types restent valables et désignent la même grille ; seuls les nouveaux codes sont affichés au format uniforme, et une partie déjà jouée sous un ancien code garde son meilleur temps de la grille du jour. Tests : un test fige la correspondance ancien code / nouveau code pour les grilles de référence Jigsaw et 16×16.

## [2.1.0] - 2026-11-09

**Nouveau : Jigsaw 16×16** (demande de Philippe) et **« Nouvelle partie » refaite** : deux lignes de choix, chacune sur une seule ligne, **Taille** (9×9, 16×16) et **Type** (classique, puzzle ; « Jigsaw » dans les autres langues que le français). Le puzzle 16×16 a seize régions connexes de seize cases de formes irrégulières, chiffres 0 à 9 puis A à F, mêmes quatre niveaux et même solveur à techniques que les autres modes, solution toujours unique. Codes de grille (symbole de difficulté 13 à 16, version d'algorithme propre : les trois autres modes gardent leur sens), grille du jour, sauvegarde (`size: 16` et `regions` en 256 chiffres hexadécimaux), statistiques et meilleurs temps séparés pour chacun des quatre types de grille. La génération construit des régions au hasard (≈ 38 % des cases hors de leur bloc) et ne garde que celles qui ont une grille complète (environ une sur dix) : 1 à 3 s sur un ordinateur, dans un Web Worker. Contrôle contre le solveur de Solo (Simon Tatham, MIT) : 24 de nos grilles Jigsaw 16×16 jugées à solution unique (le générateur de Solo ne sait pas en produire en 16×16). 165 tests unitaires, banc Chrome 195 contrôles.

## [2.0.0] - 2026-11-09

**Nouveau : grille 16×16** (demande de Philippe). « Nouvelle partie » propose un troisième type de grille, **16×16** : blocs de 4×4, chiffres **0 à 9 puis A à F** (pavé de 16 touches en 4×4, clavier 0-9 et A-F, notes en 4×4 dans chaque case). Quatre niveaux (Facile à Très difficile) mesurés par le même solveur à techniques que Jigsaw, solution toujours unique ; génération par un Web Worker (le niveau 4 prend ~1 s sur un ordinateur) avec repli sur le fil principal. Codes de grille à 12 symboles (symbole de difficulté 9 à 12, version d'algorithme propre : les codes classiques et Jigsaw gardent leur sens), grille du jour 16×16, sauvegarde avec `size: 16` (une sauvegarde classique ne change pas), statistiques et meilleurs temps séparés par type de grille. Le partage « # » de l'amont reste classique seulement. Textes dans les 20 langues. Contrôlé contre le vrai code de Solo (Simon Tatham, MIT), préréglages 4x4 : 120 grilles de son générateur résolues par notre solveur avec sa solution, 40 de nos grilles jugées à solution unique par son solveur. 157 tests unitaires, banc Chrome étendu (186 contrôles).

## [1.1.4] - 2026-11-09

L'espace autour de la barre d'outils **s'adapte à la hauteur de l'écran** (demande de Philippe) : 4 px jusqu'à 700 px de hauteur, puis 1 px de plus par 20 px, plafonné à 16 px (7 px à 765 px, 12 px à 860 px). Variable CSS `--air`, utilisée aussi dans le calcul de la taille du plateau. Banc Chrome : 164 contrôles sans échec.

## [1.1.3] - 2026-11-09

Plus d'air autour de la barre d'outils (Annuler, Rétablir, Notes, Essai, Effacer) : 7 px de plus au-dessus et en dessous (demande de Philippe). Le plateau rétrécit d'autant sur les écrans courts pour que le pavé reste entièrement visible sans défilement.

## [1.1.2] - 2026-11-09

**Plein écran** (demande de Philippe) : une touche dans le bandeau de la partie (à gauche de la pause) passe en plein écran et en sort ; nouvelle option « Démarrer en plein écran », **cochée par défaut** : l'application passe en plein écran au premier appui ou à la première touche de la session (le navigateur l'exige après un geste), une seule fois par chargement. Touche et option sont absentes quand le navigateur n'a pas de plein écran (iPhone). Textes dans les 20 langues.

**Correction** : le bouton « Quitter » de l'accueil (1.0.2) n'avait aucun texte (la clé existait dans les 20 langues mais n'était pas appliquée). Le banc Chrome, qui le signalait sans qu'on l'ait vu, est remis d'aplomb : plus aucun échec (164 contrôles).

## [1.1.1] - 2026-11-09

**Écran qui reste allumé en partie** (demande de Philippe) : tant qu'une partie court (ni en pause, ni terminée, page visible), l'application demande le verrou d'éveil de l'écran (Screen Wake Lock) ; l'économiseur d'écran ne coupe plus la partie. Le verrou est rendu à la pause, à la victoire, au retour à l'accueil et quand la page est cachée (le navigateur le retire de lui-même), puis redemandé à la reprise. Sans effet si le navigateur ne le propose pas.

**Mode paysage refait** (demande de Philippe) : quand l'écran est plus large que haut, le plateau occupe un côté et, de l'autre, le bandeau (menu, temps, pause), les outils et le pavé de saisie, sans défilement, du téléphone couché (667×375) à l'ordinateur. Le portrait ne change pas. Banc Chrome : nouvelle section « Paysage » (quatre tailles).

## [1.1.0] - 2026-11-08

**Nouveau : mode Jigsaw** (demande de Philippe). Le choix « Type de grille » de « Nouvelle partie » propose, en plus du classique, des grilles dont les neuf régions ont des formes irrégulières (d'un seul tenant, neuf cases chacune) à la place des carrés de 3×3. Quatre niveaux (Facile, Moyen, Difficile, Très difficile) mesurés par un solveur à techniques ; solution toujours unique. Codes de grille à 12 symboles (difficulté 5 à 8 pour Jigsaw, version d'algorithme propre : un code classique garde son sens), grille du jour Jigsaw, statistiques et meilleurs temps par mode, sauvegarde avec les régions (une sauvegarde classique ne change pas). Le partage « # » de l'amont reste classique seulement. Textes dans les 20 langues. Contrôlé contre le vrai code de Solo (Simon Tatham, MIT) : 240 grilles Jigsaw de son générateur résolues par notre solveur avec sa solution, et 48 de nos grilles jugées à solution unique par son solveur. 147 tests unitaires, banc Chrome étendu.

## [1.0.2] - 2026-10-26

Bouton **Quitter** sur l’accueil (demande de Philippe, comme dans Harena) : enregistre la partie puis tente de fermer la fenêtre ; sinon, un message indique d’utiliser le bouton Accueil ou Retour du téléphone.

## [1.0.1] - 2026-10-20

**Correction : une rangée de la grille s'affichait à moitié de hauteur sur téléphone** (signalé par l'Auctor sur la 1.0.0 publiée, cause trouvée et correctif proposé par Claudius). `#board` définissait les 9 colonnes mais pas les rangées : celles-ci, implicites, étaient dimensionnées par leur contenu et l'une ou l'autre s'écrasait selon les chiffres et les notes (mesuré à 390×844 : 13 45 47 45 45 47 45 45 13 px). Les rangées et les colonnes sont maintenant `repeat(9, minmax(0, 1fr))` (le `0` empêche une case au contenu plus haut, comme les notes en 3×3, d'agrandir sa piste). Le banc Chrome vérifie les 9 rangées et les 9 colonnes de même taille à ±1 px sur trois tailles de téléphone, avec des notes dans plusieurs rangées. 113 tests unitaires, banc Chrome étendu.

## [1.0.0] - 2026-10-20

**Première version publique** (décision de l'Auctor : 1.0.0 au premier envoi sur GitHub, comme pour T-7r4V3x). Cette version n'ayant jamais été publiée, elle a reçu avant son premier envoi les corrections d'un **audit de code de Claudius** (sous Opus), sans changer de numéro. **Grave** : une partie gagnée pouvait être rouverte (Ctrl+Z, Annuler resté actif, Pause puis Reprendre, Recommencer) et sa victoire comptée deux fois ; `SudokuGame` a maintenant un état `finished`, posé une fois, qui fige le temps final et refuse toute action ensuite (la fin de partie n'est plus représentée par `paused`) ; « Recommencer » sur une grille terminée ouvre une nouvelle partie de la même grille. **Moyens** : un lien « Code source » vers le dépôt et un lien « Licence » dans « À propos » (le seul lien menait à la licence) ; une sauvegarde illisible ne laisse plus un bouton « Continuer » inerte (elle est mise de côté sous `5ud0ku:savefile.illisible`, avec un message) ; l'erreur d'une case est dite au lecteur d'écran (nouvelles clés `game.cell.error` et `game.cell.notes.error`). **Faibles** : une grille saisie entièrement remplie est refusée proprement ; Ctrl+Z, Ctrl+Y, N et T n'agissent plus sous l'écran de pause ; politique de sécurité du contenu dans `index.html` (le banc vérifie qu'aucune violation n'est levée) ; texte des boutons inséré sans interprétation HTML ; chemin de la machine de l'auteur retiré de `NOTICE.md`, remerciement à QQWing ajouté ; « Rationes » au lieu de « Numeri » pour les statistiques en latin. **Décisions de l'Auctor** sur les trois points laissés ouverts par l'audit : le chronomètre continue de courir sous les menus (inchangé) ; « Recommencer » remet la grille à l'état initial et **le chronomètre repart de zéro** (y compris le temps d'une partie reprise) ; **une valeur d'essai ne fait pas gagner** : une grille pleine et juste n'est terminée que lorsque toutes les valeurs d'essai ont été confirmées. La génération des grilles est jugée assez rapide sur son téléphone, y compris en « Très difficile » : pas de Worker. **Relecture de Claudius (R1)** : « Recommencer » puis « Annuler » remettait le chronomètre à zéro en gardant la grille (une victoire pouvait être enregistrée en 5 s au lieu de 605 s) ; le temps voyage maintenant avec l'action dans la pile (Annuler le rend, Rétablir le remet à zéro). 113 tests unitaires, 134 contrôles Chrome. Récapitulatif de ce que contient cette version : génération et résolution fidèles à GNOME Sudoku (1 200 grilles de référence), quatre difficultés, pavé 3×3 avec modes normal, notes et essai, annuler et rétablir, chronomètre et pause, avertissements et surlignages, quatre familles de thèmes, vingt langues, codes de grille, grille du jour, statistiques, partage par code, reprise de la partie, application installable et hors ligne.

## [0.10.3] - 2026-10-20

**Correction : la partie n'était pas retrouvée en rouvrant l'application** (signalé par l'Auctor : « les autres, tu retrouves ta partie »). Deux causes, toutes deux dans `session.saveGame()`. (1) **Fermer l'application depuis la page d'accueil sans toucher « Continuer » supprimait la sauvegarde** : à la fermeture (`pagehide`, `visibilitychange`), l'application appelait `saveGame()` alors qu'aucune partie n'était en mémoire (elle n'est chargée qu'au toucher de « Continuer »), et `saveGame()` effaçait alors la sauvegarde existante. Ouvrir l'application, la refermer, puis la rouvrir faisait donc perdre la partie. Désormais, sans partie en mémoire, `saveGame()` ne touche à rien. (2) **Une grille intacte n'était pas enregistrée** (comme dans GNOME Sudoku) : on la retrouve maintenant même sans avoir joué un coup, dès sa création ; elle n'est supprimée qu'une fois terminée. En plus, le temps joué est enregistré toutes les 10 secondes et au retour à l'accueil. Tests : le scénario exact (trois ouvertures successives sans « Continuer ») échoue sur l'ancien code et passe ; le banc Chrome ferme et rouvre deux fois depuis l'accueil. 106 tests unitaires, 116 contrôles Chrome.

## [0.10.2] - 2026-10-20

Demande de l'Auctor : **page d'accueil calquée sur celle de 1-5731N** (relevée sur l'application 1-5731N, en lecture seule). Colonne centrée verticalement par les marges automatiques du logo et du pied de page ; logo de 21 % de la hauteur (96 à 200 px) ; titre de 2,6 rem en couleur d'accent ; menu large de `min(78vw, 300px)` ; cinq boutons identiques (1,15 rem, 12 px de marge intérieure, 12 px entre eux, une seule ligne chacun, plus de couleur ni de sous-texte sur « Continuer ») ; en bas **deux lignes d'information**, la version et la licence puis « Inspiré de *GNOME Sudoku*, de Johan Gay et de ses contributeurs » (nouvelle clé `foot.inspired`, 20 langues), en 0,72 rem, centrées, avec 10 px de marge basse. Le banc Chrome mesure ces proportions : largeurs, centrage, hauteurs, écarts, tailles de police, centrage vertical du bloc, position des deux lignes.

## [0.10.1] - 2026-10-20

Demande de l'Auctor : **même bandeau de partie que 1-5731N**. Menu à gauche ; puis le temps en couleur d'accent, gras, avec le code de la grille et la difficulté en petit dessous (trois lignes empilées dans la hauteur d'un bouton, le bandeau ne grandit pas) ; un espace ; la pause à droite. Plus de titre « 5ud0ku » dans la partie (il reste sur l'accueil). **Le chronomètre n'est plus une option** : toujours affiché, la case « Afficher le chronomètre » disparaît des 20 langues, la préférence `showTimer` aussi ; la sauvegarde garde toujours le temps ; « Continuer » affiche toujours le temps. Marge de hauteur du plateau relevée de 14 px (la page défilait de 11 px à 500×765). Le banc Chrome vérifie l'ordre et la position des éléments du bandeau, son empilement, qu'il n'y a pas de titre ni d'option de chronomètre, et l'absence de défilement à la taille par défaut. 105 tests unitaires, 102 contrôles Chrome.

## [0.10.0] - 2026-10-20

**Vingt langues** (les mêmes que T-7r4V3x et 1-5731N) : français, anglais, espagnol, allemand, italien, portugais (Portugal et Brésil), russe, arabe (écriture de droite à gauche), chinois, coréen, japonais, hindi, turc, néerlandais, polonais, ukrainien, indonésien, vietnamien et latin. Le français et l'anglais sont intégrés ; les 18 autres sont des fichiers `src/lang/<code>.js` chargés à la demande et mis en cache pour le hors-ligne. Option « Langue » (automatique d'après le navigateur, ou un choix), appliquée aussitôt, avec le sens d'écriture de la page. Les traductions sont de ma main, **sans relecture par des locuteurs natifs** (indiqué en tête de chaque fichier). Tests : chaque langue a exactement les clés et les paramètres `{nom}` du français, aucun texte vide, le registre est complet, le choix de la langue du navigateur (pt vers pt-pt, repli sur l'anglais) et le repli de `t()` sont vérifiés. Nettoyage : trois textes inutilisés retirés (`app.tagline`, `menu.new`, `code.is`).

## [0.9.2] - 2026-10-20

Demande de l'Auctor : « le numéro de grille dans le titre, sinon la grille est coupée ». Le code de la grille passe dans la **barre de titre**, à droite de « 5ud0ku » (un toucher le copie toujours), ce qui libère une ligne sous le pavé. Surtout, la hauteur disponible est maintenant calculée avec `dvh` (hauteur réellement visible) au lieu de `vh` : sur téléphone, `vh` inclut la barre d'adresse et faisait déborder le pavé sous l'écran. Le banc Chrome vérifie désormais qu'en partie il n'y a **aucun défilement** et que le pavé est entièrement visible à 430×860, 390×760 et 360×640.

## [0.9.1] - 2026-10-20

Page d'accueil allégée (demande de l'Auctor : « un peu chargée ») : le logo, le titre, cinq boutons, **Nouvelle partie, Continuer** (avec sa difficulté et son temps en petit, seulement s'il y a une partie), **Options, Statistiques, Aide**, et le pied de page. La difficulté, la grille du jour et la saisie d'un code passent dans la boîte « Nouvelle partie » ; « À propos » passe dans l'Aide (et reste dans le menu de la partie). Plus d'accroche ni de liens en rangée.

## [0.9.0] - 2026-10-20

**Page d'accueil** (demande de l'Auctor) : l'application s'ouvre sur un écran d'accueil au lieu de tomber sur une boîte de dialogue : logo (une grille de sudoku aux couleurs du thème, `src/logo.js`), titre, accroche, **Continuer la partie** (avec sa difficulté et son temps) quand une partie existe, choix de la difficulté avec le meilleur temps, **Nouvelle partie**, **Grille du jour** (et si elle est déjà gagnée), puis Saisir une grille, Statistiques, Options, Aide, À propos, et le pied de page « v0.9.0 - développé par Drusus - date - GPL3+ » (lien vers la licence). Le menu de la partie gagne « Accueil » (la partie est mise en pause, puis reprise par « Continuer ») ; la boîte « Nouvelle partie » disparaît, l'accueil la remplace. Le chronomètre est arrêté pendant qu'on est à l'accueil. `session.savedInfo()` lit la sauvegarde sans la charger. 78 tests unitaires.

## [0.8.0] - 2026-10-20

Codes de grille, grille du jour, statistiques (reprise de T-7r4V3x et 1-5731N). **Code de grille** (`src/code.js`) : 12 symboles Crockford « 0112-9A05-6GPM » = version, difficulté, graine 32 bits, deux symboles de contrôle (toute faute d'un symbole et tout échange de deux voisins distincts est détecté, testé exhaustivement) ; le même code redonne toujours la même grille (règle d'or : grilles de référence figées par les tests, version 1). Le code s'affiche sous la barre d'outils (un toucher le copie), se partage avec le code « # » compatible GNOME Sudoku, s'accepte dans « Saisir une grille » et survit à la sauvegarde. **Grille du jour** : même grille pour tous, par date locale et difficulté (graine FNV-1a de la date) ; le dialogue « Nouvelle partie » la propose et rappelle si elle est déjà gagnée. **Statistiques** (`src/stats.js`) : parties commencées et gagnées, meilleur temps et temps moyen par difficulté, dernières parties avec leur code copiable, effacement. 75 tests unitaires.

## [0.7.0] - 2026-10-20

Thèmes : quatre familles reprises de T-7r4V3x, chacune en clair et en foncé : **Épuré**, **Aurora** (verre dépoli et dégradés), **Gens Claudia** (Parchemin et Nuit de bronze, Georgia, titres en capitales espacées) et **源氏 Uji Minamoto** (Washi et Nuit indigo). Options : « Thème » et « Apparence » (selon le système, clair, foncé), sauvegardés avec les autres préférences. Aucune couleur n'est écrite en dur dans l'interface : tout vient de `src/themes.js` (variables CSS posées au démarrage, sans clignotement grâce aux valeurs par défaut de la page). Tests : toutes les variantes définissent les mêmes variables, contraste WCAG AA (4,5) des textes essentiels pour les couleurs opaques, chiffre d'essai distinct du chiffre du joueur et des chiffres donnés.

## [0.6.0] - 2026-10-20

Demande de l'Auctor : le pavé de saisie devient un **carré de 3×3 touches**, avec trois modes. **Normal** : pavé bleu. **Notes** : le pavé passe en jaune et les chiffres déjà notés dans la case sélectionnée sont en négatif. **Essai** (nouveau, touche T) : le pavé passe en vert, seuls les chiffres notés dans la case y figurent, et celui qu'on touche apparaît en vert sur la grille, notes conservées ; le toucher de nouveau retire l'essai, le même chiffre au pavé bleu le confirme (la case devient ordinaire, ses notes sont effacées). Une valeur d'essai est annulable, sauvegardée, retirée par « Effacer » et par « Recommencer ». Moteur : drapeau `test` par case (`board.js`), `insertTest` et `confirmTest` (`game.js`), `mode`, `testValue` (`session.js`). Disposition : sur grand écran en largeur, le pavé passe à côté de la grille. 50 tests unitaires.

## [0.5.0] - 2026-10-20

Jalon 3 (interface) : première version jouable. Grille de 9×9 cases (toucher et clavier : flèches, 1 à 9, Suppr, N pour les notes, P pour la pause, Ctrl+Z / Ctrl+Y), pavé de chiffres, notes, annuler/rétablir, effacer, chronomètre avec pause, quatre difficultés avec leurs meilleurs temps, partage et saisie d'une grille par code « # » ou par 81 caractères, options (avertissements, surlignages, notes automatiques, taille des chiffres), aide, à propos. Thème clair ou foncé selon le système. Français et anglais. Application installable et hors ligne (`sw.js`, manifeste, icônes générées par `tools/make-icons.py`). Tests de cohérence PWA et de version (45 en tout).

## [0.4.0] - 2026-10-20

Fin du moteur : `src/session.js` (portage de `backend.rs` et `data.rs`) : préférences et valeurs par défaut du schéma de l'amont, meilleurs temps par difficulté (jamais dégradés), sauvegarde et reprise de la partie dans le stockage du navigateur (qui peut manquer ou lever une exception : la session fonctionne alors sans mémoire), gardes des gestes (cases données intouchables, notes seulement sur case vide), nettoyage automatique des notes, toutes les possibilités notées au départ, démarrage depuis un code « # » ou une chaîne, avertissements (conflit, écart avec la solution, notes impossibles) et surlignage selon les préférences. 13 tests de plus (38 en tout). Le moteur est complet ; reste l'interface.

## [0.3.0] - 2026-10-20

Jalon 2 (moteur, suite) : `src/board.js` (plateau : valeurs, notes, conflits, formats de chaîne, de partage « # » et de sauvegarde JSON de l'amont) et `src/game.js` (partie : annuler/refaire, notes, nettoyage des notes alignées, réinitialisation, minuteur avec pause, ordre de jeu, événements). Écarts voulus avec l'amont, documentés en tête de fichier : conflits recalculés autour de chaque changement (l'amont peut laisser un conflit résiduel), `canUndo` exact, ordre de jeu complété pour une partie chargée, sauvegarde à 0 seconde acceptée, « 0 » lu comme case vide. 17 tests de plus (25 en tout).

## [0.2.0] - 2026-10-20

Jalon 1 (moteur) : `src/generator.js`, portage fidèle du générateur et du solveur de l'amont (`board_generator.rs`, lui-même issu de QQWing) : mêmes techniques de résolution dans le même ordre, donc la même classification de difficulté. Graine de 32 bits (un numéro, un puzzle). Tests : les 1200 puzzles de référence QQWing de l'amont ont tous une solution unique et la difficulté attendue ; unicité, validité, déterminisme par graine.

## [0.1.0] - 2026-10-20

Départ du projet : dépôt, licence GPL-3.0-or-later, `NOTICE.md` (origine : GNOME Sudoku `cc27ff0c`). Aucun code encore.
