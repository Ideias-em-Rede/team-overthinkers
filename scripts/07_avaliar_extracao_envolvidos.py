"""Avalia a corretude da extração de envolvidos feita pelo LLM.

Lê o gold-standard manual em dataset/validacao/gold_citados.csv (formato de
planilha, com uma linha por envolvido, id/fonte com forward-fill e duas
colunas independentes: `envolvidos_llm` = extração do LLM avaliada na
anotação e `gold` = anotação manual). Calcula precisão, recall e F1 por
matéria, agregados por fonte (micro e macro) e no total, usando o mesmo
normalizador de nomes do 04_analise_gatekeepers_noticias_reais.py.

Uso:
    python3 scripts/07_avaliar_extracao_envolvidos.py
    python3 scripts/07_avaliar_extracao_envolvidos.py --fonte deepseek
    python3 scripts/07_avaliar_extracao_envolvidos.py --detalhe
    python3 scripts/07_avaliar_extracao_envolvidos.py --gold outro.csv
"""

import argparse
import csv
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLD_DEFAULT = ROOT / "dataset" / "validacao" / "gold_citados.csv"

FONTE_ALIASES = {
    "humano": "humano",
    "openai": "openai",
    "gpt": "openai",
    "gpt-5-mini": "openai",
    "gemini": "gemini",
    "deepseek": "deepseek",
    "deepseek-v3.1": "deepseek",
    "deepseek-v3": "deepseek",
}

TITULOS = {
    "deputado", "deputada", "sr", "sra", "dr", "dra",
    "professor", "professora", "general", "pastor",
    "ministro", "ministra", "coronel", "capitao", "cabo",
}


def normalize_name(nome: str) -> str:
    if not nome:
        return ""
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"[^a-z ]", " ", s)
    tokens = [t for t in s.split() if t and t not in TITULOS]
    return " ".join(tokens)


def name_match(a_key: str, b_key: str) -> bool:
    """Match compatível com 04_analise_gatekeepers_noticias_reais.py:
    igualdade exata; ou sobreposição de >=2 tokens com um conjunto
    contido no outro."""
    if not a_key or not b_key:
        return False
    if a_key == b_key:
        return True
    at, bt = set(a_key.split()), set(b_key.split())
    if (at <= bt or bt <= at) and len(at & bt) >= 2:
        return True
    return False


def _clean_name(s: str) -> str:
    """Remove espaços e vírgulas soltas nos extremos dos nomes anotados."""
    if s is None:
        return ""
    return s.strip().rstrip(",").strip()


def _parse_id(cell: str) -> int | None:
    if not cell:
        return None
    m = re.search(r"\d+", cell)
    return int(m.group()) if m else None


def _parse_fonte(cell: str) -> str | None:
    if not cell:
        return None
    key = cell.strip().lower()
    return FONTE_ALIASES.get(key)


def load_gold_planilha(path: Path) -> dict:
    """Lê o CSV em formato de planilha e retorna:
        {(id, fonte): {"llm": [...], "gold": [...]}}

    O CSV tem um bloco de codebook nas primeiras linhas (linhas cujo primeiro
    campo não parece um cabeçalho de tabela); pulamos até achar a linha
    'notícia,fonte,envolvidos_llm,gold,...'. Depois, para cada linha, fazemos
    forward-fill de (id, fonte) e adicionamos os nomes das duas colunas
    (podem ficar desalinhadas entre si — a coluna é uma lista independente).
    """
    with path.open(encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)

    header_idx = None
    for i, row in enumerate(rows):
        cells = [c.strip().lower() for c in row]
        if "envolvidos_llm" in cells and "gold" in cells:
            header_idx = i
            break
    if header_idx is None:
        sys.exit(f"Cabeçalho não encontrado em {path} "
                 f"(esperado incluir 'envolvidos_llm' e 'gold').")

    header = [c.strip().lower() for c in rows[header_idx]]
    col_id     = header.index("notícia") if "notícia" in header else header.index("noticia")
    col_fonte  = header.index("fonte")
    col_llm    = header.index("envolvidos_llm")
    col_gold   = header.index("gold")

    out = defaultdict(lambda: {"llm": [], "gold": []})
    cur_id = None
    cur_fonte = None

    for row in rows[header_idx + 1:]:
        row = row + [""] * (max(col_id, col_fonte, col_llm, col_gold) + 1 - len(row))
        maybe_id = _parse_id(row[col_id])
        if maybe_id is not None:
            cur_id = maybe_id
        maybe_fonte = _parse_fonte(row[col_fonte])
        if maybe_fonte is not None:
            cur_fonte = maybe_fonte

        if cur_id is None or cur_fonte is None:
            continue

        llm_name = _clean_name(row[col_llm])
        gold_name = _clean_name(row[col_gold])
        if llm_name:
            out[(cur_id, cur_fonte)]["llm"].append(llm_name)
        if gold_name:
            out[(cur_id, cur_fonte)]["gold"].append(gold_name)

    return dict(out)


