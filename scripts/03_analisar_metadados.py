"""
Script 03 - Análise dos Metadados

Lê o arquivo consolidado `dados_transcricao.json` (gerado na etapa anterior,
script 02) e produz três tabelas CSV descritivas do corpus, uma linha por
categoria (partido / estado / gênero) em cada audiência:

    dataset/transcricao_reorganizada/analises_metadados/tabela_partidos.csv
    dataset/transcricao_reorganizada/analises_metadados/tabela_estados.csv
    dataset/transcricao_reorganizada/analises_metadados/tabela_genero.csv

Regras seguidas (conforme documentação da etapa):
  - Nenhuma transcrição é reprocessada; nenhuma inferência nova é feita.
  - A agregação parte da lista `participantes` de cada audiência, nunca do
    bloco `resumo` (que, no arquivo de origem, já omite participantes com
    partido/estado nulos e por isso não permite reconstruir NAO_INFORMADO).
  - Valores nulos de partido, estado ou gênero são agrupados na categoria
    NAO_INFORMADO, que participa normalmente das agregações.
  - Porcentagens são calculadas sobre o total da respectiva audiência e
    representadas como valores entre 0 e 1.

Uso:
    python3 -m scripts.03_analisar_metadados
"""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

NAO_INFORMADO = "NAO_INFORMADO"

ENTRADA = Path("dataset/transcricao_reorganizada/metadados/dados_transcricao.json")
SAIDA_DIR = Path("dataset/transcricao_reorganizada/analises_metadados")

CAMPOS = {
    "partido": {
        "chave": "partido",
        "coluna_id": "partido",
        "arquivo": "tabela_partidos.csv",
    },
    "estado": {
        "chave": "estado",
        "coluna_id": "estado",
        "arquivo": "tabela_estados.csv",
    },
    "genero": {
        "chave": "genero",
        "coluna_id": "genero",
        "arquivo": "tabela_genero.csv",
    },
}


def carregar_dados(caminho: Path) -> dict[str, Any]:
    if not caminho.exists():
        raise FileNotFoundError(
            f"Arquivo de entrada não encontrado: {caminho}\n"
            "Verifique se o script 02 (captura de metadados) já foi executado."
        )
    with caminho.open(encoding="utf-8") as f:
        return json.load(f)


def agregar_por_campo(
    audiencias: dict[str, Any], chave: str
) -> list[dict[str, Any]]:
    """
    Agrega, para um campo (partido, estado ou genero), os totais de
    participantes/falas/palavras por audiência, sempre a partir da lista
    `participantes` — nunca do bloco `resumo`.

    Retorna uma lista de linhas, uma por (audiência, categoria).
    """
    linhas: list[dict[str, Any]] = []

    for id_audiencia, audiencia in audiencias.items():
        participantes = audiencia.get("participantes", [])

        total_participantes = len(participantes)
        total_falas = sum(p["quantidade_falas"] for p in participantes)
        total_palavras = sum(p["quantidade_palavras"] for p in participantes)

        agregados: dict[str, dict[str, int]] = defaultdict(
            lambda: {"participantes": 0, "falas": 0, "palavras": 0}
        )

        for p in participantes:
            valor = p.get(chave)
            categoria = valor if valor is not None else NAO_INFORMADO

            agregados[categoria]["participantes"] += 1
            agregados[categoria]["falas"] += p["quantidade_falas"]
            agregados[categoria]["palavras"] += p["quantidade_palavras"]

        for categoria, valores in agregados.items():
            linha = {
                "id_audiencia": id_audiencia,
                chave: categoria,
                f"quantidade_participantes_do_{chave}_na_audiencia": valores[
                    "participantes"
                ],
                f"porcentagem_participantes_do_{chave}_sobre_total_participantes_audiencia": (
                    valores["participantes"] / total_participantes
                    if total_participantes
                    else 0.0
                ),
                f"porcentagem_falas_do_{chave}_sobre_total_falas_audiencia": (
                    valores["falas"] / total_falas if total_falas else 0.0
                ),
                f"porcentagem_palavras_do_{chave}_sobre_total_palavras_audiencia": (
                    valores["palavras"] / total_palavras if total_palavras else 0.0
                ),
            }
            linhas.append(linha)

    return linhas


