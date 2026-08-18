"""Extrai participantes da MATÉRIA jornalística usando LLM (OpenAI GPT).

Método: LLM. Diferente da transcrição (regex), a matéria não tem formato
padronizado — nomes aparecem no meio de frases, com variações (nome
completo, sobrenome, cargo). LLM lida melhor com isso e ainda extrai
citações diretas atribuídas a cada pessoa.

Uso:
    export OPENAI_API_KEY=sk-...
    python3 scripts/extrai_participantes_materia.py --id 1

Saída: web/public/data/participantes_materia/{id}.json
"""

import argparse
import json
import os
import sys
from pathlib import Path

from openai import OpenAI

ROOT = Path(__file__).resolve().parent.parent
MODEL = os.environ.get("PARTICIPANTES_MODEL", "gpt-4o-mini")

SOURCES = {
    "humano": {
        "input_dir": ROOT / "web" / "public" / "data" / "materias",
        "input_field": "materia_raw",
        "output_dir": ROOT / "web" / "public" / "data" / "participantes_materia",
    },
    "llm": {
        "input_dir": ROOT / "web" / "public" / "data" / "materia_llm",
        "input_field": "materia_llm",
        "output_dir": ROOT / "web" / "public" / "data" / "participantes_materia_llm",
    },
}

PROMPT_TEMPLATE = """Analise a matéria jornalística abaixo e extraia todas as pessoas mencionadas nominalmente.

Para cada pessoa, retorne:
- "nome": o nome mais completo com que a pessoa aparece na matéria.
- "cargo": cargo, função ou instituição, se citado explicitamente no texto. Use null se não citado.
- "mencoes": número de vezes que a pessoa é referenciada (por nome completo, sobrenome ou pronomes que a referenciem inequivocamente).
- "citacoes_diretas": lista com trechos entre aspas atribuídos exatamente a essa pessoa (frases exatamente como aparecem no texto). Lista vazia se não houver.

Regras:
- Só inclua pessoas mencionadas nominalmente na matéria. Não incluir cargos genéricos sem nome ("um deputado", "o presidente da comissão") se o nome não é dado.
- Não invente informações. Só extraia o que está explicitamente no texto.
- Nomes de instituições ou órgãos NÃO devem entrar.
- Retorne exclusivamente JSON válido, sem explicações adicionais.

Formato:

{
  "participantes": [
    {
      "nome": "...",
      "cargo": "...",
      "mencoes": 3,
      "citacoes_diretas": ["...", "..."]
    }
  ]
}

MATÉRIA:
{{NOTICIA}}
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


def extrair(materia_id: int, source: str = "humano", force: bool = False) -> dict:
    cfg = SOURCES[source]
    src = cfg["input_dir"] / f"{materia_id}.json"
    if not src.exists():
        sys.exit(f"Matéria #{materia_id} ({source}) não encontrada em {src}.")

    cfg["output_dir"].mkdir(parents=True, exist_ok=True)
    out = cfg["output_dir"] / f"{materia_id}.json"
    if out.exists() and not force:
        print(f"Já processada: {out} (use --force pra reprocessar)")
        return json.loads(out.read_text(encoding="utf-8"))

    materia = json.loads(src.read_text(encoding="utf-8"))
    noticia = materia[cfg["input_field"]]

    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY não definida.")

    prompt = PROMPT_TEMPLATE.replace("{{NOTICIA}}", noticia)

    client = OpenAI()
    resp = client.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        temperature=0,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.choices[0].message.content or "{}"
    parsed = json.loads(raw)
    participantes = parsed.get("participantes", [])

    # Ordena por número de menções (mais mencionados primeiro).
    participantes.sort(key=lambda p: p.get("mencoes", 0), reverse=True)

    total_citacoes = sum(len(p.get("citacoes_diretas") or []) for p in participantes)

    payload = {
        "id": materia_id,
        "source": source,
        "metodo": "llm",
        "modelo": MODEL,
        "descricao": (
            "Extração via LLM (OpenAI). O modelo identifica pessoas nomeadas, "
            "cargo (quando explicitado), número de menções e citações diretas "
            "atribuídas. Requer verificação humana em amostra por ser probabilística."
        ),
        "totais": {
            "num_participantes": len(participantes),
            "num_citacoes_diretas": total_citacoes,
        },
        "participantes": participantes,
    }

    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrito: {out}")
    print(f"  {len(participantes)} participantes · {total_citacoes} citações diretas")
    return payload


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--id", type=int, default=1)
    p.add_argument(
        "--source",
        choices=list(SOURCES.keys()),
        default="humano",
        help="Fonte da matéria: humano (Agência Câmara) ou llm (gerada por LLM)",
    )
    p.add_argument("--force", action="store_true")
    args = p.parse_args()
    extrair(args.id, source=args.source, force=args.force)
