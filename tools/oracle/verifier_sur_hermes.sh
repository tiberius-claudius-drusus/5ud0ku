#!/bin/sh
# Envoie tools/oracle/mes-jigsaw.tsv à Hermes, fait juger chaque grille par le solveur autonome de Solo (-g), rapatrie la sortie.
# Prérequis : construire_solo.sh déjà exécuté dans /tmp/solo_or sur Hermes.
H="ssh -o BatchMode=yes -o ControlMaster=no hermes"
cd "$(dirname "$0")" || exit 1
cut -f2 mes-jigsaw.tsv | $H 'cd /tmp/solo_or && while read id; do ./solo_solveur -g "$id" 2>&1 | head -1 | sed "s/^[^D]/ERREUR &/"; done' > mes-jigsaw-solo.txt
wc -l mes-jigsaw-solo.txt
