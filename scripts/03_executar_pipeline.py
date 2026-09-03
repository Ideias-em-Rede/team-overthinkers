#!/usr/bin/env python3

import subprocess
import sys
from pathlib import Path


# Raiz do projeto: team-overthinkers/
BASE_DIR = Path(__file__).resolve().parent.parent

# Diretório onde o Script 01 salva as transcrições reorganizadas.
JSON_TRANSCRICOES_DIR = (
    BASE_DIR
    / "dataset"
    / "transcricao_reorganizada"
    / "jsons"
)

TOTAL_TRANSCRICOES = 206


def executar_script(modulo: str, target_id: int) -> None:
    """Executa um módulo Python para uma audiência específica."""
    comando = [
        sys.executable,
        "-m",
        modulo,
        str(target_id),
    ]

    print(f"\n{'=' * 70}")
    print(f"Executando: {modulo} {target_id}")
    print(f"{'=' * 70}")

    subprocess.run(
        comando,
        cwd=BASE_DIR,
        check=True,
    )


def main() -> None:
    print("Iniciando processamento das 206 transcrições.")
    print(f"Diretório do projeto: {BASE_DIR}")

    # Verificações iniciais.
    script_01 = BASE_DIR / "scripts" / "01_regex_transcricao.py"
    script_02 = BASE_DIR / "scripts" / "02_capturar_metadados_da_transcricao.py"

    if not script_01.exists():
        raise FileNotFoundError(
            f"Script 01 não encontrado: {script_01}"
        )

    if not script_02.exists():
        raise FileNotFoundError(
            f"Script 02 não encontrado: {script_02}"
        )

    JSON_TRANSCRICOES_DIR.mkdir(parents=True, exist_ok=True)

    for target_id in range(1, TOTAL_TRANSCRICOES + 1):
        print(
            f"\nProcessando transcrição {target_id}/{TOTAL_TRANSCRICOES}"
        )

        # ---------------------------------------------------------------
        # Script 01 — estruturação da transcrição
        # ---------------------------------------------------------------
        executar_script(
            "scripts.01_regex_transcricao",
            target_id,
        )

        # Verifica se o Script 01 realmente gerou o JSON esperado.
        json_transcricao = (
            JSON_TRANSCRICOES_DIR
            / f"transcricao_{target_id}.json"
        )

        if not json_transcricao.exists():
            raise FileNotFoundError(
                "O Script 01 terminou sem erro, mas o JSON esperado "
                f"não foi encontrado:\n{json_transcricao}"
            )

        # ---------------------------------------------------------------
        # Script 02 — estruturação dos metadados
        # ---------------------------------------------------------------
        executar_script(
            "scripts.02_capturar_metadados_da_transcricao",
            target_id,
        )

    print("\n" + "=" * 70)
    print("PIPELINE CONCLUÍDO COM SUCESSO")
    print(f"{TOTAL_TRANSCRICOES} transcrições foram processadas.")
    print("=" * 70)


if __name__ == "__main__":
    main()