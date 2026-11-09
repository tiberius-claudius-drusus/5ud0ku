/* Harnais à paramètres : comme harness_tatham.c, mais les paramètres viennent d'une chaîne (decode_params depuis les paramètres par défaut).
 * Usage : ./o_<jeu> <nombre de graines> <chaîne de paramètres>   (ex. ./o_net 60 7x7w) ; la graine est la CHAÎNE "1", "2", … */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "puzzles.h"
extern const struct game thegame;
int main(int argc, char **argv) {
    int nb = argc > 1 ? atoi(argv[1]) : 3;
    const char *spec = argc > 2 ? argv[2] : "";
    game_params *p = thegame.default_params();
    thegame.decode_params(p, spec);
    const char *err = thegame.validate_params(p, true);
    if (err) { fprintf(stderr, "%s\n", err); return 2; }
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
