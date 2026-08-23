#!/usr/bin/env python3

import json
import re
import sys

from utils.salvar_transcricao import salvar_transcricao
from utils.capturar_metadados import capturar_metadados


DATASET = "/home/joaopedro/Documents/team-overthinkers/dataset/PublicHearingBR_LDS.jsonl"

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
        genero = "SR." if match.group("gender") == "O SR." else "SRA."
        speaker = match.group("speaker").strip()
        meta = (match.group("meta") or "").strip()
        fala = match.group("fala").strip()

        # Se o cabeçalho for um cargo, como:
        # PRESIDENTE (Lucas Redecker. Bloco/PSDB - RS)
        # usamos o nome real e separamos o partido/estado do meta.
        nome = speaker
        partido_uf = meta

        if meta and "." in meta and speaker.upper() in CARGOS:
            nome, partido_uf = (parte.strip() for parte in meta.split(".", 1))

        # Título do bloco: "SR."/"SRA." + nome + "(PARTIDO - UF)",
        # quando houver essa informação.
        participant = f"{genero} {nome}"
        if partido_uf:
            participant += f"({partido_uf})"

        if participant not in grouped:
            grouped[participant] = {
                "falas": []
            }

        # Cada parágrafo da transcrição original é tratado
        # como um turno de fala separado.
        falas = [
            trecho.strip()
            for trecho in re.split(r"\n\s*\n+", fala)
            if trecho.strip()
        ]

        grouped[participant]["falas"].extend(falas)

    markdown_lines = [
        f"# Audiência ID {target_id}",
        ""
    ]

    for participant, data in grouped.items():
        markdown_lines.append(f"## {participant}")
        markdown_lines.append("")

        for fala in data["falas"]:
            # Remove quebras de linha e espaços duplicados
            # para cada fala ocupar uma única linha.
            fala = re.sub(r"\s+", " ", fala).strip()
            markdown_lines.append(f"- {fala}")

        markdown_lines.append("")

    transcricao_reorganizada = "\n".join(markdown_lines).rstrip() + "\n"

    path = salvar_transcricao(transcricao_reorganizada, target_id)
    print(f"Transcrição salva em markdown: {path}")

    path_metadados = capturar_metadados(transcricao_reorganizada, target_id)
    print(f"Metadados salvos em: {path_metadados}")


if __name__ == "__main__":
    main()