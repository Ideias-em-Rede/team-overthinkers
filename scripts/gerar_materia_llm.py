"""Gera uma matéria jornalística a partir da TRANSCRIÇÃO usando LLM.

Objetivo: RQ3 — comparar valores-notícia e seleção de participantes entre
a matéria produzida pela Agência Câmara (humana) e a produzida por um LLM
sobre a mesma transcrição.

O prompt é deliberadamente NEUTRO: pede apenas para redigir uma matéria
jornalística factual. Sem instruções de estilo, tamanho ou ângulo — pra
não contaminar o experimento com viés do prompt.

Uso:
    export OPENAI_API_KEY=sk-...
    python3 scripts/gerar_materia_llm.py --id 1

Saída: web/public/data/materia_llm/{id}.json
"""

import argparse
import json
import os
import sys
from pathlib import Path

from openai import OpenAI

ROOT = Path(__file__).resolve().parent.parent
MATERIAS_DIR = ROOT / "web" / "public" / "data" / "materias"
OUT_DIR = ROOT / "web" / "public" / "data" / "materia_llm"
MODEL = os.environ.get("MATERIA_LLM_MODEL", "gpt-4o-mini")
TEMPERATURE = 0.3

PROMPT_TEMPLATE = """A partir da transcrição da audiência pública abaixo, redija uma matéria jornalística factual sobre o que aconteceu.

Não invente informações que não estejam na transcrição.
Não adicione instruções de estilo, opiniões editoriais ou análises suas.

TRANSCRIÇÃO:
{{TRANSCRICAO}}
"""


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = val


load_dotenv(ROOT / ".env")


def gerar(materia_id: int, force: bool = False) -> dict:
    src = MATERIAS_DIR / f"{materia_id}.json"
    if not src.exists():
        sys.exit(f"Matéria #{materia_id} não encontrada em {src}.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{materia_id}.json"
    if out.exists() and not force:
        print(f"Já gerada: {out} (use --force pra regerar)")
        return json.loads(out.read_text(encoding="utf-8"))

    materia = json.loads(src.read_text(encoding="utf-8"))
    transcricao = materia["transcricao"]

    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY não definida.")

    prompt = PROMPT_TEMPLATE.replace("{{TRANSCRICAO}}", transcricao)

    client = OpenAI()
    resp = client.chat.completions.create(
        model=MODEL,
        temperature=TEMPERATURE,
        messages=[{"role": "user", "content": prompt}],
    )
    texto = resp.choices[0].message.content or ""

    payload = {
        "id": materia_id,
        "modelo": MODEL,
        "temperature": TEMPERATURE,
        "prompt": PROMPT_TEMPLATE,
        "materia_llm": texto.strip(),
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrito: {out}")
    print(f"  {len(texto)} caracteres · {len(texto.split())} palavras")
    return payload


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--id", type=int, default=1)
    p.add_argument("--force", action="store_true")
    args = p.parse_args()
    gerar(args.id, force=args.force)
