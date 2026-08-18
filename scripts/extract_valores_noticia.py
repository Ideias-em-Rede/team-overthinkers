"""Extrai valores-notícia de uma matéria usando OpenAI GPT.

Uso:
    export OPENAI_API_KEY=sk-...
    python3 scripts/extract_valores_noticia.py --id 1

Idempotente: se o arquivo de saída já existe, mostra o resultado e sai.
Passe --force para reprocessar.

Nota metodológica: o LLM identifica apenas valores-notícia. Gatekeeping é
inferido posteriormente cruzando esses valores com quem foi (ou não)
selecionado pela Agência Câmara.
"""

import argparse
import json
import os
import sys
from pathlib import Path

from openai import OpenAI

ROOT = Path(__file__).resolve().parent.parent


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

MODEL = os.environ.get("VALORES_MODEL", "gpt-4o-mini")

SOURCES = {
    "humano": {
        "input_dir": ROOT / "web" / "public" / "data" / "materias",
        "input_field": "materia_raw",
        "output_dir": ROOT / "web" / "public" / "data" / "valores_noticia",
    },
    "llm": {
        "input_dir": ROOT / "web" / "public" / "data" / "materia_llm",
        "input_field": "materia_llm",
        "output_dir": ROOT / "web" / "public" / "data" / "valores_noticia_llm",
    },
}

PROMPT_TEMPLATE = """Analise a notícia abaixo e identifique quais valores-notícia estão presentes no texto.

Use exclusivamente os seguintes critérios:

- atualidade: o acontecimento é recente ou está relacionado a algo que está acontecendo no momento?
- proximidade: o acontecimento possui proximidade geográfica, social ou cultural com o público?
- importância: o acontecimento possui relevância institucional ou social?
- impacto: o acontecimento pode produzir consequências relevantes para pessoas, grupos ou instituições?
- conflito: há disputa, oposição, crítica, acusação ou divergência entre participantes?
- proeminência: envolve pessoas ou instituições de elevada relevância pública?
- novidade: apresenta algo novo, recente ou uma mudança em relação ao que existia anteriormente?
- curiosidade: apresenta algum elemento que desperta curiosidade ou interesse por ser incomum?
- dramaticidade: apresenta elementos de tensão, gravidade ou forte carga emocional?
- surpresa: apresenta algo inesperado ou contrário às expectativas?
- raridade: apresenta um acontecimento incomum ou excepcional?

Para cada critério, responda:
- "presente": true ou false
- "evidencia": trecho curto da notícia que justifica a classificação. Use null quando estiver ausente.

Não infira informações que não estejam na notícia.
Não considere a importância do acontecimento apenas porque ele ocorreu em uma audiência pública.
Não considere um critério presente apenas porque ele poderia ser aplicado ao acontecimento. Deve existir evidência no texto.

Retorne exclusivamente JSON válido, sem explicações adicionais.

Formato:

{
  "atualidade": {
    "presente": true,
    "evidencia": "..."
  },
  "proximidade": {
    "presente": false,
    "evidencia": null
  },
  "importancia": {
    "presente": true,
    "evidencia": "..."
  },
  "impacto": {
    "presente": false,
    "evidencia": null
  },
  "conflito": {
    "presente": true,
    "evidencia": "..."
  },
  "proeminencia": {
    "presente": true,
    "evidencia": "..."
  },
  "novidade": {
    "presente": false,
    "evidencia": null
  },
  "curiosidade": {
    "presente": false,
    "evidencia": null
  },
  "dramaticidade": {
    "presente": false,
    "evidencia": null
  },
  "surpresa": {
    "presente": false,
    "evidencia": null
  },
  "raridade": {
    "presente": false,
    "evidencia": null
  }
}

NOTÍCIA:
{{NOTICIA}}
"""


def extract(materia_id: int, source: str = "humano", force: bool = False) -> dict:
    cfg = SOURCES[source]
    src = cfg["input_dir"] / f"{materia_id}.json"
    if not src.exists():
        sys.exit(f"Matéria #{materia_id} ({source}) não encontrada em {src}.")

    cfg["output_dir"].mkdir(parents=True, exist_ok=True)
    out = cfg["output_dir"] / f"{materia_id}.json"
    if out.exists() and not force:
        print(f"Já processada: {out}\n(Use --force para reprocessar.)")
        return json.loads(out.read_text(encoding="utf-8"))

    materia = json.loads(src.read_text(encoding="utf-8"))
    noticia = materia[cfg["input_field"]]

    prompt = PROMPT_TEMPLATE.replace("{{NOTICIA}}", noticia)

    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY não definida. Exporte a chave e tente novamente.")

    client = OpenAI()
    resp = client.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        temperature=0,
        messages=[{"role": "user", "content": prompt}],
    )
    content = resp.choices[0].message.content or "{}"
    valores = json.loads(content)

    payload = {
        "id": materia_id,
        "source": source,
        "modelo": MODEL,
        "valores_noticia": valores,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrito: {out}")
    return payload


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--id", type=int, default=1, help="ID da matéria (default: 1)")
    p.add_argument(
        "--source",
        choices=list(SOURCES.keys()),
        default="humano",
        help="Fonte da matéria: humano (Agência Câmara) ou llm (gerada por LLM)",
    )
    p.add_argument("--force", action="store_true", help="Reprocessa mesmo se já existe")
    args = p.parse_args()
    extract(args.id, source=args.source, force=args.force)
