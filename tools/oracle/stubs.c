#include <stdio.h>
#include <stdlib.h>
#include "puzzles.h"
void fatal(const char *fmt, ...) { fprintf(stderr, "fatal\n"); exit(1); }
void frontend_default_colour(frontend *fe, float *out) { out[0]=out[1]=out[2]=0.8f; }
void draw_rect(drawing *dr,int x,int y,int w,int h,int c){}
void draw_line(drawing *dr,int a,int b,int c,int d,int e){}
void draw_circle(drawing *dr,int a,int b,int c,int d,int e){}
void draw_text(drawing *dr,int x,int y,int ft,int fs,int al,int col,const char *t){}
void draw_update(drawing *dr,int x,int y,int w,int h){}
void draw_polygon(drawing *dr,const int *c,int n,int f,int o){}
