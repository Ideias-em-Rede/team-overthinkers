#!/usr/bin/env python3

import json
import sys
from pathlib import Path

from utils.salvar_dados import (
    METADADOS_JSON_PATH,
    salvar_metadados_em_json,
)


BASE_DIR = Path(__file__).resolve().parent.parent

JSON_TRANSCRICOES_DIR = (
    BASE_DIR
    / "dataset"
    / "transcricao_reorganizada"
    / "jsons"
)


def carregar_transcricao_json(target_id: int) -> dict:
    """Lê o JSON estruturado (participantes + falas) gerado pelo script 01."""
    path = JSON_TRANSCRICOES_DIR / f"transcricao_{target_id}.json"

    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def carregar_metadados_existentes() -> dict:
    """
    Lê o JSON único de metadados (todas as audiências já processadas),
    indexado por id. Se ainda não existir (primeira vez rodando),
    começa vazio.
    """
    if not METADADOS_JSON_PATH.exists():
        return {}

    with METADADOS_JSON_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _agrupar_por(participantes: list[dict], chave: str) -> dict:
    """Agrega falas/palavras/participantes por partido ou por estado."""
    grupos: dict[str, dict] = {}

    for p in participantes:
        valor = p[chave]

        if not valor:
            continue

        grupo = grupos.setdefault(
            valor,
            {
                "participantes": 0,
                "falas": 0,
                "palavras": 0,
            },
        )

        grupo["participantes"] += 1
        grupo["falas"] += p["quantidade_falas"]
        grupo["palavras"] += p["quantidade_palavras"]

    return grupos


def montar_resumo(participantes: list[dict]) -> dict:
    """Calcula o resumo agregado de gênero, partido e estado."""
    homens = sum(
        1 for p in participantes
        if p["genero"] == "masculino"
    )

    mulheres = sum(
        1 for p in participantes
        if p["genero"] == "feminino"
    )

    return {
        "quantidade_participantes": len(participantes),
        "genero": {
            "masculino": homens,
            "feminino": mulheres,
        },
        "partidos": _agrupar_por(participantes, "partido"),
        "estados": _agrupar_por(participantes, "estado"),
    }


def main():
    if len(sys.argv) != 2:
        raise ValueError(f"Uso: python {sys.argv[0]} <id>")

    target_id = int(sys.argv[1])

    transcricao = carregar_transcricao_json(target_id)
    participantes = transcricao["participantes"]

    resumo = montar_resumo(participantes)

    # O JSON de metadados guarda apenas os dados estruturais
    # (nome, gênero, partido, estado e contagens).
    # O texto das falas permanece no JSON da transcrição
    # gerado pelo script 01.
    participantes_sem_falas = [
        {
            chave: valor
            for chave, valor in p.items()
            if chave != "falas"
        }
        for p in participantes
    ]

    # Insere/atualiza a entrada desta audiência no JSON único.
    dados_completos = carregar_metadados_existentes()

    dados_completos[str(target_id)] = {
        "resumo": resumo,
        "participantes": participantes_sem_falas,
    }

    path_json = salvar_metadados_em_json(dados_completos)

    print(f"Metadados (json) salvos em: {path_json}")


if __name__ == "__main__":
    main()