"""Extrai participantes da TRANSCRIÇÃO de uma audiência usando REGEX.

Método: regex sobre o padrão "O SR. NOME (PARENTESES) - fala" / "A SRA. ...".
É explicitamente REGEX (não LLM) porque a transcrição segue formato
padronizado da Câmara e queremos precisão determinística.

Uso:
    python3 scripts/extrai_participantes_transcricao.py --id 1

Saída: web/public/data/participantes_transcricao/{id}.json
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATERIAS_DIR = ROOT / "web" / "public" / "data" / "materias"
OUT_DIR = ROOT / "web" / "public" / "data" / "participantes_transcricao"

# Aceita "O SR." (masc.) e "A SRA." (fem.) — não descarta silenciosamente
# falas de participantes mulheres.
FALA_RE = re.compile(
    r"(?:O\s+SR\.|A\s+SRA\.)\s+(.+?)(?:\((.*?)\))?\s*-\s*(.*?)"
    r"(?=\n(?:O\s+SR\.|A\s+SRA\.)\s+|\Z)",
    re.DOTALL,
)


def extrair(materia_id: int, force: bool = False) -> dict:
    src = MATERIAS_DIR / f"{materia_id}.json"
    if not src.exists():
        sys.exit(f"Matéria #{materia_id} não encontrada em {src}.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{materia_id}.json"
    if out.exists() and not force:
        print(f"Já processada: {out} (use --force pra reprocessar)")
        return json.loads(out.read_text(encoding="utf-8"))

    materia = json.loads(src.read_text(encoding="utf-8"))
    transcricao = materia["transcricao"]

    trechos_por_participante: dict[str, dict] = {}
    partido_por_participante: dict[str, str] = {}
    total_chars_capturados = 0

    for match in FALA_RE.finditer(transcricao):
        identificacao = match.group(1).strip()
        parenteses = match.group(2).strip() if match.group(2) else None
        fala = match.group(3).strip()

        if identificacao.upper().startswith("PRESIDENT"):
            nome = parenteses.split(".")[0].strip() if parenteses else identificacao
            partido_estado = None
        else:
            nome = identificacao
            partido_estado = parenteses

        palavras = len(fala.split())
        reg = trechos_por_participante.setdefault(
            nome, {"nome": nome, "trechos": 0, "palavras": 0}
        )
        reg["trechos"] += 1
        reg["palavras"] += palavras

        if partido_estado and nome not in partido_por_participante:
            partido_por_participante[nome] = partido_estado

        total_chars_capturados += len(fala)

    participantes = []
    for nome, reg in trechos_por_participante.items():
        participantes.append({
            "nome": nome,
            "partido_estado": partido_por_participante.get(nome),
            "trechos": reg["trechos"],
            "palavras": reg["palavras"],
        })
    participantes.sort(key=lambda p: p["palavras"], reverse=True)

    total_palavras = sum(p["palavras"] for p in participantes)
    total_trechos = sum(p["trechos"] for p in participantes)
    total_chars = len(transcricao)

    payload = {
        "id": materia_id,
        "metodo": "regex",
        "regex_padrao": r"(?:O SR.|A SRA.) NOME (PARENTESES)? - fala",
        "descricao": (
            "Extração determinística por regex sobre o formato padronizado da "
            "transcrição da Câmara. Não usa LLM."
        ),
        "cobertura": {
            "chars_totais": total_chars,
            "chars_capturados": total_chars_capturados,
            "proporcao": round(total_chars_capturados / total_chars, 4) if total_chars else 0,
        },
        "totais": {
            "num_participantes": len(participantes),
            "num_trechos": total_trechos,
            "num_palavras": total_palavras,
        },
        "distribuicao_trechos": dict(
            sorted(Counter(p["trechos"] for p in participantes).items())
        ),
        "participantes": participantes,
    }

    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrito: {out}")
    print(
        f"  {len(participantes)} participantes · {total_trechos} trechos · "
        f"{total_palavras} palavras · cobertura {payload['cobertura']['proporcao']:.1%}"
    )
    return payload


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--id", type=int, default=1)
    p.add_argument("--force", action="store_true")
    args = p.parse_args()
    extrair(args.id, force=args.force)
