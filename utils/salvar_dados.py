import json
from pathlib import Path


BASE_DIR = Path(
    "/home/joaopedro/Documents/team-overthinkers/dataset/"
    "transcricao_reorganizada"
)

JSON_DIR = BASE_DIR / "jsons"
METADADOS_DIR = BASE_DIR / "metadados"
METADADOS_JSON_PATH = METADADOS_DIR / "dados_transcricao.json"


# ---------------------------------------------------------------------------
# Transcrição (script 01)
# ---------------------------------------------------------------------------

def salvar_transcricao_em_json(
    transcricao: dict,
    id_transcricao: int | str,
) -> Path:
    """Salva uma transcrição reorganizada em JSON.

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
        json.dumps(
            transcricao,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return output_path


# ---------------------------------------------------------------------------
# Metadados (script 02)
# ---------------------------------------------------------------------------

def salvar_metadados_em_json(metadados: dict) -> Path:
    """Salva o registro único de metadados de todas as audiências.

    O arquivo é sobrescrito por completo a cada chamada. A estrutura
    completa já deve estar mesclada antes de ser passada para esta função.

    Args:
        metadados: Estrutura completa de metadados, já mesclada e pronta
            para ser salva.

    Returns:
        Caminho do arquivo JSON criado.
    """
    METADADOS_DIR.mkdir(parents=True, exist_ok=True)

    METADADOS_JSON_PATH.write_text(
        json.dumps(
            metadados,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return METADADOS_JSON_PATH