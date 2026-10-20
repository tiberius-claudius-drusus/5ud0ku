/*
 * 5ud0ku — registre de thèmes
 * Copyright (C) 2026 Drusus (Gens Claudia). Licence : GPL-3.0-or-later (voir LICENSE.txt).
 *
 * Un THÈME est une famille (« Épuré », « Aurora »…) qui propose des VARIANTES (« clair », « foncé »). Chaque variante =
 * des variables CSS posées sur la page ; aucune couleur n'est écrite en dur dans l'interface. Une variante peut hériter
 * d'une autre (`base: 'clair'` dans la même famille, ou `base: 'epure/clair'`). Principe et familles repris de T-7r4V3x
 * (même auteur) : Épuré, Aurora, Gens Claudia (style de la tuile du portail), 源氏 Uji Minamoto.
 *
 * Variables : --bg --fg --muted --panel --line --line-strong --cell --given (chiffres donnés) --entry (chiffres du
 * joueur) --sel (case choisie) --hl (surlignage) --same (mêmes chiffres) --err --errbg --acc --accfg --test (essai)
 * --pad-note --pad-note-line (pavé jaune) --pad-test --pad-test-line (pavé vert) --shadow --veil --theme-color,
 * et la forme : --btn-radius --board-radius --ui-font --h1-spacing --h2-spacing --h2-transform --bg-image --bf.
 */

