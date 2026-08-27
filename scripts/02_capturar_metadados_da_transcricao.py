#!/usr/bin/env python3

import json
import sys
from pathlib import Path

from utils.salvar_dados import (
    METADADOS_JSON_PATH,
    salvar_metadados_em_json,
    salvar_metadados_em_markdown,
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
            valor, {"participantes": 0, "falas": 0, "palavras": 0}
        )
        grupo["participantes"] += 1
        grupo["falas"] += p["quantidade_falas"]
        grupo["palavras"] += p["quantidade_palavras"]

    return grupos


def montar_resumo(participantes: list[dict]) -> dict:
    """Calcula o resumo agregado (gênero, partido, estado) a partir dos participantes."""
    homens = sum(1 for p in participantes if p["genero"] == "masculino")
    mulheres = sum(1 for p in participantes if p["genero"] == "feminino")

    return {
        "quantidade_participantes": len(participantes),
        "genero": {
            "masculino": homens,
            "feminino": mulheres,
        },
        "partidos": _agrupar_por(participantes, "partido"),
        "estados": _agrupar_por(participantes, "estado"),
    }


def montar_tabela_markdown(
    participantes: list[dict],
    resumo: dict,
    target_id: int,
) -> str:
    """Monta o markdown final com o resumo geral e as tabelas de metadados."""
    partidos = sorted(resumo["partidos"])
    estados = sorted(resumo["estados"])

    linhas = [
        f"# Metadados da Audiência ID {target_id}",
        "",
        "## Resumo geral",
        "",
        "| Métrica | Valor |",
        "|---|---|",
        f"| Quantidade de participantes | {resumo['quantidade_participantes']} |",
        f"| Homens | {resumo['genero']['masculino']} |",
        f"| Mulheres | {resumo['genero']['feminino']} |",
        f"| Quantidade de partidos | {len(partidos)} |",
        f"| Partidos | {', '.join(partidos) if partidos else '-'} |",
        f"| Quantidade de estados | {len(estados)} |",
        f"| Estados | {', '.join(estados) if estados else '-'} |",
        "",
        "## Falas e palavras por participante",
        "",
        "| Participante | Gênero | Partido | Estado | Falas | Palavras |",
        "|---|---|---|---|---|---|",
    ]

    for p in participantes:
        linhas.append(
            f"| {p['nome']} | {p['genero']} | {p['partido'] or '-'} | "
            f"{p['estado'] or '-'} | {p['quantidade_falas']} | "
            f"{p['quantidade_palavras']} |"
        )

    linhas += [
        "",
        "## Falas e palavras por partido",
        "",
        "| Partido | Participantes | Falas | Palavras |",
        "|---|---|---|---|",
    ]

    for partido in partidos:
        agg = resumo["partidos"][partido]
        linhas.append(
            f"| {partido} | {agg['participantes']} | "
            f"{agg['falas']} | {agg['palavras']} |"
        )

    linhas += [
        "",
        "## Falas e palavras por estado",
        "",
        "| Estado | Participantes | Falas | Palavras |",
        "|---|---|---|---|",
    ]

    for estado in estados:
        agg = resumo["estados"][estado]
        linhas.append(
            f"| {estado} | {agg['participantes']} | "
            f"{agg['falas']} | {agg['palavras']} |"
        )

    return "\n".join(linhas).rstrip() + "\n"


def main():
    if len(sys.argv) != 2:
        raise ValueError(f"Uso: python {sys.argv[0]} <id>")

    target_id = int(sys.argv[1])

    transcricao = carregar_transcricao_json(target_id)
    participantes = transcricao["participantes"]

    resumo = montar_resumo(participantes)

    tabela = montar_tabela_markdown(participantes, resumo, target_id)
    path_markdown = salvar_metadados_em_markdown(tabela, target_id)
    print(f"Metadados (markdown) salvos em: {path_markdown}")

    # O JSON de metadados guarda só os dados estruturais (nome, gênero,
    # partido, estado, contagens) — o texto das falas em si já mora no
    # jsons/transcricao_ID.json gerado pelo script 01, não precisa
    # duplicar aqui.
    participantes_sem_falas = [
        {chave: valor for chave, valor in p.items() if chave != "falas"}
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