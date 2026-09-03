#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent

DEFAULT_INPUT = (
    BASE_DIR
    / "dataset"
    / "transcricao_reorganizada"
    / "metadados"
    / "dados_transcricao.json"
)

DEFAULT_OUTPUT_DIR = (
    BASE_DIR
    / "dataset"
    / "transcricao_reorganizada"
    / "analises_metadados"
)


def carregar_metadados(path: Path) -> dict:
    """Carrega o JSON consolidado de metadados."""
    if not path.exists():
        raise FileNotFoundError(
            f"Arquivo de metadados não encontrado: {path}"
        )

    with path.open("r", encoding="utf-8") as f:
        dados = json.load(f)

    if not isinstance(dados, dict):
        raise ValueError(
            "O arquivo de metadados deve conter um objeto JSON "
            "indexado pelo ID da audiência."
        )

    return dados


def normalizar_categoria(
    valor,
    categoria_desconhecida: str,
):
    """
    Substitui valores ausentes por uma categoria explícita.

    Isso é importante para que participantes sem partido ou estado
    continuem representados nas tabelas.
    """
    if pd.isna(valor) or valor is None or str(valor).strip() == "":
        return categoria_desconhecida

    return str(valor).strip()


def criar_tabela_participantes(
    metadados: dict,
) -> pd.DataFrame:
    """
    Cria uma linha para cada participante de cada audiência.
    """
    linhas = []

    for id_audiencia, dados in metadados.items():
        for participante in dados.get("participantes", []):
            linhas.append(
                {
                    "id": int(id_audiencia),
                    "nome": participante.get("nome"),
                    "genero": participante.get("genero"),
                    "partido": normalizar_categoria(
                        participante.get("partido"),
                        "NAO_INFORMADO",
                    ),
                    "estado": normalizar_categoria(
                        participante.get("estado"),
                        "NAO_INFORMADO",
                    ),
                    "falas": participante.get(
                        "quantidade_falas",
                        0,
                    ),
                    "palavras": participante.get(
                        "quantidade_palavras",
                        0,
                    ),
                }
            )

    if not linhas:
        raise ValueError(
            "Nenhum participante foi encontrado "
            "no arquivo de metadados."
        )

    df = pd.DataFrame(linhas)

    # Totais da audiência usados para calcular participação.
    totais = (
        df.groupby("id", as_index=False)
        .agg(
            participantes_audiencia=("nome", "size"),
            falas_audiencia=("falas", "sum"),
            palavras_audiencia=("palavras", "sum"),
        )
    )

    df = df.merge(
        totais,
        on="id",
        how="left",
    )

    df["palavras_por_fala"] = (
        df["palavras"]
        / df["falas"].replace(0, pd.NA)
    ).fillna(0)

    df["participacao_participantes"] = (
        1 / df["participantes_audiencia"]
    )

    df["participacao_falas"] = (
        df["falas"]
        / df["falas_audiencia"].replace(0, pd.NA)
    ).fillna(0)

    df["participacao_palavras"] = (
        df["palavras"]
        / df["palavras_audiencia"].replace(0, pd.NA)
    ).fillna(0)

    return df.sort_values(
        ["id", "palavras"],
        ascending=[True, False],
    )


def agrupar_dimensao(
    participantes: pd.DataFrame,
    coluna: str,
) -> pd.DataFrame:
    """
    Agrega participantes por audiência e dimensão.

    A dimensão pode ser:
    - partido;
    - estado;
    - gênero.
    """
    agrupado = (
        participantes.groupby(
            ["id", coluna],
            as_index=False,
            dropna=False,
        )
        .agg(
            participantes=("nome", "size"),
            falas=("falas", "sum"),
            palavras=("palavras", "sum"),
        )
    )

    totais = (
        participantes.groupby("id", as_index=False)
        .agg(
            participantes_audiencia=("nome", "size"),
            falas_audiencia=("falas", "sum"),
            palavras_audiencia=("palavras", "sum"),
        )
    )

    agrupado = agrupado.merge(
        totais,
        on="id",
        how="left",
    )

    agrupado["participacao_participantes"] = (
        agrupado["participantes"]
        / agrupado["participantes_audiencia"]
    )

    agrupado["participacao_falas"] = (
        agrupado["falas"]
        / agrupado["falas_audiencia"].replace(0, pd.NA)
    ).fillna(0)

    agrupado["participacao_palavras"] = (
        agrupado["palavras"]
        / agrupado["palavras_audiencia"].replace(0, pd.NA)
    ).fillna(0)

    agrupado["palavras_por_fala"] = (
        agrupado["palavras"]
        / agrupado["falas"].replace(0, pd.NA)
    ).fillna(0)

    return agrupado.sort_values(
        ["id", "palavras"],
        ascending=[True, False],
    )