export const THEMES = {
  epure: {
    label: 'Épuré',
    variants: {
      clair: {
        label: 'Clair',
        vars: {
          '--bg': '#f5f6f8', '--fg': '#1c1f26', '--muted': '#5f6678', '--panel': '#ffffff', '--line': '#c4c9d4', '--line-strong': '#1c1f26',
          '--cell': '#ffffff', '--given': '#1c1f26', '--entry': '#2456b8', '--sel': '#cfe0ff', '--hl': '#e9eef8', '--same': '#d6ecd8',
          '--err': '#c62828', '--errbg': '#fbe3e3', '--acc': '#2456b8', '--accfg': '#ffffff', '--test': '#1c7a35',
          '--pad-note': '#fff0a8', '--pad-note-line': '#c9a800', '--pad-test': '#d3f0d9', '--pad-test-line': '#2e9e4a',
          '--shadow': '0 1px 3px rgba(0,0,0,.18)', '--veil': 'rgba(0,0,0,.45)', '--theme-color': '#f5f6f8',
          '--btn-radius': '10px', '--board-radius': '6px', '--ui-font': "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
          '--h1-spacing': '.04em', '--h2-spacing': 'normal', '--h2-transform': 'none', '--bg-image': 'none', '--bf': 'none', '--digit-font': 'inherit',
        },
      },
      fonce: {
        label: 'Foncé',
        base: 'clair',
        vars: {
          '--bg': '#16181d', '--fg': '#e6e8ee', '--muted': '#9aa1b3', '--panel': '#20232b', '--line': '#3a3f4d', '--line-strong': '#c9cedb',
          '--cell': '#1d2027', '--given': '#e6e8ee', '--entry': '#7fa6ff', '--sel': '#2c4170', '--hl': '#262b38', '--same': '#27402c',
          '--err': '#ff6b6b', '--errbg': '#4a2326', '--acc': '#7fa6ff', '--accfg': '#10131a', '--test': '#6fe08c',
          '--pad-note': '#4d4210', '--pad-note-line': '#b89b00', '--pad-test': '#1b4026', '--pad-test-line': '#3fae5f',
          '--shadow': '0 1px 3px rgba(0,0,0,.6)', '--theme-color': '#16181d',
        },
      },
    },
  },
  aurora: {
    label: 'Aurora',
    variants: {
      clair: {
        label: 'Clair',
        base: 'epure/clair',
        vars: {
          '--bg': '#e8edfb', '--fg': '#1b2142', '--muted': '#4f5a85', '--panel': 'rgba(255,255,255,.72)', '--line': 'rgba(120,130,190,.38)',
          '--line-strong': '#3b4690', '--cell': 'rgba(255,255,255,.74)', '--given': '#1b2142', '--entry': '#3a4cd0', '--sel': 'rgba(120,140,255,.4)',
          '--hl': 'rgba(120,140,255,.14)', '--same': 'rgba(70,190,140,.3)', '--err': '#c62828', '--errbg': 'rgba(255,120,120,.3)',
          '--acc': '#4659e0', '--accfg': '#ffffff', '--test': '#16743a',
          '--pad-note': 'rgba(255,230,120,.75)', '--pad-note-line': '#c9a800', '--pad-test': 'rgba(160,235,185,.75)', '--pad-test-line': '#2e9e4a',
          '--shadow': '0 4px 18px rgba(80,90,170,.18)', '--veil': 'rgba(60,70,130,.35)', '--theme-color': '#e8edfb',
          '--btn-radius': '16px', '--board-radius': '12px', '--bg-image': 'linear-gradient(135deg,#d6e4ff 0%,#ece3ff 48%,#ffe3ee 100%)',
          '--bf': 'blur(14px) saturate(1.4)',
        },
      },
      fonce: {
        label: 'Foncé',
        base: 'epure/fonce',
        vars: {
          '--bg': '#17142b', '--fg': '#ece9ff', '--muted': '#a29cc9', '--panel': 'rgba(34,30,66,.84)', '--line': 'rgba(255,255,255,.17)',
          '--line-strong': '#b8bfff', '--cell': 'rgba(255,255,255,.09)', '--given': '#ece9ff', '--entry': '#9aa6ff', '--sel': 'rgba(143,156,255,.38)',
          '--hl': 'rgba(143,156,255,.14)', '--same': 'rgba(80,200,150,.26)', '--err': '#ff8080', '--errbg': 'rgba(255,100,100,.26)',
          '--acc': '#8f9cff', '--accfg': '#10131a', '--test': '#6fe08c',
          '--pad-note': 'rgba(120,100,10,.65)', '--pad-note-line': '#d2b000', '--pad-test': 'rgba(30,100,60,.65)', '--pad-test-line': '#3fae5f',
          '--shadow': '0 4px 18px rgba(0,0,0,.35)', '--veil': 'rgba(5,3,20,.6)', '--theme-color': '#17142b',
          '--btn-radius': '16px', '--board-radius': '12px', '--bg-image': 'linear-gradient(135deg,#1a1840 0%,#2a1a4a 50%,#3a1a38 100%)',
          '--bf': 'blur(14px) saturate(1.3)',
        },
      },
    },
  },
  /*
   * Gens Claudia — style de la tuile « Gens Claudia » du portail Inter Gentes : fonds brun-or, filets bronze, Georgia,
   * titres en majuscules espacées. « Parchemin » en est la version claire.
   */
  claudia: {
    label: 'Gens Claudia',
    variants: {
      clair: {
        label: 'Parchemin',
        base: 'epure/clair',
        vars: {
          '--bg': '#f3ead7', '--fg': '#2a1d14', '--muted': '#6a5b46', '--panel': '#fbf5e6', '--line': '#c9b27c', '--line-strong': '#8a7040',
          '--cell': '#fbf5e6', '--given': '#2a1d14', '--entry': '#8a4b12', '--sel': '#f0e2b8', '--hl': '#f5ecd2', '--same': '#e3e8c4',
          '--err': '#a8322d', '--errbg': '#f3d5ce', '--acc': '#7a5a1c', '--accfg': '#fff9ec', '--test': '#2f6f4a',
          '--pad-note': '#f4e3a0', '--pad-note-line': '#b8962c', '--pad-test': '#d5e4c4', '--pad-test-line': '#5d8a4a',
          '--shadow': '0 1px 3px rgba(42,29,20,.35)', '--veil': 'rgba(42,29,20,.45)', '--theme-color': '#f3ead7',
          '--btn-radius': '3px', '--board-radius': '3px', '--ui-font': "Georgia,'Times New Roman',serif", '--digit-font': "'Times New Roman',Times,serif",
          '--h1-spacing': '.12em', '--h2-spacing': '.12em', '--h2-transform': 'uppercase',
        },
      },
      fonce: {
        label: 'Nuit de bronze',
        base: 'claudia/clair',
        vars: {
          '--bg': '#1e1810', '--bg-image': 'linear-gradient(160deg,#1e1810 0%,#2c2218 100%)', '--fg': '#e8d8a0', '--muted': '#b9a273',
          '--panel': '#2c2218', '--line': '#5c4a28', '--line-strong': '#a88a4c', '--cell': '#3a2d18', '--given': '#e8d8a0', '--entry': '#e0b95e',
          '--sel': '#5a4524', '--hl': '#33281a', '--same': '#3a4a2a', '--err': '#ff9078', '--errbg': '#5a2a22', '--acc': '#d8b45c', '--accfg': '#1e1810',
          '--test': '#8fd49a', '--pad-note': '#5c4a1a', '--pad-note-line': '#d8b45c', '--pad-test': '#25402a', '--pad-test-line': '#55a077',
          '--shadow': '0 1px 3px rgba(0,0,0,.7)', '--veil': 'rgba(0,0,0,.6)', '--theme-color': '#1e1810',
        },
      },
    },
  },
  /*
   * Uji Minamoto — style de la tuile « Uji Minamoto » du portail : bleu nuit et indigo, Georgia.
   * « Washi » (papier japonais) en est la version claire.
   */
  minamoto: {
    label: '源氏',
    variants: {
      clair: {
        label: 'Washi',
        base: 'epure/clair',
        vars: {
          '--bg': '#eef1f6', '--fg': '#0c1424', '--muted': '#46557a', '--panel': '#ffffff', '--line': '#b8c4d8', '--line-strong': '#2a3a5c',
          '--cell': '#f7f9fc', '--given': '#0c1424', '--entry': '#2a56b0', '--sel': '#d5e1f5', '--hl': '#e6ecf7', '--same': '#d9ecd9',
          '--err': '#b3261e', '--errbg': '#fbe1df', '--acc': '#2a3a5c', '--accfg': '#ffffff', '--test': '#1b7a4c',
          '--pad-note': '#fdeeb0', '--pad-note-line': '#c0a000', '--pad-test': '#d5eede', '--pad-test-line': '#2e9a66',
          '--shadow': '0 1px 3px rgba(12,20,36,.3)', '--veil': 'rgba(12,20,36,.45)', '--theme-color': '#eef1f6',
          '--btn-radius': '6px', '--board-radius': '6px', '--ui-font': "Georgia,'Times New Roman',serif", '--digit-font': "'Times New Roman',Times,serif", '--h1-spacing': '.04em',
        },
      },
      fonce: {
        label: 'Nuit indigo',
        base: 'minamoto/clair',
        vars: {
          '--bg': '#0d1018', '--bg-image': 'linear-gradient(160deg,#0d1018 0%,#141824 100%)', '--fg': '#b8d0f0', '--muted': '#7a98c4',
          '--panel': '#14203a', '--line': '#2a3a5c', '--line-strong': '#6a8ab8', '--cell': '#0f1730', '--given': '#b8d0f0', '--entry': '#7fa8e8',
          '--sel': '#1c2c52', '--hl': '#131d38', '--same': '#1b3a2c', '--err': '#ff8f8a', '--errbg': '#4a2226', '--acc': '#6f9ad8', '--accfg': '#0d1018',
          '--test': '#6fe0a0', '--pad-note': '#4a4010', '--pad-note-line': '#c0a000', '--pad-test': '#17382a', '--pad-test-line': '#2e9a66',
          '--shadow': '0 1px 3px rgba(0,0,0,.7)', '--veil': 'rgba(0,0,0,.6)', '--theme-color': '#0d1018',
        },
      },
    },
  },
};

