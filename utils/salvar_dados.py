import json
from pathlib import Path

BASE_DIR = Path(
    "/home/joaopedro/Documents/team-overthinkers/dataset/"
    "transcricao_reorganizada"
)

MARKDOWN_DIR = BASE_DIR / "markdowns"
JSON_DIR = BASE_DIR / "jsons"
METADADOS_DIR = BASE_DIR / "metadados"
METADADOS_MARKDOWN_DIR = METADADOS_DIR / "markdowns"
METADADOS_JSON_PATH = METADADOS_DIR / "dados_transcricao.json"


# ---------------------------------------------------------------------------
# Transcrição (script 01)
# ---------------------------------------------------------------------------

def salvar_transcricao_em_markdown(transcricao: str, id_transcricao: int | str) -> Path:
    """Salva uma transcrição reorganizada em Markdown.

    Args:
        transcricao: Conteúdo da transcrição já reorganizada.
        id_transcricao: ID da transcrição/audiência.

    Returns:
        Caminho do arquivo Markdown criado.
    """
    MARKDOWN_DIR.mkdir(parents=True, exist_ok=True)

    output_path = MARKDOWN_DIR / f"transcricao_{id_transcricao}.md"
    output_path.write_text(transcricao, encoding="utf-8")

    return output_path


def salvar_transcricao_em_json(transcricao: dict, id_transcricao: int | str) -> Path:
    """Salva uma transcrição reorganizada em JSON (participantes + falas).

    Args:
        transcricao: Estrutura já reorganizada, com os participantes
            e suas respectivas falas.
        id_transcricao: ID da transcrição/audiência.

    Returns:
        Caminho do arquivo JSON criado.
    """
    JSON_DIR.mkdir(parents=True, exist_ok=True)

    output_path = JSON_DIR / f"transcricao_{id_transcricao}.json"
    output_path.write_text(
        json.dumps(transcricao, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return output_path


# ---------------------------------------------------------------------------
# Metadados (script 02)
# ---------------------------------------------------------------------------

def salvar_metadados_em_markdown(metadados: str, id_transcricao: int | str) -> Path:
    """Salva a tabela de metadados de uma audiência em Markdown.

    Fica em um subdiretório próprio (separado do JSON), pois é gerado
    um arquivo por audiência.

    Args:
        metadados: Conteúdo da tabela de metadados já montada.
        id_transcricao: ID da transcrição/audiência.

    Returns:
        Caminho do arquivo Markdown criado.
    """
    METADADOS_MARKDOWN_DIR.mkdir(parents=True, exist_ok=True)

    output_path = METADADOS_MARKDOWN_DIR / f"dados_transcricao_{id_transcricao}.md"
    output_path.write_text(metadados, encoding="utf-8")

    return output_path


def salvar_metadados_em_json(metadados: dict) -> Path:
    """Salva o registro único de metadados, com todas as audiências já
    processadas (resumo geral + uma entrada por audiência).

    Diferente do markdown, aqui é sempre o MESMO arquivo, sobrescrito
    por completo a cada chamada — quem monta o conteúdo mesclado
    (audiência nova + audiências já existentes) é quem chama esta
    função, não ela.

    Args:
        metadados: Estrutura completa já mesclada, pronta para salvar.

    Returns:
        Caminho do arquivo JSON criado.
    """
    METADADOS_DIR.mkdir(parents=True, exist_ok=True)

    METADADOS_JSON_PATH.write_text(
        json.dumps(metadados, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return METADADOS_JSON_PATH