def criar_tabela_audiencias(
    participantes: pd.DataFrame,
) -> pd.DataFrame:
    """
    Cria uma linha para cada audiência.
    """
    df = (
        participantes.groupby("id", as_index=False)
        .agg(
            participantes=("nome", "size"),
            falas=("falas", "sum"),
            palavras=("palavras", "sum"),
        )
    )

    df["palavras_por_fala"] = (
        df["palavras"]
        / df["falas"].replace(0, pd.NA)
    ).fillna(0)

    df["palavras_por_participante"] = (
        df["palavras"]
        / df["participantes"].replace(0, pd.NA)
    ).fillna(0)

    participantes_com_partido = (
        participantes["partido"]
        .ne("NAO_INFORMADO")
        .groupby(participantes["id"])
        .sum()
        .reindex(df["id"])
        .fillna(0)
        .astype(int)
        .values
    )

    df["participantes_com_partido"] = (
        participantes_com_partido
    )

    df["participantes_sem_partido"] = (
        df["participantes"]
        - df["participantes_com_partido"]
    )

    participantes_com_estado = (
        participantes["estado"]
        .ne("NAO_INFORMADO")
        .groupby(participantes["id"])
        .sum()
        .reindex(df["id"])
        .fillna(0)
        .astype(int)
        .values
    )

    df["participantes_com_estado"] = (
        participantes_com_estado
    )

    df["participantes_sem_estado"] = (
        df["participantes"]
        - df["participantes_com_estado"]
    )

    return df.sort_values("id")


def criar_resumo_geral(
    audiencias: pd.DataFrame,
) -> pd.DataFrame:
    """
    Cria um resumo descritivo do corpus inteiro.
    """
    return pd.DataFrame(
        [
            {
                "audiencias": len(audiencias),
                "participantes_total": int(
                    audiencias["participantes"].sum()
                ),
                "participantes_media_por_audiencia": (
                    audiencias["participantes"].mean()
                ),
                "participantes_mediana_por_audiencia": (
                    audiencias["participantes"].median()
                ),
                "falas_total": int(
                    audiencias["falas"].sum()
                ),
                "falas_media_por_audiencia": (
                    audiencias["falas"].mean()
                ),
                "palavras_total": int(
                    audiencias["palavras"].sum()
                ),
                "palavras_media_por_audiencia": (
                    audiencias["palavras"].mean()
                ),
                "palavras_mediana_por_audiencia": (
                    audiencias["palavras"].median()
                ),
                "palavras_por_fala_media": (
                    audiencias["palavras_por_fala"].mean()
                ),
                "palavras_por_participante_media": (
                    audiencias[
                        "palavras_por_participante"
                    ].mean()
                ),
            }
        ]
    )


def validar_ids(
    audiencias: pd.DataFrame,
) -> None:
    """
    Verifica se os IDs são sequenciais.

    Para a base atual, esperamos os IDs 1 a 206.
    """
    ids = sorted(
        audiencias["id"].astype(int).tolist()
    )

    esperados = list(
        range(
            1,
            len(ids) + 1,
        )
    )

    if ids != esperados:
        raise ValueError(
            "Os IDs das audiências não são sequenciais "
            "a partir de 1."
        )


def salvar_tabela(
    df: pd.DataFrame,
    path: Path,
) -> None:
    """Salva um DataFrame como CSV UTF-8."""
    df.to_csv(
        path,
        index=False,
        encoding="utf-8-sig",
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Gera tabelas de análise descritiva "
            "a partir do dados_transcricao.json."
        )
    )

    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=(
            "Caminho do JSON consolidado "
            "de metadados."
        ),
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=(
            "Diretório onde as tabelas CSV "
            "serão salvas."
        ),
    )

    args = parser.parse_args()

    metadados = carregar_metadados(
        args.input
    )

    participantes = criar_tabela_participantes(
        metadados
    )

    audiencias = criar_tabela_audiencias(
        participantes
    )

    validar_ids(audiencias)

    partidos = agrupar_dimensao(
        participantes,
        "partido",
    )

    estados = agrupar_dimensao(
        participantes,
        "estado",
    )

    genero = agrupar_dimensao(
        participantes,
        "genero",
    )

    resumo_geral = criar_resumo_geral(
        audiencias
    )

    args.output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    salvar_tabela(
        audiencias,
        args.output_dir
        / "tabela_audiencias.csv",
    )

    salvar_tabela(
        participantes,
        args.output_dir
        / "tabela_participantes.csv",
    )

    salvar_tabela(
        partidos,
        args.output_dir
        / "tabela_partidos.csv",
    )

    salvar_tabela(
        estados,
        args.output_dir
        / "tabela_estados.csv",
    )

    salvar_tabela(
        genero,
        args.output_dir
        / "tabela_genero.csv",
    )

    salvar_tabela(
        resumo_geral,
        args.output_dir
        / "resumo_geral.csv",
    )

    print("Análise dos metadados concluída.")
    print(
        f"Audiências analisadas: "
        f"{len(audiencias)}"
    )
    print(
        f"Participações analisadas: "
        f"{len(participantes)}"
    )
    print(
        f"Saída: {args.output_dir}"
    )


if __name__ == "__main__":
    main()