"""Agrega arquivos de valores_noticia por matéria em um único JSON.

Entrada (por matéria):
    humano: web/public/data/humano/materias/valores_noticia/{id}.json
    llm:    web/public/data/llm/materias_llm/valores_noticia/{gen}/{id}.json

Saída (agregada):
    humano: web/public/data/humano/materias/valores_noticia_all.json
    llm:    web/public/data/llm/materias_llm/valores_noticia_all/{gen}.json

Formato de saída:
    {"<id>": ["proximidade", "impacto", ...], ...}

Onde a lista contém apenas os valores com `presente=true`.

Uso:
    # humano (default)
    python3 scripts/aggregate_valores_noticia.py

    # um gerador específico
    python3 scripts/aggregate_valores_noticia.py --source llm --generator deepseek

    # todos os geradores disponíveis (pula os sem pasta)
    python3 scripts/aggregate_valores_noticia.py --source llm --generator all
"""

import argparse
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

GENERATORS = ["openai", "gemini", "anthropic", "deepseek"]


def humano_paths():
    in_dir = os.path.join(ROOT, "web/public/data/humano/materias/valores_noticia")
    out_path = os.path.join(
        ROOT, "web/public/data/humano/materias/valores_noticia_all.json"
    )
    return in_dir, out_path


def llm_paths(generator: str):
    in_dir = os.path.join(
        ROOT, "web/public/data/llm/materias_llm/valores_noticia", generator
    )
    out_path = os.path.join(
        ROOT,
        "web/public/data/llm/materias_llm/valores_noticia_all",
        f"{generator}.json",
    )
    return in_dir, out_path


def aggregate(in_dir: str, out_path: str, label: str) -> int:
    paths = sorted(
        glob.glob(os.path.join(in_dir, "*.json")),
        key=lambda p: int(os.path.basename(p).split(".")[0]),
    )
    if not paths:
        print(f"[skip] {label}: nenhum arquivo em {in_dir}", file=sys.stderr)
        return 0

    out: dict[str, list[str]] = {}
    for path in paths:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        id_ = data["id"]
        presentes = [
            k for k, v in data["valores_noticia"].items() if v.get("presente")
        ]
        out[str(id_)] = presentes

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"[ok]   {label}: {len(out)} entradas em {out_path}")
    return len(out)


def resolve_generators(arg: str) -> list[str]:
    if arg == "all":
        return list(GENERATORS)
    names = [g.strip() for g in arg.split(",") if g.strip()]
    unknown = [n for n in names if n not in GENERATORS]
    if unknown:
        sys.exit(f"Generator(es) desconhecido(s): {', '.join(unknown)}")
    return names


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--source",
        default="humano",
        choices=["humano", "llm"],
        help="Fonte a agregar (default: humano)",
    )
    p.add_argument(
        "--generator",
        default=None,
        help="Só para --source llm: nome do gerador, lista separada por vírgula, ou 'all'",
    )
    args = p.parse_args()

    if args.source == "humano":
        in_dir, out_path = humano_paths()
        n = aggregate(in_dir, out_path, "humano")
        return 0 if n > 0 else 1

    if not args.generator:
        sys.exit("--generator é obrigatório quando --source=llm")

    total = 0
    for gen in resolve_generators(args.generator):
        in_dir, out_path = llm_paths(gen)
        total += aggregate(in_dir, out_path, f"llm/{gen}")
    return 0 if total > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
