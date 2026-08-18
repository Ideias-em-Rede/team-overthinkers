#!/usr/bin/env python3

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Tuple


# ---------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------

DEFAULT_DATASET = Path(
    "/home/joaopedro/Documents/team-overthinkers/"
    "dataset/PublicHearingBR_LDS.jsonl"
)

DEFAULT_OUTPUT_DIR = Path(
    "/home/joaopedro/Documents/team-overthinkers/"
    "dataset/transcricao_reorganizada"
)


# ---------------------------------------------------------------------
# Detecção de novos participantes
# ---------------------------------------------------------------------
#
# IMPORTANTE:
# O regex é CASE-SENSITIVE.
#
# Isso significa que:
#
#   O SR. ARLINDO CHINAGLIA(...)
#   A SRA. BIA KICIS(...)
#
# são identificados como novos turnos.
#
# Mas:
#
#   O Sr. Chinaglia também nos trouxe uma fala...
#
# NÃO é identificado como novo turno.
#
# Isso evita quebrar uma fala quando o participante menciona
# outra pessoa dentro do próprio discurso.
#
SPEAKER_START_RE = re.compile(
    r"^(?:O SR\.|A SRA\.)\s+(.+)"
)


# ---------------------------------------------------------------------
# Leitura do JSONL
# ---------------------------------------------------------------------

def load_record(
    dataset_path: Path,
    identifier: int,
) -> Dict:
    """
    Carrega um registro do JSONL.

    O identifier pode ser:
    - o número da linha do JSONL (1-based);
    - ou o valor do campo "id".
    """

    with dataset_path.open("r", encoding="utf-8") as f:

        for line_number, line in enumerate(f, start=1):

            line = line.strip()

            if not line:
                continue

            record = json.loads(line)

            # Número da linha
            if line_number == identifier:
                return record

            # Campo "id"
            if record.get("id") == identifier:
                return record

    raise ValueError(
        f"Não foi encontrado registro com linha/ID = {identifier}"
    )


# ---------------------------------------------------------------------
# Identificação do participante
# ---------------------------------------------------------------------

def extract_speaker_from_header(header: str) -> str:
    """
    Extrai somente o nome do participante a partir do cabeçalho.

    Exemplos:

        O SR. PRESIDENTE(Lucas Redecker. Bloco/PSDB - RS)
        -> Lucas Redecker

        O SR. ARLINDO CHINAGLIA(Bloco/PT - SP)
        -> Arlindo Chinaglia

        O SR. ELI VIEIRA ARAUJO JÚNIOR
        -> Eli Vieira Araujo Júnior
    """

    header = header.strip()

    # Remove O SR. / A SRA.
    header = re.sub(
        r"^(O SR\.|A SRA\.)\s+",
        "",
        header
    ).strip()

    # ---------------------------------------------------------------
    # Caso exista conteúdo entre parênteses
    # ---------------------------------------------------------------

    if "(" in header and ")" in header:

        before_paren, inside_paren = header.split("(", 1)

        inside_paren = inside_paren.rsplit(")", 1)[0].strip()
        before_paren = before_paren.strip()

        # -----------------------------------------------------------
        # Caso especial:
        #
        # PRESIDENTE(Lucas Redecker. Bloco/PSDB - RS)
        #
        # O nome está dentro dos parênteses.
        # -----------------------------------------------------------

        if before_paren.upper() == "PRESIDENTE":

            name = inside_paren.split(
                ".",
                1
            )[0].strip()

            if name:
                return name

        # -----------------------------------------------------------
        # Caso normal:
        #
        # ARLINDO CHINAGLIA(Bloco/PT - SP)
        #
        # O nome está antes dos parênteses.
        # -----------------------------------------------------------

        return before_paren

    # ---------------------------------------------------------------
    # Caso sem parênteses
    # ---------------------------------------------------------------

    return header.strip()


# ---------------------------------------------------------------------
# Parsing do cabeçalho + primeira parte da fala
# ---------------------------------------------------------------------

def parse_header(
    line: str,
) -> Tuple[str, str]:
    """
    Separa uma linha de intervenção em:

        participante
        texto inicial da fala

    Trata corretamente cabeçalhos com hífens dentro de metadata,
    como:

        Bloco/PSDB - RS
        Bloco/PT - SP
    """

    line = line.strip()

    if not SPEAKER_START_RE.match(line):

        raise ValueError(
            f"Linha não reconhecida como cabeçalho: {line}"
        )

    # ---------------------------------------------------------------
    # Caso com parênteses
    #
    # O SR. NOME(Bloco/PSDB - RS) - Texto...
    #
    # O separador da fala está depois do ")".
    # ---------------------------------------------------------------

    if "(" in line and ")" in line:

        closing_paren = line.rfind(")")

        header_end = closing_paren + 1

        separator_match = re.match(
            r"\s*-\s*",
            line[header_end:]
        )

        if separator_match:

            separator_start = (
                header_end
                + separator_match.start()
            )

            separator_end = (
                header_end
                + separator_match.end()
            )

            header = line[:separator_start].strip()

            speech = line[separator_end:].strip()

            speaker = extract_speaker_from_header(
                header
            )

            return speaker, speech

    # ---------------------------------------------------------------
    # Caso sem parênteses
    #
    # O SR. NOME- Texto...
    #
    # Aqui podemos procurar o separador diretamente.
    # ---------------------------------------------------------------

    match = re.search(
        r"\s*-\s*",
        line
    )

    if not match:

        speaker = extract_speaker_from_header(
            line
        )

        return speaker, ""

    header = line[:match.start()].strip()

    speech = line[match.end():].strip()

    speaker = extract_speaker_from_header(
        header
    )

    return speaker, speech