def evaluate_materia(gold: list, pred: list) -> dict:
    """TP/FP/FN entre duas listas de nomes com matching por chave normalizada."""
    gold_keys = [normalize_name(n) for n in gold]
    pred_keys = [normalize_name(n) for n in pred]

    matched_gold = set()
    matched_pred = set()
    for i, pk in enumerate(pred_keys):
        for j, gk in enumerate(gold_keys):
            if j in matched_gold:
                continue
            if name_match(pk, gk):
                matched_pred.add(i)
                matched_gold.add(j)
                break

    tp = len(matched_pred)
    fp = len(pred_keys) - tp
    fn = len(gold_keys) - len(matched_gold)

    fp_names = [pred[i] for i in range(len(pred)) if i not in matched_pred]
    fn_names = [gold[j] for j in range(len(gold)) if j not in matched_gold]

    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "n_gold": len(gold),
        "n_pred": len(pred),
        "fp_names": fp_names,
        "fn_names": fn_names,
    }


def prf(tp: int, fp: int, fn: int) -> tuple:
    p = tp / (tp + fp) if (tp + fp) else float("nan")
    r = tp / (tp + fn) if (tp + fn) else float("nan")
    f = 2 * p * r / (p + r) if (p + r) else float("nan")
    return p, r, f


def fmt(x: float) -> str:
    return f"{x:.3f}" if x == x else "  n/a"


def print_per_materia(rows: list) -> None:
    print()
    print(f"{'id':>4} {'fonte':<10} {'gold':>4} {'pred':>4} "
          f"{'TP':>3} {'FP':>3} {'FN':>3} "
          f"{'P':>5} {'R':>5} {'F1':>5}")
    print("-" * 66)
    for r in rows:
        p, rec, f = prf(r["tp"], r["fp"], r["fn"])
        print(f"{r['id']:>4} {r['fonte']:<10} {r['n_gold']:>4} {r['n_pred']:>4} "
              f"{r['tp']:>3} {r['fp']:>3} {r['fn']:>3} "
              f"{fmt(p):>5} {fmt(rec):>5} {fmt(f):>5}")


def print_agregado(label: str, rows: list) -> None:
    tp = sum(r["tp"] for r in rows)
    fp = sum(r["fp"] for r in rows)
    fn = sum(r["fn"] for r in rows)
    micro = prf(tp, fp, fn)

    macros = [prf(r["tp"], r["fp"], r["fn"]) for r in rows]
    valid = [(p, rr, f) for p, rr, f in macros if p == p and rr == rr]
    if valid:
        mp = sum(x[0] for x in valid) / len(valid)
        mr = sum(x[1] for x in valid) / len(valid)
        mf = sum(x[2] for x in valid) / len(valid)
    else:
        mp = mr = mf = float("nan")

    n_perfect = sum(1 for r in rows if r["fp"] == 0 and r["fn"] == 0)
    print(f"  {label:<10} n={len(rows):<3} "
          f"TP={tp:<4} FP={fp:<3} FN={fn:<3} | "
          f"micro P={fmt(micro[0])} R={fmt(micro[1])} F1={fmt(micro[2])} | "
          f"macro P={fmt(mp)} R={fmt(mr)} F1={fmt(mf)} | "
          f"F1=1.0 em {n_perfect}/{len(rows)}")


def print_erros(rows: list) -> None:
    tem_erro = [r for r in rows if r["fp"] or r["fn"]]
    if not tem_erro:
        print("\nSem erros. F1=1,0 em todas as matérias avaliadas.")
        return
    print("\nErros por matéria:")
    for r in tem_erro:
        print(f"  #{r['id']:<3} {r['fonte']:<10} "
              f"FN={r['fn_names'] or '-'}  "
              f"FP={r['fp_names'] or '-'}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gold", default=str(GOLD_DEFAULT),
                    help=f"CSV do gold (default: {GOLD_DEFAULT.relative_to(ROOT)})")
    ap.add_argument("--fonte", default="all",
                    help="Filtra por fonte (humano, openai, gemini, deepseek, all)")
    ap.add_argument("--detalhe", action="store_true",
                    help="Imprime FN/FP nome a nome ao final")
    args = ap.parse_args()

    gold_path = Path(args.gold)
    if not gold_path.exists():
        sys.exit(f"Gold não encontrado: {gold_path}")

    dados = load_gold_planilha(gold_path)

    ordem_fontes = ["humano", "openai", "gemini", "deepseek"]
    if args.fonte != "all":
        if args.fonte not in ordem_fontes:
            sys.exit(f"Fonte desconhecida. Use: {', '.join(ordem_fontes)} ou all.")
        ordem_fontes = [args.fonte]

    rows_all = []
    for fonte in ordem_fontes:
        ids = sorted({mid for (mid, f) in dados if f == fonte})
        for mid in ids:
            d = dados[(mid, fonte)]
            r = evaluate_materia(d["gold"], d["llm"])
            r["id"] = mid
            r["fonte"] = fonte
            rows_all.append(r)

    if not rows_all:
        sys.exit("Nenhuma linha do gold bateu com as fontes pedidas.")

    print_per_materia(rows_all)
    print("\nAgregado:")
    for fonte in ordem_fontes:
        rows_f = [r for r in rows_all if r["fonte"] == fonte]
        if rows_f:
            print_agregado(fonte, rows_f)
    if len([f for f in ordem_fontes if any(r["fonte"] == f for r in rows_all)]) > 1:
        print_agregado("TOTAL", rows_all)

    if args.detalhe:
        print_erros(rows_all)


if __name__ == "__main__":
    main()
