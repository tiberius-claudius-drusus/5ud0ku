#!/usr/bin/env python3
"""add_audit_keys.py — textes ajoutés après l'audit de Claudius (1.0.0) : about.code, about.licence (remplacent about.source),
game.cell.error, game.cell.notes.error, home.save.unreadable. Opération ponctuelle, idempotente.
Usage : python tools/add_audit_keys.py   (depuis la racine du dépôt)
"""
from pathlib import Path

# code : (code source, licence, erreur, notes impossibles, sauvegarde illisible)
T = {
    "fr": ("Code source", "Licence", "erreur", "notes impossibles : {notes}", "Partie enregistrée illisible"),
    "en": ("Source code", "Licence", "error", "impossible notes: {notes}", "Saved game unreadable"),
    "es": ("Código fuente", "Licencia", "error", "notas imposibles: {notes}", "No se puede leer la partida guardada"),
    "de": ("Quellcode", "Lizenz", "Fehler", "unmögliche Notizen: {notes}", "Gespeichertes Spiel nicht lesbar"),
    "it": ("Codice sorgente", "Licenza", "errore", "note impossibili: {notes}", "Partita salvata illeggibile"),
    "pt-pt": ("Código-fonte", "Licença", "erro", "notas impossíveis: {notes}", "Jogo guardado ilegível"),
    "pt-br": ("Código-fonte", "Licença", "erro", "notas impossíveis: {notes}", "Jogo salvo ilegível"),
    "ru": ("Исходный код", "Лицензия", "ошибка", "невозможные заметки: {notes}", "Сохранённую игру не удалось прочитать"),
    "ar": ("الشيفرة المصدرية", "الترخيص", "خطأ", "ملاحظات مستحيلة: {notes}", "تعذّرت قراءة اللعبة المحفوظة"),
    "zh": ("源代码", "许可证", "错误", "不可能的笔记：{notes}", "无法读取已保存的游戏"),
    "ko": ("소스 코드", "라이선스", "오류", "불가능한 메모: {notes}", "저장된 게임을 읽을 수 없습니다"),
    "ja": ("ソースコード", "ライセンス", "エラー", "不可能なメモ: {notes}", "保存したゲームを読み込めません"),
    "hi": ("स्रोत कोड", "लाइसेंस", "त्रुटि", "असंभव नोट्स: {notes}", "सहेजा गया खेल पढ़ा नहीं जा सका"),
    "tr": ("Kaynak kod", "Lisans", "hata", "imkânsız notlar: {notes}", "Kayıtlı oyun okunamadı"),
    "nl": ("Broncode", "Licentie", "fout", "onmogelijke notities: {notes}", "Opgeslagen spel onleesbaar"),
    "pl": ("Kod źródłowy", "Licencja", "błąd", "niemożliwe notatki: {notes}", "Nie można odczytać zapisanej gry"),
    "uk": ("Вихідний код", "Ліцензія", "помилка", "неможливі нотатки: {notes}", "Збережену гру не вдалося прочитати"),
    "id": ("Kode sumber", "Lisensi", "kesalahan", "catatan mustahil: {notes}", "Permainan tersimpan tidak terbaca"),
    "vi": ("Mã nguồn", "Giấy phép", "lỗi", "ghi chú không thể: {notes}", "Không đọc được ván đã lưu"),
    "la": ("Codex fontis", "Licentia", "error", "notae impossibiles: {notes}", "Ludus servatus legi non potest"),
}

root = Path(__file__).resolve().parent.parent


def line_end(s, at):
    return s.index("\n", at) + 1


def patch(path, code, quote, block_start=None, block_end=None):
    s = path.read_text(encoding="utf-8")
    lo = block_start(s) if block_start else 0
    hi = block_end(s, lo) if block_end else len(s)
    seg = s[lo:hi]
    if f"{quote}about.code{quote}" in seg:
        return
    src, lic, err, nerr, unread = T[code]
    q = quote

    def kv(k, v):
        return f"  {q}{k}{q}: {q}{v}{q},\n"

    # about.source -> about.code + about.licence
    i = seg.index(f"  {q}about.source{q}:")
    j = line_end(seg, i)
    seg = seg[:i] + kv("about.code", src) + kv("about.licence", lic) + seg[j:]
    # game.cell.notes -> + game.cell.error + game.cell.notes.error
    i = seg.index(f"  {q}game.cell.notes{q}:")
    j = line_end(seg, i)
    seg = seg[:j] + kv("game.cell.error", err) + kv("game.cell.notes.error", nerr) + seg[j:]
    # home.foot -> + home.save.unreadable
    i = seg.index(f"  {q}home.foot{q}:")
    j = line_end(seg, i)
    seg = seg[:j] + kv("home.save.unreadable", unread) + seg[j:]
    path.write_text(s[:lo] + seg + s[hi:], encoding="utf-8")


for code in T:
    if code in ("fr", "en"):
        name = "FR" if code == "fr" else "EN"
        patch(root / "src" / "strings.js", code, "'",
              block_start=lambda s, n=name: s.index(f"export const {n} = {{"),
              block_end=lambda s, lo: s.index("\n};", lo))
    else:
        patch(root / "src" / "lang" / f"{code}.js", code, '"')
print("ok")
