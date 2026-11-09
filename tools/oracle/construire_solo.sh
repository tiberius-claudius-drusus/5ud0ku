#!/bin/sh
# Compile le VRAI générateur de Solo (Simon Tatham, MIT) et son solveur autonome ; écrit parties-solo-jigsaw.tsv.
# Usage : construire_solo.sh <dossier puzzles>   (préréglages 11 « 9 Jigsaw Basic » et 13 « 9 Jigsaw Advanced », graines 1 à 120)
# Sorties : ./o_solo (générateur, harnais), ./solo_solveur (solveur autonome, option -g : note de difficulté ET détection d'ambiguïté).
U="$1"; ICI="$(cd "$(dirname "$0")" && pwd)"
LIBS="$U/random.c $U/tree234.c $U/malloc.c $U/misc.c $U/dsf.c $U/sort.c $U/findloop.c $U/latin.c $U/matching.c $U/combi.c $U/divvy.c"
gcc -O1 -w -DHAVE_STDINT_H=1 -I"$U" -o o_solo "$ICI/harness_tatham.c" "$ICI/stubs.c" "$U/solo.c" $LIBS -lm -no-pie -Wl,--unresolved-symbols=ignore-all || exit 1
gcc -O1 -w -DHAVE_STDINT_H=1 -DSTANDALONE_SOLVER -I"$U" -o solo_solveur "$U/solo.c" $LIBS -lm -no-pie -Wl,--unresolved-symbols=ignore-all || echo "solveur autonome : échec de compilation"
: > parties-solo-jigsaw.tsv
for p in 11 13; do timeout 600 ./o_solo 120 $p >> parties-solo-jigsaw.tsv 2>/dev/null; done
echo "$(wc -l < parties-solo-jigsaw.tsv) parties"
