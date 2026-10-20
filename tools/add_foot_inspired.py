#!/usr/bin/env python3
"""add_foot_inspired.py — ajoute la clé « foot.inspired » (2e ligne du pied de page) à tous les dictionnaires.

Opération ponctuelle (v0.10.2) gardée pour mémoire : idempotente, n'ajoute la clé que si elle est absente.
Usage : python tools/add_foot_inspired.py   (depuis la racine du dépôt)
"""
from pathlib import Path

TEXTS = {
    "fr": "Inspiré de {name}, de Johan Gay et de ses contributeurs",
    "en": "Inspired by {name} by Johan Gay and contributors",
    "es": "Inspirado en {name}, de Johan Gay y colaboradores",
    "de": "Inspiriert von {name} von Johan Gay und Mitwirkenden",
    "it": "Ispirato a {name} di Johan Gay e collaboratori",
    "pt-pt": "Inspirado em {name}, de Johan Gay e colaboradores",
    "pt-br": "Inspirado em {name}, de Johan Gay e colaboradores",
    "ru": "По мотивам {name} Johan Gay и участников проекта",
    "ar": "مستوحى من {name} لـ Johan Gay والمساهمين",
    "zh": "灵感来自 Johan Gay 及贡献者的 {name}",
    "ko": "Johan Gay와 기여자들의 {name}에서 영감을 받음",
    "ja": "Johan Gay と貢献者による {name} にインスパイア",
    "hi": "Johan Gay और योगदानकर्ताओं के {name} से प्रेरित",
    "tr": "Johan Gay ve katkıda bulunanların {name} uygulamasından esinlenmiştir",
    "nl": "Geïnspireerd door {name} van Johan Gay en medewerkers",
    "pl": "Zainspirowane grą {name} autorstwa Johana Gaya i współtwórców",
    "uk": "За мотивами {name} від Johan Gay та учасників проєкту",
    "id": "Terinspirasi dari {name} oleh Johan Gay dan kontributor",
    "vi": "Lấy cảm hứng từ {name} của Johan Gay và những người đóng góp",
    "la": "Ex {name} a Johan Gay et collaboratoribus inspiratum",
}

root = Path(__file__).resolve().parent.parent

for code, text in TEXTS.items():
    if code in ("fr", "en"):
        path = root / "src" / "strings.js"
        s = path.read_text(encoding="utf-8")
        marker = "  'home.foot':"
        # le français et l'anglais sont dans le même fichier : on cible le bloc de la langue
        block_start = s.index("export const FR = {") if code == "fr" else s.index("export const EN = {")
        at = s.index(marker, block_start)
        end = s.index("\n", at) + 1
        block_end = s.index("};", block_start)
        if "'foot.inspired'" in s[block_start:block_end]:
            continue
        s = s[:end] + "  'foot.inspired': '" + text + "',\n" + s[end:]
        path.write_text(s, encoding="utf-8")
    else:
        path = root / "src" / "lang" / (code + ".js")
        s = path.read_text(encoding="utf-8")
        if '"foot.inspired"' in s:
            continue
        marker = '  "home.foot":'
        at = s.index(marker)
        end = s.index("\n", at) + 1
        s = s[:end] + '  "foot.inspired": "' + text + '",\n' + s[end:]
        path.write_text(s, encoding="utf-8")
print("ok")