def validar_integridade(
    audiencias: dict[str, Any], chave: str, linhas: list[dict[str, Any]]
) -> None:
    """
    Confere, para cada audiência, que a soma das quantidades agregadas na
    tabela bate com o total real de participantes/falas/palavras da
    audiência (soma sobre a lista `participantes`).
    """
    campo_qtd = f"quantidade_participantes_do_{chave}_na_audiencia"

    por_audiencia: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for linha in linhas:
        por_audiencia[linha["id_audiencia"]].append(linha)

    for id_audiencia, audiencia in audiencias.items():
        participantes = audiencia.get("participantes", [])
        total_participantes_real = len(participantes)
        total_falas_real = sum(p["quantidade_falas"] for p in participantes)
        total_palavras_real = sum(p["quantidade_palavras"] for p in participantes)

        linhas_aud = por_audiencia.get(id_audiencia, [])
        soma_participantes = sum(l[campo_qtd] for l in linhas_aud)

        # Reconstrói falas/palavras a partir das porcentagens para conferência
        soma_falas = round(
            sum(
                l[f"porcentagem_falas_do_{chave}_sobre_total_falas_audiencia"]
                for l in linhas_aud
            )
            * total_falas_real
        )
        soma_palavras = round(
            sum(
                l[f"porcentagem_palavras_do_{chave}_sobre_total_palavras_audiencia"]
                for l in linhas_aud
            )
            * total_palavras_real
        )

        if soma_participantes != total_participantes_real:
            raise AssertionError(
                f"[{chave}] Audiência {id_audiencia}: soma de participantes "
                f"({soma_participantes}) difere do total real "
                f"({total_participantes_real})."
            )
        if total_falas_real and soma_falas != total_falas_real:
            raise AssertionError(
                f"[{chave}] Audiência {id_audiencia}: soma de falas "
                f"({soma_falas}) difere do total real ({total_falas_real})."
            )
        if total_palavras_real and soma_palavras != total_palavras_real:
            raise AssertionError(
                f"[{chave}] Audiência {id_audiencia}: soma de palavras "
                f"({soma_palavras}) difere do total real ({total_palavras_real})."
            )


def escrever_csv(linhas: list[dict[str, Any]], chave: str, caminho: Path) -> None:
    colunas = [
        "id_audiencia",
        chave,
        f"quantidade_participantes_do_{chave}_na_audiencia",
        f"porcentagem_participantes_do_{chave}_sobre_total_participantes_audiencia",
        f"porcentagem_falas_do_{chave}_sobre_total_falas_audiencia",
        f"porcentagem_palavras_do_{chave}_sobre_total_palavras_audiencia",
    ]

    # Ordena por id da audiência (numérico) e depois pela categoria,
    # para facilitar leitura e diffs no CSV.
    linhas_ordenadas = sorted(
        linhas, key=lambda l: (int(l["id_audiencia"]), str(l[chave]))
    )

    caminho.parent.mkdir(parents=True, exist_ok=True)
    with caminho.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=colunas)
        writer.writeheader()
        for linha in linhas_ordenadas:
            writer.writerow(linha)


def main() -> None:
    dados = carregar_dados(ENTRADA)

    for campo, config in CAMPOS.items():
        linhas = agregar_por_campo(dados, config["chave"])
        validar_integridade(dados, config["chave"], linhas)
        caminho_saida = SAIDA_DIR / config["arquivo"]
        escrever_csv(linhas, config["chave"], caminho_saida)
        print(f"[ok] {caminho_saida} ({len(linhas)} linhas)")

    print(f"\nTabelas geradas em: {SAIDA_DIR}/")


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, AssertionError) as e:
        print(f"Erro: {e}", file=sys.stderr)
        sys.exit(1)