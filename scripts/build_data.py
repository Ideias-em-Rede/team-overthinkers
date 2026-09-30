"""Fatia PublicHearingBR_LDS.jsonl em JSON leve pro frontend.

Gera:
  web/public/data/index.json         -> lista enxuta das 206 matérias
  web/public/data/materias/{id}.json -> detalhe completo por matéria
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_JSONL = ROOT / "PublicHearingBR" / "PublicHearingBR_LDS.jsonl"
OUT_DIR = ROOT / "web" / "public" / "data"
OUT_MATERIAS = OUT_DIR / "materias"

DATE_RE = re.compile(r"(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}:\d{2})")


def parse_materia(text: str) -> dict:
    lines = [ln.strip() for ln in text.split("\n")]
    non_empty = [ln for ln in lines if ln]

    title = non_empty[0] if non_empty else ""
    subtitle = ""
    date = ""
    time = ""

    if len(non_empty) > 1:
        m = DATE_RE.search(non_empty[1])
        if m:
            date, time = m.group(1), m.group(2)
        else:
            subtitle = non_empty[1]

    if not date:
        for ln in non_empty[:6]:
            m = DATE_RE.search(ln)
            if m:
                date, time = m.group(1), m.group(2)
                break

    body_start_idx = 0
    seen_date = False
    for i, ln in enumerate(lines):
        if DATE_RE.search(ln):
            seen_date = True
            body_start_idx = i + 1
            continue
        if seen_date and ln.strip():
            body_start_idx = i
            break
    body = "\n".join(lines[body_start_idx:]).strip()

    return {"titulo": title, "subtitulo": subtitle, "data": date, "hora": time, "corpo": body}


def build():
    OUT_MATERIAS.mkdir(parents=True, exist_ok=True)
    index = []

    with SRC_JSONL.open(encoding="utf-8") as f:
        for line in f:
            sample = json.loads(line)
            sid = sample["id"]
            parsed = parse_materia(sample["materia"])
            envolvidos = sample["metadados"]["envolvidos"]
            assunto = sample["metadados"]["assunto"]

            index.append({
                "id": sid,
                "titulo": parsed["titulo"],
                "subtitulo": parsed["subtitulo"],
                "assunto": assunto,
                "data": parsed["data"],
                "hora": parsed["hora"],
                "num_envolvidos": len(envolvidos),
                "num_opinioes": sum(len(e.get("opinioes") or []) for e in envolvidos),
                "cargos": sorted({(e.get("cargo") or "").strip() for e in envolvidos if e.get("cargo")}),
            })

            detail = {
                "id": sid,
                "titulo": parsed["titulo"],
                "subtitulo": parsed["subtitulo"],
                "data": parsed["data"],
                "hora": parsed["hora"],
                "assunto": assunto,
                "corpo": parsed["corpo"],
                "materia_raw": sample["materia"],
                "transcricao": sample["transcricao"],
                "envolvidos": envolvidos,
            }
            (OUT_MATERIAS / f"{sid}.json").write_text(
                json.dumps(detail, ensure_ascii=False), encoding="utf-8"
            )

    (OUT_DIR / "index.json").write_text(
        json.dumps(index, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Escritas {len(index)} matérias em {OUT_DIR}")


if __name__ == "__main__":
    build()
