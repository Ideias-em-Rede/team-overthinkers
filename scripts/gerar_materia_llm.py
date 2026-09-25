"""Gera uma matéria jornalística a partir da TRANSCRIÇÃO usando LLMs.

Objetivo: RQ2/RQ3 — comparar valores-notícia e seleção de participantes
entre a matéria produzida pela Agência Câmara (humana) e a produzida por
diferentes LLMs sobre a mesma transcrição.

O prompt é deliberadamente NEUTRO: pede apenas para redigir uma matéria
jornalística factual. Sem instruções de estilo, tamanho ou ângulo — pra
não contaminar o experimento com viés do prompt.

Provedores:
    - openai      SDK openai (default gpt-5-mini)
    - gemini      SDK openai contra endpoint compatível do Google
                  (default gemini-2.5-pro)
    - deepseek    SDK openai contra https://api.deepinfra.com/v1/openai
                  (default deepseek-ai/DeepSeek-V3.1)

Provedores são pulados com um aviso se a API key não estiver configurada.

Uso:
    python3 scripts/gerar_materia_llm.py --id 1
    python3 scripts/gerar_materia_llm.py --id 1 --providers openai,gemini
    python3 scripts/gerar_materia_llm.py --all
    python3 scripts/gerar_materia_llm.py --all --limit 5
    python3 scripts/gerar_materia_llm.py --id 1 --force

Entrada: web/public/data/humano/materias/materias/{id}.json
Saída:   web/public/data/llm/materias_llm/{provider}/{id}.json
"""

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATERIAS_DIR = ROOT / "web" / "public" / "data" / "humano" / "materias" / "materias"
OUT_DIR = ROOT / "web" / "public" / "data" / "llm" / "materias_llm"
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


PROVIDERS = {
    "openai": {
        "sdk": "openai",
        "base_url": None,
        "api_key_env": "OPENAI_API_KEY",
        "default_model": "gpt-5-mini",
        "model_env": "MATERIA_OPENAI_MODEL",
    },
    "gemini": {
        "sdk": "openai",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key_env": "GEMINI_API_KEY",
        "default_model": "gemini-2.5-pro",
        "model_env": "MATERIA_GEMINI_MODEL",
    },
    "deepseek": {
        "sdk": "openai",
        "base_url": "https://api.deepinfra.com/v1/openai",
        "api_key_env": "DEEPINFRA_API_KEY",
        "default_model": "deepseek-ai/DeepSeek-V3.1",
        "model_env": "MATERIA_DEEPSEEK_MODEL",
    },
}


def resolve_model(provider: str) -> str:
    cfg = PROVIDERS[provider]
    return os.environ.get(cfg["model_env"], cfg["default_model"])


def call_openai_compat(provider: str, model: str, prompt: str) -> str:
    from openai import OpenAI

    cfg = PROVIDERS[provider]
    kwargs = {"api_key": os.environ[cfg["api_key_env"]]}
    if cfg.get("base_url"):
        kwargs["base_url"] = cfg["base_url"]
    client = OpenAI(**kwargs)

    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=TEMPERATURE,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        # Alguns modelos novos da OpenAI (série o1/o3/gpt-5) travam o
        # temperature em 1.0 — retry sem o parâmetro.
        if "temperature" in str(e).lower() or "Unsupported value" in str(e):
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
            )
        else:
            raise
    return resp.choices[0].message.content or ""


def run_provider(provider: str, prompt: str) -> dict:
    cfg = PROVIDERS[provider]
    if not os.environ.get(cfg["api_key_env"]):
        raise RuntimeError(f"{cfg['api_key_env']} não definida")

    model = resolve_model(provider)
    if cfg["sdk"] == "openai":
        texto = call_openai_compat(provider, model, prompt)
    else:
        raise RuntimeError(f"SDK desconhecido para {provider}: {cfg['sdk']}")

    return {"model": model, "texto": texto.strip()}


def process_one(materia_id: int, providers: list, force: bool) -> None:
    src = MATERIAS_DIR / f"{materia_id}.json"
    if not src.exists():
        print(f"[warn] matéria #{materia_id} não encontrada em {src} — pulando.")
        return

    materia = json.loads(src.read_text(encoding="utf-8"))
    transcricao = materia["transcricao"]
    prompt = PROMPT_TEMPLATE.replace("{{TRANSCRICAO}}", transcricao)

    for provider in providers:
        provider_dir = OUT_DIR / provider
        provider_dir.mkdir(parents=True, exist_ok=True)
        out = provider_dir / f"{materia_id}.json"

        if out.exists() and not force:
            print(f"[skip] #{materia_id} {provider}: já existe")
            continue

        t0 = time.time()
        try:
            result = run_provider(provider, prompt)
        except Exception as e:
            print(f"[fail] #{materia_id} {provider}: {e}")
            if os.environ.get("DEBUG"):
                traceback.print_exc()
            continue

        payload = {
            "id": materia_id,
            "generator": provider,
            "modelo": result["model"],
            "temperature": TEMPERATURE,
            "prompt": PROMPT_TEMPLATE,
            "materia_llm": result["texto"],
        }
        out.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        dt = time.time() - t0
        n_chars = len(result["texto"])
        n_words = len(result["texto"].split())
        print(
            f"[ok]   #{materia_id} {provider}: {n_chars} chars · {n_words} palavras · {dt:.1f}s"
        )


def all_ids() -> list:
    ids = []
    for p in MATERIAS_DIR.glob("*.json"):
        try:
            ids.append(int(p.stem))
        except ValueError:
            pass
    return sorted(ids)


def parse_providers(arg: str) -> list:
    if arg == "all":
        return list(PROVIDERS.keys())
    names = [p.strip() for p in arg.split(",") if p.strip()]
    unknown = [n for n in names if n not in PROVIDERS]
    if unknown:
        sys.exit(f"Provedor(es) desconhecido(s): {', '.join(unknown)}")
    return names


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--id", type=int, help="ID da matéria (ex: 1)")
    p.add_argument("--all", action="store_true", help="Processa todas as matérias")
    p.add_argument("--limit", type=int, help="Limita o número de matérias no --all")
    p.add_argument(
        "--providers",
        default="all",
        help=(
            "Lista separada por vírgula (openai, gemini, deepseek) ou 'all' "
            "(default: all — pula os que não tiverem API key)"
        ),
    )
    p.add_argument("--force", action="store_true", help="Reprocessa mesmo se já existe")
    args = p.parse_args()

    if not args.id and not args.all:
        sys.exit("Informe --id N ou --all")

    providers = parse_providers(args.providers)

    if args.all:
        ids = all_ids()
        if args.limit:
            ids = ids[: args.limit]
        print(f"[batch] {len(ids)} matérias × {len(providers)} providers")
        for i, mid in enumerate(ids, 1):
            print(f"\n── [{i}/{len(ids)}] matéria #{mid} ──")
            process_one(mid, providers, args.force)
    else:
        process_one(args.id, providers, args.force)