# ---------------------------------------------------------------------
# Verificação de cabeçalho
# ---------------------------------------------------------------------

def is_speaker_header(
    line: str,
) -> bool:
    """
    Verifica se uma linha inicia uma nova intervenção.

    O regex é deliberadamente case-sensitive.

    Portanto:

        O SR. X     -> True
        A SRA. X    -> True

        O Sr. X     -> False
        A Sra. X    -> False
    """

    return bool(
        SPEAKER_START_RE.match(
            line.strip()
        )
    )


# ---------------------------------------------------------------------
# Contagem de palavras
# ---------------------------------------------------------------------

def count_words(
    text: str,
) -> int:
    """
    Conta palavras do texto.

    A contagem ignora pontuação e considera tokens alfanuméricos,
    incluindo palavras com hífen ou apóstrofo.
    """

    words = re.findall(
        r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+"
        r"(?:[-'][A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*",
        text
    )

    return len(words)


# ---------------------------------------------------------------------
# Parsing da transcrição
# ---------------------------------------------------------------------

def parse_transcription(
    transcription: str,
) -> Dict[str, List[str]]:
    """
    Organiza a transcrição por participante.

    Cada turno permanece separado.

    Retorno:

    {
        "Lucas Redecker": [
            "Primeiro turno...",
            "Segundo turno..."
        ],
        "Arlindo Chinaglia": [
            "Primeiro turno..."
        ]
    }

    A ordem dos participantes é a ordem de primeira aparição
    na transcrição.
    """

    lines = transcription.splitlines()

    grouped: Dict[str, List[str]] = {}

    current_speaker = None

    current_block: List[str] = []

    # ---------------------------------------------------------------
    # Salva o turno atual
    # ---------------------------------------------------------------

    def flush_current_block() -> None:

        nonlocal current_speaker
        nonlocal current_block

        if current_speaker is None:
            return

        cleaned_lines = [
            line.strip()
            for line in current_block
            if line.strip()
        ]

        if not cleaned_lines:
            return

        # Junta linhas consecutivas do mesmo turno
        text = " ".join(
            cleaned_lines
        )

        if current_speaker not in grouped:
            grouped[current_speaker] = []

        grouped[current_speaker].append(
            text
        )

    # ---------------------------------------------------------------
    # Percorre a transcrição
    # ---------------------------------------------------------------

    for raw_line in lines:

        line = raw_line.strip()

        if not line:
            continue

        # -----------------------------------------------------------
        # Novo turno de fala
        # -----------------------------------------------------------

        if is_speaker_header(line):

            # Salva o turno anterior
            flush_current_block()

            # Extrai participante + início da fala
            (
                current_speaker,
                first_text,
            ) = parse_header(line)

            current_block = []

            if first_text:
                current_block.append(
                    first_text
                )

        # -----------------------------------------------------------
        # Continuação da fala atual
        # -----------------------------------------------------------

        else:

            if current_speaker is not None:

                current_block.append(
                    line
                )

    # Salva o último turno
    flush_current_block()

    return grouped


# ---------------------------------------------------------------------
# Estatísticas
# ---------------------------------------------------------------------

def calculate_statistics(
    grouped: Dict[str, List[str]],
) -> Tuple[
    int,
    int,
    int,
    Dict[str, Dict[str, int]]
]:
    """
    Calcula:

    - número de participantes;
    - número de turnos;
    - número total de palavras;
    - número de turnos e palavras por participante.
    """

    total_participants = len(
        grouped
    )

    total_turns = 0

    total_words = 0

    participant_stats = {}

    for speaker, blocks in grouped.items():

        turns = len(
            blocks
        )

        words = sum(
            count_words(block)
            for block in blocks
        )

        participant_stats[speaker] = {
            "turns": turns,
            "words": words,
        }

        total_turns += turns

        total_words += words

    return (
        total_participants,
        total_turns,
        total_words,
        participant_stats,
    )


# ---------------------------------------------------------------------
# Formatação de números
# ---------------------------------------------------------------------

def format_number(
    number: int,
) -> str:
    """
    Formata números no padrão brasileiro:

        1234 -> 1.234
        19271 -> 19.271
    """

    return f"{number:,}".replace(
        ",",
        "."
    )


