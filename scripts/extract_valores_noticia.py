"""Extrai valores-notícia de matérias usando DeepSeek V3.

Usa o SDK openai contra https://api.deepinfra.com/v1/openai, com o modelo
deepseek-ai/DeepSeek-V3 (override via env VALORES_DEEPSEEK_MODEL).

Por default processa TODAS as matérias humanas encontradas em
web/public/data/materias/. Use --id para restringir a uma matéria específica
ou --ids para uma lista.

Uso:
    # processa TODAS as matérias humanas (default)
    python3 scripts/extract_valores_noticia.py

    # apenas a matéria #1
    python3 scripts/extract_valores_noticia.py --id 1

    # subset explícito
    python3 scripts/extract_valores_noticia.py --ids 1,2,7,42

    # todas as matérias em source=llm (para cada generator disponível)
    python3 scripts/extract_valores_noticia.py --source llm

    # ambas as fontes, reprocessando tudo
    python3 scripts/extract_valores_noticia.py --source both --force

Saída:
    web/public/data/valores_noticia/{id}.json                     (source=humano)
    web/public/data/valores_noticia_llm/{generator}/{id}.json     (source=llm)

Nota metodológica: o LLM identifica apenas valores-notícia. Gatekeeping é
inferido posteriormente cruzando esses valores com quem foi (ou não)
selecionado.
"""

import argparse
import json
import os
import sys
import traceback
from pathlib import Path

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


PROVIDER = {
    "base_url": "https://api.deepinfra.com/v1/openai",
    "api_key_env": "DEEPINFRA_API_KEY",
    "default_model": "deepseek-ai/DeepSeek-V3",
    "model_env": "VALORES_DEEPSEEK_MODEL",
}

GENERATORS = ["openai", "gemini", "anthropic", "deepseek"]


PROMPT_TEMPLATE = """Analise a notícia abaixo e identifique quais valores-notícia estão presentes no texto.

Use exclusivamente os seguintes critérios:

Proximidade: O impacto geográfico ou cultural do acontecimento em relação ao cotidiano e à vida do público-alvo
Proeminência: O envolvimento de pessoas conhecidas, elites, celebridades, instituições influentes ou autoridades governamentais
Impacto: A importância, magnitude ou gravidade das repercussões que o evento terá diretamente sobre a vida dos cidadãos e da sociedade civil
Conflito: Disputas, tensões, desentendimentos e debates que envolvem forças políticas, sociais ou institucionais opostas
Novidade: Fatos fora do comum, bizarros, inesperados ou que rompem de alguma forma com a normalidade cotidiana
Interesse: O potencial de capturar a atenção, despertar a curiosidade ou responder a uma necessidade real do público
Sensacionalismo: Aspectos dramáticos, sexuais ou chocantes estrategicamente explorados para maximizar a audiência

Para cada critério, responda:
- "presente": true ou false
- "evidencia": trecho curto da notícia que justifica a classificação. Use null quando estiver ausente.

Não infira informações que não estejam na notícia.
Não considere a importância do acontecimento apenas porque ele ocorreu em uma audiência pública.
Não considere um critério presente apenas porque ele poderia ser aplicado ao acontecimento. Deve existir evidência no texto.

Retorne exclusivamente JSON válido, sem explicações adicionais. Use exatamente as chaves abaixo, nesta ordem.

Formato:

{
  "proximidade": { "presente": true, "evidencia": "..." },
  "proeminencia": { "presente": true, "evidencia": "..." },
  "impacto": { "presente": true, "evidencia": "..." },
  "conflito": { "presente": true, "evidencia": "..." },
  "novidade": { "presente": true, "evidencia": "..." },
  "interesse": { "presente": true, "evidencia": "..." },
  "sensacionalismo": { "presente": false, "evidencia": null }
}

NOTÍCIA:
{{NOTICIA}}
"""


def resolve_model() -> str:
    return os.environ.get(PROVIDER["model_env"], PROVIDER["default_model"])


def call_deepseek(model: str, prompt: str) -> str:
    from openai import OpenAI

    client = OpenAI(
        api_key=os.environ[PROVIDER["api_key_env"]],
        base_url=PROVIDER["base_url"],
    )
    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content or "{}"


def run_extraction(prompt: str) -> dict:
    if not os.environ.get(PROVIDER["api_key_env"]):
        raise RuntimeError(f"{PROVIDER['api_key_env']} não definida")

    model = resolve_model()
    content = call_deepseek(model, prompt)

    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()

    return {"model": model, "valores": json.loads(stripped)}