export const DEFAULT_FAMILY = 'epure';
export const MODES = ['auto', 'clair', 'fonce'];

/** Variables CSS d'une variante, héritage `base` résolu (protégé contre les boucles). */
export function resolve(family, variant, seen = new Set()) {
  const fam = THEMES[family];
  const v = fam?.variants?.[variant];
  if (!v) return {};
  const key = `${family}/${variant}`;
  if (seen.has(key)) return { ...v.vars };
  seen.add(key);
  let base = {};
  if (v.base) {
    const [bf, bv] = v.base.includes('/') ? v.base.split('/') : [family, v.base];
    base = resolve(bf, bv, seen);
  }
  return { ...base, ...v.vars };
}

/** Choix valides à partir d'un choix éventuellement corrompu (stockage local). */
export function normalize({ family, mode } = {}) {
  return {
    family: THEMES[family] ? family : DEFAULT_FAMILY,
    mode: MODES.includes(mode) ? mode : 'auto',
  };
}

/** Variante (clair/foncé) effective pour un mode donné et la préférence du système. */
export function pickVariant(mode, prefersDark) {
  if (mode === 'clair' || mode === 'fonce') return mode;
  return prefersDark ? 'fonce' : 'clair';
}

/** Pose les variables sur l'élément racine et met à jour la couleur de la barre du navigateur. */
export function apply(choice, prefersDark, root = document.documentElement, doc = document) {
  const { family, mode } = normalize(choice);
  const variant = pickVariant(mode, prefersDark);
  const vars = resolve(family, variant);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = `${family}-${variant}`;
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    if (vars['--theme-color']) meta.setAttribute('content', vars['--theme-color']);
  }
  return { family, variant };
}