# ---------------------------------------------------------------------
# Geração do Markdown
# ---------------------------------------------------------------------

def build_markdown(
    record: Dict,
    grouped: Dict[str, List[str]],
) -> str:
    """
    Cria o Markdown final.

    O documento contém:

    1. título;
    2. estatísticas gerais;
    3. distribuição por participante;
    4. transcrição reorganizada.
    """

    record_id = record.get(
        "id",
        "desconhecido"
    )

    (
        total_participants,
        total_turns,
        total_words,
        participant_stats,
    ) = calculate_statistics(
        grouped
    )

    lines = [
        f"# Transcrição reorganizada — ID {record_id}",
        "",
        "## Estatísticas da audiência",
        "",
        (
            f"- **Número de participantes:** "
            f"{total_participants}"
        ),
        (
            f"- **Número de turnos de fala:** "
            f"{total_turns}"
        ),
        (
            f"- **Total de palavras:** "
            f"{format_number(total_words)}"
        ),
        "",
        "### Distribuição por participante",
        "",
        "| Participante | Turnos | Palavras |",
        "|---|---:|---:|",
    ]

    # ---------------------------------------------------------------
    # Ordena por número de palavras, do maior para o menor.
    # ---------------------------------------------------------------

    sorted_participants = sorted(
        participant_stats.items(),
        key=lambda item: item[1]["words"],
        reverse=True,
    )

    for speaker, stats in sorted_participants:

        lines.append(
            f"| {speaker} | "
            f"{stats['turns']} | "
            f"{format_number(stats['words'])} |"
        )

    lines.extend([
        "",
        "---",
        "",
        (
            "Cada bullet corresponde a um turno de fala "
            "preservado da transcrição original."
        ),
        "",
    ])

    # ---------------------------------------------------------------
    # Transcrição completa
    #
    # A ordem aqui é a ordem de primeira aparição dos participantes.
    # ---------------------------------------------------------------

    for speaker, blocks in grouped.items():

        lines.append(
            f"## {speaker}"
        )

        lines.append("")

        for block in blocks:

            lines.append(
                f"- {block}"
            )

        lines.append("")

    return "\n".join(
        lines
    )


# ---------------------------------------------------------------------
# Salvamento
# ---------------------------------------------------------------------

def save_output(
    content: str,
    output_dir: Path,
    identifier: int,
) -> Path:
    """
    Salva usando:

        transcricao_extraida_01.md
        transcricao_extraida_02.md
        transcricao_extraida_03.md
        ...
    """

    output_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    filename = (
        f"transcricao_extraida_{identifier:02d}.md"
    )

    output_path = (
        output_dir
        / filename
    )

    output_path.write_text(
        content,
        encoding="utf-8"
    )

    return output_path


# ---------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------

def main() -> None:

    parser = argparse.ArgumentParser(
        description=(
            "Extrai e reorganiza a transcrição de um registro "
            "do PublicHearingBR_LDS.jsonl por participante."
        )
    )

    parser.add_argument(
        "id",
        type=int,
        help=(
            "Número da linha do JSONL ou valor do campo 'id'."
        ),
    )

    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET,
        help=(
            "Caminho para o arquivo JSONL."
        ),
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=(
            "Diretório onde o arquivo Markdown será salvo."
        ),
    )

    args = parser.parse_args()

    # ---------------------------------------------------------------
    # 1. Carrega o registro
    # ---------------------------------------------------------------

    record = load_record(
        dataset_path=args.dataset,
        identifier=args.id,
    )

    # ---------------------------------------------------------------
    # 2. Obtém a transcrição
    # ---------------------------------------------------------------

    transcription = record.get(
        "transcricao"
    )

    if not transcription:

        raise ValueError(
            f"O registro {args.id} não possui "
            f"campo 'transcricao'."
        )

    # ---------------------------------------------------------------
    # 3. Faz o parsing
    # ---------------------------------------------------------------

    grouped = parse_transcription(
        transcription
    )

    # ---------------------------------------------------------------
    # 4. Gera o Markdown
    # ---------------------------------------------------------------

    markdown = build_markdown(
        record=record,
        grouped=grouped,
    )

    # ---------------------------------------------------------------
    # 5. Salva
    # ---------------------------------------------------------------

    output_path = save_output(
        content=markdown,
        output_dir=args.output_dir,
        identifier=args.id,
    )

    # ---------------------------------------------------------------
    # 6. Estatísticas no terminal
    # ---------------------------------------------------------------

    (
        total_participants,
        total_turns,
        total_words,
        participant_stats,
    ) = calculate_statistics(
        grouped
    )

    print()
    print(
        "Transcrição extraída com sucesso."
    )
    print()
    print(
        f"ID: {args.id}"
    )
    print(
        f"Participantes: {total_participants}"
    )
    print(
        f"Turnos de fala: {total_turns}"
    )
    print(
        f"Total de palavras: {total_words}"
    )
    print(
        f"Arquivo: {output_path}"
    )
    print()


# ---------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------

if __name__ == "__main__":
    main()