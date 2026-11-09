/* Harnais générique : compile n'importe quel jeu de la collection de Simon Tatham (MIT) avec son VRAI générateur et affiche,
 * pour un préréglage et des graines 1..N, une ligne « jeu <TAB> paramètres <TAB> graine <TAB> description <TAB> aux ».
 * Usage : ./o_<jeu> <nombre de graines> <numéro de préréglage>      (la graine est la CHAÎNE "1", "2", …) */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "puzzles.h"
extern const struct game thegame;
int main(int argc, char **argv) {
    int nb = argc > 1 ? atoi(argv[1]) : 3;
    int preset = argc > 2 ? atoi(argv[2]) : 0;
    char *nom; game_params *p = NULL;
    if (!thegame.fetch_preset(preset, &nom, &p)) return 2;
    char *ps = thegame.encode_params(p, true);
    for (int s = 1; s <= nb; s++) {
        char seed[32]; sprintf(seed, "%d", s);
        random_state *rs = random_new(seed, strlen(seed));
        char *aux = NULL;
        char *desc = thegame.new_desc(p, rs, &aux, false);
        printf("%s\t%s\t%d\t%s\t%s\n", thegame.name, ps, s, desc, aux ? aux : "");
        random_free(rs);
    }
    return 0;
}