def resolve_contexts(materia_id: int, source: str, generators: list) -> list:
    """
    Retorna uma lista de dicts descrevendo o que analisar:
        [{"label", "generator", "noticia", "output_path"}, ...]

    - source=humano: 1 contexto (sem generator).
    - source=llm: 1 contexto por generator que tem materia_llm/{gen}/{id}.json.
    """
    cfg = SOURCES[source]
    contexts = []

    if source == "humano":
        src = cfg["input_dir"] / f"{materia_id}.json"
        if not src.exists():
            print(f"[skip] humano: matéria #{materia_id} não encontrada em {src}")
            return []
        materia = json.loads(src.read_text(encoding="utf-8"))
        contexts.append(
            {
                "label": "humano",
                "generator": None,
                "noticia": materia[cfg["input_field"]],
                "output_path": cfg["output_dir"] / f"{materia_id}.json",
            }
        )
        return contexts

    for gen in generators:
        src = cfg["input_dir"] / gen / f"{materia_id}.json"
        if not src.exists():
            print(f"[skip] llm/{gen}: matéria não encontrada em {src}")
            continue
        materia = json.loads(src.read_text(encoding="utf-8"))
        contexts.append(
            {
                "label": f"llm/{gen}",
                "generator": gen,
                "noticia": materia[cfg["input_field"]],
                "output_path": cfg["output_dir"] / gen / f"{materia_id}.json",
            }
        )
    return contexts


def process(materia_id: int, source: str, generators: list, force: bool) -> None:
    contexts = resolve_contexts(materia_id, source, generators)
    if not contexts:
        return

    for ctx in contexts:
        print(f"\n--- contexto: {ctx['label']} ---")
        out = ctx["output_path"]

        if out.exists() and not force:
            print(f"[skip] já existe ({out})")
            continue

        prompt = PROMPT_TEMPLATE.replace("{{NOTICIA}}", ctx["noticia"])

        try:
            result = run_extraction(prompt)
        except Exception as e:
            print(f"[fail] {e}")
            if os.environ.get("DEBUG"):
                traceback.print_exc()
            continue

        payload = {
            "id": materia_id,
            "source": source,
            "generator": ctx["generator"],
            "modelo": result["model"],
            "valores_noticia": result["valores"],
        }
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"[ok]   escrito {out}")


def parse_generators(arg: str) -> list:
    if arg == "all":
        return list(GENERATORS)
    names = [g.strip() for g in arg.split(",") if g.strip()]
    unknown = [n for n in names if n not in GENERATORS]
    if unknown:
        sys.exit(f"Generator(es) desconhecido(s): {', '.join(unknown)}")
    return names


def parse_sources(arg: str) -> list:
    if arg == "both":
        return list(SOURCES.keys())
    if arg not in SOURCES:
        sys.exit(f"Source inválido: {arg} (use humano, llm ou both)")
    return [arg]


def discover_materia_ids() -> list:
    materias_dir = SOURCES["humano"]["input_dir"]
    ids = []
    for path in materias_dir.glob("*.json"):
        try:
            ids.append(int(path.stem))
        except ValueError:
            continue
    return sorted(ids)


def parse_ids(id_arg, ids_arg) -> list:
    if id_arg is not None:
        return [id_arg]
    if ids_arg:
        try:
            return [int(x.strip()) for x in ids_arg.split(",") if x.strip()]
        except ValueError:
            sys.exit(f"--ids inválido: {ids_arg}")
    return discover_materia_ids()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument(
        "--id",
        type=int,
        default=None,
        help="ID de uma única matéria (default: processa todas)",
    )
    p.add_argument(
        "--ids",
        default=None,
        help="Lista de IDs separada por vírgula (ex: 1,2,7). Ignorado se --id for usado.",
    )
    p.add_argument(
        "--source",
        default="humano",
        help="Fonte: humano (Agência Câmara), llm (gerada por LLM) ou both",
    )
    p.add_argument(
        "--generators",
        default="all",
        help="Só para source=llm ou both: quais matérias-geradas analisar. "
        "Lista separada por vírgula (openai, gemini, anthropic, deepseek) ou 'all' "
        "(default: all — pula os que não têm arquivo)",
    )
    p.add_argument("--force", action="store_true", help="Reprocessa mesmo se já existe")
    args = p.parse_args()

    generators = parse_generators(args.generators)
    sources = parse_sources(args.source)
    materia_ids = parse_ids(args.id, args.ids)

    if not materia_ids:
        sys.exit("Nenhuma matéria encontrada para processar.")

    print(f"Processando {len(materia_ids)} matéria(s) em {len(sources)} fonte(s).")

    for source in sources:
        print(f"\n=== source={source} ===")
        for i, materia_id in enumerate(materia_ids, 1):
            print(f"\n[{i}/{len(materia_ids)}] matéria #{materia_id}")
            process(materia_id, source, generators, args.force)
