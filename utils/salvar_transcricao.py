from pathlib import Path

OUTPUT_DIR = Path(
    "/home/joaopedro/Documents/team-overthinkers/dataset/"
    "transcricao_reorganizada/markdowns"
)


def salvar_transcricao(transcricao: str, id_transcricao: int | str) -> Path:
    """Salva uma transcrição reorganizada em Markdown.

    Args:
        transcricao: Conteúdo da transcrição já reorganizada.
        id_transcricao: ID da transcrição/audiência.

    Returns:
        Caminho do arquivo Markdown criado.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    output_path = OUTPUT_DIR / f"transcricao_{id_transcricao}.md"
    output_path.write_text(transcricao, encoding="utf-8")

    return output_path