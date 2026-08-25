#!/usr/bin/env python3

import json
import re
import sys

from utils.salvar_dados import salvar_transcricao_em_json


DATASET = " YOUR PATH "

SPEECH_RE = re.compile(
    r"(?ms)^(?P<gender>O SR\.|A SRA\.)\s+"
    r"(?P<speaker>[^\r\n(]+?)"
    r"(?:\s*\((?P<meta>[^)\r\n]*)\))?"
    r"\s*[-–—]\s*"
    r"(?P<fala>.*?)(?=^(?:O SR\.|A SRA\.)\s+|\Z)"
)

CARGOS = {
    "PRESIDENTE",
    "RELATOR",
    "RELATORA",
    "COORDENADOR",
    "COORDENADORA",
}


def resolver_participante(match: re.Match) -> dict:
    """
    A partir de um match de SPEECH_RE, resolve os dados do participante:
    gênero, nome, partido e estado (quando disponíveis).
    """
    genero = "SR." if match.group("gender") == "O SR." else "SRA."
    speaker = match.group("speaker").strip()
    meta = (match.group("meta") or "").strip()

    # Se o cabeçalho for um cargo, como:
    # PRESIDENTE (Lucas Redecker. Bloco/PSDB - RS)
    # usamos o nome real e separamos o partido/estado do meta.
    nome = speaker
    partido_uf = meta

    if meta and "." in meta and speaker.upper() in CARGOS:
        nome, partido_uf = (parte.strip() for parte in meta.split(".", 1))

    # Só tratamos como "PARTIDO - UF" quando há esse separador. Alguns
    # cabeçalhos trazem apelidos ou observações entre parênteses (ex.:
    # "(MESTRE CHICO)", "(Manifestação em língua estrangeira...)"), que
    # não são partido/estado.
    partido = None
    estado = None

    if " - " in partido_uf:
        partido_bruto, estado = (
            parte.strip() for parte in partido_uf.rsplit(" - ", 1)
        )
        partido = re.sub(r"^Bloco/", "", partido_bruto).strip()

    return {
        "genero": genero,
        "nome": nome,
        "partido": partido,
        "estado": estado,
        "partido_uf_bruto": partido_uf,
    }


def montar_titulo(participante: dict) -> str:
    """Título usado internamente para agrupar as falas por participante."""
    titulo = f"{participante['genero']} {participante['nome']}"

    if participante["partido_uf_bruto"]:
        titulo += f"({participante['partido_uf_bruto']})"

    return titulo


def main():
    if len(sys.argv) != 2:
        raise ValueError(f"Uso: python {sys.argv[0]} <id>")

    target_id = int(sys.argv[1])

    with open(DATASET, "r", encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)

            if row.get("id") == target_id:
                break
        else:
            raise ValueError(f"ID {target_id} não encontrado.")

    grouped = {}

    for match in SPEECH_RE.finditer(row["transcricao"]):
        participante = resolver_participante(match)
        titulo = montar_titulo(participante)

        # Cada match da regex corresponde a um bloco de fala.
        fala = re.sub(r"\s+", " ", match.group("fala")).strip()

        if not fala:
            continue

        if titulo not in grouped:
            grouped[titulo] = {
                **participante,
                "falas": [],
            }

        grouped[titulo]["falas"].append(fala)

    # --- JSON ---
    participantes = [
        {
            "nome": dados["nome"],
            "genero": dados["genero"],
            "partido": dados["partido"],
            "estado": dados["estado"],
            "falas": dados["falas"],
            "quantidade_falas": len(dados["falas"]),
            "quantidade_palavras": sum(
                len(fala.split()) for fala in dados["falas"]
            ),
        }
        for dados in grouped.values()
    ]

    transcricao_reorganizada_json = {
        "id": target_id,
        "participantes": participantes,
    }

    path_json = salvar_transcricao_em_json(
        transcricao_reorganizada_json,
        target_id,
    )

    print(f"Transcrição salva em json: {path_json}")


if __name__ == "__main__":
    main()
